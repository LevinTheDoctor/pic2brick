import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { LegoColor } from '../lib/colors'
import { UNKNOWN_COLOR } from '../lib/colors'
import type { LDrawModel } from '../lib/ldraw'
import { insidePolygon, partSpec, type Outline, type PartSpec } from '../lib/parts'

/** 1 Noppe = 20 LDU = 1 Welteinheit */
const SCALE = 1 / 20
const GAP = 0.35
const BEVEL = 0.45

export type CameraPreset = 'angle' | 'top'

/** Von Glasflächen verdeckte Ränder in px; das Modell wird im freien Bereich zentriert. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SceneInput {
  model: LDrawModel
  colors: Map<number, LegoColor>
  names: Map<string, string>
}

export interface HoverEvent {
  /** Index in `model.parts` */
  part: number
  x: number
  y: number
}

interface Bucket {
  mesh: THREE.InstancedMesh
  /** Index in `model.parts` je Instanz */
  owners: number[]
  /** Basisfarbe je Instanz */
  colors: THREE.Color[]
  /** Basismatrizen (für die Einfall-Animation) */
  matrices: Float32Array
  /** Anzahl Instanzen bis einschließlich Schritt s */
  upTo: Int32Array
  /** Nur Noppen: alle Noppen mit Sichtbarkeitsbereich [from, until) in Schritten */
  studs?: {
    owners: number[]
    colors: THREE.Color[]
    matrices: Float32Array
    from: Int32Array
    until: Float64Array
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOutBack = (t: number) => {
  const c = 1.4
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/** Schrumpft einen Umriss um GAP + BEVEL, damit zwischen Teilen eine Fuge bleibt. */
function inset(outline: Outline): Outline {
  const xs = outline.map((p) => p[0])
  const zs = outline.map((p) => p[1])
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2]
  const [hx, hz] = [(maxX - minX) / 2, (maxZ - minZ) / 2]
  const d = GAP + BEVEL
  const [fx, fz] = [Math.max(hx - d, 0.1) / hx, Math.max(hz - d, 0.1) / hz]
  return outline.map(([x, z]) => [cx + (x - cx) * fx, cz + (z - cz) * fz])
}

/** Körper eines Teils: Umriss in (x, z), nach unten extrudiert (y von −h bis 0, y oben). */
function bodyGeometry(spec: PartSpec): THREE.BufferGeometry {
  if (spec.pin) {
    const pin = new THREE.CylinderGeometry(4, 4, 40, 12)
    pin.rotateX(Math.PI / 2)
    return pin
  }
  const shape = new THREE.Shape(inset(spec.outline).map(([x, z]) => new THREE.Vector2(x, z)))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(spec.height - 2 * BEVEL, 0.5),
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 4,
  })
  geometry.translate(0, 0, BEVEL)
  // Nach der Drehung zeigt die Extrusion nach unten: y ∈ [−h, 0]
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function studGeometry() {
  const stud = new THREE.CylinderGeometry(6, 6, 4, 18)
  stud.translate(0, 2, 0)
  return stud
}

/** LDraw-Matrix (y nach unten) als three.js-Matrix (y nach oben): F·M·F mit F = diag(1, −1, 1). */
function toThree(position: [number, number, number], m: number[], target: THREE.Matrix4) {
  // prettier-ignore
  target.set(
    m[0], -m[1], m[2], position[0],
    -m[3], m[4], -m[5], -position[1],
    m[6], -m[7], m[8], position[2],
    0, 0, 0, 1,
  )
  return target
}

export class MosaicScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000)
  private controls: OrbitControls
  private root = new THREE.Group()
  private light = new THREE.DirectionalLight(0xffffff, 1.4)
  private ground: THREE.Mesh
  private buckets: Bucket[] = []
  private geometries: THREE.BufferGeometry[] = []
  private materials = {
    solid: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 }),
    clear: new THREE.MeshStandardMaterial({
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  }
  private input: SceneInput | null = null
  private size = new THREE.Vector3(1, 1, 1)
  private step = 0
  private focus: number | null = null
  private hovered: { bucket: Bucket; instance: number } | null = null
  private dropStart = 0
  private dropStep = -1
  private cameraTween: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null
  private frame = 0
  private needsRender = true
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private pointerEvent: PointerEvent | null = null
  private resizeObserver: ResizeObserver
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private canvas: HTMLCanvasElement
  private onHover: (event: HoverEvent | null) => void

  constructor(canvas: HTMLCanvasElement, onHover: (event: HoverEvent | null) => void) {
    this.canvas = canvas
    this.onHover = onHover
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    // Abgestimmt an vorschau.png: Draufsicht trifft die Rebrickable-Farben
    this.scene.environmentIntensity = 0.3
    pmrem.dispose()

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.45))
    this.light.castShadow = true
    this.light.shadow.mapSize.set(2048, 2048)
    this.light.shadow.bias = -0.0004
    this.light.shadow.normalBias = 0.02
    this.scene.add(this.light, this.light.target)

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.22 }),
    )
    this.ground.receiveShadow = true
    this.scene.add(this.ground, this.root)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.addEventListener('change', () => this.requestRender())
    this.controls.addEventListener('start', () => (this.cameraTween = null))

    canvas.addEventListener('pointermove', this.handlePointer)
    canvas.addEventListener('pointerleave', this.handleLeave)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
    this.loop()
  }

  setModel(input: SceneInput) {
    this.clear()
    this.input = input
    const { model, colors, names } = input
    const stepCount = model.steps.length
    const matrix = new THREE.Matrix4()
    const offset = new THREE.Matrix4()
    const vector = new THREE.Vector3()

    // Abdeckung: ab welchem Schritt liegt etwas auf einer Zelle? Verdeckte Noppen fallen dann weg.
    const specs = model.parts.map((part) => partSpec(part.id, names))
    const covered = new Map<string, number>()
    model.parts.forEach((part, index) => {
      const spec = specs[index]
      if (spec.pin || spec.outline.length === 0) return
      const bottom = part.position[1] + spec.height
      const xs = spec.outline.map((p) => p[0])
      const zs = spec.outline.map((p) => p[1])
      for (let x = Math.min(...xs) + 10; x < Math.max(...xs); x += 20)
        for (let z = Math.min(...zs) + 10; z < Math.max(...zs); z += 20) {
          if (!insidePolygon(x, z, spec.outline)) continue
          const m = part.matrix
          const wx = part.position[0] + m[0] * x + m[2] * z
          const wz = part.position[2] + m[6] * x + m[8] * z
          const key = `${Math.round((wx - 10) / 20)},${Math.round((wz - 10) / 20)},${bottom}`
          covered.set(key, Math.min(covered.get(key) ?? Infinity, part.step))
        }
    })

    // Instanzen sammeln
    type Pending = {
      owners: number[]
      matrices: THREE.Matrix4[]
      colors: THREE.Color[]
      steps: number[]
      until: number[]
    }
    const pending = new Map<string, { spec: PartSpec | 'stud'; transparent: boolean; data: Pending }>()
    const bucketFor = (key: string, spec: PartSpec | 'stud', transparent: boolean) => {
      const id = `${key}|${transparent}`
      let entry = pending.get(id)
      if (!entry) {
        entry = { spec, transparent, data: { owners: [], matrices: [], colors: [], steps: [], until: [] } }
        pending.set(id, entry)
      }
      return entry.data
    }

    const bounds = new THREE.Box3()
    model.parts.forEach((part, index) => {
      const spec = specs[index]
      const lego = colors.get(part.color) ?? UNKNOWN_COLOR
      const color = new THREE.Color(lego.hex)
      toThree(part.position, part.matrix, matrix)
      const body = bucketFor(spec.key, spec, lego.transparent)
      body.owners.push(index)
      body.matrices.push(matrix.clone())
      body.colors.push(color)
      body.steps.push(part.step)
      if (!spec.pin) {
        bounds.expandByPoint(vector.set(part.position[0], -part.position[1], part.position[2]))
        bounds.expandByPoint(vector.set(part.position[0], -part.position[1] - spec.height, part.position[2]))
      }

      for (const [sx, sz] of spec.studs) {
        const m = part.matrix
        const wx = part.position[0] + m[0] * sx + m[2] * sz
        const wz = part.position[2] + m[6] * sx + m[8] * sz
        const until = covered.get(`${Math.round((wx - 10) / 20)},${Math.round((wz - 10) / 20)},${part.position[1]}`)
        if (until !== undefined && until <= part.step) continue
        const studs = bucketFor('stud', 'stud', lego.transparent)
        studs.until.push(until ?? Infinity)
        studs.owners.push(index)
        studs.matrices.push(matrix.clone().multiply(offset.makeTranslation(sx, 0, sz)))
        studs.colors.push(color)
        studs.steps.push(part.step)
      }
    })

    const sharedStud = studGeometry()
    this.geometries.push(sharedStud)
    for (const { spec, transparent, data } of pending.values()) {
      let geometry: THREE.BufferGeometry = sharedStud
      if (spec !== 'stud') {
        geometry = bodyGeometry(spec)
        this.geometries.push(geometry)
      }
      const material = transparent ? this.materials.clear : this.materials.solid
      const mesh = new THREE.InstancedMesh(geometry, material, data.owners.length)
      mesh.castShadow = !transparent
      mesh.receiveShadow = true
      const upTo = new Int32Array(stepCount + 1)
      data.matrices.forEach((m, i) => {
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, data.colors[i])
        upTo[data.steps[i] + 1] += 1
      })
      for (let s = 1; s <= stepCount; s++) upTo[s] += upTo[s - 1]
      mesh.frustumCulled = false
      this.root.add(mesh)
      const matrices = new Float32Array(mesh.instanceMatrix.array)
      this.buckets.push({
        mesh,
        owners: data.owners,
        colors: data.colors,
        matrices,
        upTo: upTo.subarray(1) as Int32Array,
        studs:
          spec === 'stud'
            ? {
                owners: data.owners,
                colors: data.colors,
                matrices: matrices.slice(),
                from: Int32Array.from(data.steps),
                until: Float64Array.from(data.until),
              }
            : undefined,
      })
    }

    // Modell zentrieren und skalieren
    bounds.min.x -= 10
    bounds.min.z -= 10
    bounds.max.x += 10
    bounds.max.z += 10
    const center = bounds.getCenter(new THREE.Vector3())
    bounds.getSize(this.size).multiplyScalar(SCALE)
    this.root.scale.setScalar(SCALE)
    this.root.position.set(-center.x * SCALE, -bounds.min.y * SCALE + 0.05, -center.z * SCALE)

    const span = Math.max(this.size.x, this.size.z)
    this.ground.scale.set(span * 3, 1, span * 3)
    this.light.position.set(-span * 0.6, span * 1.2, span * 0.4)
    const shadow = this.light.shadow.camera
    shadow.left = shadow.bottom = -span
    shadow.right = shadow.top = span
    shadow.far = span * 4
    shadow.updateProjectionMatrix()
    this.camera.far = span * 20
    this.camera.updateProjectionMatrix()

    this.step = stepCount - 1
    this.applyStep()
    this.setCamera('angle', false)
  }

  /** Zeigt alle Teile bis einschließlich Schritt `step`. `animate` lässt den letzten Schritt einfallen. */
  setStep(step: number, animate = false) {
    if (!this.input) return
    this.step = Math.max(0, Math.min(step, this.input.model.steps.length - 1))
    this.restoreDrop()
    this.applyStep()
    if (animate && !reducedMotion()) {
      this.dropStep = this.step
      this.dropStart = performance.now()
    }
    this.requestRender()
  }

  /** Hebt alle Teile mit diesem LDraw-Farbcode hervor (null = alle normal). */
  setFocus(code: number | null) {
    this.focus = code
    this.applyColors()
  }

  setCamera(preset: CameraPreset, animate = true) {
    const span = Math.max(this.size.x, this.size.z)
    const { clientWidth: width, clientHeight: height } = this.canvas
    const freeW = Math.max(width - this.insets.left - this.insets.right, 200)
    const freeH = Math.max(height - this.insets.top - this.insets.bottom, 200)
    const fullH = height + 2 * Math.abs(this.offset().y)
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const fit = ((span * fullH) / (2 * tan * Math.min(freeW, freeH))) * 1.06
    // Schräg: die vordere Kante kommt näher, deshalb etwas weiter weg
    const target =
      preset === 'top'
        ? new THREE.Vector3(0, fit, 0.001)
        : new THREE.Vector3(0.18, 0.78, 0.72).normalize().multiplyScalar(fit * 1.5)
    this.controls.target.set(0, 0, 0)
    if (!animate || reducedMotion()) {
      this.camera.position.copy(target)
      this.cameraTween = null
    } else this.cameraTween = { from: this.camera.position.clone(), to: target, start: performance.now() }
    this.requestRender()
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointermove', this.handlePointer)
    this.canvas.removeEventListener('pointerleave', this.handleLeave)
    this.clear()
    this.controls.dispose()
    this.materials.solid.dispose()
    this.materials.clear.dispose()
    this.scene.environment?.dispose()
    this.renderer.dispose()
  }

  private clear() {
    for (const bucket of this.buckets) {
      this.root.remove(bucket.mesh)
      bucket.mesh.dispose()
    }
    for (const geometry of this.geometries) geometry.dispose()
    this.buckets = []
    this.geometries = []
    this.hovered = null
  }

  private applyStep() {
    for (const bucket of this.buckets) {
      if (bucket.studs) this.compactStuds(bucket)
      bucket.mesh.count = bucket.upTo[this.step] ?? 0
    }
    if (this.focus !== null) this.applyColors()
    if (this.hovered && this.hovered.instance >= this.hovered.bucket.mesh.count) this.setHovered(null)
  }

  /** Noppen: nur die zeigen, die in diesem Schritt schon da und noch nicht verdeckt sind. */
  private compactStuds(bucket: Bucket) {
    const all = bucket.studs!
    const owners: number[] = []
    const colors: THREE.Color[] = []
    const upTo = new Int32Array(bucket.upTo.length)
    const array = bucket.mesh.instanceMatrix.array as Float32Array
    for (let i = 0; i < all.owners.length; i++) {
      if (all.from[i] > this.step || all.until[i] <= this.step) continue
      array.set(all.matrices.subarray(i * 16, i * 16 + 16), owners.length * 16)
      bucket.mesh.setColorAt(owners.length, all.colors[i])
      owners.push(all.owners[i])
      colors.push(all.colors[i])
      upTo[all.from[i]] += 1
    }
    for (let s = 1; s < upTo.length; s++) upTo[s] += upTo[s - 1]
    bucket.owners = owners
    bucket.colors = colors
    bucket.upTo = upTo
    bucket.matrices = array.slice(0, owners.length * 16)
    bucket.mesh.instanceMatrix.needsUpdate = true
    if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true
    if (this.hovered?.bucket === bucket) this.hovered = null
  }

  private applyColors() {
    const dim = new THREE.Color('#c7ccd3')
    const scratch = new THREE.Color()
    const parts = this.input?.model.parts
    for (const bucket of this.buckets) {
      bucket.colors.forEach((base, i) => {
        scratch.copy(base)
        if (this.focus !== null && parts && parts[bucket.owners[i]].color !== this.focus) scratch.lerp(dim, 0.82)
        if (this.hovered && this.hovered.bucket.owners[this.hovered.instance] === bucket.owners[i])
          scratch.lerp(new THREE.Color('#ffffff'), 0.28)
        bucket.mesh.setColorAt(i, scratch)
      })
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true
    }
    this.requestRender()
  }

  private setHovered(next: { bucket: Bucket; instance: number } | null) {
    const same =
      next && this.hovered && next.bucket.owners[next.instance] === this.hovered.bucket.owners[this.hovered.instance]
    if (same || (!next && !this.hovered)) return
    this.hovered = next
    this.applyColors()
  }

  private handlePointer = (event: PointerEvent) => {
    this.pointerEvent = event
    this.needsRender = true
  }

  private handleLeave = () => {
    this.pointerEvent = null
    this.setHovered(null)
    this.onHover(null)
  }

  private pick() {
    const event = this.pointerEvent
    this.pointerEvent = null
    if (!event || event.buttons !== 0) return
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(
      this.buckets.map((b) => b.mesh),
      false,
    )
    const hit = hits.find((h) => h.instanceId !== undefined)
    const bucket = hit && this.buckets.find((b) => b.mesh === hit.object)
    if (!hit || !bucket || hit.instanceId === undefined) {
      this.setHovered(null)
      this.onHover(null)
      return
    }
    this.setHovered({ bucket, instance: hit.instanceId })
    this.onHover({ part: bucket.owners[hit.instanceId], x: event.clientX, y: event.clientY })
  }

  private restoreDrop() {
    if (this.dropStep < 0) return
    for (const bucket of this.buckets) {
      bucket.mesh.instanceMatrix.array.set(bucket.matrices)
      bucket.mesh.instanceMatrix.needsUpdate = true
    }
    this.dropStep = -1
  }

  private animateDrop(now: number) {
    if (this.dropStep < 0) return false
    const duration = 520
    const spread = 420
    let running = false
    for (const bucket of this.buckets) {
      const start = this.dropStep === 0 ? 0 : bucket.upTo[this.dropStep - 1]
      const end = bucket.upTo[this.dropStep]
      if (end <= start) continue
      const array = bucket.mesh.instanceMatrix.array as Float32Array
      for (let i = start; i < end; i++) {
        const delay = ((i - start) / Math.max(end - start, 1)) * spread
        const t = Math.min(Math.max((now - this.dropStart - delay) / duration, 0), 1)
        if (t < 1) running = true
        const lift = (1 - easeOutBack(t)) * 160
        array[i * 16 + 13] = bucket.matrices[i * 16 + 13] + lift
      }
      bucket.mesh.instanceMatrix.needsUpdate = true
    }
    if (!running) this.dropStep = -1
    return true
  }

  /** Setzt die verdeckten Ränder und richtet die Kamera neu aus. */
  setInsets(insets: Insets) {
    const changed = (Object.keys(insets) as (keyof Insets)[]).some((k) => Math.abs(insets[k] - this.insets[k]) > 1)
    if (!changed) return
    this.insets = insets
    this.resize()
  }

  /** Verschiebung der Bildmitte zur Mitte des freien Bereichs */
  private offset() {
    return {
      x: (this.insets.left - this.insets.right) / 2,
      y: (this.insets.top - this.insets.bottom) / 2,
    }
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    const { x, y } = this.offset()
    const fullW = width + 2 * Math.abs(x)
    const fullH = height + 2 * Math.abs(y)
    this.camera.aspect = fullW / fullH
    this.camera.setViewOffset(fullW, fullH, Math.abs(x) - x, Math.abs(y) - y, width, height)
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  private requestRender() {
    this.needsRender = true
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const now = performance.now()
    let active = this.controls.update()
    if (this.cameraTween) {
      const t = Math.min((now - this.cameraTween.start) / 700, 1)
      const k = 1 - Math.pow(1 - t, 3)
      this.camera.position.lerpVectors(this.cameraTween.from, this.cameraTween.to, k)
      this.camera.lookAt(this.controls.target)
      if (t >= 1) this.cameraTween = null
      active = true
    }
    if (this.animateDrop(now)) active = true
    if (this.pointerEvent) this.pick()
    if (!active && !this.needsRender) return
    this.needsRender = false
    this.renderer.render(this.scene, this.camera)
  }
}

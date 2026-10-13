/**
 * Schnellvorschau im Browser: verkleinert das Foto auf die Noppenzahl und wählt je Noppe
 * die nächste LEGO-Farbe (ohne Dithering). Nur eine Annäherung an das, was der Server baut.
 */

export interface PreviewSettings {
  width: number
  height: number
  fit: 'zuschneiden' | 'einpassen'
  contrast: number
  saturation: number
  palette: string[]
  frame: number
  frameColor: string
  /** Füllfarbe beim Einpassen */
  padColor: string
}

type Lab = [number, number, number]

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Liefert für jede Noppe die Palettenfarbe (Hex) – Zeile für Zeile. */
export function quantize(image: CanvasImageSource & { width: number; height: number }, s: PreviewSettings) {
  const innerW = Math.max(s.width - 2 * s.frame, 1)
  const innerH = Math.max(s.height - 2 * s.frame, 1)
  const canvas = document.createElement('canvas')
  canvas.width = innerW
  canvas.height = innerH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = s.padColor
  ctx.fillRect(0, 0, innerW, innerH)

  const scale =
    s.fit === 'zuschneiden'
      ? Math.max(innerW / image.width, innerH / image.height)
      : Math.min(innerW / image.width, innerH / image.height)
  const [dw, dh] = [image.width * scale, image.height * scale]
  ctx.filter = `contrast(${s.contrast}) saturate(${s.saturation})`
  ctx.drawImage(image, (innerW - dw) / 2, (innerH - dh) / 2, dw, dh)

  const pixels = ctx.getImageData(0, 0, innerW, innerH).data
  const palette = s.palette.map((hex) => ({ hex, lab: rgbToLab(...hexToRgb(hex)) }))
  const cache = new Map<number, string>()
  const cells: string[] = new Array(s.width * s.height).fill(s.frameColor)

  for (let y = 0; y < innerH; y++)
    for (let x = 0; x < innerW; x++) {
      const i = (y * innerW + x) * 4
      const key = ((pixels[i] >> 2) << 12) | ((pixels[i + 1] >> 2) << 6) | (pixels[i + 2] >> 2)
      let hex = cache.get(key)
      if (!hex) {
        const [l, a, b] = rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2])
        let best = Infinity
        hex = palette[0]?.hex ?? '#000000'
        for (const color of palette) {
          const d = (color.lab[0] - l) ** 2 + (color.lab[1] - a) ** 2 + (color.lab[2] - b) ** 2
          if (d < best) {
            best = d
            hex = color.hex
          }
        }
        cache.set(key, hex)
      }
      cells[(y + s.frame) * s.width + x + s.frame] = hex
    }
  return cells
}

/** Zeichnet Noppen-Zellen auf ein Canvas. */
export function drawStuds(canvas: HTMLCanvasElement, cells: string[], width: number, height: number, maxSize = 900) {
  const cell = Math.max(3, Math.floor(maxSize / Math.max(width, height)))
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = width * cell * dpr
  canvas.height = height * cell * dpr
  canvas.style.aspectRatio = `${width} / ${height}`
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const radius = cell * 0.3
  ctx.lineWidth = Math.max(1, cell * 0.08)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = cells[y * width + x]
      ctx.fillRect(x * cell, y * cell, cell, cell)
      if (cell < 6) continue
      // Flache Noppe: heller Kreis mit dunklem Ring
      ctx.beginPath()
      ctx.arc(x * cell + cell / 2, y * cell + cell / 2, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'
      ctx.stroke()
    }
}

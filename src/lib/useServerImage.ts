import { useEffect, useState } from 'react'
import { previewImage } from '../api/client'

export interface ServerImage {
  file: File
  key: string
  bitmap: ImageBitmap
  url: string
}

/**
 * Bearbeitetes Foto vom Server (`POST /bild/vorschau`), kurz verzögert und abbrechbar.
 * Ohne Bildfelder oder ohne Server gibt es `null`, dann bleibt das Original.
 * Während eine neue Version lädt, bleibt die alte stehen (`pending`).
 */
export function useServerImage(file: File | null, fields: Record<string, string> | null, size = 800) {
  const [image, setImage] = useState<ServerImage | null>(null)
  const key = file && fields && Object.keys(fields).length > 0 ? JSON.stringify(fields) : null

  useEffect(() => {
    if (!file || !key) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const blob = await previewImage(file, { ...JSON.parse(key), groesse: String(size) }, controller.signal)
        const bitmap = await createImageBitmap(blob)
        if (controller.signal.aborted) return bitmap.close()
        setImage({ file, key, bitmap, url: URL.createObjectURL(blob) })
      } catch {
        // Server weg oder Angabe ungültig: die letzte Version bleibt stehen
      }
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [file, key, size])

  // Alte Version freigeben, sobald die neue gezeigt wird
  useEffect(
    () => () => {
      if (!image) return
      image.bitmap.close()
      URL.revokeObjectURL(image.url)
    },
    [image],
  )

  if (!key || !image || image.file !== file) return { image: null, pending: !!key }
  return { image, pending: image.key !== key }
}

/** Shrink a picked image to a small data URL (a logo does not need more than ~400px). Keeps transparency for PNG. */
export async function logoFromFile(file: File, maxW = 400, maxH = 160): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG or WebP image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('That image is over 5 MB. Pick a smaller one.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url })
    const k = Math.min(1, maxW / img.width, maxH / img.height)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9)
  } finally { URL.revokeObjectURL(url) }
}

/** Natural size of a data URL image, so the PDF can keep the aspect ratio. */
export const imageSize = (dataUrl: string) =>
  new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = () => res({ w: 0, h: 0 }); i.src = dataUrl })

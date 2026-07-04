/** Read pixel dimensions from PNG/JPEG/GIF bytes (for sizing DOCX images). Pure. */
export function imageSize(buf: Buffer): { width: number; height: number } {
  // PNG: IHDR width/height at bytes 16..23.
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // GIF: little-endian width/height at bytes 6..9.
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  // JPEG: scan for a Start-Of-Frame marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o++
        continue
      }
      const marker = buf[o + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) }
      }
      o += 2 + buf.readUInt16BE(o + 2)
    }
  }
  return { width: 600, height: 400 }
}

/** Scale dimensions to fit a maximum width, preserving aspect ratio. */
export function fitWidth(
  dim: { width: number; height: number },
  maxWidth: number
): { width: number; height: number } {
  if (dim.width <= maxWidth) return dim
  return { width: maxWidth, height: Math.round((dim.height * maxWidth) / dim.width) }
}

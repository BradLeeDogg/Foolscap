// Generates build/icon.png (1024) and build/icon.ico (256, PNG-based) — a calm
// "F" monogram (cream on an ink tile). Pure Node: per-pixel RGBA + zlib, no deps.
// Run: node scripts/gen-icon.cjs   (re-run to regenerate)
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const INK = [0x2b, 0x2a, 0x26] // warm charcoal tile
const CREAM = [0xf3, 0xea, 0xd6] // paper-cream glyph

function makeRGBA(S) {
  const buf = Buffer.alloc(S * S * 4) // transparent by default
  const m = S * 0.055 // tile inset
  const r = S * 0.205 // corner radius
  // Blocky "F" geometry (fractions of S).
  const stemX0 = S * 0.37,
    stemW = S * 0.115,
    top = S * 0.28,
    bot = S * 0.72,
    armH = S * 0.115,
    topArmW = S * 0.3,
    midArmW = S * 0.21,
    midY = S * 0.455
  const inTile = (x, y) => {
    if (x < m || x > S - m || y < m || y > S - m) return false
    const cx = x < m + r ? m + r : x > S - m - r ? S - m - r : x
    const cy = y < m + r ? m + r : y > S - m - r ? S - m - r : y
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  const inF = (x, y) => {
    if (y < top || y > bot) return false
    if (x >= stemX0 && x <= stemX0 + stemW) return true // stem
    if (y >= top && y <= top + armH && x >= stemX0 && x <= stemX0 + topArmW) return true // top arm
    if (y >= midY && y <= midY + armH && x >= stemX0 && x <= stemX0 + midArmW) return true // mid arm
    return false
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4
      if (!inTile(x + 0.5, y + 0.5)) continue
      const c = inF(x + 0.5, y + 0.5) ? CREAM : INK
      buf[o] = c[0]
      buf[o + 1] = c[1]
      buf[o + 2] = c[2]
      buf[o + 3] = 255
    }
  }
  return buf
}

const CRC = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encodePNG(S, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(S * (1 + S * 4))
  for (let y = 0; y < S; y++) {
    const ro = y * (1 + S * 4)
    raw[ro] = 0 // filter: none
    rgba.copy(raw, ro + 1, y * S * 4, (y + 1) * S * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
function encodeICO(png256) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // width 256
  entry[1] = 0 // height 256
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png256.length, 8)
  entry.writeUInt32LE(22, 12) // offset
  return Buffer.concat([header, entry, png256])
}

const out = path.join(__dirname, '..', 'build')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'icon.png'), encodePNG(1024, makeRGBA(1024)))
fs.writeFileSync(path.join(out, 'icon.ico'), encodeICO(encodePNG(256, makeRGBA(256))))
console.log('wrote build/icon.png (1024) and build/icon.ico (256)')

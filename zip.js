// 압축 없는(store) ZIP 쓰기·읽기 — 사진 백업용. 라이브러리 없이, 우리가 쓴 ZIP만 읽으면 됨
(() => {
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();

  // files: [{name, data: Uint8Array}] → Blob
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); // UTF-8 이름
      h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + size;
    }
    const cSize = central.reduce((s, p) => s + p.byteLength, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
  }

  // ArrayBuffer → [{name, data}] (store 방식만)
  function unzip(buf) {
    const v = new DataView(buf), out = [], dec = new TextDecoder();
    let p = 0;
    while (p + 30 <= buf.byteLength && v.getUint32(p, true) === 0x04034b50) {
      const method = v.getUint16(p + 8, true), size = v.getUint32(p + 18, true);
      const nl = v.getUint16(p + 26, true), xl = v.getUint16(p + 28, true);
      const name = dec.decode(new Uint8Array(buf, p + 30, nl));
      const start = p + 30 + nl + xl;
      if (method !== 0) throw new Error('compressed zip not supported');
      out.push({ name, data: new Uint8Array(buf.slice(start, start + size)) });
      p = start + size;
    }
    return out;
  }
  window.Zip = { zip, unzip };
})();

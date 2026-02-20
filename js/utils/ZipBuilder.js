/**
 * Minimal ZIP file builder (no compression, stored entries).
 * Produces valid ZIP archives for MVR/GDTF packaging.
 */
export class ZipBuilder {
  constructor() {
    this.files = [];
  }

  /**
   * Add a file to the archive.
   * @param {string} name - file path inside archive
   * @param {Uint8Array|string} data - file content
   */
  addFile(name, data) {
    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    }
    this.files.push({ name, data });
  }

  /**
   * Build the ZIP file.
   * @returns {Uint8Array}
   */
  build() {
    const entries = [];
    let offset = 0;

    // Build local file headers + data
    for (const file of this.files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = this._crc32(file.data);

      // Local file header (30 bytes + name)
      const localHeader = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(localHeader);
      lv.setUint32(0, 0x04034b50, true);  // local file header signature
      lv.setUint16(4, 20, true);           // version needed to extract
      lv.setUint16(6, 0, true);            // general purpose bit flag
      lv.setUint16(8, 0, true);            // compression method (stored)
      lv.setUint16(10, 0, true);           // last mod file time
      lv.setUint16(12, 0, true);           // last mod file date
      lv.setUint32(14, crc, true);         // crc-32
      lv.setUint32(18, file.data.length, true);  // compressed size
      lv.setUint32(22, file.data.length, true);  // uncompressed size
      lv.setUint16(26, nameBytes.length, true);  // file name length
      lv.setUint16(28, 0, true);           // extra field length
      new Uint8Array(localHeader).set(nameBytes, 30);

      entries.push({ header: localHeader, data: file.data, offset, nameBytes, crc });
      offset += localHeader.byteLength + file.data.length;
    }

    // Build central directory
    const centralHeaders = [];
    for (const entry of entries) {
      const ch = new ArrayBuffer(46 + entry.nameBytes.length);
      const cv = new DataView(ch);
      cv.setUint32(0, 0x02014b50, true);   // central file header signature
      cv.setUint16(4, 20, true);            // version made by
      cv.setUint16(6, 20, true);            // version needed to extract
      cv.setUint16(8, 0, true);             // general purpose bit flag
      cv.setUint16(10, 0, true);            // compression method
      cv.setUint16(12, 0, true);            // last mod file time
      cv.setUint16(14, 0, true);            // last mod file date
      cv.setUint32(16, entry.crc, true);    // crc-32
      cv.setUint32(20, entry.data.length, true);  // compressed size
      cv.setUint32(24, entry.data.length, true);  // uncompressed size
      cv.setUint16(28, entry.nameBytes.length, true); // file name length
      cv.setUint16(30, 0, true);            // extra field length
      cv.setUint16(32, 0, true);            // file comment length
      cv.setUint16(34, 0, true);            // disk number start
      cv.setUint16(36, 0, true);            // internal file attributes
      cv.setUint32(38, 0, true);            // external file attributes
      cv.setUint32(42, entry.offset, true); // relative offset of local header
      new Uint8Array(ch).set(entry.nameBytes, 46);
      centralHeaders.push(ch);
    }

    const centralDirSize = centralHeaders.reduce((s, h) => s + h.byteLength, 0);
    const centralDirOffset = offset;

    // End of central directory record (22 bytes)
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);     // end of central dir signature
    ev.setUint16(4, 0, true);              // number of this disk
    ev.setUint16(6, 0, true);              // disk where central dir starts
    ev.setUint16(8, this.files.length, true);  // entries on this disk
    ev.setUint16(10, this.files.length, true); // total entries
    ev.setUint32(12, centralDirSize, true);    // size of central directory
    ev.setUint32(16, centralDirOffset, true);  // offset of central directory
    ev.setUint16(20, 0, true);             // comment length

    // Combine everything
    const totalSize = offset + centralDirSize + 22;
    const result = new Uint8Array(totalSize);
    let pos = 0;

    for (const entry of entries) {
      result.set(new Uint8Array(entry.header), pos);
      pos += entry.header.byteLength;
      result.set(entry.data, pos);
      pos += entry.data.length;
    }
    for (const ch of centralHeaders) {
      result.set(new Uint8Array(ch), pos);
      pos += ch.byteLength;
    }
    result.set(new Uint8Array(eocd), pos);

    return result;
  }

  /** Standard CRC-32 */
  _crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

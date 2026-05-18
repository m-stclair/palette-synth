const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  })();

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

function dateToDosParts(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = Math.max(1, date.getMonth() + 1);
    const day = Math.max(1, date.getDate());
    const hours = Math.max(0, date.getHours());
    const minutes = Math.max(0, date.getMinutes());
    const seconds = Math.floor(Math.max(0, date.getSeconds()) / 2);
    return {
      time: (hours << 11) | (minutes << 5) | seconds,
      date: ((year - 1980) << 9) | (month << 5) | day
    };
  }

export function createStoredZipBlob(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    let centralSize = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(String(entry.name || "file.bin"));
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
      const {time, date} = dateToDosParts(entry.lastModified || new Date());
      const checksum = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const dvLocal = new DataView(local.buffer);
      dvLocal.setUint32(0, 0x04034B50, true);
      dvLocal.setUint16(4, 20, true);
      dvLocal.setUint16(6, 0x0800, true);
      dvLocal.setUint16(8, 0, true);
      dvLocal.setUint16(10, time, true);
      dvLocal.setUint16(12, date, true);
      dvLocal.setUint32(14, checksum, true);
      dvLocal.setUint32(18, data.length, true);
      dvLocal.setUint32(22, data.length, true);
      dvLocal.setUint16(26, nameBytes.length, true);
      dvLocal.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      localParts.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const dvCentral = new DataView(central.buffer);
      dvCentral.setUint32(0, 0x02014B50, true);
      dvCentral.setUint16(4, 20, true);
      dvCentral.setUint16(6, 20, true);
      dvCentral.setUint16(8, 0x0800, true);
      dvCentral.setUint16(10, 0, true);
      dvCentral.setUint16(12, time, true);
      dvCentral.setUint16(14, date, true);
      dvCentral.setUint32(16, checksum, true);
      dvCentral.setUint32(20, data.length, true);
      dvCentral.setUint32(24, data.length, true);
      dvCentral.setUint16(28, nameBytes.length, true);
      dvCentral.setUint16(30, 0, true);
      dvCentral.setUint16(32, 0, true);
      dvCentral.setUint16(34, 0, true);
      dvCentral.setUint16(36, 0, true);
      dvCentral.setUint32(38, 0, true);
      dvCentral.setUint32(42, localOffset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      localOffset += local.length;
      centralSize += central.length;
    }

    const end = new Uint8Array(22);
    const dvEnd = new DataView(end.buffer);
    dvEnd.setUint32(0, 0x06054B50, true);
    dvEnd.setUint16(4, 0, true);
    dvEnd.setUint16(6, 0, true);
    dvEnd.setUint16(8, entries.length, true);
    dvEnd.setUint16(10, entries.length, true);
    dvEnd.setUint32(12, centralSize, true);
    dvEnd.setUint32(16, localOffset, true);
    dvEnd.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, end], {type: "application/zip"});
  }

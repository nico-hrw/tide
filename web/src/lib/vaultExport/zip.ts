// Minimal ZIP writer/reader (method 0 = stored, no compression). Enough for the vault export and its
// import: UTF-8 names, CRC-32 per entry, no encryption, no ZIP64 (limit: 65535 entries, 4 GiB).

export interface ZipEntry {
    path: string;
    data: Uint8Array;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;
// Fixed DOS date/time (1980-01-01 00:00): stored entries carry no meaningful timestamp.
const DOS_TIME = 0;
const DOS_DATE = 0x21;
const UTF8_FLAG = 0x0800;

function normalizePath(path: string): string {
    const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!clean || clean.split('/').some((p) => p === '..')) throw new Error(`Ungültiger Pfad im Archiv: ${path}`);
    return clean;
}

/** Builds the archive as a Blob (parts are not copied into one large buffer). */
export function createZip(entries: ZipEntry[]): Blob {
    if (entries.length > MAX_ENTRIES) throw new Error('Zu viele Dateien für ein ZIP-Archiv.');
    const parts: BlobPart[] = [];
    const central: Uint8Array[] = [];
    const seen = new Set<string>();
    let offset = 0;

    for (const entry of entries) {
        const path = normalizePath(entry.path);
        if (seen.has(path)) throw new Error(`Doppelter Pfad im Archiv: ${path}`);
        seen.add(path);
        const name = encoder.encode(path);
        const crc = crc32(entry.data);
        const size = entry.data.length;
        if (size > MAX_SIZE || offset > MAX_SIZE) throw new Error('Archiv zu groß (4 GiB-Grenze).');

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, UTF8_FLAG, true);
        local.setUint16(8, 0, true);
        local.setUint16(10, DOS_TIME, true);
        local.setUint16(12, DOS_DATE, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, size, true);
        local.setUint32(22, size, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(new Uint8Array(local.buffer), name, entry.data as BlobPart);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, UTF8_FLAG, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, DOS_TIME, true);
        cd.setUint16(14, DOS_DATE, true);
        cd.setUint32(16, crc, true);
        cd.setUint32(20, size, true);
        cd.setUint32(24, size, true);
        cd.setUint16(28, name.length, true);
        cd.setUint32(42, offset, true);
        central.push(new Uint8Array(cd.buffer), name);

        offset += 30 + name.length + size;
    }

    const centralSize = central.reduce((sum, c) => sum + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    parts.push(...(central as BlobPart[]), new Uint8Array(end.buffer));
    return new Blob(parts, { type: 'application/zip' });
}

/** Reads a stored (method 0) archive written by `createZip`; verifies every CRC. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Keine gültige ZIP-Datei.');
    const count = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];

    for (let n = 0; n < count; n++) {
        if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt.');
        const method = view.getUint16(pos + 10, true);
        const crc = view.getUint32(pos + 16, true);
        const size = view.getUint32(pos + 24, true);
        const nameLen = view.getUint16(pos + 28, true);
        const extraLen = view.getUint16(pos + 30, true);
        const commentLen = view.getUint16(pos + 32, true);
        const localOffset = view.getUint32(pos + 42, true);
        const path = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
        if (method !== 0) throw new Error(`Nicht unterstützte ZIP-Kompression bei ${path}.`);
        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`ZIP-Eintrag beschädigt: ${path}`);
        const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(dataStart, dataStart + size);
        if (data.length !== size || crc32(data) !== crc) throw new Error(`Prüfsumme stimmt nicht: ${path}`);
        entries.push({ path: normalizePath(path), data });
        pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

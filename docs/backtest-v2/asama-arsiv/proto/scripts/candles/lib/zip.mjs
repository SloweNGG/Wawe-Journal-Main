// Minimal single-entry ZIP reader on node:zlib (no npm). Built for Binance Vision kline zips:
// exactly one deflate (or stored) entry, no encryption, no ZIP64. zlib.crc32 needs Node >= 20.15 / 22.2.
import { inflateRawSync, crc32 } from 'node:zlib';

export const ZIP_MAX_ENTRY_BYTES = 64 * 1024 * 1024;   // absolute inflate cap (real 1m month CSVs are 6-8 MB)

export class ZipError extends Error {
  constructor(message) { super(message); this.name = 'ZipError'; }
}

/**
 * @param {Buffer} zip
 * @param {{ nameRe?: RegExp, maxBytes?: number }} [opts]
 * @returns {{ name: string, data: Buffer, method: number }}
 */
export function extractSingleEntry(zip, opts = {}) {
  const maxBytes = opts.maxBytes ?? ZIP_MAX_ENTRY_BYTES;
  if (!Buffer.isBuffer(zip) || zip.length < 22) throw new ZipError('not a zip: too short (truncated download or error page)');
  // 1. End of central directory: scan back over the 22-byte record plus a comment of up to 64 KiB.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('end-of-central-directory not found (truncated download or HTML/XML error body)');
  if (eocd >= 20 && zip.readUInt32LE(eocd - 20) === 0x07064b50) throw new ZipError('ZIP64 is not supported');
  const entries = zip.readUInt16LE(eocd + 10);
  if (entries !== 1) throw new ZipError(`expected exactly 1 entry, found ${entries}`);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cd = zip.readUInt32LE(eocd + 16);
  if (cd + cdSize > eocd) throw new ZipError('central directory overlaps the EOCD record');
  // 2. Central directory header: authoritative CRC and sizes (valid even when bit 3 / data descriptor is used).
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new ZipError('bad central directory header');
  const flags = zip.readUInt16LE(cd + 8);
  const method = zip.readUInt16LE(cd + 10);
  const crc = zip.readUInt32LE(cd + 16);
  const compSize = zip.readUInt32LE(cd + 20);
  const size = zip.readUInt32LE(cd + 24);
  const nameLen = zip.readUInt16LE(cd + 28);
  const loc = zip.readUInt32LE(cd + 42);
  const name = zip.toString('utf8', cd + 46, cd + 46 + nameLen);
  if (flags & 0x0001) throw new ZipError('encrypted entries are not supported');
  if ([compSize, size, loc].includes(0xffffffff)) throw new ZipError('ZIP64 is not supported');
  if (opts.nameRe && !opts.nameRe.test(name)) throw new ZipError(`unexpected entry name "${name}"`);
  if (size > maxBytes) throw new ZipError(`entry declares ${size} bytes, above the ${maxBytes}-byte cap`);
  // 3. Local header: use ITS OWN name/extra lengths to find the data.
  if (loc + 30 > cd || zip.readUInt32LE(loc) !== 0x04034b50) throw new ZipError('bad local file header');
  const data = loc + 30 + zip.readUInt16LE(loc + 26) + zip.readUInt16LE(loc + 28);
  if (data + compSize > cd) throw new ZipError('entry data overlaps the central directory');
  const raw = zip.subarray(data, data + compSize);
  // 4. Inflate (8) or copy (0) with an output cap, then verify size and CRC-32.
  let out;
  if (method === 8) {
    try { out = inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) }); }
    catch (e) { throw new ZipError(`inflate failed: ${e.code || e.message}`); }
  } else if (method === 0) {
    out = Buffer.from(raw);
  } else {
    throw new ZipError(`unsupported compression method ${method}`);
  }
  if (out.length !== size) throw new ZipError(`size mismatch: ${out.length} != ${size}`);
  if ((crc32(out) >>> 0) !== crc) throw new ZipError('CRC-32 mismatch');
  return { name, data: out, method };
}

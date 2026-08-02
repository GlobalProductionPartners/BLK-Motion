/*
 * MVR (My Virtual Rig) reader.
 *
 * An .mvr is a ZIP holding GeneralSceneDescription.xml plus GDTF files and
 * 3D models. We only need the scene XML — the renderer parses it with
 * DOMParser (already present there) and drives the import mapping UI.
 *
 * The ZIP is read with a minimal central-directory parser over Node's zlib
 * rather than a dependency: this app ships as a signed, licensed, offline
 * desktop build and every added package is another thing to audit and
 * notarise. Only STORE (0) and DEFLATE (8) exist in practice for MVR.
 */
const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CDFH_SIG = 0x02014b50;

function findEocd(buf) {
  // EOCD is at the end, but a trailing comment can push it back up to 64k
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function listEntries(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (off === 0xffffffff) throw new Error('ZIP64 archives are not supported');

  const entries = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CDFH_SIG) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  // the local header repeats the name/extra lengths — the data starts after them
  const lh = entry.localOff;
  if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('Corrupt ZIP entry: ' + entry.name);
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('Unsupported ZIP compression method ' + entry.method + ' in ' + entry.name);
}

/** Read an .mvr and return its GeneralSceneDescription.xml as text. */
function readMvr(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = listEntries(buf);
  const scene = entries.find((e) => /(^|\/)generalscenedescription\.xml$/i.test(e.name));
  if (!scene) {
    throw new Error('No GeneralSceneDescription.xml inside this .mvr (found: ' +
      (entries.slice(0, 6).map((e) => e.name).join(', ') || 'nothing') + ')');
  }
  return readEntry(buf, scene).toString('utf8');
}

module.exports = { readMvr };

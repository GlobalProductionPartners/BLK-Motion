const dgram = require('dgram');
const crypto = require('crypto');

const SACN_PORT = 5568;
const ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]); // "ASC-E1.17\0\0\0"
const VECTOR_ROOT_E131_DATA = 0x00000004;
const VECTOR_E131_DATA_PACKET = 0x00000002;
const VECTOR_DMP_SET_PROPERTY = 0x02;

function sacnMulticastGroup(universe) {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}

/**
 * Real sACN / ANSI E1.31 sender over UDP multicast — the layered
 * Root/Framing/DMP packet a lighting console or media server actually
 * expects to parse, not a stand-in.
 */
class SACN {
  constructor({ priority = 100 } = {}) {
    this.onError = null; // set by the host; an unhandled dgram 'error' would throw
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('error', (err) => { if (this.onError) this.onError(err); });
    this.socket.bind(() => {
      try { this.socket.setMulticastTTL(8); } catch (_e) { /* platform default is fine */ }
    });
    this.cid = crypto.randomBytes(16);
    this.seq = 0;
    this.priority = priority; // E1.31 priority 1–200; settable live from Settings
  }

  /** Build + send one sACN DMX data packet for a universe (1–63999). */
  sendDmx(universe, data, sourceName = 'BLK Motion') {
    const dmxSlots = Buffer.from(data).subarray(0, 512);
    const propertyValues = Buffer.concat([Buffer.from([0x00]), dmxSlots]); // start code + slots

    const totalLen = 125 + propertyValues.length;
    const rootLen = totalLen - 16;
    const framingLen = totalLen - 38;
    const dmpLen = totalLen - 115;

    const pkt = Buffer.alloc(totalLen);
    let o = 0;

    // Root Layer
    pkt.writeUInt16BE(0x0010, o); o += 2;               // Preamble Size
    pkt.writeUInt16BE(0x0000, o); o += 2;                // Post-amble Size
    ACN_ID.copy(pkt, o); o += 12;                        // ACN Packet Identifier
    pkt.writeUInt16BE(0x7000 | (rootLen & 0x0fff), o); o += 2;
    pkt.writeUInt32BE(VECTOR_ROOT_E131_DATA, o); o += 4;
    this.cid.copy(pkt, o); o += 16;                      // CID

    // Framing Layer
    pkt.writeUInt16BE(0x7000 | (framingLen & 0x0fff), o); o += 2;
    pkt.writeUInt32BE(VECTOR_E131_DATA_PACKET, o); o += 4;
    Buffer.from(sourceName.slice(0, 63), 'utf8').copy(pkt, o); o += 64; // Source Name (64B, padded)
    pkt.writeUInt8(Math.min(200, Math.max(1, this.priority | 0)), o); o += 1; // Priority (default 100)
    pkt.writeUInt16BE(0, o); o += 2;                     // Sync Address (unused)
    pkt.writeUInt8(this.seq, o); o += 1;                 // Sequence Number
    this.seq = this.seq >= 255 ? 0 : this.seq + 1;
    pkt.writeUInt8(0, o); o += 1;                        // Options
    pkt.writeUInt16BE(universe, o); o += 2;              // Universe

    // DMP Layer
    pkt.writeUInt16BE(0x7000 | (dmpLen & 0x0fff), o); o += 2;
    pkt.writeUInt8(VECTOR_DMP_SET_PROPERTY, o); o += 1;
    pkt.writeUInt8(0xa1, o); o += 1;                     // Address Type & Data Type
    pkt.writeUInt16BE(0x0000, o); o += 2;                // First Property Address
    pkt.writeUInt16BE(0x0001, o); o += 2;                // Address Increment
    pkt.writeUInt16BE(propertyValues.length, o); o += 2; // Property value count
    propertyValues.copy(pkt, o);

    this.socket.send(pkt, SACN_PORT, sacnMulticastGroup(universe));
    return pkt;
  }

  close() {
    try { this.socket.close(); } catch (_e) { /* already closed */ }
  }
}

module.exports = SACN;

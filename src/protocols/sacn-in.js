const dgram = require('dgram');
const EventEmitter = require('events');

const SACN_PORT = 5568;
const ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]);
const VECTOR_ROOT_E131_DATA = 0x00000004;
const VECTOR_E131_DATA_PACKET = 0x00000002;

function multicastGroup(universe) {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}

/**
 * sACN / ANSI E1.31 receiver for console input. Joins the multicast group of
 * each configured universe (unicast to port 5568 is accepted too, per spec)
 * and emits 'dmx' { universe, data } for every start-code-0 data packet.
 */
class SacnIn extends EventEmitter {
  constructor() {
    super();
    this.ownCid = null; // set to our sACN sender's CID so we never hear our own output
    this.joined = new Set();
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('error', (err) => this.emit('error', err));
    this.socket.on('message', (msg) => this._handle(msg));
    this.ready = false;
    this.pendingJoins = [];
    this.socket.bind(SACN_PORT, () => {
      this.ready = true;
      this.pendingJoins.forEach((u) => this._join(u));
      this.pendingJoins = [];
    });
  }

  setUniverses(list) {
    const want = new Set(list || []);
    [...this.joined].forEach((u) => { if (!want.has(u)) this._leave(u); });
    [...want].forEach((u) => {
      if (this.joined.has(u)) return;
      if (this.ready) this._join(u);
      else this.pendingJoins.push(u);
    });
  }

  _join(u) {
    try { this.socket.addMembership(multicastGroup(u)); this.joined.add(u); }
    catch (err) { this.emit('error', err); }
  }

  _leave(u) {
    try { this.socket.dropMembership(multicastGroup(u)); } catch (_e) { /* iface gone */ }
    this.joined.delete(u);
  }

  _handle(msg) {
    // Layout mirrors our sender (sacn.js): root vector @18, framing vector
    // @40, universe @113 BE, DMP property count @123 BE, values @125
    // (start code + slots).
    if (msg.length < 126) return;
    if (msg.readUInt16BE(0) !== 0x0010) return;
    if (!msg.subarray(4, 16).equals(ACN_ID)) return;
    if (msg.readUInt32BE(18) !== VECTOR_ROOT_E131_DATA) return;
    if (msg.readUInt32BE(40) !== VECTOR_E131_DATA_PACKET) return;
    if (msg[112] & 0x40) return; // stream_terminated
    if (this.ownCid && msg.subarray(22, 38).equals(this.ownCid)) return; // our own multicast, looped back
    const universe = msg.readUInt16BE(113);
    const count = msg.readUInt16BE(123);
    if (count < 1 || msg[125] !== 0) return; // DMX start code only
    const data = msg.subarray(126, 126 + Math.min(count - 1, 512, msg.length - 126));
    if (data.length) this.emit('dmx', { universe, data });
  }

  close() {
    try { this.socket.close(); } catch (_e) { /* already closed */ }
  }
}

module.exports = SacnIn;

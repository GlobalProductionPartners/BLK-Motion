const dgram = require('dgram');
const os = require('os');
const EventEmitter = require('events');

const ARTNET_PORT = 6454;
const ARTNET_ID = Buffer.from('Art-Net\0', 'ascii'); // 8 bytes, per spec
const OP_DMX = 0x5000;
const OP_POLL = 0x2000;
const OP_POLL_REPLY = 0x2100;
const PROT_VER = 14;

/**
 * Real Art-Net (v4-compatible) sender/receiver over UDP broadcast.
 * Implements ArtDmx (send DMX) and ArtPoll/ArtPollReply (node discovery) —
 * the two operations BLK Motion's patch/live views actually need.
 */
class ArtNet extends EventEmitter {
  constructor({ bindPort = ARTNET_PORT, broadcast = '255.255.255.255' } = {}) {
    super();
    this.port = bindPort;         // bind AND destination port (Art-Net uses one)
    this.broadcast = broadcast;   // broadcast or unicast target address
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.seq = 1;
    this.inputUniverses = new Set(); // console-input universes we listen for

    this.socket.on('message', (msg, rinfo) => this._handleMessage(msg, rinfo));
    this.socket.on('error', (err) => this.emit('error', err));

    this.socket.bind(bindPort, () => {
      this.socket.setBroadcast(true);
    });
  }

  _handleMessage(msg, rinfo) {
    if (msg.length < 10 || !msg.subarray(0, 8).equals(ARTNET_ID)) return;
    const opCode = msg.readUInt16LE(8);
    if (opCode === OP_POLL_REPLY) {
      this.emit('poll-reply', this._parsePollReply(msg, rinfo));
    } else if (opCode === OP_DMX && this.inputUniverses.size && msg.length >= 20) {
      // Console input. Our own broadcast output loops back on this same
      // socket — drop packets whose source is a local address on OUR port so
      // an overlapping universe can never feed the engine its own output.
      const universe = msg[14] | (msg[15] << 8);
      if (!this.inputUniverses.has(universe)) return;
      if (rinfo.port === this.port && this._isLocalAddress(rinfo.address)) return;
      const len = Math.min(msg.readUInt16BE(16), 512, msg.length - 18);
      if (len > 0) this.emit('dmx-in', { universe, data: msg.subarray(18, 18 + len) });
    }
  }

  setInputUniverses(list) {
    this.inputUniverses = new Set(list || []);
  }

  _isLocalAddress(addr) {
    if (addr === '127.0.0.1') return true;
    if (!this._localAddrs || Date.now() - this._localAddrsAt > 30000) {
      this._localAddrs = new Set();
      const ifs = os.networkInterfaces();
      Object.keys(ifs).forEach((n) => (ifs[n] || []).forEach((a) => this._localAddrs.add(a.address)));
      this._localAddrsAt = Date.now();
    }
    return this._localAddrs.has(addr);
  }

  _parsePollReply(msg, rinfo) {
    // ArtPollReply layout (subset): IP(4)@[10], Port(2 LE)@[14],
    // ShortName(18 bytes)@[26], LongName(64 bytes)@[44], NumPortsHi/Lo@[173:175]
    const ip = `${msg[10]}.${msg[11]}.${msg[12]}.${msg[13]}`;
    const shortName = msg.subarray(26, 26 + 18).toString('ascii').replace(/\0.*$/, '');
    const longName = msg.subarray(44, 44 + 64).toString('ascii').replace(/\0.*$/, '');
    return { ip, shortName, longName, source: rinfo.address };
  }

  /** Build and send an ArtDmx packet for one universe (0–32767). data: Buffer/array up to 512 bytes. */
  sendDmx(universe, data) {
    const slots = Buffer.from(data).subarray(0, 512);
    const len = slots.length % 2 === 0 ? slots.length : slots.length + 1; // ArtDmx length must be even
    const packet = Buffer.alloc(18 + len);

    ARTNET_ID.copy(packet, 0);
    packet.writeUInt16LE(OP_DMX, 8);
    packet.writeUInt8(0, 10);
    packet.writeUInt8(PROT_VER, 11);
    packet.writeUInt8(this.seq, 12);
    this.seq = this.seq >= 255 ? 1 : this.seq + 1;
    packet.writeUInt8(0, 13); // Physical
    packet.writeUInt8(universe & 0xff, 14);        // SubUni
    packet.writeUInt8((universe >> 8) & 0x7f, 15);  // Net
    packet.writeUInt16BE(len, 16);
    slots.copy(packet, 18);

    this.socket.send(packet, this.port, this.broadcast);
    return packet;
  }

  /** Broadcast an ArtPoll to discover nodes on the local network. */
  poll() {
    const packet = Buffer.alloc(14);
    ARTNET_ID.copy(packet, 0);
    packet.writeUInt16LE(OP_POLL, 8);
    packet.writeUInt8(0, 10);
    packet.writeUInt8(PROT_VER, 11);
    packet.writeUInt8(0x02, 12); // TalkToMe: send ArtPollReply on state change
    packet.writeUInt8(0, 13);    // Priority: all messages
    this.socket.send(packet, this.port, this.broadcast);
    return packet;
  }

  close() {
    try { this.socket.close(); } catch (_e) { /* already closed */ }
  }
}

module.exports = ArtNet;

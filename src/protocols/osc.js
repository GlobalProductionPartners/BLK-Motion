const dgram = require('dgram');
const EventEmitter = require('events');

const OSC_LISTEN_PORT = 8000; // conventional OSC input port (matches QLab/TouchDesigner/Ableton defaults)

function pad4(buf) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

function encodeString(str) {
  return pad4(Buffer.concat([Buffer.from(str, 'ascii'), Buffer.from([0])]));
}

function encodeOscMessage(address, args) {
  const typeTags = ',' + args.map((a) => {
    if (typeof a === 'number') return Number.isInteger(a) ? 'i' : 'f';
    return 's';
  }).join('');

  const parts = [encodeString(address), encodeString(typeTags)];
  args.forEach((a) => {
    if (typeof a === 'number') {
      const b = Buffer.alloc(4);
      if (Number.isInteger(a)) b.writeInt32BE(a, 0); else b.writeFloatBE(a, 0);
      parts.push(b);
    } else {
      parts.push(encodeString(String(a)));
    }
  });
  return Buffer.concat(parts);
}

function readOscString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const str = buf.subarray(offset, end).toString('ascii');
  const consumed = end - offset + 1;
  const padded = consumed % 4 === 0 ? consumed : consumed + (4 - (consumed % 4));
  return { str, nextOffset: offset + padded };
}

function decodeOscMessage(buf) {
  if (buf.length === 0 || buf[0] !== 0x2f) return null; // must start with '/'
  const { str: address, nextOffset: afterAddr } = readOscString(buf, 0);
  const { str: typeTags, nextOffset: afterTags } = readOscString(buf, afterAddr);
  if (!typeTags.startsWith(',')) return { address, args: [] };

  let offset = afterTags;
  const args = [];
  for (const tag of typeTags.slice(1)) {
    if (tag === 'i') { args.push(buf.readInt32BE(offset)); offset += 4; }
    else if (tag === 'f') { args.push(buf.readFloatBE(offset)); offset += 4; }
    else if (tag === 's') { const r = readOscString(buf, offset); args.push(r.str); offset = r.nextOffset; }
    else { break; } // unsupported tag (blob etc.) — stop parsing further args
  }
  return { address, args };
}

/**
 * Real OSC send/receive over UDP — used for triggering BLK Motion cues from
 * (or reporting state to) a console/media server such as QLab, TouchDesigner
 * or Ableton Live, which is how the brief's grandMA3-passthrough workflow
 * generalizes to non-DMX control surfaces.
 */
class OSC extends EventEmitter {
  constructor({ listenPort = OSC_LISTEN_PORT } = {}) {
    super();
    this.listenPort = listenPort;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('message', (msg) => {
      const parsed = decodeOscMessage(msg);
      if (parsed) this.emit('message', parsed);
    });
    this.socket.on('error', (err) => this.emit('error', err));
  }

  start() {
    this.socket.bind(this.listenPort);
  }

  send(host, port, address, args = []) {
    const packet = encodeOscMessage(address, args);
    this.socket.send(packet, port, host);
    return packet;
  }

  close() {
    try { this.socket.close(); } catch (_e) { /* already closed */ }
  }
}

module.exports = OSC;
module.exports.encodeOscMessage = encodeOscMessage;
module.exports.decodeOscMessage = decodeOscMessage;

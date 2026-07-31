const EventEmitter = require('events');

// Lazy-required so the app still launches cleanly if the native serialport
// module is missing (fresh checkout, failed rebuild) — USB output just
// reports unavailable instead of crashing the main process.
let SerialPortClass = null;
function loadSerialPort() {
  if (!SerialPortClass) SerialPortClass = require('serialport').SerialPort;
  return SerialPortClass;
}

const ENTTEC_START = 0x7e;
const ENTTEC_END = 0xe7;
const LABEL_OUTPUT_DMX = 6; // "Output Only Send DMX Packet" — port 1

/**
 * USB-DMX output through a serial widget. Two driver modes:
 *
 *  - 'pro':  ENTTEC DMX USB Pro framing (0x7E label lenLE data 0xE7); the
 *            widget generates the DMX break/timing itself. DMX King
 *            ultraDMX devices speak the same protocol.
 *  - 'open': ENTTEC Open DMX USB — a bare FTDI at 250 kbaud 8N2 with no
 *            micro on board, so the host generates the break + frame.
 */
class UsbDmx extends EventEmitter {
  constructor({ path, mode = 'pro' } = {}) {
    super();
    this.path = path;
    this.mode = mode === 'open' ? 'open' : 'pro';
    this.port = null;
    this.ready = false;
    this._busy = false; // open-mode frames span multiple async steps; never overlap them
  }

  open() {
    let SP;
    try { SP = loadSerialPort(); }
    catch (err) {
      this.emit('status', { state: 'error', message: 'serialport module unavailable — run npm install' });
      return;
    }
    const opts = this.mode === 'open'
      ? { path: this.path, baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none', autoOpen: false }
      : { path: this.path, baudRate: 57600, autoOpen: false };
    this.port = new SP(opts);
    this.port.on('error', (err) => this.emit('status', { state: 'error', message: err.message }));
    this.port.on('close', () => { this.ready = false; this.emit('status', { state: 'closed' }); });
    this.port.open((err) => {
      if (err) { this.emit('status', { state: 'error', message: err.message }); return; }
      this.ready = true;
      this.emit('status', { state: 'open', message: this.path + ' · ' + (this.mode === 'pro' ? 'ENTTEC Pro protocol' : 'Open DMX host-timed') });
    });
  }

  /** data: Buffer/array of up to 512 slot values (no start code). */
  sendDmx(data) {
    if (!this.port || !this.ready || this._busy) return;
    const slots = Buffer.from(data).subarray(0, 512);
    const dmxPacket = Buffer.concat([Buffer.from([0x00]), slots]); // start code 0 + slots
    if (this.mode === 'pro') {
      const framed = Buffer.alloc(dmxPacket.length + 5);
      framed[0] = ENTTEC_START;
      framed[1] = LABEL_OUTPUT_DMX;
      framed.writeUInt16LE(dmxPacket.length, 2);
      dmxPacket.copy(framed, 4);
      framed[framed.length - 1] = ENTTEC_END;
      this.port.write(framed);
    } else {
      // Open DMX: the host owns the wire — break (>=88us), mark-after-break,
      // then the frame. setTimeout granularity comfortably exceeds the spec
      // minimums; at 25 Hz the 513-byte frame (~23 ms at 250 kbaud) fits.
      this._busy = true;
      const done = () => { this._busy = false; };
      this.port.set({ brk: true }, (e1) => {
        if (e1 || !this.ready) return done();
        setTimeout(() => {
          this.port.set({ brk: false }, (e2) => {
            if (e2 || !this.ready) return done();
            setTimeout(() => {
              if (!this.ready) return done();
              this.port.write(dmxPacket, done);
            }, 1);
          });
        }, 1);
      });
    }
  }

  close() {
    this.ready = false;
    if (this.port && this.port.isOpen) { try { this.port.close(); } catch (_e) { /* already closing */ } }
    this.port = null;
  }

  static async listPorts() {
    const SP = loadSerialPort();
    const ports = await SP.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
      // FTDI VID 0403 covers ENTTEC and DMX King widgets
      likely: /0403/i.test(p.vendorId || '') || /enttec|dmx|ftdi/i.test(p.manufacturer || '')
    }));
  }
}

module.exports = UsbDmx;

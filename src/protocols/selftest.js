/* Standalone protocol sanity check — run with `node src/protocols/selftest.js`.
   Not part of the app; verifies packet structure/round-tripping before wiring
   these modules into the Electron main process. */
const assert = require('assert');
const dgram = require('dgram');

const ArtNet = require('./artnet');
const SACN = require('./sacn');
const OSC = require('./osc');

function testArtDmx() {
  const an = new ArtNet({ bindPort: 16454 });
  const data = Array.from({ length: 512 }, (_, i) => i % 256);
  const pkt = an.sendDmx(1, data);

  assert.strictEqual(pkt.subarray(0, 8).toString('ascii'), 'Art-Net\0', 'ID field');
  assert.strictEqual(pkt.readUInt16LE(8), 0x5000, 'OpCode ArtDmx');
  assert.strictEqual(pkt.readUInt8(10), 0, 'ProtVerHi');
  assert.strictEqual(pkt.readUInt8(11), 14, 'ProtVerLo');
  assert.strictEqual(pkt.readUInt8(14), 1, 'SubUni (universe 1)');
  assert.strictEqual(pkt.readUInt8(15), 0, 'Net');
  assert.strictEqual(pkt.readUInt16BE(16), 512, 'Length');
  assert.strictEqual(pkt.length, 18 + 512, 'total packet length');
  assert.strictEqual(pkt[18], 0, 'first DMX slot');
  assert.strictEqual(pkt[18 + 255], 255, 'slot 255 wraps correctly');
  an.close();
  console.log('✓ Art-Net ArtDmx packet structure correct (%d bytes)', pkt.length);
}

function testSacnDmx() {
  const sc = new SACN();
  const data = Array.from({ length: 512 }, (_, i) => (i * 3) % 256);
  const pkt = sc.sendDmx(1, data, 'BLK Motion Test');

  assert.strictEqual(pkt.readUInt16BE(0), 0x0010, 'Preamble Size');
  assert.strictEqual(pkt.subarray(4, 16).toString('ascii'), 'ASC-E1.17\0\0\0', 'ACN ID');
  assert.strictEqual(pkt.readUInt32BE(18), 0x00000004, 'Root vector');
  assert.strictEqual(pkt.readUInt32BE(40), 0x00000002, 'Framing vector');
  assert.strictEqual(pkt.subarray(44, 44 + 15).toString('utf8'), 'BLK Motion Test', 'Source name');
  assert.strictEqual(pkt.readUInt8(108), 100, 'Priority');
  assert.strictEqual(pkt.readUInt16BE(113), 1, 'Universe');
  assert.strictEqual(pkt.readUInt8(117), 0x02, 'DMP vector');
  assert.strictEqual(pkt.readUInt16BE(123), 513, 'Property value count (start code + 512)');
  assert.strictEqual(pkt.length, 125 + 513, 'total packet length');
  assert.strictEqual(pkt[125], 0, 'DMX start code');
  assert.strictEqual(pkt[126], 0, 'slot 0');
  assert.strictEqual(pkt[126 + 3], 9, 'slot 3 = 3*3');
  sc.close();
  console.log('✓ sACN (E1.31) packet structure correct (%d bytes)', pkt.length);
}

function testOscRoundtrip(done) {
  const osc = new OSC({ listenPort: 17000 });
  osc.on('message', (msg) => {
    assert.strictEqual(msg.address, '/blk/cue/fire', 'address round-trips');
    assert.strictEqual(msg.args[0], 3, 'int arg round-trips');
    assert.ok(Math.abs(msg.args[1] - 0.75) < 1e-5, 'float arg round-trips');
    assert.strictEqual(msg.args[2], 'green', 'string arg round-trips');
    console.log('✓ OSC message round-trips correctly over real UDP loopback');
    osc.close();
    done();
  });
  osc.start();
  setTimeout(() => {
    osc.send('127.0.0.1', 17000, '/blk/cue/fire', [3, 0.75, 'green']);
  }, 100);
}

testArtDmx();
testSacnDmx();
testOscRoundtrip(() => {
  console.log('\nAll protocol self-tests passed.');
  process.exit(0);
});

setTimeout(() => {
  console.error('OSC round-trip test timed out — UDP loopback likely blocked in this environment');
  process.exit(1);
}, 3000);

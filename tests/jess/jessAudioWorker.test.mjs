import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../../public/jess-audio-worker.js', import.meta.url), 'utf8');
const messages = [];

const sandbox = {
  Float32Array,
  ArrayBuffer,
  DataView,
  Uint8Array,
  Math,
  Number,
  Error,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  console,
  self: {
    postMessage: (message) => messages.push(message),
    onmessage: null,
  },
};

vm.runInNewContext(workerSource, sandbox, { filename: 'jess-audio-worker.js' });
assert.equal(typeof sandbox.self.onmessage, 'function');

function frame(value, length = 1024) {
  const data = new Float32Array(length);
  data.fill(value);
  return data.buffer;
}

function process(buffer, sequence, sampleRate = 48000) {
  sandbox.self.onmessage({
    data: {
      type: 'process',
      buffer,
      sampleRate,
      generation: 7,
      sequence,
    },
  });
}

sandbox.self.onmessage({
  data: { type: 'reset', generation: 7, sampleRate: 48000 },
});

// Continuous streaming is intentional: silence must still be forwarded so
// Gemini Live's server-side activity detection can own turn boundaries.
for (let i = 0; i < 12; i += 1) process(frame(i % 2 ? 0.001 : 0), i);

const audioMessages = messages.filter((message) => message.type === 'audio');
assert.equal(audioMessages.length, 12, 'every input frame should produce a PCM frame');
assert.ok(audioMessages.every((message) => message.generation === 7));
assert.ok(audioMessages.every((message) => message.mimeType === 'audio/pcm;rate=16000'));
assert.ok(audioMessages.every((message) => typeof message.data === 'string' && message.data.length > 0));
assert.ok(audioMessages.every((message) => !('vadState' in message)), 'client VAD must not gate audio');

const firstPcmBytes = Buffer.from(audioMessages[0].data, 'base64').byteLength;
// 1024 source frames at 48 kHz become roughly 341 frames at 16 kHz.
assert.ok(firstPcmBytes >= 600 && firstPcmBytes <= 800, `unexpected PCM size: ${firstPcmBytes}`);

// A generation reset must clear the streaming resampler state.
sandbox.self.onmessage({
  data: { type: 'reset', generation: 8, sampleRate: 48000 },
});
messages.length = 0;
sandbox.self.onmessage({
  data: {
    type: 'process',
    buffer: frame(0.05),
    sampleRate: 48000,
    generation: 8,
    sequence: 0,
  },
});
assert.equal(messages.length, 1);
assert.equal(messages[0].generation, 8);

sandbox.self.onmessage({ data: { type: 'process', generation: 8, sequence: 1 } });
assert.equal(messages.some((message) => message.type === 'error' && message.sequence === 1), false);

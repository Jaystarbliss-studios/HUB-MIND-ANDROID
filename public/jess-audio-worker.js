/* Jess audio processing worker.
 * Continuous PCM streaming: the worker only resamples and encodes audio.
 * Turn detection remains owned by Gemini Live's server-side VAD.
 */
const TARGET_SAMPLE_RATE = 16000;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 96000;

let generation = 0;
let sequence = -1;
let sourceSampleRate = TARGET_SAMPLE_RATE;
let resampleStep = 1;
let resamplePhase = 0;
let previousSourceSample = null;

function resetState(nextGeneration, sampleRate) {
  generation = Number.isFinite(nextGeneration) ? nextGeneration : 0;
  sequence = -1;
  sourceSampleRate = sampleRate >= MIN_SAMPLE_RATE && sampleRate <= MAX_SAMPLE_RATE
    ? sampleRate
    : TARGET_SAMPLE_RATE;
  resampleStep = sourceSampleRate / TARGET_SAMPLE_RATE;
  resamplePhase = 0;
  previousSourceSample = null;
}

function streamResample(input) {
  if (!input.length) return new Float32Array(0);

  let buffer;
  if (previousSourceSample === null) {
    buffer = input;
  } else {
    buffer = new Float32Array(input.length + 1);
    buffer[0] = previousSourceSample;
    buffer.set(input, 1);
  }

  const output = [];
  let position = resamplePhase;

  while (position + 1 < buffer.length) {
    const index = Math.floor(position);
    const fraction = position - index;
    output.push(buffer[index] + (buffer[index + 1] - buffer[index]) * fraction);
    position += resampleStep;
  }

  resamplePhase = position - (buffer.length - 1);
  previousSourceSample = input[input.length - 1];
  return Float32Array.from(output);
}

function floatTo16BitPCM(input) {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return output;
}

function base64Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function emitAudio(samples, message) {
  if (!samples.length) return;
  const pcm = floatTo16BitPCM(samples);
  self.postMessage({
    type: 'audio',
    generation: message.generation,
    sequence: message.sequence,
    data: base64Encode(pcm),
    mimeType: 'audio/pcm;rate=16000',
  });
}

self.onmessage = function(event) {
  const message = event && event.data;
  if (!message || !message.type) return;

  try {
    if (message.type === 'reset') {
      resetState(message.generation, message.sampleRate);
      return;
    }

    if (message.type !== 'process' || !(message.buffer instanceof ArrayBuffer)) return;

    const messageGeneration = Number.isFinite(message.generation) ? message.generation : 0;
    const messageSequence = Number.isFinite(message.sequence) ? message.sequence : 0;
    const sampleRate = Number(message.sampleRate) || TARGET_SAMPLE_RATE;

    if (messageGeneration !== generation || sampleRate !== sourceSampleRate) {
      resetState(messageGeneration, sampleRate);
    }

    const input = new Float32Array(message.buffer);
    if (!input.length) return;

    const resampled = streamResample(input);
    emitAudio(resampled, { generation: messageGeneration, sequence: messageSequence });
  } catch (error) {
    self.postMessage({
      type: 'error',
      generation: event?.data?.generation,
      sequence: event?.data?.sequence,
      message: error instanceof Error ? error.message : 'Audio processing failed.',
    });
  }
};

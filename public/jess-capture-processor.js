class JessCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetFrames = options?.processorOptions?.targetFrames || 1024;
    this.buffer = new Float32Array(this.targetFrames);
    this.offset = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    if (!input) return true;
    let sourceOffset = 0;
    while (sourceOffset < input.length) {
      const count = Math.min(this.targetFrames - this.offset, input.length - sourceOffset);
      this.buffer.set(input.subarray(sourceOffset, sourceOffset + count), this.offset);
      this.offset += count;
      sourceOffset += count;
      if (this.offset === this.targetFrames) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.targetFrames);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('jess-capture-processor', JessCaptureProcessor);

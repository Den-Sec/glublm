/**
 * ONNX Runtime Web model wrapper - ported from web/glub.js.
 * Handles loading, tokenization, and text generation.
 */
import { SimpleBPE } from './tokenizer.js';

const MAX_CTX = 96;
const MAX_NEW_TOKENS = 32;
const MIN_NEW_TOKENS = 4;
const TEMPERATURE = 0.6;
const TOP_K = 40;

function sampleTopK(logits, temperature, topK) {
  const scaled = logits.map((x) => x / temperature);
  const indexed = scaled.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0]);
  const top = indexed.slice(0, topK);
  const maxLogit = top[0][0];
  const exps = top.map(([v]) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return top[i][1];
  }
  return top[top.length - 1][1];
}

export class OnnxModel {
  constructor() {
    this._session = null;
    this._tokenizer = null;
    this._ready = false;
    this._generating = false;
  }

  /**
   * Load model and tokenizer.
   * @param {string} modelUrl
   * @param {string} tokenizerUrl
   * @param {(stage: string, pct: number) => void} [onProgress]
   */
  async load(modelUrl, tokenizerUrl, onProgress) {
    try {
      onProgress?.('downloading', 0);

      // Load tokenizer (small, fast)
      const tokResp = await fetch(tokenizerUrl);
      const tokJson = await tokResp.json();
      this._tokenizer = new SimpleBPE(tokJson);
      onProgress?.('downloading', 5);

      // Load model with progress
      const modelResp = await fetch(modelUrl);
      const contentLength = parseInt(modelResp.headers.get('Content-Length') || '0');
      let received = 0;

      if (contentLength > 0 && modelResp.body) {
        const reader = modelResp.body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          onProgress?.('downloading', 5 + Math.round((received / contentLength) * 85));
        }
        const modelBuf = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) { modelBuf.set(chunk, offset); offset += chunk.length; }

        onProgress?.('loading', 95);
        this._session = await ort.InferenceSession.create(modelBuf, {
          executionProviders: ['wasm'],
        });
      } else {
        // Fallback: no streaming progress
        const modelBuf = await modelResp.arrayBuffer();
        onProgress?.('loading', 90);
        this._session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
          executionProviders: ['wasm'],
        });
      }

      this._ready = true;
      onProgress?.('ready', 100);
    } catch (e) {
      onProgress?.('error', 0);
      throw e;
    }
  }

  /**
   * Generate a response to the given prompt.
   * @param {string} promptText
   * @returns {Promise<string>}
   */
  async generate(promptText) {
    if (!this._ready || this._generating) return '';
    this._generating = true;

    try {
      let ids = this._tokenizer.encode(promptText + ' ->');
      const produced = [];

      for (let step = 0; step < MAX_NEW_TOKENS; step++) {
        const ctx = ids.slice(-MAX_CTX);
        const input = new ort.Tensor(
          'int64',
          BigInt64Array.from(ctx.map(BigInt)),
          [1, ctx.length],
        );
        const out = await this._session.run({ input_ids: input });
        const logits = out.logits.data;
        const vocabSize = out.logits.dims[2];
        const seqLen = out.logits.dims[1];
        const lastLogits = Array.from(
          logits.slice((seqLen - 1) * vocabSize, seqLen * vocabSize),
        );

        if (step < MIN_NEW_TOKENS) {
          if (this._tokenizer.eosId !== undefined) lastLogits[this._tokenizer.eosId] = -Infinity;
          if (this._tokenizer.padId !== undefined) lastLogits[this._tokenizer.padId] = -Infinity;
        }

        const nextId = sampleTopK(lastLogits, TEMPERATURE, TOP_K);
        ids.push(nextId);
        produced.push(nextId);
        if (step >= MIN_NEW_TOKENS && (nextId === this._tokenizer.eosId || nextId === this._tokenizer.padId)) break;
      }

      return this._tokenizer.decode(produced, true);
    } finally {
      this._generating = false;
    }
  }

  get isReady() { return this._ready; }
  get isGenerating() { return this._generating; }
}

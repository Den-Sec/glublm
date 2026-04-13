// companion/server/inference.js
import { InferenceSession, Tensor } from 'onnxruntime-node';
import fs from 'node:fs';

const MAX_CTX = 96;
const MAX_NEW_TOKENS = 32;
const MIN_NEW_TOKENS = 4;
const TEMPERATURE = 0.6;
const TOP_K = 40;

function sampleTopK(logits, temperature, topK) {
  const scaled = logits.map(x => x / temperature);
  const indexed = scaled.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0]);
  const top = indexed.slice(0, topK);
  const maxLogit = top[0][0];
  const exps = top.map(([v]) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sumExp);
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return top[i][1];
  }
  return top[top.length - 1][1];
}

export class GlubInference {
  constructor() {
    this._session = null;
    this._tokenizer = null;
    this._ready = false;
    this._generating = false;
  }

  async load(modelPath, tokenizerPath) {
    const tokJson = JSON.parse(fs.readFileSync(tokenizerPath, 'utf-8'));
    this._tokenizer = new SimpleBPE(tokJson);
    this._session = await InferenceSession.create(modelPath);
    this._ready = true;
    console.log('[glub] ONNX model loaded');
  }

  async generate(prompt) {
    if (!this._ready || this._generating) return 'blub?';
    this._generating = true;
    try {
      let ids = this._tokenizer.encode(prompt + ' ->');
      const produced = [];

      for (let step = 0; step < MAX_NEW_TOKENS; step++) {
        const ctx = ids.slice(-MAX_CTX);
        const input = new Tensor('int64', BigInt64Array.from(ctx.map(BigInt)), [1, ctx.length]);
        const out = await this._session.run({ input_ids: input });
        const logits = out.logits.data;
        const vocabSize = out.logits.dims[2];
        const seqLen = out.logits.dims[1];
        const lastLogits = Array.from(logits.slice((seqLen - 1) * vocabSize, seqLen * vocabSize));

        if (step < MIN_NEW_TOKENS) {
          if (this._tokenizer.eosId !== undefined) lastLogits[this._tokenizer.eosId] = -Infinity;
          if (this._tokenizer.padId !== undefined) lastLogits[this._tokenizer.padId] = -Infinity;
        }

        const nextId = sampleTopK(lastLogits, TEMPERATURE, TOP_K);
        ids.push(nextId);
        produced.push(nextId);
        if (step >= MIN_NEW_TOKENS && (nextId === this._tokenizer.eosId || nextId === this._tokenizer.padId)) break;
      }

      return this._tokenizer.decode(produced, true) || 'blub?';
    } catch (e) {
      console.error('[glub] Inference error:', e.message);
      return 'blub... i got confused';
    } finally {
      this._generating = false;
    }
  }

  get isReady() { return this._ready; }
}

// --- SimpleBPE (ported from desk-pet/inference/tokenizer.js) ---
class SimpleBPE {
  constructor(json) {
    this._vocab = json.model.vocab;
    this._inv = Object.fromEntries(
      Object.entries(this._vocab).map(([k, v]) => [v, k]),
    );
    this._merges = new Map();
    for (let i = 0; i < json.model.merges.length; i++) {
      const m = json.model.merges[i];
      const pair = Array.isArray(m) ? m : m.split(' ');
      this._merges.set(pair.join(' '), i);
    }
    this._specials = {};
    for (const t of json.added_tokens || []) {
      this._specials[t.content] = t.id;
    }
    this.eosId = this._specials['<eos>'] ?? this._vocab['<eos>'];
    this.bosId = this._specials['<bos>'] ?? this._vocab['<bos>'];
    this.padId = this._specials['<pad>'] ?? this._vocab['<pad>'];
    this.unkId = this._specials['<unk>'] ?? this._vocab['<unk>'];

    this._bytesToUnicode = this._buildBytesToUnicode();
    this._unicodeToBytes = Object.fromEntries(
      Object.entries(this._bytesToUnicode).map(([k, v]) => [v, k]),
    );
  }

  _buildBytesToUnicode() {
    const bs = [];
    for (let b = 33; b <= 126; b++) bs.push(b);
    for (let b = 161; b <= 172; b++) bs.push(b);
    for (let b = 174; b <= 255; b++) bs.push(b);
    const cs = [...bs];
    let n = 0;
    for (let b = 0; b < 256; b++) {
      if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
    }
    const mapping = {};
    for (let i = 0; i < bs.length; i++) {
      mapping[bs[i]] = String.fromCodePoint(cs[i]);
    }
    return mapping;
  }

  _byteEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let out = '';
    for (const b of bytes) out += this._bytesToUnicode[b];
    return out;
  }

  _byteDecode(text) {
    const bytes = [];
    for (const ch of text) {
      const b = this._unicodeToBytes[ch];
      if (b !== undefined) bytes.push(parseInt(b));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  _bpeWord(word) {
    let parts = word.split('');
    while (parts.length > 1) {
      let best = null;
      let bestIdx = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = `${parts[i]} ${parts[i + 1]}`;
        const rank = this._merges.get(key);
        if (rank !== undefined && rank < bestIdx) { best = i; bestIdx = rank; }
      }
      if (best === null) break;
      parts = [...parts.slice(0, best), parts[best] + parts[best + 1], ...parts.slice(best + 2)];
    }
    return parts;
  }

  encode(text, addSpecials = true) {
    const encoded = this._byteEncode(' ' + text);
    const ids = [];
    if (addSpecials && this.bosId !== undefined) ids.push(this.bosId);
    const tokens = this._bpeWord(encoded);
    for (const t of tokens) {
      const id = this._vocab[t];
      ids.push(id !== undefined ? id : this.unkId);
    }
    if (addSpecials && this.eosId !== undefined) ids.push(this.eosId);
    return ids;
  }

  decode(ids, skipSpecials = true) {
    const special = new Set([this.bosId, this.eosId, this.padId, this.unkId].filter(x => x !== undefined));
    const tokens = [];
    for (const id of ids) {
      if (skipSpecials && special.has(id)) continue;
      const t = this._inv[id];
      if (t !== undefined) tokens.push(t);
    }
    return this._byteDecode(tokens.join('')).trim();
  }
}

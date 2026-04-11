/**
 * Minimal BPE tokenizer - ported from web/glub.js.
 * Compatible with HuggingFace tokenizers JSON format.
 */
export class SimpleBPE {
  constructor(json) {
    this.vocab = json.model.vocab;
    this.idToToken = Object.fromEntries(
      Object.entries(this.vocab).map(([k, v]) => [v, k]),
    );
    this.merges = new Map();
    for (let i = 0; i < json.model.merges.length; i++) {
      const m = json.model.merges[i];
      const pair = Array.isArray(m) ? m : m.split(' ');
      this.merges.set(pair.join(' '), i);
    }
    this.specials = {};
    for (const t of json.added_tokens || []) {
      this.specials[t.content] = t.id;
    }
    this.bosId = this.specials['<bos>'] ?? this.vocab['<bos>'];
    this.eosId = this.specials['<eos>'] ?? this.vocab['<eos>'];
    this.padId = this.specials['<pad>'] ?? this.vocab['<pad>'];
    this.unkId = this.specials['<unk>'] ?? this.vocab['<unk>'];

    this.bytesToUnicode = this._bytesToUnicode();
    this.unicodeToBytes = Object.fromEntries(
      Object.entries(this.bytesToUnicode).map(([k, v]) => [v, k]),
    );
  }

  _bytesToUnicode() {
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
    for (const b of bytes) out += this.bytesToUnicode[b];
    return out;
  }

  _byteDecode(text) {
    const bytes = [];
    for (const ch of text) {
      const b = this.unicodeToBytes[ch];
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
        const rank = this.merges.get(key);
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
      const id = this.vocab[t];
      ids.push(id !== undefined ? id : this.unkId);
    }
    if (addSpecials && this.eosId !== undefined) ids.push(this.eosId);
    return ids;
  }

  decode(ids, skipSpecials = true) {
    const tokens = [];
    for (const id of ids) {
      if (skipSpecials && [this.bosId, this.eosId, this.padId, this.unkId].includes(id)) continue;
      const t = this.idToToken[id];
      if (t !== undefined) tokens.push(t);
    }
    return this._byteDecode(tokens.join('')).trim();
  }
}

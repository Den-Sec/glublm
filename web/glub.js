// GlubLM browser inference
// Loads a quantized ONNX model + the HF tokenizer and runs generation in the browser.

const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const formEl = document.getElementById("form");
const promptEl = document.getElementById("prompt");
const sendEl = document.getElementById("send");

const MODEL_URL = "model.onnx";
const TOKENIZER_URL = "tokenizer.json";
const MAX_CTX = 96;
const MAX_NEW_TOKENS = 32;
const MIN_NEW_TOKENS = 4;
const TEMPERATURE = 0.6;
const TOP_K = 40;

let session = null;
let tokenizer = null;

function appendMessage(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function setStatus(text, ready = false) {
  statusEl.textContent = text;
  if (ready) statusEl.classList.add("ready");
}

/* =========================================================================
   Minimal BPE tokenizer (JSON format compatible with HF tokenizers library)
   Supports encoding/decoding for the byte-level BPE that GlubLM uses.
   ========================================================================= */
class SimpleBPE {
  constructor(json) {
    this.vocab = json.model.vocab;
    this.idToToken = Object.fromEntries(
      Object.entries(this.vocab).map(([k, v]) => [v, k]),
    );
    this.merges = new Map();
    for (let i = 0; i < json.model.merges.length; i++) {
      const m = json.model.merges[i];
      const pair = Array.isArray(m) ? m : m.split(" ");
      this.merges.set(pair.join(" "), i);
    }
    this.specials = {};
    for (const t of json.added_tokens || []) {
      this.specials[t.content] = t.id;
    }
    this.bosId = this.specials["<bos>"] ?? this.vocab["<bos>"];
    this.eosId = this.specials["<eos>"] ?? this.vocab["<eos>"];
    this.padId = this.specials["<pad>"] ?? this.vocab["<pad>"];
    this.unkId = this.specials["<unk>"] ?? this.vocab["<unk>"];

    // Byte-level BPE pre-tokenizer: encodes bytes to printable chars
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
      if (!bs.includes(b)) {
        bs.push(b);
        cs.push(256 + n);
        n++;
      }
    }
    const mapping = {};
    for (let i = 0; i < bs.length; i++) {
      mapping[bs[i]] = String.fromCodePoint(cs[i]);
    }
    return mapping;
  }

  _byteEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let out = "";
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
    let parts = word.split("");
    while (parts.length > 1) {
      let best = null;
      let bestIdx = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = `${parts[i]} ${parts[i + 1]}`;
        const rank = this.merges.get(key);
        if (rank !== undefined && rank < bestIdx) {
          best = i;
          bestIdx = rank;
        }
      }
      if (best === null) break;
      parts = [
        ...parts.slice(0, best),
        parts[best] + parts[best + 1],
        ...parts.slice(best + 2),
      ];
    }
    return parts;
  }

  encode(text, addSpecials = true) {
    // Byte-level pre-tokenize: prefix a space like HF ByteLevel(add_prefix_space=True)
    const encoded = this._byteEncode(" " + text);
    const ids = [];
    if (addSpecials && this.bosId !== undefined) ids.push(this.bosId);
    // Treat the full encoded string as one "word" for simplicity; BPE handles splitting
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
    return this._byteDecode(tokens.join("")).trim();
  }
}

/* =========================================================================
   Sampling
   ========================================================================= */
function sampleTopK(logits, temperature, topK) {
  const scaled = logits.map((x) => x / temperature);
  // find top-k
  const indexed = scaled.map((v, i) => [v, i]);
  indexed.sort((a, b) => b[0] - a[0]);
  const top = indexed.slice(0, topK);
  const maxLogit = top[0][0];
  const exps = top.map(([v, _]) => Math.exp(v - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);
  // multinomial
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return top[i][1];
  }
  return top[top.length - 1][1];
}

/* =========================================================================
   Generation
   ========================================================================= */
async function generate(promptText) {
  let ids = tokenizer.encode(promptText + " ->");
  const produced = [];

  for (let step = 0; step < MAX_NEW_TOKENS; step++) {
    const ctx = ids.slice(-MAX_CTX);
    const input = new ort.Tensor(
      "int64",
      BigInt64Array.from(ctx.map(BigInt)),
      [1, ctx.length],
    );
    const feeds = { input_ids: input };
    const out = await session.run(feeds);
    const logits = out.logits.data;
    // pick last-token logits
    const vocabSize = out.logits.dims[2];
    const seqLen = out.logits.dims[1];
    const lastLogits = Array.from(
      logits.slice((seqLen - 1) * vocabSize, seqLen * vocabSize),
    );

    // Suppress EOS/PAD during minimum generation window
    if (step < MIN_NEW_TOKENS) {
      if (tokenizer.eosId !== undefined) lastLogits[tokenizer.eosId] = -Infinity;
      if (tokenizer.padId !== undefined) lastLogits[tokenizer.padId] = -Infinity;
    }

    const nextId = sampleTopK(lastLogits, TEMPERATURE, TOP_K);
    ids.push(nextId);
    produced.push(nextId);
    if (step >= MIN_NEW_TOKENS && (nextId === tokenizer.eosId || nextId === tokenizer.padId)) break;
  }
  return tokenizer.decode(produced, true);
}

/* =========================================================================
   Bootstrap
   ========================================================================= */
async function main() {
  setStatus("downloading model...");
  try {
    const [modelResp, tokResp] = await Promise.all([
      fetch(MODEL_URL),
      fetch(TOKENIZER_URL),
    ]);
    const modelBuf = await modelResp.arrayBuffer();
    const tokJson = await tokResp.json();

    setStatus("loading tokenizer...");
    tokenizer = new SimpleBPE(tokJson);

    setStatus("starting ONNX runtime...");
    session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
      executionProviders: ["wasm"],
    });

    setStatus("ready. glub!", true);
    promptEl.disabled = false;
    sendEl.disabled = false;
    promptEl.focus();
  } catch (e) {
    setStatus("error loading model: " + e.message);
    console.error(e);
  }
}

formEl.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;
  appendMessage(text, "user");
  promptEl.value = "";
  sendEl.disabled = true;
  try {
    const reply = await generate(text);
    appendMessage(reply, "glub");
  } catch (e) {
    appendMessage("(the goldfish got confused: " + e.message + ")", "glub");
  } finally {
    sendEl.disabled = false;
    promptEl.focus();
  }
});

main();

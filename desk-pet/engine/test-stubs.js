// Test stubs for browser-only APIs so modules can be unit-tested in Node.
// Install before importing the module under test. Reset between tests.

class MockGainNode {
  constructor() {
    this.gain = { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
    this._connectedTo = null;
    this._disconnected = false;
  }
  connect(dst) { this._connectedTo = dst; return dst; }
  disconnect() { this._disconnected = true; this._connectedTo = null; }
}

class MockOscillator {
  constructor() {
    this.frequency = { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} };
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
    this._onended = null;
  }
  connect(dst) { return dst; }
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; if (this._onended) this._onended(); }
  set onended(fn) { this._onended = fn; }
  get onended() { return this._onended; }
}

class MockBufferSource {
  constructor() { this.buffer = null; this.started = false; }
  connect(dst) { return dst; }
  disconnect() {}
  start() { this.started = true; }
  stop() {}
}

class MockBuffer {
  constructor(channels, length, rate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = rate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(ch) { return this._data[ch]; }
}

class MockFilter {
  constructor() {
    this.type = 'lowpass';
    this.frequency = { value: 350, setValueAtTime: () => {} };
    this.Q = { value: 1 };
  }
  connect(dst) { return dst; }
  disconnect() {}
}

export class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = { _isDestination: true };
    this._resumeCalls = 0;
    this._oscillators = [];
  }
  resume() { this._resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() { const o = new MockOscillator(); this._oscillators.push(o); return o; }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockFilter(); }
  createBufferSource() { return new MockBufferSource(); }
  createBuffer(channels, length, rate) { return new MockBuffer(channels, length, rate); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

// --- stubbing API ---

const _originals = {};

export function installAudioStub() {
  const registry = { count: 0, last: null };
  _originals.AudioContext = globalThis.AudioContext;
  _originals.webkitAudioContext = globalThis.webkitAudioContext;
  globalThis.AudioContext = class extends MockAudioContext {
    constructor() {
      super();
      registry.count++;
      registry.last = this;
    }
  };
  return registry;
}

export function uninstallAudioStub() {
  if ('AudioContext' in _originals) globalThis.AudioContext = _originals.AudioContext;
  if ('webkitAudioContext' in _originals) globalThis.webkitAudioContext = _originals.webkitAudioContext;
}

export function removeAudioStub() {
  _originals.AudioContext = globalThis.AudioContext;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
}

// In Node 22+ globalThis.navigator is a read-only getter; use defineProperty
// to replace it, and remember the original descriptor so we can restore it.
function _snapshotNavigatorDescriptor() {
  if (!('navigatorDescriptor' in _originals)) {
    _originals.navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator') ?? null;
  }
}

export function installHapticStub() {
  const registry = { calls: [] };
  _snapshotNavigatorDescriptor();
  const existing = (_originals.navigatorDescriptor && 'get' in _originals.navigatorDescriptor)
    ? _originals.navigatorDescriptor.get.call(globalThis)
    : globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    enumerable: true,
    value: {
      ...(existing ?? {}),
      vibrate(pattern) { registry.calls.push(pattern); return true; },
    },
  });
  return registry;
}

export function removeHapticStub() {
  _snapshotNavigatorDescriptor();
  const existing = (_originals.navigatorDescriptor && 'get' in _originals.navigatorDescriptor)
    ? _originals.navigatorDescriptor.get.call(globalThis)
    : globalThis.navigator;
  const nav = { ...(existing ?? {}) };
  delete nav.vibrate;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    enumerable: true,
    value: nav,
  });
}

export function uninstallHapticStub() {
  if ('navigatorDescriptor' in _originals) {
    const desc = _originals.navigatorDescriptor;
    if (desc) {
      Object.defineProperty(globalThis, 'navigator', desc);
    } else {
      delete globalThis.navigator;
    }
    delete _originals.navigatorDescriptor;
  }
}

export function installMatchMediaStub({ reducedMotion = false } = {}) {
  const listeners = [];
  const mql = {
    matches: reducedMotion,
    addEventListener(_, fn) { listeners.push(fn); },
    removeEventListener(_, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  _originals.matchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => mql;
  return {
    setReducedMotion(v) {
      mql.matches = v;
      listeners.forEach(fn => fn({ matches: v }));
    },
  };
}

export function uninstallMatchMediaStub() {
  if ('matchMedia' in _originals) globalThis.matchMedia = _originals.matchMedia;
}

export function installLocalStorageStub(initial = {}) {
  const store = { ...initial };
  _originals.localStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
  return store;
}

export function uninstallLocalStorageStub() {
  if ('localStorage' in _originals) globalThis.localStorage = _originals.localStorage;
}

// --- Speech / FSM / STATES mocks for bowl-memory + rituals tests ---

export function makeSpeechMock() {
  const calls = [];
  return {
    isVisible: false,
    show(text, opts) { calls.push({ text, opts }); this.isVisible = true; },
    _calls: calls,
  };
}

export function makeFsmMock(initialState = 'IDLE') {
  const calls = [];
  let state = initialState;
  return {
    get currentState() { return state; },
    setState(s) { state = s; },
    transition(s, opts) { calls.push({ state: s, opts }); state = s; return true; },
    _calls: calls,
  };
}

export const STATES_MOCK = Object.freeze({
  IDLE: 'IDLE',
  SLEEPING: 'SLEEPING',
  EATING: 'EATING',
  HAPPY: 'HAPPY',
  EXCITED: 'EXCITED',
  BLOWING_BUBBLES: 'BLOWING_BUBBLES',
  TALKING: 'TALKING',
  FORGETTING: 'FORGETTING',
  BUMPING: 'BUMPING',
  TURNING: 'TURNING',
  WIGGLING: 'WIGGLING',
  SAD: 'SAD',
});

export function resetAllStubs() {
  uninstallAudioStub();
  uninstallHapticStub();
  uninstallMatchMediaStub();
  uninstallLocalStorageStub();
  for (const k of Object.keys(_originals)) delete _originals[k];
}

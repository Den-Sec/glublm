let ws = null;
let state = { hunger: 100, cleanliness: 100, happiness: 100, health: 100, bond: 10 };

function connectWs() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => updateStatus('connected');
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => { updateStatus('reconnecting...'); setTimeout(connectWs, 3000); };
  ws.onerror = () => ws.close();
}

function sendCmd(type, data = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type, ...data }));
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'full_state':
    case 'needs_update':
      Object.assign(state, msg);
      renderStats();
      renderActions();
      break;
    case 'speech':
      if (msg.speaker === 'fish') renderQuote(msg.text, msg.mood);
      break;
    case 'error':
      showToast(`${msg.action}: ${msg.reason}`);
      break;
  }
}

function showToast(text) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.getElementById('app').prepend(toast);
  }
  toast.textContent = text;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

function renderStats() {
  setBar('hunger', state.hunger);
  setBar('water', state.cleanliness);
  setBar('happy', state.happiness);
  setBar('health', state.health);
  setBar('bond', state.bond);

  const nameEl = document.getElementById('fish-name');
  if (state.fishName) nameEl.textContent = state.ageDays !== undefined ? `${state.fishName} - day ${state.ageDays}` : state.fishName;

  const dayText = state.ageDays !== undefined ? `day ${state.ageDays}` : '';
  const indicator = document.getElementById('status-indicator');
  if (state.isBellyUp) {
    indicator.textContent = 'CRITICAL';
    indicator.classList.add('critical');
  } else {
    indicator.classList.remove('critical');
    if (state.hunger < 30 || state.cleanliness < 30) indicator.textContent = 'needs attention';
    else indicator.textContent = dayText;
  }
}

function setBar(id, value) {
  const fill = document.getElementById(`bar-${id}`);
  const val = document.getElementById(`val-${id}`);
  if (!fill || !val) return;
  fill.style.width = Math.max(2, value) + '%';
  val.textContent = Math.round(value) + '%';

  // Mirror the value to the parent role=progressbar for screen readers
  const bar = fill.parentElement;
  if (bar?.getAttribute('role') === 'progressbar') {
    bar.setAttribute('aria-valuenow', String(Math.round(value)));
  }

  fill.classList.remove('green', 'orange', 'red');
  if (id === 'bond') return;
  if (value > 60) fill.classList.add('green');
  else if (value > 30) fill.classList.add('orange');
  else fill.classList.add('red');
}

function renderQuote(text, mood) {
  const box = document.getElementById('quote-box');
  const quote = document.getElementById('fish-quote');
  quote.textContent = `"${text}"`;
  box.className = mood === 'critical' ? 'mood-critical' : (mood === 'hungry' || mood === 'uncomfortable') ? 'mood-warn' : '';
}

// Action buttons: built once, mutated on each needs_update (preserves :active, .pressed, focus).
const actionBtns = {};

const ACTION_DEFS = [
  { id: 'feed',  base: 'feed',         cmd: () => sendCmd('cmd_feed') },
  { id: 'clean', base: 'clean water',  cmd: () => sendCmd('cmd_change_water') },
  { id: 'play',  base: 'play',         cmd: () => sendCmd('cmd_play') },
  // poop reads state.poops[0] fresh inside the handler (NOT captured at init time)
  { id: 'poop',  base: 'clean poop',   cmd: () => {
    const first = state.poops?.[0];
    if (first) sendCmd('cmd_clean_poop', { id: first.id });
  }},
];

function initActions() {
  const container = document.getElementById('actions');
  if (!container) return;
  container.innerHTML = '';
  for (const def of ACTION_DEFS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = def.id;
    btn.addEventListener('click', () => {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 300);
      def.cmd();
    });
    container.appendChild(btn);
    actionBtns[def.id] = { btn, def };
  }
}

function urgencyOf(id) {
  if (id === 'feed')  return state.hunger      < 15 ? 2 : state.hunger      < 30 ? 1 : 0;
  if (id === 'clean') return state.cleanliness < 20 ? 2 : state.cleanliness < 30 ? 1 : 0;
  if (id === 'play')  return 0;
  if (id === 'poop')  return (state.poops?.length || 0) > 2 ? 1 : 0;
  return 0;
}

function updateActions() {
  const poopCount = state.poops?.length || 0;
  for (const id of Object.keys(actionBtns)) {
    const { btn, def } = actionBtns[id];
    const u = urgencyOf(id);
    const baseLabel = id === 'poop' && poopCount > 0 ? `${def.base} (${poopCount})` : def.base;
    const nextText = u >= 2 ? `${baseLabel}!` : baseLabel;
    if (btn.textContent !== nextText) btn.textContent = nextText;
    const nextClass = `action-btn ${u >= 2 ? 'urgent' : u >= 1 ? 'warn' : 'calm'}`;
    if (btn.className !== nextClass) btn.className = nextClass;
    // Re-order via flexbox `order` (avoids DOM reparent which would kill :active/.pressed)
    btn.style.order = String(-u);
  }
}

// Backwards-compatible alias for the old function name (handleMessage still calls renderActions)
const renderActions = updateActions;

function updateStatus(text) {
  document.getElementById('status-indicator').textContent = text;
}

function setupChat() {
  const prompt = document.getElementById('prompt');
  const send = document.getElementById('send');
  const submit = () => {
    const text = prompt.value.trim();
    if (!text) return;
    sendCmd('cmd_chat', { text });
    prompt.value = '';
  };
  send.addEventListener('click', submit);
  prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

document.addEventListener('DOMContentLoaded', () => {
  initActions();
  setupChat();
  connectWs();
});

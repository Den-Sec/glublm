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
  }
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

function renderActions() {
  const container = document.getElementById('actions');
  const poopCount = state.poops?.length || 0;
  const actions = [
    { id: 'feed', label: 'feed', urgency: state.hunger < 30 ? (state.hunger < 15 ? 2 : 1) : 0 },
    { id: 'clean', label: 'clean water', urgency: state.cleanliness < 30 ? (state.cleanliness < 20 ? 2 : 1) : 0 },
    { id: 'play', label: 'play', urgency: 0 },
    { id: 'poop', label: `clean poop${poopCount > 0 ? ` (${poopCount})` : ''}`, urgency: poopCount > 2 ? 1 : 0 },
  ];

  actions.sort((a, b) => b.urgency - a.urgency);

  container.innerHTML = '';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.textContent = action.urgency >= 2 ? `${action.label}!` : action.label;
    btn.className = `action-btn ${action.urgency >= 2 ? 'urgent' : action.urgency >= 1 ? 'warn' : 'calm'}`;
    btn.addEventListener('click', () => {
      if (action.id === 'feed') sendCmd('cmd_feed');
      else if (action.id === 'clean') sendCmd('cmd_change_water');
      else if (action.id === 'play') sendCmd('cmd_play');
      else if (action.id === 'poop') {
        const first = state.poops?.[0];
        if (first) sendCmd('cmd_clean_poop', { id: first.id });
      }
    });
    container.appendChild(btn);
  }
}

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
  setupChat();
  connectWs();
});

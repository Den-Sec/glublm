// First-run onboarding for desk-pet. Shows 3 sequential hints to teach
// users how to interact with the fish. Persists via localStorage; shown
// only once per browser. Honors prefers-reduced-motion.

const ONBOARD_KEY = 'glub_onboarded_v1';

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(ONBOARD_KEY) !== 'true';
  } catch {
    return false; // localStorage blocked (e.g. private browsing strict mode)
  }
}

export function markOnboarded() {
  try { localStorage.setItem(ONBOARD_KEY, 'true'); } catch {}
}

const HINTS = [
  { text: 'tap the fish', duration: 2500 },
  { text: 'hold for happy', duration: 2500 },
  { text: 'type to chat', duration: 2500 },
];

let _dismissed = false;

export async function runOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  const textEl = overlay?.querySelector('.onboarding-text');
  const skipBtn = document.getElementById('onboarding-skip');
  if (!overlay || !textEl) return;

  _dismissed = false;
  overlay.classList.remove('hidden');

  // Early dismissal via skip button OR first pointer interaction on bowl/prompt
  const dismissHandler = () => { _dismissed = true; };
  skipBtn?.addEventListener('click', dismissHandler, { once: true });
  const bowl = document.getElementById('bowl');
  const prompt = document.getElementById('prompt');
  bowl?.addEventListener('pointerdown', dismissHandler, { once: true });
  prompt?.addEventListener('focus', dismissHandler, { once: true });

  for (const hint of HINTS) {
    if (_dismissed) break;
    textEl.textContent = hint.text;
    await wait(hint.duration);
  }

  overlay.classList.add('hidden');
  markOnboarded();
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════
// Speech — Web Speech API (local, privacy-safe)
// No student data ever leaves the device.
// ═══════════════════════════════════

let voicesLoaded = false;
let voices = [];

// Load voices (async on some browsers)
function loadVoices() {
  voices = speechSynthesis.getVoices();
  voicesLoaded = voices.length > 0;
}

if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

/**
 * Find the best English voice available
 */
function getBestVoice() {
  if (!voicesLoaded) loadVoices();

  // Prefer high-quality voices
  const preferred = [
    v => v.lang.startsWith('en') && v.name.includes('Samantha'),
    v => v.lang.startsWith('en') && v.name.includes('Google'),
    v => v.lang.startsWith('en') && v.name.includes('Daniel'),
    v => v.lang.startsWith('en') && v.name.includes('Karen'),
    v => v.lang.startsWith('en-AU'),
    v => v.lang.startsWith('en-GB'),
    v => v.lang.startsWith('en-US'),
    v => v.lang.startsWith('en'),
  ];

  for (const test of preferred) {
    const match = voices.find(test);
    if (match) return match;
  }
  return null;
}

/**
 * Speak a name using the Web Speech API (free, local, privacy-safe)
 */
export function speakName(name, phoneticGuide) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }

    // iOS workaround: cancel + small delay, then speak.
    // On iOS Safari, calling cancel() immediately before speak() can
    // cause the utterance to be silently dropped.
    speechSynthesis.cancel();

    const text = phoneticGuide || name;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = getBestVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = resolve;
    utterance.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(e);
      }
    };

    // iOS needs a tiny delay after cancel() before speak() will work
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      setTimeout(() => speechSynthesis.speak(utterance), 50);
    } else {
      speechSynthesis.speak(utterance);
    }
  });
}

/**
 * Pronounce a name. All processing happens on-device.
 */
export async function pronounceName(name, phoneticGuide) {
  await speakName(name, phoneticGuide);
}

/**
 * Check if speech is supported
 */
export function isSpeechSupported() {
  return 'speechSynthesis' in window;
}

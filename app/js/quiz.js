// ═══════════════════════════════════
// Quiz UI — All 4 phases + answer feedback
// ═══════════════════════════════════
import { esc, createPhotoElement, revokeAllPhotoURLs, animateCard, showToast } from './ui.js';
import { matchName } from './matching.js';
import { pronounceName, isSpeechSupported } from './speech.js';
import { getRetrievability, Grade } from './fsrs.js';
import { Phase } from './scheduler.js';
import { updateStudent } from './db.js';

let scheduler = null;
let currentCard = null;
let currentStudent = null;
let currentPhase = null;
let currentIsReverse = false;
let questionStartTime = 0;
let isPlaying = false;
let activePhotoURL = null;


// ─── Initialize Quiz ───

export function initQuiz(sessionScheduler) {
  scheduler = sessionScheduler;
  setupKeyboardShortcuts();
}

// ─── Display Next Card ───

export async function showNextCard() {
  if (!scheduler) return;

  // Check if session is complete
  if (scheduler.isSessionComplete()) {
    onSessionComplete();
    return;
  }

  const next = scheduler.getNextCard();
  if (!next) {
    onSessionComplete();
    return;
  }

  currentCard = next.card;
  currentStudent = next.student;
  currentPhase = next.phase;
  currentIsReverse = next.isReverse;
  questionStartTime = Date.now();

  // Clean up previous photo
  if (activePhotoURL) {
    URL.revokeObjectURL(activePhotoURL);
    activePhotoURL = null;
  }

  // Update stats display
  updateStatsDisplay();

  // Update confidence bar
  updateConfidenceBar();

  // Animate card
  animateCard(document.getElementById('quizCard'));

  // Render the appropriate phase
  if (currentIsReverse) {
    renderReversePhase();
  } else {
    switch (currentPhase) {
      case Phase.STUDY:
        renderStudyPhase();
        break;
      case Phase.MULTIPLE_CHOICE:
        renderMultipleChoicePhase();
        break;
      case Phase.HINTED_RECALL:
        renderHintedRecallPhase();
        break;
      case Phase.FULL_RECALL:
      default:
        renderFullRecallPhase();
        break;
    }
  }

  // Update mastery bar
  updateMasteryBar();
}

// ─── Phase Renderers ───

function renderStudyPhase() {
  const container = document.getElementById('photoContainer');
  const inputArea = document.getElementById('inputArea');

  // Show photo with name overlay
  displayPhoto(container, currentStudent);

  inputArea.innerHTML = `
    <div class="study-phase">
      <div class="study-name-overlay">
        <span class="study-name">${esc(currentStudent.preferredName)} ${esc(currentStudent.familyName)}</span>
      </div>
      <div class="study-timer-bar"><div class="study-timer-fill" id="studyTimerFill"></div></div>
      <p class="study-hint">Take a moment to learn this face and name</p>
      <button class="next-btn study-next-btn" id="studyNextBtn">Got it</button>
    </div>
  `;

  // Auto-advance timer (4 seconds)
  const fill = document.getElementById('studyTimerFill');
  if (fill) {
    fill.style.transition = 'width 4s linear';
    requestAnimationFrame(() => fill.style.width = '100%');
  }

  const autoAdvanceTimer = setTimeout(() => advanceFromStudy(), 4000);

  document.getElementById('studyNextBtn').onclick = () => {
    clearTimeout(autoAdvanceTimer);
    advanceFromStudy();
  };
}

async function advanceFromStudy() {
  await scheduler.recordStudyPhaseComplete(currentCard);
  showNextCard();
}

function renderMultipleChoicePhase() {
  const container = document.getElementById('photoContainer');
  const inputArea = document.getElementById('inputArea');

  displayPhoto(container, currentStudent);

  // Get distractors
  const distractors = scheduler.getDistractors(currentStudent.id);
  const options = [currentStudent, ...distractors].sort(() => Math.random() - 0.5);

  inputArea.innerHTML = `
    <p class="prompt-text">Who is this student?</p>
    <div class="mc-options">
      ${options.map(s => `
        <button class="mc-option" data-student-id="${s.id}">
          ${esc(s.preferredName)} ${esc(s.familyName)}
        </button>
      `).join('')}
    </div>
  `;

  // Attach handlers
  inputArea.querySelectorAll('.mc-option').forEach(btn => {
    btn.onclick = () => handleMultipleChoiceAnswer(btn, options);
  });
}

function handleMultipleChoiceAnswer(clickedBtn, options) {
  const allBtns = document.querySelectorAll('.mc-option');
  const isCorrect = parseInt(clickedBtn.dataset.studentId) === currentStudent.id;
  const responseTime = Date.now() - questionStartTime;

  // Highlight correct/wrong
  allBtns.forEach(btn => {
    btn.disabled = true;
    const id = parseInt(btn.dataset.studentId);
    if (id === currentStudent.id) {
      btn.classList.add('correct');
    } else if (btn === clickedBtn && !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  const grade = isCorrect ? Grade.GOOD : Grade.AGAIN;

  // Show answer after brief delay
  setTimeout(() => showAnswerPhase(isCorrect, grade, responseTime), 800);
}

function renderHintedRecallPhase() {
  const container = document.getElementById('photoContainer');
  const inputArea = document.getElementById('inputArea');

  displayPhoto(container, currentStudent);

  const firstLetter = currentStudent.preferredName[0];

  inputArea.innerHTML = `
    <p class="prompt-text">Who is this student?</p>
    <div class="hint-text">Starts with "${esc(firstLetter)}..."</div>
    <div class="name-input-row">
      <input type="text" class="name-input" id="nameInput" placeholder="Type their name" autocomplete="off" autofocus>
    </div>
    <div class="action-row">
      <button class="skip-btn" id="skipBtn">I don't know</button>
      <button class="check-btn" id="checkBtn">Check</button>
    </div>
  `;

  const input = document.getElementById('nameInput');
  setTimeout(() => input.focus(), 100);

  document.getElementById('checkBtn').onclick = () => handleTypedAnswer(true);
  document.getElementById('skipBtn').onclick = () => handleSkip();
}

function renderFullRecallPhase() {
  const container = document.getElementById('photoContainer');
  const inputArea = document.getElementById('inputArea');

  displayPhoto(container, currentStudent);

  inputArea.innerHTML = `
    <p class="prompt-text">Who is this student?</p>
    <div class="name-input-row">
      <input type="text" class="name-input" id="nameInput" placeholder="Type their name" autocomplete="off" autofocus>
    </div>
    <div class="action-row">
      <button class="skip-btn" id="skipBtn">I don't know</button>
      <button class="check-btn" id="checkBtn">Check</button>
    </div>
  `;

  const input = document.getElementById('nameInput');
  setTimeout(() => input.focus(), 100);

  document.getElementById('checkBtn').onclick = () => handleTypedAnswer(false);
  document.getElementById('skipBtn').onclick = () => handleSkip();
}

function renderReversePhase() {
  const container = document.getElementById('photoContainer');
  const inputArea = document.getElementById('inputArea');

  // Show name instead of photo
  container.innerHTML = `
    <div class="reverse-name-display">
      <span class="reverse-name">${esc(currentStudent.preferredName)} ${esc(currentStudent.familyName)}</span>
      <p class="reverse-prompt">Which face matches this name?</p>
    </div>
  `;

  // Get face options
  const distractors = scheduler.getFaceDistractors(currentStudent.id);
  const options = [currentStudent, ...distractors].sort(() => Math.random() - 0.5);

  inputArea.innerHTML = `
    <div class="face-options-grid">
      ${options.map(s => {
        const thumbHTML = s.thumbnail
          ? `<img class="face-option-img" data-student-id="${s.id}" src="" alt="">`
          : `<div class="face-option-placeholder" data-student-id="${s.id}">${esc((s.preferredName[0] || '') + (s.familyName[0] || ''))}</div>`;
        return `<button class="face-option" data-student-id="${s.id}">${thumbHTML}</button>`;
      }).join('')}
    </div>
  `;

  // Load thumbnails
  options.forEach(s => {
    if (s.thumbnail) {
      const img = inputArea.querySelector(`img[data-student-id="${s.id}"]`);
      if (img) {
        const url = URL.createObjectURL(s.thumbnail);
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);
      }
    }
  });

  // Attach handlers
  inputArea.querySelectorAll('.face-option').forEach(btn => {
    btn.onclick = () => handleReverseAnswer(btn);
  });
}

function handleReverseAnswer(clickedBtn) {
  const allBtns = document.querySelectorAll('.face-option');
  const isCorrect = parseInt(clickedBtn.dataset.studentId) === currentStudent.id;
  const responseTime = Date.now() - questionStartTime;

  allBtns.forEach(btn => {
    btn.disabled = true;
    const id = parseInt(btn.dataset.studentId);
    if (id === currentStudent.id) btn.classList.add('correct');
    else if (btn === clickedBtn && !isCorrect) btn.classList.add('wrong');
  });

  const grade = isCorrect ? Grade.GOOD : Grade.AGAIN;
  setTimeout(() => showAnswerPhase(isCorrect, grade, responseTime), 800);
}

// ─── Answer Handling ───

function handleTypedAnswer(isHinted) {
  const input = document.getElementById('nameInput');
  const value = input.value.trim();
  if (!value) return;

  const responseTime = Date.now() - questionStartTime;
  const result = matchName(value, currentStudent.preferredName);

  // Style the input
  const isCorrect = result.grade >= Grade.GOOD;
  input.classList.add(isCorrect ? 'correct' : 'incorrect');
  input.disabled = true;

  // Adjust grade: if hinted and exact, max is Good (not Easy)
  let grade = result.grade;
  if (isHinted && grade === Grade.EASY) grade = Grade.GOOD;

  // Auto-detect "Easy" via response time (< 3s for exact match)
  if (!isHinted && result.match === 'exact' && responseTime < 3000) {
    grade = Grade.EASY;
  }

  showAnswerPhase(isCorrect, grade, responseTime, result.feedback);
}

function handleSkip() {
  const input = document.getElementById('nameInput');
  if (input) {
    input.classList.add('incorrect');
    input.disabled = true;
  }

  const responseTime = Date.now() - questionStartTime;
  showAnswerPhase(false, Grade.AGAIN, responseTime, 'No worries — you\'ll get it next time!');
}

async function showAnswerPhase(isCorrect, grade, responseTime, feedbackText) {
  const inputArea = document.getElementById('inputArea');

  // Show the photo (in case of reverse mode)
  if (currentIsReverse) {
    const container = document.getElementById('photoContainer');
    displayPhoto(container, currentStudent);
  }

  const fb = feedbackText || (isCorrect ? 'Correct!' : 'Not quite...');
  const feedbackClass = isCorrect ? 'correct-feedback' : 'incorrect-feedback';

  const speechSupported = isSpeechSupported();
  const mnemonicValue = currentStudent.mnemonic || '';

  inputArea.innerHTML = `
    <div class="feedback show ${feedbackClass}">${esc(fb)}</div>
    <div class="correct-name show">${esc(currentStudent.preferredName)} ${esc(currentStudent.familyName)}</div>
    ${currentStudent.phoneticGuide ? `<div class="phonetic-guide">${esc(currentStudent.phoneticGuide)}</div>` : ''}
    <div class="mnemonic-section">
      <textarea class="mnemonic-field" id="mnemonicField" placeholder="Add a memory trick..." rows="2">${esc(mnemonicValue)}</textarea>
    </div>
    <div class="action-row" style="justify-content:center">
      ${speechSupported ? `
        <button class="play-btn" id="playBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          Hear Name
        </button>
      ` : ''}
      <button class="next-btn" id="nextBtn">Next</button>
    </div>
  `;

  // Save mnemonic on blur
  const mnField = document.getElementById('mnemonicField');
  if (mnField) {
    mnField.addEventListener('blur', async () => {
      const val = mnField.value.trim();
      if (val !== (currentStudent.mnemonic || '')) {
        currentStudent.mnemonic = val;
        await updateStudent(currentStudent.id, { mnemonic: val });
      }
    });
  }

  // Pronunciation button
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.onclick = () => handlePronunciation();
  }

  // Next button
  document.getElementById('nextBtn').onclick = () => showNextCard();

  // Record the result
  await scheduler.recordResult(currentCard, grade, responseTime);

  // Update stats display
  updateStatsDisplay();

  // Focus next button
  setTimeout(() => {
    const btn = document.getElementById('nextBtn');
    if (btn) btn.focus();
  }, 100);
}

// ─── Helpers ───

function displayPhoto(container, student) {
  if (activePhotoURL) {
    URL.revokeObjectURL(activePhotoURL);
    activePhotoURL = null;
  }

  if (student.photo) {
    activePhotoURL = URL.createObjectURL(student.photo);
    container.innerHTML = `<img src="${activePhotoURL}" alt="Student photo">`;
  } else if (student.thumbnail) {
    activePhotoURL = URL.createObjectURL(student.thumbnail);
    container.innerHTML = `<img src="${activePhotoURL}" alt="Student photo">`;
  } else {
    const initials = (student.preferredName[0] || '') + (student.familyName[0] || '');
    container.innerHTML = `<div class="no-photo-large">${esc(initials.toUpperCase())}</div>`;
  }
}

function handlePronunciation() {
  if (isPlaying || !currentStudent) return;

  const btn = document.getElementById('playBtn');
  if (btn) btn.disabled = true;
  isPlaying = true;

  const name = `${currentStudent.preferredName} ${currentStudent.familyName}`;

  // Call synchronously from the tap handler — iOS requires this for speechSynthesis
  pronounceName(name, currentStudent.phoneticGuide)
    .catch(err => console.warn('Pronunciation error:', err))
    .finally(() => {
      isPlaying = false;
      if (btn) btn.disabled = false;
    });
}

function updateStatsDisplay() {
  if (!scheduler) return;
  const stats = scheduler.getSessionStats();
  const el = (id) => document.getElementById(id);

  const correct = el('statCorrect');
  const incorrect = el('statIncorrect');
  const streak = el('statStreak');
  const goalRing = el('dailyGoalProgress');

  if (correct) correct.textContent = `${stats.correct} correct`;
  if (incorrect) incorrect.textContent = `${stats.incorrect} missed`;
  if (streak) {
    // Show current session streak (consecutive correct in this session)
    const sessionStreak = stats.correct > 0 && stats.incorrect === 0
      ? stats.correct
      : stats.correct - stats.incorrect > 0 ? stats.correct - stats.incorrect : 0;
  }

  // Update daily goal ring
  if (goalRing) {
    const pct = Math.min(100, Math.round(stats.goalProgress * 100));
    goalRing.style.setProperty('--progress', pct + '%');
    goalRing.setAttribute('data-progress', `${stats.reviewed}/${scheduler.dailyGoal}`);
  }
}

function updateConfidenceBar() {
  if (!currentCard) return;
  const pct = Math.round(getRetrievability(currentCard) * 100);
  const fill = document.getElementById('confidenceFill');
  if (fill) fill.style.width = pct + '%';
}

function updateMasteryBar() {
  if (!scheduler) return;
  const mastery = scheduler.getMasteryStats();
  const bar = document.getElementById('masteryFill');
  const text = document.getElementById('masteryText');
  if (bar) bar.style.width = mastery.percentage + '%';
  if (text) text.textContent = `${mastery.mastered}/${mastery.total} students learned`;
}

function onSessionComplete() {
  // Dispatch custom event for app.js to handle
  window.dispatchEvent(new CustomEvent('sessionComplete', {
    detail: {
      stats: scheduler.getSessionStats(),
      mastery: scheduler.getMasteryStats(),
      troubleSpots: scheduler.getTroubleSpots(),
    }
  }));
}

// ─── Keyboard Shortcuts ───

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
  const quizScreen = document.getElementById('quizScreen');
  if (!quizScreen || !quizScreen.classList.contains('active')) return;

  const nameInput = document.getElementById('nameInput');
  const nextBtn = document.getElementById('nextBtn');
  const checkBtn = document.getElementById('checkBtn');
  const studyNextBtn = document.getElementById('studyNextBtn');

  const activeTag = document.activeElement?.tagName;
  const isInInput = document.activeElement === nameInput || activeTag === 'TEXTAREA';
  const isAnswerPhase = !!nextBtn;
  const isQuestionPhase = !!checkBtn;
  const isStudyPhase = !!studyNextBtn;

  // Enter → Check answer / Next card / Advance study
  if (e.key === 'Enter') {
    e.preventDefault();
    if (isStudyPhase) studyNextBtn.click();
    else if (isQuestionPhase) checkBtn.click();
    else if (isAnswerPhase) nextBtn.click();
    return;
  }

  // Escape → Skip
  if (e.key === 'Escape') {
    e.preventDefault();
    if (isStudyPhase) studyNextBtn.click();
    else if (isQuestionPhase) {
      const skipBtn = document.getElementById('skipBtn');
      if (skipBtn) skipBtn.click();
    }
    return;
  }

  // Space → Play pronunciation (answer phase, not in input)
  if (e.key === ' ' && isAnswerPhase && !isInInput) {
    e.preventDefault();
    handlePronunciation();
    return;
  }

  // Number keys 1-4 for multiple choice
  if (['1', '2', '3', '4'].includes(e.key) && !isInInput) {
    const mcOptions = document.querySelectorAll('.mc-option:not([disabled])');
    const idx = parseInt(e.key) - 1;
    if (mcOptions[idx]) {
      e.preventDefault();
      mcOptions[idx].click();
      return;
    }
  }

  // Start typing during answer phase → advance to next card (but not if focused on an input/textarea)
  const tag = document.activeElement?.tagName;
  if (isAnswerPhase && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    showNextCard();
    // Inject the typed character
    setTimeout(() => {
      const inp = document.getElementById('nameInput');
      if (inp) inp.value = e.key;
    }, 120);
  }
}

export function cleanup() {
  if (activePhotoURL) {
    URL.revokeObjectURL(activePhotoURL);
    activePhotoURL = null;
  }
  revokeAllPhotoURLs();
  document.removeEventListener('keydown', handleKeyboard);
}

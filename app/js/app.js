// ═══════════════════════════════════
// App — Main entry point
// ═══════════════════════════════════
import { db, getClasses, addClass, deleteClass, getClass, getStudentsByClass, getSetting, setSetting, clearAllData, requestPersistentStorage, updateClass } from './db.js';
import { importFromZip, importFromFolder } from './import.js';
import { SessionScheduler } from './scheduler.js';
import { initQuiz, showNextCard, cleanup as cleanupQuiz } from './quiz.js';
import { getDailyGoal, setDailyGoal, GOAL_LEVELS, checkStreak, getStreakData, recordSessionComplete, buildSessionSummary, checkMilestone } from './stats.js';
import { showScreen, showLoading, hideLoading, showToast, esc, isMobile, isIOS, confirmDialog, renderProgressRing } from './ui.js';
import { isSpeechSupported } from './speech.js';

let currentClassId = null;
let scheduler = null;

// ─── Demo Auto-Import ───

async function handleDemoParam() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== '1') return;

  // Clear param to prevent re-triggering
  history.replaceState(null, '', window.location.pathname + window.location.hash);

  // Only auto-import if no classes exist yet
  const classes = await getClasses();
  if (classes.length > 0) return;

  showLoading('Loading demo class...');
  try {
    const response = await fetch('/demo_students.zip');
    if (!response.ok) throw new Error('Could not fetch demo data');
    const blob = await response.blob();
    const file = new File([blob], 'demo_students.zip', { type: 'application/zip' });
    const classId = await addClass('Demo Class (BIOL1020)');
    const count = await importFromZip(file, classId, (msg) => {
      const text = document.getElementById('loadingText');
      if (text) text.textContent = msg;
    });
    await updateClass(classId, { studentCount: count });
    hideLoading();
    showToast(`${count} demo students loaded!`, 'success');
    await startStudySession(classId);
  } catch (err) {
    hideLoading();
    console.error('Demo import error:', err);
    showToast('Could not load demo — try uploading demo_students.zip manually', 'error', 5000);
  }
}

// ─── Initialization ───

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
  }

  // Request persistent storage
  await requestPersistentStorage();

  // Check streak
  await checkStreak();

  // Load existing classes
  await renderSetupScreen();

  // Handle ?demo=1 auto-import
  await handleDemoParam();

  // Set up routing
  setupRouting();

  // Mobile zoom prevention
  setupMobileHandlers();

  // Listen for session complete
  window.addEventListener('sessionComplete', handleSessionComplete);
}

// ─── Routing ───

function setupRouting() {
  window.addEventListener('hashchange', route);
  route(); // Handle initial hash
}

function route() {
  const hash = window.location.hash || '';
  const routes = {
    '': 'setup',
    '#/setup': 'setup',
    '#/quiz': 'quiz',
    '#/progress': 'progress',
    '#/settings': 'settings',
    '#/summary': 'summary',
  };
  const screen = routes[hash];
  if (screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(screen + 'Screen');
    if (el) el.classList.add('active');
  }
}

// ─── Setup Screen ───

async function renderSetupScreen() {
  const classes = await getClasses();
  const classList = document.getElementById('classList');
  const existingSection = document.getElementById('existingClasses');
  const streak = await getStreakData();

  // Streak display
  const streakEl = document.getElementById('streakDisplay');
  if (streakEl && streak.currentStreak > 0) {
    streakEl.innerHTML = `<span class="streak-badge">${streak.currentStreak} day streak</span>`;
    streakEl.classList.remove('hidden');
  }

  if (classList && existingSection) {
    if (classes.length === 0) {
      existingSection.classList.add('hidden');
      classList.innerHTML = '';
    } else {
      existingSection.classList.remove('hidden');
    }
  }

  if (classes.length > 0 && classList && existingSection) {
    classList.innerHTML = classes.map(c => `
      <div class="class-item" data-id="${c.id}">
        <div class="class-info">
          <span class="class-name">${esc(c.name)}</span>
          <span class="class-count">${c.studentCount || 0} students</span>
        </div>
        <div class="class-actions">
          <button class="class-study-btn" data-id="${c.id}">Study</button>
          <button class="class-delete-btn" data-id="${c.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach handlers
    classList.querySelectorAll('.class-study-btn').forEach(btn => {
      btn.onclick = () => startStudySession(parseInt(btn.dataset.id));
    });
    classList.querySelectorAll('.class-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        const cls = await getClass(parseInt(btn.dataset.id));
        if (await confirmDialog(`Delete "${cls.name}" and all its data?`)) {
          await deleteClass(parseInt(btn.dataset.id));
          await renderSetupScreen();
          showToast('Class deleted');
        }
      };
    });
  }

  // Import handlers
  setupImportHandlers();

  // Device hints
  const hint = document.getElementById('deviceHint');
  if (hint && isMobile) {
    hint.textContent = 'Tip: Zip the photo folder on your computer and transfer it via AirDrop or cloud storage.';
  }

  // Settings link
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.onclick = () => {
      renderSettingsScreen();
      showScreen('settings');
    };
  }
}

function setupImportHandlers() {
  const folderInput = document.getElementById('folderInput');
  const zipInput = document.getElementById('zipInput');
  const classNameInput = document.getElementById('classNameInput');

  // Folder button
  const folderBtn = document.getElementById('folderBtn');
  if (folderBtn) {
    folderBtn.onclick = () => folderInput.click();
  }

  // Zip button
  const zipBtn = document.getElementById('zipBtn');
  if (zipBtn) {
    zipBtn.onclick = () => zipInput.click();
  }

  // Folder import
  if (folderInput) {
    folderInput.onchange = async () => {
      if (!folderInput.files.length) return;
      await handleImport('folder', folderInput.files);
    };
  }

  // Zip import
  if (zipInput) {
    zipInput.onchange = async () => {
      if (!zipInput.files[0]) return;
      await handleImport('zip', zipInput.files[0]);
    };
  }
}

async function handleImport(type, fileOrList) {
  const className = document.getElementById('classNameInput')?.value.trim() || 'My Class';

  showLoading('Preparing import...');

  try {
    const classId = await addClass(className);
    let count;

    if (type === 'zip') {
      count = await importFromZip(fileOrList, classId, (msg) => {
        const text = document.getElementById('loadingText');
        if (text) text.textContent = msg;
      });
    } else {
      count = await importFromFolder(fileOrList, classId, (msg) => {
        const text = document.getElementById('loadingText');
        if (text) text.textContent = msg;
      });
    }

    hideLoading();

    if (count > 0) {
      await updateClass(classId, { studentCount: count });
      showToast(`${count} students imported!`, 'success');
      await renderSetupScreen();

      // Auto-start if this is the only class
      const classes = await getClasses();
      if (classes.length === 1) {
        await startStudySession(classId);
      }
    } else {
      await deleteClass(classId);
      showToast('No valid student photos found. Expected format: "LastName, FirstName (ID).jpg"', 'error', 5000);
    }
  } catch (err) {
    hideLoading();
    console.error('Import error:', err);
    showToast('Import failed: ' + err.message, 'error');
  }
}

// ─── Study Session ───

async function startStudySession(classId) {
  currentClassId = classId;

  showLoading('Loading students...');

  const goal = await getDailyGoal();
  scheduler = new SessionScheduler(classId, goal.reviews);

  // Check for reverse mode
  const reverseMode = await getSetting('reverseMode');
  scheduler.reverseMode = !!reverseMode;

  await scheduler.init();

  hideLoading();

  if (scheduler.students.size === 0) {
    showToast('No students in this class', 'error');
    return;
  }

  initQuiz(scheduler);
  showScreen('quiz');

  // Update mastery display
  const mastery = scheduler.getMasteryStats();
  updateMasteryDisplay(mastery);

  showNextCard();
}

function updateMasteryDisplay(mastery) {
  const bar = document.getElementById('masteryFill');
  const text = document.getElementById('masteryText');
  if (bar) bar.style.width = mastery.percentage + '%';
  if (text) text.textContent = `${mastery.mastered}/${mastery.total} learned`;
}

// ─── Session Complete ───

async function handleSessionComplete(event) {
  const { stats, mastery, troubleSpots } = event.detail;

  // Record session and update streak
  const streak = await recordSessionComplete(currentClassId, stats);

  // Check milestone
  // (We'd need prevMastered from before session, approximate with current)
  const milestone = checkMilestone(
    Math.max(0, mastery.actualMastered - stats.newLearned),
    mastery.actualMastered,
    mastery.total
  );

  // Build summary
  const summary = await buildSessionSummary(currentClassId, stats, mastery);

  // Render summary screen
  renderSummaryScreen(summary, troubleSpots, milestone);
  showScreen('summary');
}

function renderSummaryScreen(summary, troubleSpots, milestone) {
  const container = document.getElementById('summaryContent');
  if (!container) return;

  container.innerHTML = `
    ${milestone ? `<div class="milestone-banner">${esc(milestone)}</div>` : ''}

    <div class="summary-header">
      <h2>Session Complete</h2>
      <p class="summary-message">${esc(summary.accuracyMessage)}</p>
    </div>

    <div class="summary-stats-grid">
      <div class="summary-stat">
        <div class="summary-stat-value">${summary.cardsReviewed}</div>
        <div class="summary-stat-label">Cards Reviewed</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${summary.accuracy}%</div>
        <div class="summary-stat-label">Accuracy ${summary.accuracyDelta ? `<br><span class="delta">${esc(summary.accuracyDelta)}</span>` : ''}</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${summary.newStudentsLearned}</div>
        <div class="summary-stat-label">New Students</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-value">${summary.duration}</div>
        <div class="summary-stat-label">Duration</div>
      </div>
    </div>

    <div class="summary-mastery">
      <div class="mastery-bar-large">
        <div class="mastery-fill-large" style="width: ${summary.masteryPercentage}%"></div>
      </div>
      <p class="mastery-label">${esc(summary.masteryProgress)}</p>
    </div>

    ${summary.speedDelta ? `<p class="speed-delta">${esc(summary.speedDelta)}</p>` : ''}

    ${summary.streak > 0 ? `
      <div class="streak-summary">
        <span class="streak-fire">&#x1F525;</span>
        <span>${summary.streak} day streak!</span>
        ${summary.streakFreezes > 0 ? `<span class="freeze-count">${summary.streakFreezes} freeze${summary.streakFreezes > 1 ? 's' : ''} available</span>` : ''}
      </div>
    ` : ''}

    ${troubleSpots.length > 0 ? `
      <div class="trouble-spots">
        <h3>Focus next time</h3>
        <div class="trouble-list">
          ${troubleSpots.map(t => `
            <div class="trouble-item">
              <span>${esc(t.student.preferredName)} ${esc(t.student.familyName)}</span>
              <span class="trouble-lapses">${t.lapses} miss${t.lapses > 1 ? 'es' : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="summary-actions">
      <button class="start-btn" id="continueStudyBtn">Continue Studying</button>
      <button class="back-btn" id="backToSetupBtn">Done for now</button>
    </div>
  `;

  document.getElementById('continueStudyBtn').onclick = () => startStudySession(currentClassId);
  document.getElementById('backToSetupBtn').onclick = async () => {
    cleanupQuiz();
    await renderSetupScreen();
    showScreen('setup');
  };
}

// ─── Settings Screen ───

async function renderSettingsScreen() {
  const container = document.getElementById('settingsContent');
  if (!container) return;

  const currentGoal = await getSetting('dailyGoal') || 'regular';
  const reverseMode = await getSetting('reverseMode') || false;

  container.innerHTML = `
    <div class="settings-section">
      <h3>Daily Goal</h3>
      <p class="settings-desc">How many cards do you want to review each day?</p>
      <div class="goal-picker">
        ${Object.entries(GOAL_LEVELS).map(([key, val]) => `
          <button class="goal-option ${key === currentGoal ? 'active' : ''}" data-goal="${key}">
            <span class="goal-count">${val.reviews}</span>
            <span class="goal-label">${val.label}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="settings-section">
      <h3>Study Options</h3>
      <div class="setting-row">
        <label class="setting-toggle">
          <input type="checkbox" id="reverseModeToggle" ${reverseMode ? 'checked' : ''}>
          <span>Reverse mode (name → pick face)</span>
        </label>
        <p class="settings-desc">Occasionally show the name and ask you to identify the face from options</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Data</h3>
      <button class="danger-btn" id="clearAllBtn">Clear All Data</button>
      <p class="settings-desc">Remove all classes, students, and progress from this device</p>
    </div>

    <div class="settings-section privacy-notice">
      <h3>Privacy</h3>
      <p>All student data is stored entirely on your device and never transmitted to any server. Photos, names, and your progress data never leave your browser.</p>
      ${isIOS ? '<p class="ios-note">For best experience on iOS, add this app to your Home Screen to prevent data loss.</p>' : ''}
    </div>
  `;

  // Goal picker
  container.querySelectorAll('.goal-option').forEach(btn => {
    btn.onclick = async () => {
      container.querySelectorAll('.goal-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await setDailyGoal(btn.dataset.goal);
      showToast('Daily goal updated');
    };
  });

  // Reverse mode
  const reverseToggle = document.getElementById('reverseModeToggle');
  if (reverseToggle) {
    reverseToggle.onchange = async () => {
      await setSetting('reverseMode', reverseToggle.checked);
    };
  }

  // Clear all data
  document.getElementById('clearAllBtn').onclick = async () => {
    if (await confirmDialog('This will permanently delete all classes, students, photos, and your learning progress. Are you sure?')) {
      await clearAllData();
      showToast('All data cleared');
      await renderSetupScreen();
      showScreen('setup');
    }
  };
}

// ─── Progress Screen ───

export async function renderProgressScreen() {
  if (!currentClassId) return;

  const container = document.getElementById('progressContent');
  if (!container) return;

  const students = await getStudentsByClass(currentClassId);
  const { getFSRSCardsByClass } = await import('./db.js');
  const cards = await getFSRSCardsByClass(currentClassId);
  const cardMap = new Map(cards.map(c => [c.studentId, c]));

  const sorted = [...students].sort((a, b) => a.familyName.localeCompare(b.familyName));

  let html = '<div class="progress-student-grid">';
  for (const s of sorted) {
    const card = cardMap.get(s.id);
    let status = 'new';
    if (card) {
      if (card.stability >= 21) status = 'mastered';
      else if (card.state !== 'new') status = 'learning';
    }

    const initials = (s.preferredName[0] || '') + (s.familyName[0] || '');
    html += `
      <div class="progress-item ${status}">
        ${s.thumbnail ? `<img src="${URL.createObjectURL(s.thumbnail)}" alt="">` : `<div class="pi-initials">${esc(initials.toUpperCase())}</div>`}
        <span>${esc(s.preferredName)} ${esc(s.familyName[0])}.</span>
      </div>
    `;
  }
  html += '</div>';

  container.innerHTML = html;
}

// ─── Mobile Handlers ───

function setupMobileHandlers() {
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 300) e.preventDefault();
    lastTap = now;
  }, { passive: false });
}

// ─── Back Button Handling ───

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.back-btn');
  if (!btn) return;

  const currentScreen = document.querySelector('.screen.active');
  if (!currentScreen) return;

  const id = currentScreen.id;
  if (id === 'quizScreen' || id === 'settingsScreen' || id === 'progressScreen' || id === 'summaryScreen') {
    cleanupQuiz();
    await renderSetupScreen();
    showScreen('setup');
  }
});

// ─── Start ───
init().catch(console.error);

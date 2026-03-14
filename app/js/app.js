// ═══════════════════════════════════
// App — Main entry point
// ═══════════════════════════════════
import { db, getClasses, addClass, deleteClass, getClass, getStudentsByClass, getSetting, setSetting, clearAllData, requestPersistentStorage, updateClass, exportAllData, importBackupData, exportProgressCSV, getStorageEstimate, getFSRSCardsByClass } from './db.js';
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

  // Skip if demo class already exists
  const classes = await getClasses();
  if (classes.some(c => c.name.includes('Demo'))) {
    // Demo already imported, just start it
    const demoClass = classes.find(c => c.name.includes('Demo'));
    await startStudySession(demoClass.id);
    return;
  }

  showLoading('Loading demo class...');
  try {
    const response = await fetch('/demo_students.zip');
    if (!response.ok) throw new Error('Could not fetch demo data');
    const blob = await response.blob();
    const file = new File([blob], 'demo_students.zip', { type: 'application/zip' });
    const classId = await addClass('Demo Class (BIOL1020)');
    const result = await importFromZip(file, classId, (msg) => {
      const text = document.getElementById('loadingText');
      if (text) text.textContent = msg;
    });
    await updateClass(classId, { studentCount: result.count });
    hideLoading();
    showToast(`${result.count} demo students loaded!`, 'success');
    await startStudySession(classId);
  } catch (err) {
    hideLoading();
    console.error('Demo import error:', err);
    showToast('Could not load demo — try uploading demo_students.zip manually', 'error', 5000);
  }
}

// ─── Dark Mode ───

async function initDarkMode() {
  const saved = await getSetting('darkMode');
  if (saved === 'on') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (saved === 'off') {
    document.documentElement.removeAttribute('data-theme');
  }
  // If null, respect system preference (CSS handles via prefers-color-scheme)
}

// ─── Initialization ───

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => null);

    // Listen for SW updates
    if (reg) {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }
  }

  // Dark mode
  await initDarkMode();

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

  // iOS data loss warning (first import)
  if (isIOS) {
    const warned = await getSetting('iosWarningShown');
    if (!warned) {
      await setSetting('iosWarningShown', true);
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (!isPWA) {
        setTimeout(() => {
          showToast('Tip: Install this app to your Home Screen to prevent iOS from deleting your data', 'info', 6000);
        }, 2000);
      }
    }
  }
}

// ─── SW Update Banner ───

function showUpdateBanner() {
  const existing = document.getElementById('updateBanner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>A new version is available</span>
    <button onclick="location.reload()">Refresh</button>
    <button class="dismiss" onclick="this.parentElement.remove()">Dismiss</button>
  `;
  document.body.appendChild(banner);
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
    '#/dashboard': 'dashboard',
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
          <button class="class-study-btn" data-id="${c.id}" aria-label="Study ${esc(c.name)}">Study</button>
          <button class="class-delete-btn" data-id="${c.id}" title="Delete" aria-label="Delete ${esc(c.name)}">
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
    let result;

    if (type === 'zip') {
      result = await importFromZip(fileOrList, classId, (msg) => {
        const text = document.getElementById('loadingText');
        if (text) text.textContent = msg;
      });
    } else {
      result = await importFromFolder(fileOrList, classId, (msg) => {
        const text = document.getElementById('loadingText');
        if (text) text.textContent = msg;
      });
    }

    hideLoading();

    const count = result.count;
    const skipped = result.skipped;

    if (count > 0) {
      await updateClass(classId, { studentCount: count });
      let msg = `${count} students imported!`;
      if (skipped.length > 0) {
        msg += ` (${skipped.length} file${skipped.length > 1 ? 's' : ''} skipped)`;
      }
      showToast(msg, 'success', skipped.length > 0 ? 5000 : 3000);

      // Show skipped files detail if any
      if (skipped.length > 0) {
        setTimeout(() => {
          const names = skipped.slice(0, 5).join(', ');
          const more = skipped.length > 5 ? ` and ${skipped.length - 5} more` : '';
          showToast(`Skipped: ${names}${more}. Expected format: LastName, FirstName (ID).jpg`, 'info', 8000);
        }, 3500);
      }

      await renderSetupScreen();

      // Auto-start if this is the only class
      const classes = await getClasses();
      if (classes.length === 1) {
        await startStudySession(classId);
      }
    } else {
      await deleteClass(classId);
      let errorMsg = 'No valid student photos found. Expected format: "LastName, FirstName (ID).jpg"';
      if (skipped.length > 0) {
        const names = skipped.slice(0, 3).join(', ');
        errorMsg += `\n\nFiles found but not matching: ${names}${skipped.length > 3 ? ` (+${skipped.length - 3} more)` : ''}`;
      }
      showToast(errorMsg, 'error', 8000);
    }
  } catch (err) {
    hideLoading();
    console.error('Import error:', err);
    showToast('Import failed: ' + err.message, 'error', 5000);
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
    ${milestone ? `<div class="milestone-banner" role="alert">${esc(milestone)}</div>` : ''}

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
      <div class="mastery-bar-large" role="progressbar" aria-valuenow="${summary.masteryPercentage}" aria-valuemin="0" aria-valuemax="100">
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
  const darkMode = await getSetting('darkMode');
  const classes = await getClasses();

  // Storage estimate
  const storage = await getStorageEstimate();
  const storageMB = storage ? (storage.usage / (1024 * 1024)).toFixed(1) : null;

  container.innerHTML = `
    <div class="settings-section">
      <h3>Daily Goal</h3>
      <p class="settings-desc">How many cards do you want to review each day?</p>
      <div class="goal-picker">
        ${Object.entries(GOAL_LEVELS).map(([key, val]) => `
          <button class="goal-option ${key === currentGoal ? 'active' : ''}" data-goal="${key}" aria-label="${val.label}: ${val.reviews} reviews">
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
      <h3>Appearance</h3>
      <div class="setting-row">
        <label class="setting-toggle">
          <input type="checkbox" id="darkModeToggle" ${darkMode === 'on' ? 'checked' : ''}>
          <span>Dark mode</span>
        </label>
        <p class="settings-desc">${darkMode ? '' : 'Currently following system preference'}</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Data</h3>
      ${storageMB ? `<p class="settings-desc">Storage used: ${storageMB} MB</p>` : ''}

      <div class="data-actions">
        <button class="secondary-btn" id="exportBackupBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          Export Backup
        </button>
        <button class="secondary-btn" id="importBackupBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
          Import Backup
        </button>
        <input type="file" id="backupFileInput" accept=".json" class="hidden">
      </div>

      ${classes.length > 0 ? `
        <div class="csv-export">
          <p class="settings-desc" style="margin-top:16px">Export progress as CSV:</p>
          <div class="csv-class-list">
            ${classes.map(c => `
              <button class="csv-export-btn" data-id="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                ${esc(c.name)}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 20px">
        <button class="danger-btn" id="clearAllBtn">Clear All Data</button>
        <p class="settings-desc">Remove all classes, students, and progress from this device</p>
      </div>
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

  // Dark mode
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    darkToggle.onchange = async () => {
      const on = darkToggle.checked;
      await setSetting('darkMode', on ? 'on' : 'off');
      if (on) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };
  }

  // Export backup
  document.getElementById('exportBackupBtn').onclick = async () => {
    showLoading('Exporting backup...');
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learn-my-students-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      hideLoading();
      showToast('Backup exported!', 'success');
    } catch (err) {
      hideLoading();
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  // Import backup
  const backupInput = document.getElementById('backupFileInput');
  document.getElementById('importBackupBtn').onclick = () => backupInput.click();
  backupInput.onchange = async () => {
    const file = backupInput.files[0];
    if (!file) return;
    if (!await confirmDialog('This will replace all existing data with the backup. Continue?')) return;
    showLoading('Importing backup...');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importBackupData(data);
      hideLoading();
      showToast('Backup restored!', 'success');
      await renderSetupScreen();
      showScreen('setup');
    } catch (err) {
      hideLoading();
      showToast('Import failed: ' + err.message, 'error');
    }
  };

  // CSV export
  container.querySelectorAll('.csv-export-btn').forEach(btn => {
    btn.onclick = async () => {
      const classId = parseInt(btn.dataset.id);
      const cls = await getClass(classId);
      const csv = await exportProgressCSV(classId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cls.name.replace(/[^a-z0-9]/gi, '_')}_progress.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported!', 'success');
    };
  });

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
  const cards = await getFSRSCardsByClass(currentClassId);
  const cardMap = new Map(cards.map(c => [c.studentId, c]));

  const sorted = [...students].sort((a, b) => a.familyName.localeCompare(b.familyName));

  let html = '<div class="progress-student-grid">';
  for (const s of sorted) {
    const card = cardMap.get(s.id);
    let status = 'new';
    let statusLabel = 'New';
    if (card) {
      if (card.stability >= 21) { status = 'mastered'; statusLabel = 'Mastered'; }
      else if (card.state !== 'new') { status = 'learning'; statusLabel = 'Learning'; }
    }

    const initials = (s.preferredName[0] || '') + (s.familyName[0] || '');
    html += `
      <div class="progress-item ${status}" role="listitem" aria-label="${esc(s.preferredName)} ${esc(s.familyName)}: ${statusLabel}">
        ${s.thumbnail ? `<img src="${URL.createObjectURL(s.thumbnail)}" alt="${esc(s.preferredName)} ${esc(s.familyName)}">` : `<div class="pi-initials">${esc(initials.toUpperCase())}</div>`}
        <span>${esc(s.preferredName)} ${esc(s.familyName[0])}.</span>
      </div>
    `;
  }
  html += '</div>';

  container.innerHTML = html;
}

// ─── Dashboard Screen ───

async function renderDashboardScreen(classId) {
  const container = document.getElementById('dashboardContent');
  if (!container) return;

  const students = await getStudentsByClass(classId);
  const cards = await getFSRSCardsByClass(classId);
  const cls = await getClass(classId);

  // Card state counts
  let newCount = 0, learning = 0, review = 0, mastered = 0;
  let totalStability = 0;
  const upcomingReviews = { today: 0, tomorrow: 0, thisWeek: 0, later: 0 };
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

  for (const card of cards) {
    if (card.state === 'new') newCount++;
    else if (card.stability >= 21) mastered++;
    else if (card.state === 'learning' || card.state === 'relearning') learning++;
    else review++;

    totalStability += card.stability || 0;

    const due = new Date(card.due);
    if (card.state !== 'new') {
      if (due <= now) upcomingReviews.today++;
      else if (due <= tomorrow) upcomingReviews.tomorrow++;
      else if (due <= weekEnd) upcomingReviews.thisWeek++;
      else upcomingReviews.later++;
    }
  }

  const total = students.length;
  const avgStability = cards.length > 0 ? (totalStability / cards.length).toFixed(1) : 0;
  const retentionEst = cards.length > 0 ? Math.round((mastered + review * 0.7 + learning * 0.3) / cards.length * 100) : 0;

  container.innerHTML = `
    <h3>${esc(cls?.name || 'Class')} — Dashboard</h3>

    <div class="dash-section">
      <h4>Card States</h4>
      <div class="dash-states">
        <div class="dash-state-bar">
          ${mastered > 0 ? `<div class="dash-bar-segment mastered" style="width:${mastered/total*100}%" title="Mastered: ${mastered}"></div>` : ''}
          ${review > 0 ? `<div class="dash-bar-segment review" style="width:${review/total*100}%" title="Review: ${review}"></div>` : ''}
          ${learning > 0 ? `<div class="dash-bar-segment learning" style="width:${learning/total*100}%" title="Learning: ${learning}"></div>` : ''}
          ${newCount > 0 ? `<div class="dash-bar-segment new" style="width:${newCount/total*100}%" title="New: ${newCount}"></div>` : ''}
        </div>
        <div class="dash-legend">
          <span class="dash-legend-item"><span class="dot mastered"></span> Mastered ${mastered}</span>
          <span class="dash-legend-item"><span class="dot review"></span> Review ${review}</span>
          <span class="dash-legend-item"><span class="dot learning"></span> Learning ${learning}</span>
          <span class="dash-legend-item"><span class="dot new"></span> New ${newCount}</span>
        </div>
      </div>
    </div>

    <div class="dash-section">
      <h4>Upcoming Reviews</h4>
      <div class="dash-forecast">
        <div class="dash-forecast-item">
          <span class="dash-forecast-count">${upcomingReviews.today}</span>
          <span class="dash-forecast-label">Due now</span>
        </div>
        <div class="dash-forecast-item">
          <span class="dash-forecast-count">${upcomingReviews.tomorrow}</span>
          <span class="dash-forecast-label">Tomorrow</span>
        </div>
        <div class="dash-forecast-item">
          <span class="dash-forecast-count">${upcomingReviews.thisWeek}</span>
          <span class="dash-forecast-label">This week</span>
        </div>
        <div class="dash-forecast-item">
          <span class="dash-forecast-count">${upcomingReviews.later}</span>
          <span class="dash-forecast-label">Later</span>
        </div>
      </div>
    </div>

    <div class="dash-section">
      <h4>Stats</h4>
      <div class="summary-stats-grid">
        <div class="summary-stat">
          <div class="summary-stat-value">${total}</div>
          <div class="summary-stat-label">Total Students</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat-value">${retentionEst}%</div>
          <div class="summary-stat-label">Est. Retention</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat-value">${avgStability}</div>
          <div class="summary-stat-label">Avg. Stability</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat-value">${Math.round(mastered/total*100) || 0}%</div>
          <div class="summary-stat-label">Mastered</div>
        </div>
      </div>
    </div>
  `;
}

// ─── Mobile Handlers ───

function setupMobileHandlers() {
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });
}

// ─── Back Button Handling ───

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.back-btn');
  if (!btn) return;

  const currentScreen = document.querySelector('.screen.active');
  if (!currentScreen) return;

  const id = currentScreen.id;
  if (id === 'quizScreen' || id === 'settingsScreen' || id === 'progressScreen' || id === 'summaryScreen' || id === 'dashboardScreen') {
    cleanupQuiz();
    await renderSetupScreen();
    showScreen('setup');
  }
});

// ─── Dashboard link from progress ───

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.dashboard-link');
  if (!btn || !currentClassId) return;
  await renderDashboardScreen(currentClassId);
  showScreen('dashboard');
});

// ─── Start ───
init().catch(console.error);

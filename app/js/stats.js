// ═══════════════════════════════════
// Stats & Gamification
// Streaks, daily goals, session summaries
// ═══════════════════════════════════
import { getSetting, setSetting, saveSession, getRecentSessions } from './db.js';

// ─── Daily Goal Levels ───
export const GOAL_LEVELS = {
  casual:  { reviews: 5,  label: 'Casual' },
  regular: { reviews: 15, label: 'Regular' },
  intense: { reviews: 30, label: 'Intense' }
};

/**
 * Get the current daily goal
 */
export async function getDailyGoal() {
  const level = await getSetting('dailyGoal') || 'regular';
  return GOAL_LEVELS[level] || GOAL_LEVELS.regular;
}

/**
 * Set the daily goal level
 */
export async function setDailyGoal(level) {
  await setSetting('dailyGoal', level);
}

// ─── Streak System ───

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.round(Math.abs(d2 - d1) / (24 * 60 * 60 * 1000));
}

/**
 * Get current streak data
 */
export async function getStreakData() {
  const data = await getSetting('streakData');
  return data || {
    currentStreak: 0,
    longestStreak: 0,
    lastPracticeDate: null,
    streakFreezes: 1,  // Start with 1 freeze
    freezesUsed: 0,
    totalSessions: 0,
    consecutiveDays: 0, // For freeze replenishment
  };
}

/**
 * Check and update streak on app open.
 * Handles streak freezes and resets.
 */
export async function checkStreak() {
  const streak = await getStreakData();
  const today = todayStr();

  if (!streak.lastPracticeDate) {
    // First time user
    return streak;
  }

  const daysSince = daysBetween(streak.lastPracticeDate, today);

  if (daysSince === 0) {
    // Already practiced today
    return streak;
  }

  if (daysSince === 1) {
    // Yesterday — streak is active but not yet extended (will extend on session complete)
    return streak;
  }

  if (daysSince === 2 && streak.streakFreezes > 0) {
    // Missed 1 day — use a streak freeze
    streak.streakFreezes--;
    streak.freezesUsed++;
    await setSetting('streakData', streak);
    return streak;
  }

  // Streak broken
  streak.currentStreak = 0;
  streak.freezesUsed = 0;
  streak.consecutiveDays = 0;
  await setSetting('streakData', streak);
  return streak;
}

/**
 * Record a completed session and update streak
 */
export async function recordSessionComplete(classId, sessionStats) {
  const today = todayStr();
  const streak = await getStreakData();

  // Save session to DB
  await saveSession({
    classId,
    startedAt: new Date(Date.now() - sessionStats.durationMs),
    endedAt: new Date(),
    cardsReviewed: sessionStats.reviewed,
    correct: sessionStats.correct,
    incorrect: sessionStats.incorrect,
    newLearned: sessionStats.newLearned,
    accuracy: sessionStats.accuracy,
    avgResponseTime: sessionStats.avgResponseTimeMs,
  });

  // Update streak only if minimum session threshold met (5 reviews)
  if (sessionStats.reviewed >= 5) {
    if (streak.lastPracticeDate !== today) {
      // New day practice
      const daysSince = streak.lastPracticeDate
        ? daysBetween(streak.lastPracticeDate, today)
        : 999;

      if (daysSince <= 2) {
        // Extend streak
        streak.currentStreak++;
      } else {
        // Start new streak
        streak.currentStreak = 1;
      }

      streak.consecutiveDays++;
      streak.lastPracticeDate = today;

      // Replenish freeze every 7 consecutive days (max 2)
      if (streak.consecutiveDays % 7 === 0 && streak.streakFreezes < 2) {
        streak.streakFreezes++;
      }
    }

    streak.totalSessions++;
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    await setSetting('streakData', streak);
  }

  return streak;
}

// ─── Session Summary ───

/**
 * Build a session summary with growth framing
 */
export async function buildSessionSummary(classId, sessionStats, masteryStats) {
  const recentSessions = await getRecentSessions(classId, 5);
  const streak = await getStreakData();

  // Compare with previous session
  const prevSession = recentSessions.length > 1 ? recentSessions[1] : null;

  let accuracyDelta = '';
  let speedDelta = '';

  if (prevSession) {
    const prevAccuracy = prevSession.accuracy || 0;
    const diff = sessionStats.accuracy - prevAccuracy;
    if (diff > 0) accuracyDelta = `+${diff}% from last session`;
    else if (diff < 0) accuracyDelta = `${diff}% from last session`;
    else accuracyDelta = 'Same as last session';

    if (prevSession.avgResponseTime && sessionStats.avgResponseTimeMs) {
      const speedImprove = Math.round(
        ((prevSession.avgResponseTime - sessionStats.avgResponseTimeMs) / prevSession.avgResponseTime) * 100
      );
      if (speedImprove > 0) speedDelta = `${speedImprove}% faster than last session`;
    }
  }

  // Duration formatting
  const mins = Math.round(sessionStats.durationMs / 60000);
  const duration = mins < 1 ? 'Less than a minute' : `${mins} minute${mins === 1 ? '' : 's'}`;

  // Positive framing for accuracy
  let accuracyMessage;
  if (sessionStats.accuracy >= 90) accuracyMessage = 'Outstanding recall!';
  else if (sessionStats.accuracy >= 75) accuracyMessage = 'Great progress!';
  else if (sessionStats.accuracy >= 50) accuracyMessage = 'Building strong foundations!';
  else accuracyMessage = 'Challenging session — you tackled tough names!';

  return {
    duration,
    cardsReviewed: sessionStats.reviewed,
    accuracy: sessionStats.accuracy,
    accuracyDelta,
    accuracyMessage,
    speedDelta,
    newStudentsLearned: sessionStats.newLearned,
    masteryProgress: `${masteryStats.mastered}/${masteryStats.total} students learned`,
    masteryPercentage: masteryStats.percentage,
    streak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    streakFreezes: streak.streakFreezes,
    goalProgress: sessionStats.goalProgress,
  };
}

// ─── Milestone Detection ───

/**
 * Check if a mastery milestone was crossed
 * @param {number} prevMastered - mastered count before session
 * @param {number} currentMastered - mastered count after session
 * @returns {string|null} milestone message or null
 */
export function checkMilestone(prevMastered, currentMastered, total) {
  // Check every 10 students
  const prevChunk = Math.floor(prevMastered / 10);
  const currChunk = Math.floor(currentMastered / 10);

  if (currChunk > prevChunk) {
    const reached = currChunk * 10;
    const remaining = total - currentMastered;

    if (currentMastered >= total) {
      return `You've learned all ${total} students!`;
    }
    if (remaining <= 10) {
      return `${currentMastered} students learned — almost there! Only ${remaining} to go!`;
    }
    return `${reached} students learned — great milestone!`;
  }

  return null;
}

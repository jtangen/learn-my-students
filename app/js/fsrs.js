// ═══════════════════════════════════
// FSRS v4.5 — Spaced Repetition Algorithm
// Pure functions, no dependencies
// Based on: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// ═══════════════════════════════════

const DECAY = -0.5;
const FACTOR = 19 / 81; // ensures R(S,S) = 0.9

// FSRS-4.5 default parameters (17 values, trained on 700M+ reviews)
const DEFAULT_W = [
  0.4872, 1.4003, 3.7145, 13.8206,  // w0-w3: initial stability for grades 1..4
  5.1618,                             // w4: initial difficulty base
  1.2298,                             // w5: initial difficulty scaling
  0.8975,                             // w6: difficulty reversion from grade
  0.031,                              // w7: mean reversion weight
  1.6474,                             // w8: success stability base
  0.1367,                             // w9: success stability S exponent
  1.0461,                             // w10: success stability R factor
  2.1072,                             // w11: failure stability base
  0.0793,                             // w12: failure stability D exponent
  0.3246,                             // w13: failure stability S exponent
  1.587,                              // w14: failure stability R factor
  0.2272,                             // w15: hard penalty
  2.8755                              // w16: easy bonus
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Retrievability: probability of recall after t days with stability S
 * R(t,S) = (1 + FACTOR * t / S) ^ DECAY
 */
export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * Next optimal interval for desired retention
 * I(r,S) = (S / FACTOR) * (r^(1/DECAY) - 1)
 */
export function nextInterval(stability, desiredRetention = 0.9) {
  return Math.max(1, Math.round(
    (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1)
  ));
}

/**
 * Initial stability for a given first grade (1=Again, 2=Hard, 3=Good, 4=Easy)
 */
function initStability(grade, w = DEFAULT_W) {
  return Math.max(0.1, w[grade - 1]);
}

/**
 * Initial difficulty for a given first grade
 */
function initDifficulty(grade, w = DEFAULT_W) {
  return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1, 10);
}

/**
 * Update difficulty after a review
 */
function updateDifficulty(D, grade, w = DEFAULT_W) {
  const deltaD = -w[6] * (grade - 3);
  const Dprime = D + deltaD * (10 - D) / 9;
  // Mean reversion toward D0(grade=4)
  const D0_4 = clamp(w[4] - Math.exp(w[5] * 3) + 1, 1, 10);
  return clamp(w[7] * D0_4 + (1 - w[7]) * Dprime, 1, 10);
}

/**
 * Stability after successful recall
 */
function stabilityAfterSuccess(D, S, R, grade, w = DEFAULT_W) {
  const hardPenalty = (grade === 2) ? w[15] : 1;
  const easyBonus = (grade === 4) ? w[16] : 1;
  return S * (
    Math.exp(w[8]) *
    (11 - D) *
    Math.pow(S, -w[9]) *
    (Math.exp(w[10] * (1 - R)) - 1) *
    hardPenalty *
    easyBonus
    + 1
  );
}

/**
 * Stability after failure (lapse)
 */
function stabilityAfterFailure(D, S, R, w = DEFAULT_W) {
  return Math.max(0.1,
    w[11] *
    Math.pow(D, -w[12]) *
    (Math.pow(S + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - R))
  );
}

// ─── Card States ───
export const State = {
  NEW: 'new',
  LEARNING: 'learning',
  REVIEW: 'review',
  RELEARNING: 'relearning'
};

// ─── Grades ───
export const Grade = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
};

/**
 * Create a new FSRS card for a student
 */
export function createNewCard(studentId, classId) {
  return {
    studentId,
    classId,
    state: State.NEW,
    difficulty: 0,
    stability: 0,
    due: new Date(0),
    lastReview: null,
    reps: 0,
    lapses: 0,
    encounterCount: 0,
    currentPhase: 'study'
  };
}

/**
 * Review a card and compute new scheduling state
 * @param {Object} card - current card state
 * @param {number} grade - 1=Again, 2=Hard, 3=Good, 4=Easy
 * @param {Date} now - current timestamp
 * @param {number} desiredRetention - target retention rate (0.8 to 0.95)
 * @returns {Object} updated card
 */
export function reviewCard(card, grade, now = new Date(), desiredRetention = 0.9) {
  const updated = { ...card };
  updated.lastReview = now;

  if (card.state === State.NEW) {
    // First review: initialize D and S from grade
    updated.difficulty = initDifficulty(grade);
    updated.stability = initStability(grade);
    updated.reps = 1;

    if (grade === Grade.AGAIN) {
      updated.state = State.LEARNING;
      updated.lapses = 1;
      // Short interval for learning: review in ~1 minute (stored as fractional day)
      updated.due = new Date(now.getTime() + 60 * 1000);
    } else {
      updated.state = State.REVIEW;
      const interval = nextInterval(updated.stability, desiredRetention);
      updated.due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    }
  } else {
    // Subsequent review
    const elapsedDays = card.lastReview
      ? Math.max(0, (now.getTime() - card.lastReview.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const R = card.stability > 0 ? retrievability(elapsedDays, card.stability) : 0;

    updated.difficulty = updateDifficulty(card.difficulty, grade);

    if (grade === Grade.AGAIN) {
      // Lapse
      updated.stability = stabilityAfterFailure(updated.difficulty, card.stability, R);
      updated.lapses = (card.lapses || 0) + 1;
      updated.state = State.RELEARNING;
      // Short interval: 1 minute for relearning
      updated.due = new Date(now.getTime() + 60 * 1000);
    } else {
      // Successful recall
      updated.stability = stabilityAfterSuccess(updated.difficulty, card.stability, R, grade);
      updated.reps = (card.reps || 0) + 1;
      updated.state = State.REVIEW;
      const interval = nextInterval(updated.stability, desiredRetention);
      updated.due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    }
  }

  return updated;
}

/**
 * Get current retrievability for a card
 */
export function getRetrievability(card, now = new Date()) {
  if (card.state === State.NEW || !card.lastReview || card.stability <= 0) return 0;
  const elapsed = Math.max(0, (now.getTime() - card.lastReview.getTime()) / (24 * 60 * 60 * 1000));
  return retrievability(elapsed, card.stability);
}

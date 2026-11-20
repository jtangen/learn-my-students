// ═══════════════════════════════════
// Session Scheduler
// Manages card queue, batch intro, progressive difficulty
// ═══════════════════════════════════
import { getDueCards, getNewCards, getFSRSCardsByClass, saveFSRSCard, getStudentsByClass } from './db.js';
import { reviewCard, Grade, State } from './fsrs.js';
import { chooseDistractors } from './name-guess.js';

const BATCH_SIZE = 6;        // New students per session
const MIN_QUEUE_AHEAD = 3;   // Keep at least this many cards queued

// ─── Progressive Difficulty Phases ───
export const Phase = {
  STUDY: 'study',
  MULTIPLE_CHOICE: 'multipleChoice',
  HINTED_RECALL: 'hintedRecall',
  FULL_RECALL: 'fullRecall'
};

// Phase order for advancement
const PHASE_ORDER = [Phase.STUDY, Phase.MULTIPLE_CHOICE, Phase.HINTED_RECALL, Phase.FULL_RECALL];

function nextPhase(currentPhase) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return Phase.FULL_RECALL;
  return PHASE_ORDER[idx + 1];
}

/**
 * Where you stand with a student, from their card:
 *   'new'      not met yet
 *   'shaky'    forgotten at the last attempt, or missed twice and still fragile
 *   'learning' met and on the way
 *   'known'    stable for three weeks or more (the same line the mastery bar uses)
 */
export function cardStatus(card) {
  if (!card) return 'new';
  if (card.state === State.NEW) return card.encounterCount ? 'learning' : 'new';
  if (card.stability >= 21) return 'known';
  if (card.state === State.LEARNING || card.state === State.RELEARNING) return 'shaky';
  if ((card.lapses || 0) >= 2 && card.stability < 7) return 'shaky';
  return 'learning';
}

export const STATUS_LABELS = { known: 'Know well', learning: 'Learning', shaky: 'Shaky', new: 'New' };

/**
 * Session scheduler: manages the quiz queue for a study session
 */
export class SessionScheduler {
  /**
   * @param {object} options - { quick: n } runs a short session ("Five before class"):
   *   n students, each taken from seeing the name to typing it from memory.
   */
  constructor(classId, dailyGoal = 15, options = {}) {
    this.classId = classId;
    this.dailyGoal = dailyGoal;
    this.quick = options.quick || 0;
    this.quickIds = [];            // the students chosen for a short session
    this.queue = [];
    this.reviewed = 0;
    this.correct = 0;
    this.incorrect = 0;
    this.newLearned = 0;
    this.responseTimes = [];
    this.startTime = Date.now();
    this.students = new Map();     // id -> student record
    this.cards = new Map();        // studentId -> FSRS card
    this.lastStudentId = null;
    this.reverseMode = false;
  }

  /**
   * Initialize the session: load students, build queue
   */
  async init() {
    // Load all students for this class
    const studentList = await getStudentsByClass(this.classId);
    for (const s of studentList) {
      this.students.set(s.id, s);
    }

    // Load all FSRS cards
    const cardList = await getFSRSCardsByClass(this.classId);
    for (const c of cardList) {
      this.cards.set(c.studentId, c);
    }

    await this.buildQueue();
  }

  /**
   * Build the initial session queue with interleaved new + review cards
   */
  async buildQueue() {
    const now = new Date();

    if (this.quick) {
      this.queue = await this.pickQuick(this.quick);
      this.quickIds = this.queue.map(c => c.studentId);
      return;
    }

    // Get due review cards
    const dueCards = await getDueCards(this.classId, now);

    // Get new cards (up to BATCH_SIZE)
    const newCards = await getNewCards(this.classId);
    const newBatch = newCards.slice(0, BATCH_SIZE);

    // Interleave: ~75% reviews, 25% new
    this.queue = [];
    let reviewIdx = 0;
    let newIdx = 0;

    while (reviewIdx < dueCards.length || newIdx < newBatch.length) {
      // Add 3-4 review cards
      const reviewChunk = Math.min(3 + Math.floor(Math.random() * 2), dueCards.length - reviewIdx);
      for (let i = 0; i < reviewChunk && reviewIdx < dueCards.length; i++) {
        this.queue.push(dueCards[reviewIdx++]);
      }

      // Then 1 new card
      if (newIdx < newBatch.length) {
        this.queue.push(newBatch[newIdx++]);
      }
    }

    // If we have nothing due but have new cards, just use new cards
    if (this.queue.length === 0 && newCards.length > 0) {
      this.queue = newCards.slice(0, BATCH_SIZE);
    }

    // If still nothing, get all cards ordered by due date (for practicing ahead)
    if (this.queue.length === 0) {
      const allCards = await getFSRSCardsByClass(this.classId);
      // Sort by due date (soonest first)
      allCards.sort((a, b) => new Date(a.due) - new Date(b.due));
      this.queue = allCards.slice(0, 20);
    }
  }

  /**
   * Choose the students for a short session: anyone shaky first (learnt and
   * lost), then students not met yet, then the ones known least.
   */
  async pickQuick(count) {
    const all = (await getFSRSCardsByClass(this.classId)).filter(c => this.students.has(c.studentId));
    const shaky = all.filter(c => cardStatus(c) === 'shaky');
    const fresh = all.filter(c => c.state === State.NEW);
    const rest = all.filter(c => c.state !== State.NEW && cardStatus(c) !== 'shaky')
      .sort((a, b) => (a.stability || 0) - (b.stability || 0));
    return [...shaky, ...fresh, ...rest].slice(0, count);
  }

  /** The students practised in a short session, in the order chosen */
  getQuickStudents() {
    return this.quickIds.map(id => this.students.get(id)).filter(Boolean);
  }

  /**
   * Get the next card to show.
   * Returns { card, student, phase } or null if session is complete.
   */
  getNextCard() {
    if (this.queue.length === 0) return null;

    // Find a card that isn't the same as the last shown
    let idx = 0;
    if (this.queue.length > 1 && this.lastStudentId != null) {
      idx = this.queue.findIndex(c => c.studentId !== this.lastStudentId);
      if (idx < 0) idx = 0;
    }

    const card = this.queue.splice(idx, 1)[0];
    const student = this.students.get(card.studentId);
    if (!student) {
      // Student not found, skip
      return this.queue.length > 0 ? this.getNextCard() : null;
    }

    this.lastStudentId = card.studentId;

    // Determine phase based on encounter count
    let phase;
    if (card.state === State.NEW && card.encounterCount === 0) {
      phase = Phase.STUDY;
    } else if (card.encounterCount === 1) {
      // Skip MC if fewer than 2 students (need at least 2 options)
      phase = this.students.size >= 2 ? Phase.MULTIPLE_CHOICE : Phase.HINTED_RECALL;
    } else if (card.encounterCount === 2) {
      phase = Phase.HINTED_RECALL;
    } else {
      phase = card.currentPhase === Phase.FULL_RECALL ? Phase.FULL_RECALL : (card.currentPhase || Phase.FULL_RECALL);
    }

    // Random reverse mode insertion (~15% of full-recall cards)
    const isReverse = this.reverseMode &&
      phase === Phase.FULL_RECALL &&
      Math.random() < 0.15;

    return { card, student, phase, isReverse };
  }

  /**
   * Get the wrong answers for a multiple-choice question.
   * They are drawn from names of the same likely gender as the right one
   * where the first name allows a guess (see name-guess.js), so that a
   * question can't be answered just by ruling names out.
   */
  getDistractors(correctStudentId, count = 3) {
    const correct = this.students.get(correctStudentId);
    const others = [...this.students.values()].filter(s => s.id !== correctStudentId);
    return chooseDistractors(correct, others, count, Math.random, this.mixedUpWith(correctStudentId));
  }

  /**
   * Note a mix-up: for this card's student, the name (or the face) of another
   * student was given. It is kept on the card, as a count per student, and is
   * saved when the card's result is recorded straight afterwards.
   */
  noteMixUp(card, otherStudentId) {
    const other = Number(otherStudentId);
    if (!card || !Number.isFinite(other) || other === card.studentId || !this.students.has(other)) return;
    const mixUps = { ...(card.mixUps || {}) };
    mixUps[other] = (mixUps[other] || 0) + 1;
    card.mixUps = mixUps;
  }

  /**
   * The students this one has been mixed up with, most often first. It counts
   * both ways round: giving Dev's name for Rohan's face makes each a good
   * wrong answer for the other. Students since deleted are left out.
   */
  mixedUpWith(studentId) {
    const counts = new Map();
    const add = (id, n) => {
      id = Number(id);
      if (id !== studentId && this.students.has(id) && n > 0) counts.set(id, (counts.get(id) || 0) + n);
    };
    for (const card of this.cards.values()) {
      if (!card.mixUps) continue;
      if (card.studentId === studentId) {
        for (const [id, n] of Object.entries(card.mixUps)) add(id, n);
      } else if (card.mixUps[studentId]) {
        add(card.studentId, card.mixUps[studentId]);
      }
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ student: this.students.get(id), n, tie: Math.random() }))
      .sort((a, b) => b.n - a.n || a.tie - b.tie)
      .map(x => x.student);
  }

  /**
   * Get random distractor photos for reverse mode.
   * Returns array of 3 student objects (excluding the correct student).
   */
  getFaceDistractors(correctStudentId, count = 3) {
    return this.getDistractors(correctStudentId, count);
  }

  /**
   * Record the result of a card review.
   * @param {Object} card - the FSRS card
   * @param {number} grade - 1=Again, 2=Hard, 3=Good, 4=Easy
   * @param {number} responseTimeMs - how long the user took to answer
   */
  async recordResult(card, grade, responseTimeMs) {
    const now = new Date();
    this.reviewed++;
    this.responseTimes.push(responseTimeMs);

    if (grade >= Grade.GOOD) {
      this.correct++;
    } else {
      this.incorrect++;
    }

    // Was this a new card being learned?
    if (card.state === State.NEW) {
      this.newLearned++;
    }

    // Update FSRS state
    const updated = reviewCard(card, grade, now);

    // Update encounter tracking
    if (grade >= Grade.GOOD) {
      updated.encounterCount = (card.encounterCount || 0) + 1;
      updated.currentPhase = nextPhase(card.currentPhase || Phase.STUDY);
    } else {
      // Failed: keep same encounter count and phase
      updated.encounterCount = card.encounterCount || 0;
      updated.currentPhase = card.currentPhase || Phase.STUDY;
    }

    // Ensure dates are proper Date objects for storage
    if (updated.due && !(updated.due instanceof Date)) {
      updated.due = new Date(updated.due);
    }
    if (updated.lastReview && !(updated.lastReview instanceof Date)) {
      updated.lastReview = new Date(updated.lastReview);
    }

    // Save to DB
    await saveFSRSCard(updated);

    // Update local cache
    this.cards.set(updated.studentId, updated);

    // If failed, re-insert into queue (3-5 cards later)
    if (grade === Grade.AGAIN) {
      const insertAt = Math.min(this.queue.length, 3 + Math.floor(Math.random() * 3));
      this.queue.splice(insertAt, 0, updated);
    } else if (this.quick && (grade < Grade.GOOD || (card.encounterCount || 0) < 3)) {
      // Short session: a right answer short of typed recall comes back for the next step
      // (multiple choice, then a first-letter hint, then typing the name unaided), and a
      // near miss comes back for another go. A student is done once typed right unaided.
      const insertAt = Math.min(this.queue.length, 2 + Math.floor(Math.random() * 2));
      this.queue.splice(insertAt, 0, updated);
    }

    return updated;
  }

  /**
   * Record a study phase completion (just viewing, no FSRS review)
   */
  async recordStudyPhaseComplete(card) {
    const updated = { ...card };
    updated.encounterCount = 1;
    updated.currentPhase = Phase.MULTIPLE_CHOICE;
    await saveFSRSCard(updated);
    this.cards.set(updated.studentId, updated);

    // Re-insert for the next phase (multiple choice), a few cards later
    const insertAt = Math.min(this.queue.length, 2 + Math.floor(Math.random() * 3));
    this.queue.splice(insertAt, 0, updated);

    return updated;
  }

  /**
   * Check if the session's daily goal has been reached
   */
  isGoalReached() {
    if (this.quick) return false;   // a short session ends when its students are done
    return this.reviewed >= this.dailyGoal;
  }

  /**
   * Check if the session is complete (goal reached or no more cards)
   */
  isSessionComplete() {
    return this.queue.length === 0 || this.isGoalReached();
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const duration = Date.now() - this.startTime;
    const avgResponseTime = this.responseTimes.length > 0
      ? Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length)
      : 0;

    return {
      reviewed: this.reviewed,
      correct: this.correct,
      incorrect: this.incorrect,
      newLearned: this.newLearned,
      accuracy: this.reviewed > 0 ? Math.round((this.correct / this.reviewed) * 100) : 0,
      durationMs: duration,
      avgResponseTimeMs: avgResponseTime,
      goalProgress: Math.min(1, this.reviewed / this.dailyGoal),
    };
  }

  /**
   * Get mastery overview for the class
   */
  getMasteryStats() {
    let mastered = 0, learning = 0, newCount = 0;
    const total = this.students.size;

    for (const card of this.cards.values()) {
      if (card.state === State.NEW) {
        newCount++;
      } else if (card.stability >= 21) {
        mastered++;
      } else {
        learning++;
      }
    }

    // Endowed progress (~8%)
    const endowed = Math.ceil(total * 0.08);
    const displayMastered = Math.min(total, mastered + endowed);

    return {
      total,
      mastered: displayMastered,
      actualMastered: mastered,
      learning,
      new: newCount,
      percentage: total > 0 ? Math.round((displayMastered / total) * 100) : 0
    };
  }

  /**
   * Get the trouble spots (students with most lapses)
   */
  getTroubleSpots(limit = 5) {
    const spots = [];
    for (const card of this.cards.values()) {
      if (card.lapses > 0) {
        const student = this.students.get(card.studentId);
        if (student) {
          spots.push({ student, card, lapses: card.lapses });
        }
      }
    }
    spots.sort((a, b) => b.lapses - a.lapses);
    return spots.slice(0, limit);
  }
}

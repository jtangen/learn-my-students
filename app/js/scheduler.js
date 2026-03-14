// ═══════════════════════════════════
// Session Scheduler
// Manages card queue, batch intro, progressive difficulty
// ═══════════════════════════════════
import { getDueCards, getNewCards, getFSRSCardsByClass, saveFSRSCard, getStudentsByClass } from './db.js';
import { reviewCard, Grade, State } from './fsrs.js';

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
 * Session scheduler: manages the quiz queue for a study session
 */
export class SessionScheduler {
  constructor(classId, dailyGoal = 15) {
    this.classId = classId;
    this.dailyGoal = dailyGoal;
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
   * Get random distractor names for multiple-choice.
   * Prefers distractors whose first name has the same likely gender
   * (based on name ending heuristics) to avoid trivially obvious wrong answers.
   */
  getDistractors(correctStudentId, count = 3) {
    const correct = this.students.get(correctStudentId);
    const others = [...this.students.values()].filter(s => s.id !== correctStudentId);

    // If not enough students for full distractor set, return what we have
    if (!correct || others.length <= count) {
      return others.sort(() => Math.random() - 0.5);
    }

    // Split candidates by likely gender match
    const correctGender = guessNameGender(correct.preferredName);
    const sameGender = others.filter(s => guessNameGender(s.preferredName) === correctGender);
    const diffGender = others.filter(s => guessNameGender(s.preferredName) !== correctGender);

    // Prefer same-gender distractors, fill remainder randomly
    const shuffledSame = sameGender.sort(() => Math.random() - 0.5);
    const shuffledDiff = diffGender.sort(() => Math.random() - 0.5);

    const result = [];
    let si = 0, di = 0;
    while (result.length < count) {
      if (si < shuffledSame.length) {
        result.push(shuffledSame[si++]);
      } else if (di < shuffledDiff.length) {
        result.push(shuffledDiff[di++]);
      } else {
        break;
      }
    }
    return result;
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

// ─── Name-based gender heuristic ───
// Returns 'f', 'm', or 'u' (unknown). Uses common English name endings
// and a short lookup of high-frequency names. Not perfect, but sufficient
// to avoid obviously mismatched MC distractors.

const FEMALE_NAMES = new Set([
  'mary','emma','olivia','ava','sophia','isabella','mia','charlotte','amelia',
  'harper','evelyn','abigail','emily','elizabeth','ella','madison','scarlett',
  'victoria','aria','grace','chloe','camila','penelope','riley','layla','lily',
  'nora','zoey','hannah','hazel','violet','aurora','savannah','audrey','brooklyn',
  'bella','claire','skylar','lucy','paisley','natalie','anna','caroline','genesis',
  'leah','aaliyah','allison','gabriella','alice','sadie','hailey','eva','emilia',
  'autumn','quinn','nevaeh','piper','ruby','serenity','willow','taylor','madelyn',
  'kaylee','naomi','sarah','alexa','stella','ellie','maya','sophie','tania',
  'jessica','jennifer','ashley','amanda','stephanie','nicole','michelle','rachel',
  'samantha','rebecca','katherine','catherine','megan','andrea','laura','linda',
  'patricia','barbara','susan','karen','nancy','betty','margaret','sandra','donna',
  'carol','ruth','sharon','helen','deborah','diana','julia','bonita','shanelle',
  'alesha','elin','kenisha','cheuk','wing','raphita','nadia','nina','tara','lara',
]);

const MALE_NAMES = new Set([
  'james','robert','john','michael','david','william','richard','joseph','thomas',
  'charles','christopher','daniel','matthew','anthony','mark','donald','steven',
  'paul','andrew','joshua','kenneth','kevin','brian','george','timothy','ronald',
  'edward','jason','jeffrey','ryan','jacob','gary','nicholas','eric','jonathan',
  'stephen','larry','justin','scott','brandon','benjamin','samuel','raymond',
  'gregory','frank','alexander','patrick','jack','dennis','jerry','tyler','aaron',
  'jose','adam','nathan','henry','peter','zachary','douglas','harold','kyle','noah',
  'ethan','liam','mason','logan','aiden','jackson','sebastian','owen','caleb',
  'luke','isaac','dylan','connor','harrison','theodore','derek','ayush','anderson',
]);

function guessNameGender(firstName) {
  if (!firstName) return 'u';
  const name = firstName.split(' ')[0].toLowerCase().trim();

  // Direct lookup first
  if (FEMALE_NAMES.has(name)) return 'f';
  if (MALE_NAMES.has(name)) return 'm';

  // Ending-based heuristics (works for many English/Romance names)
  if (name.endsWith('a') || name.endsWith('ia') || name.endsWith('ina') ||
      name.endsWith('ella') || name.endsWith('ette') || name.endsWith('lyn') ||
      name.endsWith('een') || name.endsWith('ine')) return 'f';

  if (name.endsWith('son') || name.endsWith('ton') || name.endsWith('ard') ||
      name.endsWith('ert') || name.endsWith('old') || name.endsWith('ew')) return 'm';

  return 'u';
}

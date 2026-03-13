// ═══════════════════════════════════
// Database Layer — Dexie.js / IndexedDB
// ═══════════════════════════════════
import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4/+esm';

const db = new Dexie('LearnMyStudents');

db.version(1).stores({
  classes:   '++id, name, createdAt',
  students:  '++id, classId, studentId, familyName, preferredName, [classId+studentId]',
  fsrsCards: '++id, studentId, classId, due, state, [classId+due], [classId+state]',
  sessions:  '++id, classId, startedAt',
  settings:  'key'
});

// ─── Classes ───
export async function addClass(name) {
  return db.classes.add({ name, createdAt: new Date(), studentCount: 0 });
}

export async function getClasses() {
  return db.classes.toArray();
}

export async function getClass(id) {
  return db.classes.get(id);
}

export async function updateClass(id, fields) {
  return db.classes.update(id, fields);
}

export async function deleteClass(id) {
  await db.transaction('rw', [db.classes, db.students, db.fsrsCards, db.sessions], async () => {
    await db.fsrsCards.where('classId').equals(id).delete();
    await db.sessions.where('classId').equals(id).delete();
    await db.students.where('classId').equals(id).delete();
    await db.classes.delete(id);
  });
}

// ─── Students ───
// Note: photo and thumbnail are stored as non-indexed Blob properties
export async function addStudents(classId, studentDataArray) {
  await db.transaction('rw', [db.students, db.classes], async () => {
    await db.students.bulkAdd(studentDataArray.map(s => ({
      classId,
      studentId: s.studentId,
      familyName: s.familyName,
      preferredName: s.preferredName,
      photo: s.photo,           // Blob, NOT indexed
      thumbnail: s.thumbnail,   // Blob, NOT indexed
      phoneticGuide: '',
      mnemonic: '',
      major: '',
      hometown: '',
      funFact: '',
      notes: ''
    })));
    await db.classes.update(classId, { studentCount: studentDataArray.length });
  });
}

export async function getStudentsByClass(classId) {
  return db.students.where('classId').equals(classId).toArray();
}

export async function getStudent(id) {
  return db.students.get(id);
}

export async function getStudentCount(classId) {
  return db.students.where('classId').equals(classId).count();
}

export async function updateStudent(id, fields) {
  return db.students.update(id, fields);
}

// ─── FSRS Cards ───
export async function saveFSRSCard(cardData) {
  if (cardData.id) {
    return db.fsrsCards.put(cardData);
  }
  return db.fsrsCards.add(cardData);
}

export async function saveFSRSCards(cards) {
  return db.fsrsCards.bulkPut(cards);
}

export async function getFSRSCard(studentId, classId) {
  return db.fsrsCards
    .where('classId').equals(classId)
    .filter(c => c.studentId === studentId)
    .first();
}

export async function getFSRSCardsByClass(classId) {
  return db.fsrsCards.where('classId').equals(classId).toArray();
}

export async function getDueCards(classId, now = new Date()) {
  return db.fsrsCards.where('[classId+due]')
    .between([classId, Dexie.minKey], [classId, now])
    .filter(c => c.state !== 'new') // Exclude new cards — they're handled by getNewCards
    .toArray();
}

export async function getNewCards(classId) {
  return db.fsrsCards.where({ classId, state: 'new' }).toArray();
}

export async function initFSRSCards(classId, students) {
  const existing = await getFSRSCardsByClass(classId);
  const existingStudentIds = new Set(existing.map(c => c.studentId));

  const newCards = students
    .filter(s => !existingStudentIds.has(s.id))
    .map(s => ({
      studentId: s.id,
      classId,
      state: 'new',
      difficulty: 0,
      stability: 0,
      due: new Date(0), // due immediately for new cards
      lastReview: null,
      reps: 0,
      lapses: 0,
      encounterCount: 0,
      currentPhase: 'study'
    }));

  if (newCards.length > 0) {
    await db.fsrsCards.bulkAdd(newCards);
  }
}

// ─── Sessions ───
export async function saveSession(sessionData) {
  return db.sessions.add(sessionData);
}

export async function getRecentSessions(classId, limit = 10) {
  return db.sessions
    .where('classId').equals(classId)
    .reverse()
    .limit(limit)
    .toArray();
}

// ─── Settings ───
export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}

// ─── Data Management ───
export async function clearAllData() {
  await db.transaction('rw', [db.classes, db.students, db.fsrsCards, db.sessions, db.settings], async () => {
    await db.classes.clear();
    await db.students.clear();
    await db.fsrsCards.clear();
    await db.sessions.clear();
    await db.settings.clear();
  });
}

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const persisted = await navigator.storage.persist();
    return persisted;
  }
  return false;
}

export { db };

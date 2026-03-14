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

// ─── Export / Import Backup ───

/**
 * Export all app data as a JSON blob (photos as base64).
 */
export async function exportAllData() {
  const classes = await db.classes.toArray();
  const students = await db.students.toArray();
  const cards = await db.fsrsCards.toArray();
  const sessions = await db.sessions.toArray();
  const settings = await db.settings.toArray();

  // Convert photo/thumbnail blobs to base64
  const studentsWithPhotos = await Promise.all(students.map(async s => {
    const out = { ...s };
    if (s.photo instanceof Blob) out.photo = await blobToBase64(s.photo);
    if (s.thumbnail instanceof Blob) out.thumbnail = await blobToBase64(s.thumbnail);
    return out;
  }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    classes,
    students: studentsWithPhotos,
    fsrsCards: cards,
    sessions,
    settings,
  };
}

/**
 * Import backup data from a JSON object, replacing all existing data.
 */
export async function importBackupData(data) {
  if (!data || data.version !== 1) throw new Error('Invalid backup format');

  // Convert base64 photos back to Blobs
  const students = data.students.map(s => {
    const out = { ...s };
    if (typeof s.photo === 'string' && s.photo.startsWith('data:')) out.photo = base64ToBlob(s.photo);
    if (typeof s.thumbnail === 'string' && s.thumbnail.startsWith('data:')) out.thumbnail = base64ToBlob(s.thumbnail);
    // Restore Date objects
    return out;
  });

  // Restore Date objects in cards
  const cards = data.fsrsCards.map(c => ({
    ...c,
    due: c.due ? new Date(c.due) : null,
    lastReview: c.lastReview ? new Date(c.lastReview) : null,
  }));

  // Restore Date objects in sessions
  const sessions = data.sessions.map(s => ({
    ...s,
    startedAt: s.startedAt ? new Date(s.startedAt) : null,
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
  }));

  // Restore Date objects in classes
  const classes = data.classes.map(c => ({
    ...c,
    createdAt: c.createdAt ? new Date(c.createdAt) : null,
  }));

  await db.transaction('rw', [db.classes, db.students, db.fsrsCards, db.sessions, db.settings], async () => {
    await db.classes.clear();
    await db.students.clear();
    await db.fsrsCards.clear();
    await db.sessions.clear();
    await db.settings.clear();

    if (classes.length) await db.classes.bulkAdd(classes);
    if (students.length) await db.students.bulkAdd(students);
    if (cards.length) await db.fsrsCards.bulkAdd(cards);
    if (sessions.length) await db.sessions.bulkAdd(sessions);
    if (data.settings.length) await db.settings.bulkAdd(data.settings);
  });
}

/**
 * Export progress data as CSV for a class.
 */
export async function exportProgressCSV(classId) {
  const students = await getStudentsByClass(classId);
  const cards = await getFSRSCardsByClass(classId);
  const cardMap = new Map(cards.map(c => [c.studentId, c]));

  const rows = [['Family Name', 'Preferred Name', 'Student ID', 'Phase', 'State', 'Stability', 'Difficulty', 'Reps', 'Lapses', 'Next Review']];

  for (const s of students.sort((a, b) => a.familyName.localeCompare(b.familyName))) {
    const card = cardMap.get(s.id);
    rows.push([
      s.familyName,
      s.preferredName,
      s.studentId,
      card?.currentPhase || 'study',
      card?.state || 'new',
      card?.stability?.toFixed(1) || '0',
      card?.difficulty?.toFixed(2) || '0',
      String(card?.reps || 0),
      String(card?.lapses || 0),
      card?.due ? new Date(card.due).toLocaleDateString() : 'N/A',
    ]);
  }

  return rows.map(r => r.map(f => `"${f}"`).join(',')).join('\n');
}

/**
 * Get storage usage estimate
 */
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  }
  return null;
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export { db };

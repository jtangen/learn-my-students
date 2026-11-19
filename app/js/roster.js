// ═══════════════════════════════════
// Class list — read a CSV and compare it with the photos
// Pure functions, no dependencies. The file is read in the browser
// and never leaves the device.
// ═══════════════════════════════════

// ─── Reading the file ───

function countOutsideQuotes(line, ch) {
  let n = 0, inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) n++;
  }
  return n;
}

/** Work out whether the file uses commas, semicolons or tabs. */
function guessDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '').slice(0, 10);
  if (lines.length === 0) return ',';
  const candidates = ['\t', ';', ','];   // on a tie, tabs and semicolons win: commas turn up inside names
  const counts = candidates.map(ch => lines.map(l => countOutsideQuotes(l, ch)));

  // A delimiter appears the same number of times on every line
  for (let i = 0; i < candidates.length; i++) {
    if (counts[i][0] > 0 && counts[i].every(n => n === counts[i][0])) return candidates[i];
  }
  // Otherwise, whichever appears most
  let best = ',', bestTotal = 0;
  for (let i = 0; i < candidates.length; i++) {
    const total = counts[i].reduce((a, b) => a + b, 0);
    if (total > bestTotal) { best = candidates[i]; bestTotal = total; }
  }
  return best;
}

/**
 * Split CSV text into rows of cells.
 * Handles quoted cells (with commas or line breaks inside), doubled quotes,
 * Windows line endings, a leading byte-order mark, and semicolon or tab files.
 * Empty rows are dropped.
 */
export function parseCSV(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const delimiter = guessDelimiter(t);
  const rows = [];
  let row = [], cell = '', inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      inQuotes = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }

  return rows
    .map(r => r.map(c => c.replace(/\s+/g, ' ').trim()))
    .filter(r => r.some(c => c !== ''));
}

// ─── Working out which column is which ───

function normHeader(h) {
  return String(h || '').toLowerCase()
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Each role has tiers: the first tier with exactly one matching column wins.
const HEADER_RULES = {
  id: [
    /^(student|stu|learner|candidate) ?(id|number|no|num|code)$/,
    /^(emplid|sid|sis user id|sis id|id number|person id|university id)$/,
    /^(id|number|no)$/,
  ],
  first: [
    /^preferred( (first|given))?( names?)?$/,
    /^(first|given) ?names?$|^(first|given|forenames?)$/,
  ],
  last: [
    /^(last|family) ?names?$|^(surname|last|family)$/,
  ],
  full: [
    /^(full ?name|student ?name|name|student|display ?name)$/,
  ],
};

function pickColumn(headers, role) {
  for (const rule of HEADER_RULES[role]) {
    const matches = [];
    headers.forEach((h, i) => { if (rule.test(normHeader(h))) matches.push(i); });
    if (matches.length === 1) return { index: matches[0], ambiguous: false };
    if (matches.length > 1) return { index: null, ambiguous: true };
  }
  return { index: null, ambiguous: false };
}

function looksLikeStudentNumber(value) {
  return /^[A-Za-z]{0,2}\d{4,}(\.0+)?$/.test(String(value || '').replace(/\s+/g, ''));
}

function share(values, test) {
  const filled = values.filter(v => v !== '' && v != null);
  if (filled.length === 0) return 0;
  return filled.filter(test).length / filled.length;
}

/**
 * Look at the rows of a class list and work out which column holds what.
 *
 * Returns a mapping and whether we are confident in it. When `confident`
 * is false the caller should ask the instructor to check the columns
 * rather than go ahead on a guess; `reasons` says why, in plain words.
 *
 * mapping: { first, last, full, id } are column indexes or null;
 * layout is 'two' (first and last name in separate columns) or 'one'
 * (full name in one column); nameOrder is 'last-first' or 'first-last'.
 */
export function detectColumns(rows) {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const firstRow = rows[0] || [];
  const picks = {
    id: pickColumn(firstRow, 'id'),
    first: pickColumn(firstRow, 'first'),
    last: pickColumn(firstRow, 'last'),
    full: pickColumn(firstRow, 'full'),
  };
  const headerRecognised = Object.values(picks).some(p => p.index != null || p.ambiguous);

  // No headings we know: is the first row a heading at all?
  let hasHeader = headerRecognised;
  if (!headerRecognised && rows.length > 1) {
    const firstHasDigits = firstRow.some(c => /\d/.test(c));
    const restHasDigits = rows.slice(1).some(r => r.some(c => /\d/.test(c)));
    const firstHasComma = firstRow.some(c => c.includes(','));
    hasHeader = !firstHasDigits && !firstHasComma && restHasDigits;
  }

  const data = hasHeader ? rows.slice(1) : rows;
  const sample = data.slice(0, 200);
  const column = i => sample.map(r => r[i] || '');
  const numberLike = [];
  const commaNames = [];
  for (let i = 0; i < width; i++) {
    if (share(column(i), looksLikeStudentNumber) >= 0.9 && column(i).some(v => v !== '')) numberLike.push(i);
    if (share(column(i), v => /^[^,]+,\s*[^,]+$/.test(v)) >= 0.8) commaNames.push(i);
  }

  const mapping = { first: null, last: null, full: null, id: null, layout: null, nameOrder: 'last-first' };
  const reasons = [];

  if (!headerRecognised) {
    reasons.push("this file doesn't have headings we recognise");
    if (numberLike.length === 1) mapping.id = numberLike[0];
    if (commaNames.length === 1) { mapping.full = commaNames[0]; mapping.layout = 'one'; }
  } else {
    if (Object.values(picks).some(p => p.ambiguous)) {
      reasons.push('more than one column could be the same thing');
    }

    // Names
    if (picks.first.index != null && picks.last.index != null) {
      mapping.first = picks.first.index;
      mapping.last = picks.last.index;
      mapping.layout = 'two';
    } else if (picks.full.index != null) {
      mapping.full = picks.full.index;
      mapping.layout = 'one';
      const withComma = share(column(picks.full.index), v => v.includes(','));
      if (withComma >= 0.8) {
        mapping.nameOrder = 'last-first';
      } else {
        mapping.nameOrder = 'first-last';
        reasons.push("the names are in one column without a comma, so we can't be sure which part is the family name");
      }
    } else {
      if (picks.first.index != null) mapping.first = picks.first.index;
      if (picks.last.index != null) mapping.last = picks.last.index;
      reasons.push("we couldn't find the students' names");
    }

    // Student number
    if (picks.id.index != null) {
      mapping.id = picks.id.index;
      if (share(column(picks.id.index), looksLikeStudentNumber) < 0.8) {
        reasons.push(`the "${firstRow[picks.id.index]}" column doesn't look like student numbers`);
      }
    } else if (!picks.id.ambiguous && numberLike.length > 0) {
      if (numberLike.length === 1) mapping.id = numberLike[0];
      reasons.push('there is a column of numbers that might be student numbers');
    }

    // Rows that don't line up with the headings (for example "Baker, Mia" without quotes)
    const ragged = data.filter(r => r.filter(c => c !== '').length > 0 && r.length > firstRow.length).length;
    if (data.length > 0 && ragged / data.length > 0.2) {
      reasons.push('some rows have more columns than the headings');
    }
  }

  return { hasHeader, width, mapping, confident: reasons.length === 0, reasons };
}

// ─── Turning rows into students ───

function cleanNumber(value) {
  return String(value || '').replace(/\s+/g, '').replace(/\.0+$/, '');
}

function splitFullName(value, nameOrder) {
  const v = String(value || '').trim();
  if (!v) return { familyName: '', preferredName: '' };
  const comma = v.indexOf(',');
  if (comma >= 0 && nameOrder !== 'first-last') {
    return { familyName: v.slice(0, comma).trim(), preferredName: v.slice(comma + 1).trim() };
  }
  if (comma >= 0) {
    // "First Last" was chosen but this one has a comma: trust the comma
    return { familyName: v.slice(0, comma).trim(), preferredName: v.slice(comma + 1).trim() };
  }
  const parts = v.split(' ');
  if (parts.length === 1) return { familyName: v, preferredName: '' };
  if (nameOrder === 'first-last') {
    return { familyName: parts[parts.length - 1], preferredName: parts.slice(0, -1).join(' ') };
  }
  return { familyName: parts[0], preferredName: parts.slice(1).join(' ') };
}

/**
 * Read the students out of the rows using a column mapping.
 * Rows with no name are skipped, and a student number listed twice counts once.
 * @returns {{ familyName: string, preferredName: string, studentId: string }[]}
 */
export function readClassList(rows, { hasHeader, mapping }) {
  const data = hasHeader ? rows.slice(1) : rows;
  const seenNumbers = new Set();
  const list = [];

  for (const r of data) {
    let familyName = '', preferredName = '';
    if (mapping.layout === 'two') {
      familyName = (r[mapping.last] || '').trim();
      preferredName = (r[mapping.first] || '').trim();
    } else if (mapping.layout === 'one') {
      ({ familyName, preferredName } = splitFullName(r[mapping.full], mapping.nameOrder));
    }
    if (!familyName && !preferredName) continue;

    const studentId = mapping.id != null ? cleanNumber(r[mapping.id]) : '';
    if (studentId) {
      const key = numberKey(studentId);
      if (seenNumbers.has(key)) continue;
      seenNumbers.add(key);
    }
    list.push({ familyName, preferredName, studentId });
  }
  return list;
}

/** Is this mapping complete enough to read names with? */
export function mappingIsUsable(mapping) {
  if (mapping.layout === 'two') return mapping.first != null && mapping.last != null && mapping.first !== mapping.last;
  if (mapping.layout === 'one') return mapping.full != null;
  return false;
}

// ─── Comparing the class list with the photos ───

/** Student numbers compare without spaces, case or leading zeros. */
export function numberKey(value) {
  const v = cleanNumber(value).toLowerCase();
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, '') : v;
}

function nameKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function fullKey(s) {
  const family = nameKey(s.familyName), first = nameKey(s.preferredName);
  return family || first ? `${family}|${first}` : '';
}

function looseKey(s) {
  // Family name plus the first given name: "Mia Jane" on the list matches "Mia" on the photo
  const family = nameKey(s.familyName), first = nameKey(s.preferredName).split(' ')[0] || '';
  return family && first ? `${family}|${first}` : '';
}

/**
 * Compare a class list with the students who have photos.
 *
 * A student on the list is matched by student number when the list gives
 * one. If no photo has that number, or the list has no number, they are
 * matched by name: against any student when the list has no number, and
 * only against students stored without a number when it does (two people
 * with different numbers are different people, whatever their names).
 * Each photo is matched to at most one person on the list.
 *
 * @param {{familyName, preferredName, studentId}[]} list - from readClassList
 * @param {{id, familyName, preferredName, studentId}[]} students - students in the class
 * @returns {{ missing: object[], matched: number, notOnList: object[] }}
 */
export function compareClassList(list, students) {
  const unused = new Map(students.map(s => [s.id, s]));
  const pending = list.map(entry => ({ entry, done: false }));

  const take = (item, student) => { unused.delete(student.id); item.done = true; };

  // 1. Student number
  for (const item of pending) {
    if (!item.entry.studentId) continue;
    const key = numberKey(item.entry.studentId);
    for (const s of unused.values()) {
      if (s.studentId && numberKey(s.studentId) === key) { take(item, s); break; }
    }
  }

  // 2. Name: exact first, then family name plus first given name
  for (const keyOf of [fullKey, looseKey]) {
    for (const item of pending) {
      if (item.done) continue;
      const key = keyOf(item.entry);
      if (!key) continue;
      for (const s of unused.values()) {
        if (item.entry.studentId && s.studentId) continue;
        if (keyOf(s) === key) { take(item, s); break; }
      }
    }
  }

  return {
    missing: pending.filter(i => !i.done).map(i => i.entry),
    matched: pending.filter(i => i.done).length,
    notOnList: [...unused.values()],
  };
}

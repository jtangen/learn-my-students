// ═══════════════════════════════════
// Students — add, edit and delete by hand; find who has no photo
// Everything here happens on the device: camera frames are drawn to a
// canvas and stored in IndexedDB, and the class list is read in the browser.
// ═══════════════════════════════════
import { getClass, getStudentsByClass, getStudent, addStudent, updateStudent, deleteStudent, updateClass } from './db.js';
import { preparePhoto } from './import.js';
import { parseCSV, detectColumns, readClassList, compareClassList, mappingIsUsable, numberKey } from './roster.js';
import { showScreen, showToast, showLoading, hideLoading, esc, isMobile, confirmDialog } from './ui.js';

/** The words the instructor ticks. Stored with the student, with the date. */
export const CONSENT_WORDING = 'This student has agreed to this photo being taken and kept on this device so I can learn their name.';

// Same shape as the flashcard photo (.photo-container in styles.css)
const FRAME_RATIO = 0.86;

const LOCK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>';
const TRASH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
const CAMERA_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>';
const PICTURE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';

let classId = null;        // the class whose students are showing
let onDone = null;         // back to the list of classes
let thumbURLs = [];        // object URLs for the list, revoked when it is redrawn
let pendingList = null;    // a class list waiting for its columns to be confirmed
let lastRows = null;       // the rows of the list just loaded, so its columns can be changed
let form = null;           // the open add/edit form

// ─── Opening and leaving ───

/** Wire up the two screens once. `done` is called to go back to the list of classes. */
export function initStudents({ done }) {
  onDone = done;

  document.getElementById('studentsBackBtn').onclick = leaveStudents;
  document.getElementById('studentFormBackBtn').onclick = closeForm;

  document.getElementById('classListInput').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadClassListFile(file);
  };
  document.getElementById('studentPhotoInput').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) usePhoto(file);
  };
  document.getElementById('studentCameraInput').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) usePhoto(file);
  };

  // Dropping a file: a picture on the form, a class list on the students screen.
  // Catch drops anywhere on these screens so a near miss doesn't open the file in the tab.
  for (const id of ['studentsScreen', 'studentFormScreen']) {
    const screen = document.getElementById(id);
    screen.addEventListener('dragover', (e) => {
      e.preventDefault();
      screen.classList.add('dragging');
    });
    screen.addEventListener('dragleave', (e) => {
      if (!screen.contains(e.relatedTarget)) screen.classList.remove('dragging');
    });
    screen.addEventListener('drop', (e) => {
      e.preventDefault();
      screen.classList.remove('dragging');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (id === 'studentFormScreen') {
        if (form) usePhoto(file);
      } else {
        loadClassListFile(file);
      }
    });
  }

  // The camera must never stay on after the form is left, however it is left
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (form && hash !== '#/studentForm') {
      stopCamera();
      discardForm();
      if (hash === '#/students') renderStudents();
    }
    if (classId != null && (hash === '' || hash === '#/setup')) {
      cleanupList();
      classId = null;
      if (onDone) onDone();
    }
  });
  window.addEventListener('pagehide', stopCamera);
}

/** Show the students of a class. */
export async function openStudentsScreen(id) {
  classId = id;
  pendingList = null;
  lastRows = null;
  await renderStudents();
  showScreen('students');
  window.scrollTo(0, 0);
}

function cleanupList() {
  for (const url of thumbURLs) URL.revokeObjectURL(url);
  thumbURLs = [];
  pendingList = null;
  lastRows = null;
}

function leaveStudents() {
  cleanupList();
  classId = null;
  if (onDone) onDone();
}

// ─── The students screen ───

function fullName(s) {
  return `${s.preferredName} ${s.familyName}`.trim();
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

async function renderStudents() {
  const container = document.getElementById('studentsContent');
  if (!container || classId == null) return;

  const cls = await getClass(classId);
  if (!cls) { leaveStudents(); return; }

  const students = await getStudentsByClass(classId);
  students.sort((a, b) => a.familyName.localeCompare(b.familyName) || a.preferredName.localeCompare(b.preferredName));

  for (const url of thumbURLs) URL.revokeObjectURL(url);
  thumbURLs = [];

  container.innerHTML = `
    <p class="students-class">${esc(cls.name)} · ${plural(students.length, 'student', 'students')}</p>

    <button class="primary-btn" id="addStudentBtn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      Add a student
    </button>
    <p class="device-note">${LOCK_ICON}<span>Photos you add stay on this device.</span></p>

    <div class="settings-section" id="classListSection">
      ${renderClassListSection(cls, students)}
    </div>

    <div class="settings-section">
      <h3>In this class</h3>
      ${students.length === 0 ? '<p class="settings-desc">No students yet.</p>' : `
        <div class="student-list" role="list">
          ${students.map(s => {
            let thumb;
            if (s.thumbnail) {
              const url = URL.createObjectURL(s.thumbnail);
              thumbURLs.push(url);
              thumb = `<img class="student-thumb" src="${url}" alt="">`;
            } else {
              thumb = `<div class="student-thumb student-thumb-none">${esc(((s.preferredName[0] || '') + (s.familyName[0] || '')).toUpperCase())}</div>`;
            }
            const consent = s.photoConsent && s.photoConsent.agreed
              ? `<span class="student-consent">Photo added by you · consent ticked ${esc(formatDate(s.photoConsent.date))}</span>`
              : '';
            return `
              <div class="student-row" role="listitem" data-id="${s.id}">
                ${thumb}
                <div class="student-meta">
                  <span class="student-name">${esc(fullName(s))}</span>
                  ${s.studentId ? `<span class="student-number">${esc(s.studentId)}</span>` : ''}
                  ${consent}
                </div>
                <div class="student-actions">
                  <button class="row-btn student-edit-btn" data-id="${s.id}" aria-label="Edit ${esc(fullName(s))} or replace the photo">Edit</button>
                  <button class="class-delete-btn student-delete-btn" data-id="${s.id}" title="Delete" aria-label="Delete ${esc(fullName(s))}">${TRASH_ICON}</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('addStudentBtn').onclick = () => openForm({ mode: 'add' });

  container.querySelectorAll('.student-edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const student = await getStudent(parseInt(btn.dataset.id));
      if (student) openForm({ mode: 'edit', student });
    };
  });

  container.querySelectorAll('.student-delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const student = await getStudent(parseInt(btn.dataset.id));
      if (!student) return;
      if (await confirmDialog(`Delete ${fullName(student)} and their photo from this device? Your progress with them goes too.`)) {
        await deleteStudent(student.id);
        showToast('Student deleted');
        await renderStudents();
      }
    };
  });

  wireClassListSection(cls, students);
}

// ─── Who has no photo? ───

function renderClassListSection(cls, students) {
  const heading = '<h3>Who has no photo?</h3>';

  if (pendingList) return heading + renderMappingStep();

  const saved = cls.classList;
  if (!saved) {
    return `${heading}
      <p class="settings-desc">The university's photo download only includes students who have a photo. Load your class list to see who is missing.</p>
      <button class="setup-btn" id="classListBtn">
        <span class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></span>
        <span>Load class list (.csv)</span>
      </button>
      <p class="format-hint">Needs names, and student numbers if you have them. Read on this device, never uploaded.</p>`;
  }

  const result = compareClassList(saved.students, students);
  const missing = result.missing;

  return `${heading}
    <p class="list-summary" id="classListSummary"><strong>${saved.students.length}</strong> on the class list · <strong>${result.matched}</strong> ${result.matched === 1 ? 'has' : 'have'} a photo · <strong>${missing.length}</strong> ${missing.length === 1 ? 'has' : 'have'} no photo</p>
    ${missing.length === 0 ? '<p class="list-all-good">Everyone on the class list has a photo.</p>' : `
      <h4 class="list-heading">Students with no photo</h4>
      <div class="missing-list" role="list">
        ${missing.map((m, i) => `
          <div class="missing-row" role="listitem">
            <div class="student-meta">
              <span class="student-name">${esc(fullName(m))}</span>
              ${m.studentId ? `<span class="student-number">${esc(m.studentId)}</span>` : ''}
            </div>
            <button class="secondary-btn add-photo-btn" data-i="${i}" aria-label="Add photo for ${esc(fullName(m))}">${CAMERA_ICON} Add photo</button>
          </div>`).join('')}
      </div>
    `}
    ${result.notOnList.length > 0 ? `
      <details class="not-on-list">
        <summary>${plural(result.notOnList.length, 'student has', 'students have')} a photo but ${result.notOnList.length === 1 ? "isn't" : "aren't"} on this list</summary>
        <p>${result.notOnList.map(s => esc(fullName(s))).join(', ')}</p>
        <p>They may have left the course, or their name is written differently on the list.</p>
      </details>
    ` : ''}
    <p class="list-source">From ${esc(saved.fileName || 'your class list')}, loaded ${esc(formatDate(saved.loadedAt))}. ${esc(saved.columns || '')}</p>
    <div class="list-actions">
      ${lastRows ? '<button class="row-btn" id="classListColumnsBtn">Change columns</button>' : ''}
      <button class="row-btn" id="classListBtn">Load a different list</button>
      <button class="row-btn" id="classListRemoveBtn">Remove list</button>
    </div>`;
}

function wireClassListSection(cls, students) {
  const loadBtn = document.getElementById('classListBtn');
  if (loadBtn) loadBtn.onclick = () => document.getElementById('classListInput').click();

  const removeBtn = document.getElementById('classListRemoveBtn');
  if (removeBtn) {
    removeBtn.onclick = async () => {
      if (await confirmDialog('Remove the class list from this device? Students and photos are not affected.')) {
        await updateClass(classId, { classList: null });
        lastRows = null;
        await renderStudents();
        showToast('Class list removed');
      }
    };
  }

  const columnsBtn = document.getElementById('classListColumnsBtn');
  if (columnsBtn) {
    columnsBtn.onclick = () => {
      pendingList = { ...lastRows, detection: { ...lastRows.detection, mapping: { ...lastRows.detection.mapping } }, asked: true };
      renderStudents();
    };
  }

  document.querySelectorAll('#classListSection .add-photo-btn').forEach(btn => {
    btn.onclick = () => {
      const result = compareClassList(cls.classList.students, students);
      const entry = result.missing[parseInt(btn.dataset.i)];
      if (entry) openForm({ mode: 'add', prefill: entry });
    };
  });

  if (pendingList) wireMappingStep();
}

async function loadClassListFile(file) {
  if (classId == null) return;
  if (/\.(xlsx|xls|numbers)$/i.test(file.name)) {
    showToast('That is a spreadsheet file. Save it as CSV first (File, then Save As or Export), then load the CSV.', 'error', 7000);
    return;
  }
  if ((file.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) {
    showToast('That is a picture, not a class list. To add a photo, use "Add a student".', 'error', 6000);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('That file is too big to be a class list', 'error', 5000);
    return;
  }
  let rows;
  try {
    rows = parseCSV(await file.text());
  } catch (err) {
    showToast('Could not read that file', 'error', 5000);
    return;
  }
  if (rows.length === 0) {
    showToast('That file looks empty', 'error', 5000);
    return;
  }

  const detection = detectColumns(rows);
  const loaded = { rows, fileName: file.name, detection };

  if (detection.confident && mappingIsUsable(detection.mapping)) {
    await saveClassList(loaded);
  } else {
    pendingList = loaded;
    await renderStudents();
    document.getElementById('classListSection')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function columnLabel(rows, hasHeader, i) {
  const header = hasHeader ? (rows[0][i] || '') : '';
  const example = (rows[hasHeader ? 1 : 0] || [])[i] || '';
  let label = `Column ${i + 1}`;
  if (header) label += `: ${header}`;
  if (example) label += ` (e.g. ${example})`;
  return label;
}

function describeColumns(loaded) {
  const { rows, detection } = loaded;
  const { mapping, hasHeader } = detection;
  const name = i => (hasHeader && rows[0][i]) ? `"${rows[0][i]}"` : `column ${i + 1}`;
  const parts = [];
  if (mapping.layout === 'two') {
    parts.push(`first name from ${name(mapping.first)}`, `last name from ${name(mapping.last)}`);
  } else {
    parts.push(`names from ${name(mapping.full)}`);
  }
  parts.push(mapping.id != null ? `student number from ${name(mapping.id)}` : 'no student numbers');
  const text = parts.join(', ');
  return 'Read ' + text + '.';
}

async function saveClassList(loaded) {
  const list = readClassList(loaded.rows, loaded.detection);
  if (list.length === 0) {
    showToast('No student names found in that file', 'error', 5000);
    return;
  }
  await updateClass(classId, {
    classList: {
      fileName: loaded.fileName,
      loadedAt: new Date().toISOString(),
      columns: describeColumns(loaded),
      students: list,   // names and student numbers only; other columns are not kept
    }
  });
  pendingList = null;
  lastRows = loaded;
  await renderStudents();
  showToast(`Class list loaded: ${plural(list.length, 'student', 'students')}`, 'success');
}

// ─── The column mapping step ───

function renderMappingStep() {
  const { rows, detection, asked } = pendingList;
  const { mapping, hasHeader, width } = detection;

  const options = (selected, noneLabel) => {
    let html = `<option value="">${esc(noneLabel)}</option>`;
    for (let i = 0; i < width; i++) {
      html += `<option value="${i}" ${selected === i ? 'selected' : ''}>${esc(columnLabel(rows, hasHeader, i))}</option>`;
    }
    return html;
  };

  const why = asked
    ? 'Change which columns are used.'
    : `Please check, because ${esc(detection.reasons.join(', and '))}.`;

  return `
    <div class="mapping-step" id="mappingStep">
      <p class="mapping-title">Which columns are which?</p>
      <p class="settings-desc">${why}</p>

      <label class="setting-toggle mapping-header-toggle">
        <input type="checkbox" id="mapHasHeader" ${hasHeader ? 'checked' : ''}>
        <span>The first row is headings, not a student</span>
      </label>

      <div class="mapping-layout" role="radiogroup" aria-label="How names are written">
        <label class="setting-toggle"><input type="radio" name="mapLayout" value="two" ${mapping.layout === 'two' ? 'checked' : ''}><span>First and last name are in two columns</span></label>
        <label class="setting-toggle"><input type="radio" name="mapLayout" value="one" ${mapping.layout === 'one' ? 'checked' : ''}><span>The whole name is in one column</span></label>
      </div>

      <div class="mapping-fields ${mapping.layout === 'two' ? '' : 'hidden'}" id="mapTwo">
        <div class="form-field">
          <label for="mapFirst">First name</label>
          <select id="mapFirst" class="form-select">${options(mapping.first, 'Choose a column')}</select>
        </div>
        <div class="form-field">
          <label for="mapLast">Last name</label>
          <select id="mapLast" class="form-select">${options(mapping.last, 'Choose a column')}</select>
        </div>
      </div>

      <div class="mapping-fields ${mapping.layout === 'one' ? '' : 'hidden'}" id="mapOne">
        <div class="form-field">
          <label for="mapFull">Name</label>
          <select id="mapFull" class="form-select">${options(mapping.full, 'Choose a column')}</select>
        </div>
        <div class="form-field">
          <label for="mapOrder">Written as</label>
          <select id="mapOrder" class="form-select">
            <option value="last-first" ${mapping.nameOrder === 'last-first' ? 'selected' : ''}>Last name first (Baker, Mia)</option>
            <option value="first-last" ${mapping.nameOrder === 'first-last' ? 'selected' : ''}>First name first (Mia Baker)</option>
          </select>
        </div>
      </div>

      <div class="form-field">
        <label for="mapId">Student number <span class="optional">(optional)</span></label>
        <select id="mapId" class="form-select">${options(mapping.id, 'No student number column')}</select>
      </div>

      <div class="mapping-preview" id="mapPreview" aria-live="polite"></div>

      <div class="form-actions">
        <button class="primary-btn" id="mapUseBtn">Use these columns</button>
        <button class="text-btn" id="mapCancelBtn">Cancel</button>
      </div>
    </div>`;
}

function wireMappingStep() {
  const { detection } = pendingList;
  const mapping = detection.mapping;
  const num = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseInt(v);
  };

  const readControls = () => {
    detection.hasHeader = document.getElementById('mapHasHeader').checked;
    const layout = document.querySelector('input[name="mapLayout"]:checked');
    mapping.layout = layout ? layout.value : null;
    mapping.first = num('mapFirst');
    mapping.last = num('mapLast');
    mapping.full = num('mapFull');
    mapping.nameOrder = document.getElementById('mapOrder').value;
    mapping.id = num('mapId');
  };

  const refreshPreview = () => {
    const preview = document.getElementById('mapPreview');
    const useBtn = document.getElementById('mapUseBtn');
    document.getElementById('mapTwo').classList.toggle('hidden', mapping.layout !== 'two');
    document.getElementById('mapOne').classList.toggle('hidden', mapping.layout !== 'one');

    if (!mappingIsUsable(mapping)) {
      preview.innerHTML = '<p class="settings-desc">Choose where the names are to see how the list will be read.</p>';
      useBtn.disabled = true;
      return;
    }
    const list = readClassList(pendingList.rows, detection);
    useBtn.disabled = list.length === 0;
    preview.innerHTML = `
      <p class="mapping-preview-title">The first ${Math.min(3, list.length)} of ${plural(list.length, 'student', 'students')} would be read as:</p>
      <table class="mapping-table">
        <tr><th>First name</th><th>Last name</th><th>Student number</th></tr>
        ${list.slice(0, 3).map(s => `<tr><td>${esc(s.preferredName) || '<em>none</em>'}</td><td>${esc(s.familyName) || '<em>none</em>'}</td><td>${esc(s.studentId) || '<em>none</em>'}</td></tr>`).join('')}
      </table>`;
  };

  document.getElementById('mapHasHeader').onchange = () => {
    // Headings change the column labels, so redraw the step
    readControls();
    renderStudents();
  };
  document.querySelectorAll('#mappingStep input[name="mapLayout"], #mappingStep select').forEach(el => {
    el.onchange = () => { readControls(); refreshPreview(); };
  });

  document.getElementById('mapUseBtn').onclick = async () => {
    readControls();
    if (!mappingIsUsable(mapping)) return;
    await saveClassList(pendingList);
  };
  document.getElementById('mapCancelBtn').onclick = () => {
    pendingList = null;
    renderStudents();
  };

  refreshPreview();
}

// ─── The add / edit form ───

function canUseLiveCamera() {
  return !isMobile && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function openForm({ mode, student = null, prefill = null }) {
  form = {
    mode,
    student,
    photo: null,        // { photo, thumbnail } once a new picture is chosen
    previewURL: null,
    stream: null,
    busy: false,
  };

  const s = student || prefill || {};
  const title = document.getElementById('studentFormTitle');
  if (title) title.textContent = mode === 'add' ? 'Add a student' : 'Edit student';

  const container = document.getElementById('studentFormContent');
  container.innerHTML = `
    <div class="form-field">
      <label for="sfFirst">First name</label>
      <input type="text" id="sfFirst" class="class-name-input" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(s.preferredName || '')}">
    </div>
    <div class="form-field">
      <label for="sfLast">Last name</label>
      <input type="text" id="sfLast" class="class-name-input" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(s.familyName || '')}">
    </div>
    <div class="form-field">
      <label for="sfNumber">Student number <span class="optional">(optional)</span></label>
      <input type="text" id="sfNumber" class="class-name-input" autocomplete="off" inputmode="numeric" spellcheck="false" value="${esc(s.studentId || '')}">
    </div>

    <div class="form-field">
      <span class="form-label" id="sfPhotoLabel">Photo</span>
      <div class="photo-frame" id="sfFrame" aria-labelledby="sfPhotoLabel"></div>
      <div class="photo-sources" id="sfSources">
        ${isMobile ? `<button class="secondary-btn" id="sfTakeBtn">${CAMERA_ICON} Take photo</button>` : ''}
        ${canUseLiveCamera() ? `<button class="secondary-btn" id="sfCameraBtn">${CAMERA_ICON} Use camera</button>` : ''}
        <button class="secondary-btn" id="sfChooseBtn">${PICTURE_ICON} Choose a picture</button>
      </div>
      <div class="photo-sources hidden" id="sfLive">
        <button class="primary-btn" id="sfCaptureBtn">${CAMERA_ICON} Capture</button>
        <button class="secondary-btn" id="sfCameraCancelBtn">Cancel camera</button>
      </div>
      ${isMobile ? '' : '<p class="format-hint">You can also drop a picture anywhere on this page.</p>'}
    </div>

    <div id="sfConsentArea"></div>

    <p class="device-note">${LOCK_ICON}<span>The photo stays on this device. It is never uploaded.</span></p>

    <p class="form-error hidden" id="sfError" role="alert"></p>

    <div class="form-actions">
      <button class="primary-btn" id="sfSaveBtn">${mode === 'add' ? 'Add student' : 'Save changes'}</button>
      <button class="text-btn" id="sfCancelBtn">Cancel</button>
    </div>
  `;

  const take = document.getElementById('sfTakeBtn');
  if (take) take.onclick = () => document.getElementById('studentCameraInput').click();
  const camera = document.getElementById('sfCameraBtn');
  if (camera) camera.onclick = startCamera;
  document.getElementById('sfChooseBtn').onclick = () => document.getElementById('studentPhotoInput').click();
  document.getElementById('sfCaptureBtn').onclick = capturePhoto;
  document.getElementById('sfCameraCancelBtn').onclick = () => { stopCamera(); renderFrame(); };
  document.getElementById('sfSaveBtn').onclick = saveForm;
  document.getElementById('sfCancelBtn').onclick = closeForm;
  for (const id of ['sfFirst', 'sfLast', 'sfNumber']) {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveForm(); }
    });
  }

  renderFrame();
  renderConsent();
  showScreen('studentForm');
  window.scrollTo(0, 0);
  if (!isMobile) {
    setTimeout(() => {
      const first = document.getElementById('sfFirst');
      if (first && !first.value) first.focus();
    }, 100);
  }
}

/** Draw the photo frame: the new picture, the current one, or an empty frame. */
function renderFrame() {
  const frame = document.getElementById('sfFrame');
  if (!frame || !form) return;

  if (form.previewURL) { URL.revokeObjectURL(form.previewURL); form.previewURL = null; }

  const blob = form.photo ? form.photo.photo : (form.student ? (form.student.photo || form.student.thumbnail) : null);
  if (blob) {
    form.previewURL = URL.createObjectURL(blob);
    frame.innerHTML = `<img src="${form.previewURL}" alt="${form.photo ? 'The new photo' : 'The current photo'}">`;
  } else {
    frame.innerHTML = `<div class="photo-frame-empty">${CAMERA_ICON}<span>No photo yet</span></div>`;
  }

  document.getElementById('sfSources').classList.remove('hidden');
  document.getElementById('sfLive').classList.add('hidden');

  const hasPhoto = !!blob;
  const label = (id, text) => {
    const btn = document.getElementById(id);
    if (btn) btn.lastChild.textContent = ' ' + text;
  };
  label('sfTakeBtn', hasPhoto ? 'Take a new photo' : 'Take photo');
  label('sfCameraBtn', hasPhoto ? 'Use camera again' : 'Use camera');
  label('sfChooseBtn', hasPhoto ? 'Choose a different picture' : 'Choose a picture');
}

/** The consent tick is asked for whenever a photo is being added or replaced. */
function renderConsent() {
  const area = document.getElementById('sfConsentArea');
  if (!area || !form) return;

  const needsConsent = form.mode === 'add' || !!form.photo;
  if (needsConsent) {
    const wasTicked = document.getElementById('sfConsent')?.checked;
    area.innerHTML = `
      <label class="consent-box" for="sfConsent">
        <input type="checkbox" id="sfConsent" ${wasTicked ? 'checked' : ''}>
        <span>${esc(CONSENT_WORDING)}</span>
      </label>`;
    document.getElementById('sfConsent').onchange = clearError;
  } else if (form.student && form.student.photoConsent && form.student.photoConsent.agreed) {
    area.innerHTML = `<p class="consent-recorded">You ticked that this student agreed to their photo on ${esc(formatDate(form.student.photoConsent.date))}.</p>`;
  } else {
    area.innerHTML = '';
  }
}

async function usePhoto(blob) {
  if (!form) return;
  clearError();
  if (blob.type && !blob.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(blob.name || '')) {
    showError('That file is not a picture. Choose a JPG or PNG.');
    return;
  }
  stopCamera();
  try {
    const prepared = await preparePhoto(blob);
    if (!form) return;
    form.photo = prepared;
    renderFrame();
    renderConsent();
  } catch (err) {
    const heic = /\.(heic|heif)$/i.test(blob.name || '') || /hei[cf]/i.test(blob.type || '');
    showError(heic
      ? "This browser can't open HEIC pictures from an iPhone. Send it as a JPG instead, or open the app in Safari."
      : "Couldn't open that picture. Try a JPG or PNG.");
    renderFrame();
  }
}

// ─── Laptop camera ───

async function startCamera() {
  if (!form || form.stream) return;
  clearError();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      showError('The camera is blocked for this page. Allow it in your browser, or choose a picture instead.');
    } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      showError('No camera was found. Choose a picture instead.');
    } else if (err.name === 'NotReadableError') {
      showError('The camera is being used by another app. Close it and try again, or choose a picture.');
    } else {
      showError('The camera could not be started. Choose a picture instead.');
    }
    return;
  }

  // The form may have been closed while the browser was asking for permission
  if (!form || window.location.hash !== '#/studentForm') {
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  form.stream = stream;
  const frame = document.getElementById('sfFrame');
  frame.innerHTML = '<video id="sfVideo" autoplay playsinline muted></video>';
  const video = document.getElementById('sfVideo');
  video.srcObject = stream;
  video.play().catch(() => {});

  document.getElementById('sfSources').classList.add('hidden');
  document.getElementById('sfLive').classList.remove('hidden');
  document.getElementById('sfCaptureBtn').focus();
}

function stopCamera() {
  if (form && form.stream) {
    form.stream.getTracks().forEach(t => t.stop());
    form.stream = null;
  }
  const video = document.getElementById('sfVideo');
  if (video) video.srcObject = null;
}

/** Keep exactly what the frame shows: the middle of the picture, in the flashcard's shape. */
function capturePhoto() {
  const video = document.getElementById('sfVideo');
  if (!form || !video || !video.videoWidth) return;

  const vw = video.videoWidth, vh = video.videoHeight;
  let sw = vw, sh = vh;
  if (vw / vh > FRAME_RATIO) sw = Math.round(vh * FRAME_RATIO);
  else sh = Math.round(vw / FRAME_RATIO);
  const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  canvas.toBlob((blob) => {
    stopCamera();
    if (blob) usePhoto(blob);
    else { showError('The photo could not be captured. Try again.'); renderFrame(); }
  }, 'image/jpeg', 0.92);
}

// ─── Saving ───

function showError(message, focusId) {
  const el = document.getElementById('sfError');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (focusId) document.getElementById(focusId)?.focus();
}

function clearError() {
  const el = document.getElementById('sfError');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

async function saveForm() {
  if (!form || form.busy) return;
  clearError();

  const preferredName = document.getElementById('sfFirst').value.trim();
  const familyName = document.getElementById('sfLast').value.trim();
  const studentId = document.getElementById('sfNumber').value.replace(/\s+/g, '');
  const consent = document.getElementById('sfConsent');

  if (!preferredName) return showError("Enter the student's first name.", 'sfFirst');
  if (!familyName) return showError("Enter the student's last name.", 'sfLast');
  if (form.stream) return showError('The camera is still on. Press Capture to take the photo, or cancel the camera.');
  if (form.mode === 'add' && !form.photo) return showError('Add a photo first: take one, or choose a picture.');
  if (form.photo && !(consent && consent.checked)) {
    return showError('Tick the box to say the student has agreed to this photo. Without it, the photo is not saved.', 'sfConsent');
  }

  const editingId = form.student ? form.student.id : null;
  const others = (await getStudentsByClass(classId)).filter(s => s.id !== editingId);
  if (studentId) {
    const clash = others.find(s => s.studentId && numberKey(s.studentId) === numberKey(studentId));
    if (clash) return showError(`${fullName(clash)} already has that student number in this class.`, 'sfNumber');
  }
  if (form.mode === 'add') {
    const sameName = others.find(s => fullName(s).toLowerCase() === `${preferredName} ${familyName}`.toLowerCase() && (!s.studentId || !studentId));
    if (sameName && !await confirmDialog(`There is already a ${fullName(sameName)} in this class. Add another student with the same name?`)) return;
  }

  const photoConsent = form.photo
    ? { agreed: true, date: new Date().toISOString(), wording: CONSENT_WORDING }
    : null;

  form.busy = true;
  showLoading('Saving...');
  try {
    if (form.mode === 'add') {
      await addStudent(classId, {
        studentId, familyName, preferredName,
        photo: form.photo.photo,
        thumbnail: form.photo.thumbnail,
        photoConsent,
      });
    } else {
      const fields = { studentId, familyName, preferredName };
      if (form.photo) {
        fields.photo = form.photo.photo;
        fields.thumbnail = form.photo.thumbnail;
        fields.photoConsent = photoConsent;
      }
      await updateStudent(editingId, fields);
    }
  } catch (err) {
    form.busy = false;
    hideLoading();
    if (err.name === 'QuotaExceededError' || err.message?.includes('quota')) {
      showError('Storage full. Your browser ran out of space. Try clearing old classes.');
    } else {
      console.error('Save student error:', err);
      showError('Could not save: ' + err.message);
    }
    return;
  }
  hideLoading();

  const message = form.mode === 'add'
    ? `${preferredName} ${familyName} added. They will come up as a new card.`
    : (form.photo ? 'Photo replaced' : 'Changes saved');
  discardForm();
  await renderStudents();
  showScreen('students');
  showToast(message, 'success', 4000);
}

function discardForm() {
  stopCamera();
  if (form && form.previewURL) URL.revokeObjectURL(form.previewURL);
  form = null;
  const container = document.getElementById('studentFormContent');
  if (container) container.innerHTML = '';
}

async function closeForm() {
  discardForm();
  await renderStudents();
  showScreen('students');
}

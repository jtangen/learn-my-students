// ═══════════════════════════════════
// Import — ZIP/folder import with thumbnail generation
// ═══════════════════════════════════
import { addStudents, initFSRSCards, getStudentsByClass } from './db.js';

/**
 * Parse student info from filename.
 * Expected format: "LastName, FirstName (StudentID).jpg"
 */
export function parseStudentFromName(fileName, fileSize) {
  const baseName = fileName.split('/').pop();
  // Skip macOS resource fork files
  if (baseName.startsWith('._') || fileName.includes('__MACOSX')) return null;
  if (!baseName.match(/\.(jpg|jpeg|png)$/i)) return null;
  // Skip tiny/corrupt files (under 3KB)
  if (fileSize !== undefined && fileSize < 3000) return null;

  const match = baseName.match(/^(.+?),\s*(.+?)\s*\((\d+)\)\.\w+$/);
  if (!match) return null;

  return {
    familyName: match[1].trim(),
    preferredName: match[2].trim(),
    studentId: match[3],
  };
}

/**
 * Generate a thumbnail from an image blob.
 */
async function generateThumbnail(blob, maxSize = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxSize / Math.max(img.width, img.height);
      if (scale >= 1) {
        // Image is already small enough
        URL.revokeObjectURL(url);
        resolve(blob);
        return;
      }
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((thumbBlob) => {
        URL.revokeObjectURL(url);
        resolve(thumbBlob);
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Import students from a ZIP file.
 * @param {File} file - the ZIP file
 * @param {number} classId - the class to import into
 * @param {function} onProgress - callback(message, current, total)
 */
export async function importFromZip(file, classId, onProgress) {
  const zip = await JSZip.loadAsync(file);

  const entries = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parsed = parseStudentFromName(path);
    if (!parsed) continue;
    entries.push({ path, entry, ...parsed });
  }

  const total = entries.length;
  const studentData = [];

  // Process in batches to avoid freezing
  const BATCH = 10;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);

    await Promise.all(batch.map(async (item, j) => {
      const idx = i + j + 1;
      if (onProgress) onProgress(`Processing student ${idx} of ${total}...`, idx, total);

      const blob = await item.entry.async('blob');
      const photo = new Blob([blob], { type: 'image/jpeg' });
      const thumbnail = await generateThumbnail(photo);

      if (thumbnail) {
        studentData.push({
          studentId: item.studentId,
          familyName: item.familyName,
          preferredName: item.preferredName,
          photo,
          thumbnail,
        });
      }
    }));

    // Yield to the event loop between batches
    await new Promise(r => setTimeout(r, 0));
  }

  if (studentData.length > 0) {
    await addStudents(classId, studentData);
    // Initialize FSRS cards for all imported students
    const students = await getStudentsByClass(classId);
    await initFSRSCards(classId, students);
  }

  return studentData.length;
}

/**
 * Import students from a folder (webkitdirectory FileList).
 */
export async function importFromFolder(fileList, classId, onProgress) {
  const files = Array.from(fileList);
  const validFiles = [];

  for (const file of files) {
    const parsed = parseStudentFromName(file.name, file.size);
    if (parsed) validFiles.push({ file, ...parsed });
  }

  const total = validFiles.length;
  const studentData = [];

  const BATCH = 10;
  for (let i = 0; i < validFiles.length; i += BATCH) {
    const batch = validFiles.slice(i, i + BATCH);

    await Promise.all(batch.map(async (item, j) => {
      const idx = i + j + 1;
      if (onProgress) onProgress(`Processing student ${idx} of ${total}...`, idx, total);

      const photo = item.file;
      const thumbnail = await generateThumbnail(photo);

      if (thumbnail) {
        studentData.push({
          studentId: item.studentId,
          familyName: item.familyName,
          preferredName: item.preferredName,
          photo,
          thumbnail,
        });
      }
    }));

    await new Promise(r => setTimeout(r, 0));
  }

  if (studentData.length > 0) {
    await addStudents(classId, studentData);
    const students = await getStudentsByClass(classId);
    await initFSRSCards(classId, students);
  }

  return studentData.length;
}

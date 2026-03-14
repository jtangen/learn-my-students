// ═══════════════════════════════════
// Import — ZIP/folder import with thumbnail generation
// ═══════════════════════════════════
import { addStudents, initFSRSCards, getStudentsByClass } from './db.js';

// Max photo dimension — photos larger than this are resized on import
const MAX_PHOTO_SIZE = 800;

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
 * Resize a photo blob to fit within maxSize dimensions.
 * Returns the original blob if already small enough.
 */
async function resizePhoto(blob, maxSize = MAX_PHOTO_SIZE) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const needsResize = img.width > maxSize || img.height > maxSize;
      if (!needsResize) {
        URL.revokeObjectURL(url);
        resolve(blob);
        return;
      }
      const canvas = document.createElement('canvas');
      const scale = maxSize / Math.max(img.width, img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((resizedBlob) => {
        URL.revokeObjectURL(url);
        resolve(resizedBlob || blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
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
 * @returns {{ count: number, skipped: string[] }}
 */
export async function importFromZip(file, classId, onProgress) {
  const zip = await JSZip.loadAsync(file);

  const entries = [];
  const skipped = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const baseName = path.split('/').pop();
    // Skip system files silently
    if (baseName.startsWith('._') || path.includes('__MACOSX') || baseName.startsWith('.')) continue;
    const parsed = parseStudentFromName(path);
    if (!parsed) {
      // Only report image files that failed to parse
      if (baseName.match(/\.(jpg|jpeg|png)$/i)) {
        skipped.push(baseName);
      }
      continue;
    }
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

      try {
        const blob = await item.entry.async('blob');
        const rawPhoto = new Blob([blob], { type: 'image/jpeg' });
        const photo = await resizePhoto(rawPhoto);
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
      } catch (err) {
        skipped.push(item.path.split('/').pop() + ' (processing error)');
      }
    }));

    // Yield to the event loop between batches
    await new Promise(r => setTimeout(r, 0));
  }

  if (studentData.length > 0) {
    try {
      await addStudents(classId, studentData);
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.message?.includes('quota')) {
        throw new Error('Storage full — your browser ran out of space. Try clearing old classes or using a different browser.');
      }
      throw err;
    }
    // Initialize FSRS cards for all imported students
    const students = await getStudentsByClass(classId);
    await initFSRSCards(classId, students);
  }

  return { count: studentData.length, skipped };
}

/**
 * Import students from a folder (webkitdirectory FileList).
 * @returns {{ count: number, skipped: string[] }}
 */
export async function importFromFolder(fileList, classId, onProgress) {
  const files = Array.from(fileList);
  const validFiles = [];
  const skipped = [];

  for (const file of files) {
    // Skip system files silently
    if (file.name.startsWith('.') || file.name.startsWith('._')) continue;
    const parsed = parseStudentFromName(file.name, file.size);
    if (parsed) {
      validFiles.push({ file, ...parsed });
    } else if (file.name.match(/\.(jpg|jpeg|png)$/i)) {
      skipped.push(file.name);
    }
  }

  const total = validFiles.length;
  const studentData = [];

  const BATCH = 10;
  for (let i = 0; i < validFiles.length; i += BATCH) {
    const batch = validFiles.slice(i, i + BATCH);

    await Promise.all(batch.map(async (item, j) => {
      const idx = i + j + 1;
      if (onProgress) onProgress(`Processing student ${idx} of ${total}...`, idx, total);

      try {
        const photo = await resizePhoto(item.file);
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
      } catch (err) {
        skipped.push(item.file.name + ' (processing error)');
      }
    }));

    await new Promise(r => setTimeout(r, 0));
  }

  if (studentData.length > 0) {
    try {
      await addStudents(classId, studentData);
    } catch (err) {
      if (err.name === 'QuotaExceededError' || err.message?.includes('quota')) {
        throw new Error('Storage full — your browser ran out of space. Try clearing old classes or using a different browser.');
      }
      throw err;
    }
    const students = await getStudentsByClass(classId);
    await initFSRSCards(classId, students);
  }

  return { count: studentData.length, skipped };
}

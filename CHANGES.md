# Changes on the `add-a-student` branch

Nothing here has been pushed, merged or deployed. The live site and `main` are untouched.
All testing used the app's made-up demo class and data made up for the tests. No real student data was opened.

## Try it

**On your laptop, one command:**

```
(sleep 1 && open "http://localhost:8000/app/?demo=1") & python3 -m http.server 8000 --directory "/Users/uqjtange/Documents/research/past_projects/learn_my_students-add-a-student"
```

That serves this branch on your own machine and opens the demo class. Press Back, then **Students** on the class row.
`localhost:8000` keeps its own storage, separate from the live site, so your real classes are not touched.
Stop it with Ctrl-C. If you later change files and still see the old version, the service worker is holding the old copy: use a private window.

**On your phone (same Wi-Fi as the laptop):**

```
python3 -m http.server 8000 --bind 0.0.0.0 --directory "/Users/uqjtange/Documents/research/past_projects/learn_my_students-add-a-student"
```

Then find the laptop's address (`ipconfig getifaddr en0`) and open `http://THAT-ADDRESS:8000/app/?demo=1` on the phone.
macOS may ask whether Python can accept incoming connections: say yes. Some networks (often university Wi-Fi) stop devices talking to each other, so a home network or the phone's hotspot is the safer bet.

What works this way: importing, studying, the Students screen, **Take photo** (opens the phone's camera), choosing from the photo library, the class list.
What does not: installing to the Home Screen with offline use, because browsers only allow that over https. For that the branch would need to be deployed (for example a Vercel preview), which I have not done.

## Phase 1: add a student, consent, who has no photo

### 1. Add a student by photo

Each class row on the first screen has a new **Students** button. It opens a Students screen for that class with:

- **Add a student**: first name, last name, optional student number, and a photo.
- The photo can come from:
  - **Take photo** on a phone (a file input that asks for the camera),
  - **Use camera** on a laptop (live preview, **Capture**, and you can retake),
  - **Choose a picture**, or drop a picture file anywhere on the page.
- Every student in the class is listed with **Edit** (fix a name or number, or replace the photo) and a delete button. Delete asks first, and removes the student, their photo and their card.
- The photo is fitted the way imported photos are (longest side 800 pixels, thumbnail 200 pixels) and stored in the same record shape, in the same place.
  Two small differences from an imported photo, both on purpose: a photo you add is always redrawn as a JPEG, so anything the camera wrote into the file (such as where it was taken) is dropped; and a laptop-camera capture keeps exactly what the preview frame shows (the middle of the picture, in the flashcard's shape).
- The new student gets a new card, the same kind an imported student gets, and joins the queue of new cards.

One thing to know: new cards are introduced six per session, in the order they were added. In a class where you have not yet met everyone, a student you add by hand comes up after the students already waiting. In the 20-student demo class that is the fourth session. I left the scheduling alone because it was not part of the brief.

### 2. Consent, plainly

Adding or replacing a photo by hand needs one tick:

> This student has agreed to this photo being taken and kept on this device so I can learn their name.

Without the tick the form refuses and nothing is saved. With it, the student's record carries `photoConsent: { agreed: true, date, wording }` (the date and the exact words ticked), and the Students screen shows "Photo added by you · consent ticked 20 Nov 2026".
Fixing a name without changing the photo does not ask again. Replacing the photo of a student who came from the university download asks for the tick too.
Under the tick is the one-line reminder: "The photo stays on this device. It is never uploaded."

### 3. Find who has no photo

On the Students screen, **Load class list (.csv)** (or drop the file on the page). The app compares the list with the photos and shows, for example, "23 on the class list · 20 have a photo · 3 have no photo", then the students with no photo, each with an **Add photo** button that opens the form with the name and student number filled in.

- Headings are recognised in many spellings (Student ID, Student Number, SID, EMPLID; First Name, Given Name, Preferred Name; Last Name, Surname, Family Name; Name, Student Name, Full Name).
- Names can be in two columns or in one as "Last, First". Commas, semicolons and tabs all work, as do quoted cells and spreadsheet exports.
- If the app cannot tell which column is which, it asks: a small step where you pick the columns and see how the first three students would be read before going ahead. It asks when the headings are unfamiliar, when there is no heading row, when names are in one column without a comma, when a "student number" column does not look like numbers, when an unlabelled column looks like it might be student numbers, and when rows do not line up with the headings.
- Matching is by student number when the list has one, otherwise by name (capitals, accents and middle names are ignored). A student you added by hand without a number is matched by name.
- Students who have a photo but are not on the list are mentioned too (they may have left the course).
- Only names and student numbers are kept from the file, on the device, with the class. Other columns are not stored. **Remove list** deletes it.

### 4. README

- The "Cooper et al., 2017" link now goes to DOI 10.1187/cbe.16-08-0265. I checked both DOIs against Crossref: the new one is Cooper, Haney, Krieg and Brownell (2017), "What's in a Name?"; the old one was Cavanagh et al. (2016), a different paper.
- Three rows added to the feature table and three lines to Privacy.
- I also updated the file list (two new files), the screen count and the line count in README.md and llms.txt, because the new files made them wrong. Say if you would rather I had left those alone.

### Service worker

The cache name went from `v4` to `v5` and the two new files (`students.js`, `roster.js`) are in the list, so installed copies pick up the new version.

### Files

- New: `app/js/students.js` (the two screens), `app/js/roster.js` (reading and comparing class lists; pure functions).
- Changed: `app/index.html` (two screens), `app/css/styles.css` (their styles, light and dark), `app/js/app.js` (the Students button and routing), `app/js/db.js` (`addStudent`, `deleteStudent`), `app/js/import.js` (`preparePhoto`), `app/sw.js`, `README.md`, `llms.txt`.
- No new dependencies, no build step, no change to the database's indexes. Existing stored classes are read as before; the new fields are only added to students you add or edit.

## How phase 1 was tested

Served locally with `python3 -m http.server` and driven in real headless Chrome (version 158) over its DevTools port with real mouse clicks, touch taps, key presses, file choosers and file drops. The driver records every request made by the page and by the service worker. Test scripts and their output are in the session's scratch folder, not in the repo.

| What | Result |
|---|---|
| Demo class imports, a study session runs to the summary (before and after the changes) | Pass |
| Class-list reading and matching, 33 unit checks in Node | 33 of 33 |
| Add a student from a made-up picture file: appears in the class and comes up in the study session as a new card; form refuses with no name, no photo, a file that is not a picture, a student number already in use, and without the consent tick; record carries consent, date and wording; photo is 600 by 800 JPEG with a 200-pixel thumbnail; the made-up location in the file is gone; replace by dropping a file; fix a number with no new tick; a sideways phone photo comes out upright; delete with confirm; reload | 62 of 62 |
| Laptop camera with Chrome's fake camera: live preview, capture, retake, cancel, consent, stored photo; camera switched off after capture, Cancel, Back, and browser Back; camera blocked gives a plain message | 20 of 20 |
| Class list in six layouts (two columns with student number; one "Last, First" column; names only in capitals with middle names; semicolons with unfamiliar headings; no heading row; unquoted "Last, First"). Three needed the mapping step. Each: 23 on the list, 20 with a photo, the right 3 missing. Add photo from the list, then 21 and 2. Reload. Remove list | 38 of 38 |
| Phone-sized Chrome (390 by 844, touch, iPhone user agent): Take photo opens the camera input, no sideways scrolling, consent by tapping the sentence | 13 of 13 |
| The way you would try it on a phone (plain http, so no service worker and no live-camera API) | 5 of 5 |
| Reload, then network off (local server stopped and proxy stopped, same browser profile): app loads, all data intact, add a student, run a study session | 19 of 19 |

### The network log

- The page and the service worker made no request other than to the local server and the two libraries the app has always loaded from CDNs: Dexie (`cdn.jsdelivr.net`) and JSZip (`cdnjs.cloudflare.com`). Every request was a GET. The new features add none.
- So "no request leaves the machine other than to the local server" is **not** true of the app, and was not before this work: on a first visit it fetches those two library files. They carry no student data. Keeping copies of them inside the app would make the statement true; I did not do that because it was not asked for.
- As an outside check I also ran the browser through a logging proxy. Besides the two CDNs it showed Chrome contacting Google's own services (`accounts.google.com`, `clients2.google.com`, `content-autofill.googleapis.com`, `www.google.com`, `www.gstatic.com`). The same hosts appear when the unchanged `main` version is run the same way, so they come from Chrome, not from the app, and this branch contacted no host that `main` did not.

### Found along the way, already on `main` (not changed in phase 1)

- On a first visit a banner says "A new version is available" and covers the Back button.
- Leaving a study session while a "study" card is showing does not stop its four-second timer, so the hidden session keeps moving through cards.
- Reloading on Settings (and other inner screens) shows an empty card.
- The app page has no favicon, so every load logs a 404.

These are picked up in phase 2.

## Not tested, and not done

- **A real iPhone or Android camera.** "Take photo" was tested as far as: the tap opens a file input with `accept="image/*" capture="environment"`, and a photo handed back is stored upright. Whether iOS opens the camera straight away, and how the photo comes back, needs a real phone.
- **iOS Safari and an installed (Home Screen) app keeping storage.** iOS can clear a website's storage after some weeks without use; the app already warns about this. Not testable here.
- **Safari and Firefox.** Everything was run in Chrome only.
- **HEIC pictures.** An iPhone photo sent to a Mac is often HEIC, which Chrome cannot open. The form says so in plain words. That message, and Safari opening HEIC, were not tested with a real HEIC file.
- **A real laptop camera and a real permission prompt.** Tested with Chrome's fake camera and with the camera blocked by setting.
- **A real class list from the university.** I do not know its exact columns and did not look. The six made-up layouts are my guess at the range.
- **A real class of 150.** The largest class tested was the demo's 20 (plus additions).
- **Screen readers.** Buttons and fields are labelled, but nothing was run with VoiceOver.

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
- **A real class of 150.** The largest class tested in phase 1 was the demo's 20 (plus additions). Phase 2 tested a made-up class of 160: see below.
- **Screen readers.** Buttons and fields are labelled, but nothing was run with VoiceOver.

---

# Phase 2: a better experience, in function and design

The reasons are in `AUDIT.md`: each change below answers a numbered finding there. One improvement per commit. Before and after screenshots are beside the phase 1 screenshots, named `p2_NN_..._before.png` and `p2_NN_..._after.png` (NN is the audit number); the walk-through screenshots the audit was written from are in `audit_before/`.

## The one thing that must not go wrong: data already in people's browsers

**Nothing about how data is stored was restructured.** No new store, no new index, no database version change. Phase 2 adds one optional field to a student (`goesBy`), starts using one that every record already had (`phoneticGuide`), and adds one setting (`lastBackupAt`). Old records simply do not have the new field and are read as "none". Because the database version is unchanged, the old app can still open the data after the new one has used it, so a roll-back is safe too. I chose this over a version upgrade on purpose: a version bump would lock the old app out for no benefit.

**The upgrade test** (`t6_upgrade.py`, run against the finished branch):

1. The app exactly as it is on `main` (a copy made with `git archive`, served with the same caching headers as the live site) in a fresh browser profile. Demo class plus a second class: 23 students. Sessions on day 0 (twice), day 1, day 4 and day 9 (the page's clock moved forward), one wrong answer, a memory trick typed in, daily goal changed, reverse mode on, dark mode on. That left 2 classes, 23 students with photos, 23 cards (20 reviewed, at typed recall, one lapsed), 5 sessions and 4 settings.
2. Same profile, same address, now serving this branch. The first load shows the old cached app and the "A new version is available" banner; I pressed Refresh, as a user would.
3. Compared every record of every store with what `main` left, photos as SHA-256 of their bytes: **classes, students, cards, sessions and settings all identical.** Dark mode was still on. The Students screen showed all 20 old students with photos. A study session three days later ran from the old history; afterwards no student or photo had changed, the five old sessions were untouched with one added, and no card had lost a review.
4. Served `main` again to the same profile (a roll-back): the old app opened the data, identical, and started a session.

Result: **22 of 22 checks passed**, on the phase 1 commit and again on the finished branch.

## What changed, most valuable first

| Audit | Change | How it was tested |
|---|---|---|
| 1 | **The study card's timer stops when you leave.** It used to keep running, so students were marked as seen while you were on another screen. | Before: 0 cards seen, leave on a study card, 9.5 seconds later 2 marked as seen. After: 0. A new session's first card stays up its own four seconds and still moves on by itself. |
| 2 | **A typed full name is accepted**, in either order ("Mia Baker", "Baker, Mia"). A family name alone still is not. | In a real session, day 4: full name and "Last, First" marked Correct; family name alone not. 21 typed answers also checked directly against the marking function. |
| 20 | **Nicknames and short forms count** (see the note below this table). | 40 unit checks; in a real session "Nik", "Soph", "Lachie", "Liv" and "Charlie" for the demo students. |
| 3 | **The flashcard fits a laptop screen.** | At 1440 by 780 the Next button was 161 pixels below the fold; now it is on screen with 38 to spare. Also checked at 1280 by 900. |
| 4 | **The Students screen is the class overview**: Know well, Learning, Shaky or New for each student (from their card), counts that filter the list, search by name or number, and a **Faces** view of larger photos to scan when someone is in front of you. Each class row on the first screen says what is waiting ("4 due · 6 new" or "all caught up"). The class-list section moved under the list, with a one-line summary and jump link at the top. | After a fortnight of simulated use and one miss: counts match the cards; filter, name search, number search, "No students match", faces grid (four across on a laptop, three on a phone, no sideways scroll). |
| 5 | **Five before class.** A button under each class: five students (anyone shaky first, then new, then least known), each taken from seeing the name, to picking it from four, to typing it with a first-letter hint, to typing it unaided. The summary says "Ready for class" and shows the five. A near miss comes back for another go. | Five students, each in that order; the other 15 untouched; cards scheduled; repeats in one sitting do not raise a card's stability; the ordinary Study session unchanged; a class of three says "A few before class". |
| 6 | **A first visit says what the app is**, offers "Try it with a demo class", and has a fold-out "Where do I get my students' photos?" (the UQ steps from the README). The two icon buttons now say About and Settings. | Demo loads 20 students from the app's own address and nothing else; the box goes once there is a class; phone width. |
| 7 | **No "new version" banner on a first visit.** | First visit: none. A real update (the upgrade test) still shows it. |
| 8 | **Goes by, and how it's said.** Two optional fields on the student form. The name they go by shows on flashcards and lists and either first name counts when typed; how it's said shows with the name and is what "Hear Name" speaks. | Set on an imported student without a consent tick; study card, multiple choice, hint letter and answer all use it; "Mia" and "Mimi Baker" both accepted for a student listed as Mia who goes by Mimi. |
| 9 | **Grey text is readable.** | Measured contrast of 18 pieces of small text: lowest was 1.5 to 1, now 4.6 to 1 in light and 5.3 to 1 in dark (the minimum is 4.5). |
| 10 | **Reduced motion is honoured.** | With the setting on: card slide and bar animations off, spinner still turning, study card still advances. With it off: unchanged. |
| 11 | **The confirm box is a proper dialog** (role, focus on Cancel, Tab stays inside, Escape cancels, focus returns), its red button says what it does (Delete, Replace, Remove), and toasts are announced to screen readers. | Keyboard only: opened, tabbed, escaped, then deleted a class without touching the mouse. |
| 12 | **Buttons are big enough to tap.** | On a 390-pixel phone, 21 buttons and tick boxes measured: all at least 44 by 44 (Back was 30 tall, the bin 30 by 30, tick boxes 13). |
| 13 | **Dark mode follows the device until you choose.** If your device is in dark mode and you never touched the setting, the app will now be dark; that is what Settings always said it did. | Device dark, no choice: dark. Device switches: app follows. Light chosen in the app: stays light after a reload. |
| 14 | **A failed import leaves nothing behind** and says what to do in plain words. The same file can be chosen again. | A non-zip: plain message, no web address, no empty class; a good zip imports afterwards. |
| 15 | **Streak days are local days.** | Brisbane time zone, 8am and 11am the same day: one day (was two, the first dated the day before). 9am next morning: two. |
| 16 | **A session left part-way is recorded.** | Five answers then Back: one session of 5, streak 1 (was no session). Leaving without answering records nothing; a finished session is recorded once. |
| 17 | **A reload on an inner screen goes to the class list**, not an empty card. | Reload on Settings, summary, a session, Students, dashboard: class list each time. Settings still opens six times in a row; Back and Forward work. |
| 18 | **Settings explains the backup and says when you last saved one.** | Round trip below. |
| 19 | **The app page has a tab icon**, so nothing asks for a missing file. | No missing-file errors online or with the network off. |

Also fixed on the way: the backup file was named for the UTC day, and a toast sat on top of the bottom button on a phone and swallowed taps.

### Nicknames: I fixed the matching, and made the README say exactly what it does

The README promised "50+ nickname mappings" and "credit for close answers". Running the app's own `matching.js` showed:

- The table was there (52 names), but **no nickname ever counted as correct**. One in the table got "That's a nickname! Full name: Elizabeth" and was scored as a miss. Most never reached that check: "Kate" for Katherine, "Tom" for Thomas, "Alex" for Alexander, "Ben", "Sam" and "Steve" were caught earlier by the similarity test and got "Almost!".
- Short forms were a lottery. "Soph" for Sophie passed (as a "small typo"); "Nik" for Nikhil and "Lach" for Lachlan were misses.

I fixed the matching rather than trimming the README, for three reasons: the table was plainly meant to earn credit; the old behaviour was arbitrary from the lecturer's side; and the feedback can do the teaching, because an accepted nickname now reads **"Correct! On the list as "Nikhil""**, so the full name is in front of you every time. If a student really goes by Nik, the new "Goes by" field is the proper place for it.

What counts as correct now: the name; a small typo; a nickname from the table, in either direction ("Liz" for Elizabeth, "William" for Bill); and a short form made from the front of the name (at least three letters and at least half the name: "Nik" for Nikhil, not "Ni", and not "Mar" for Margaret). I added 26 common names to the table (Lachlan, Olivia, Charlotte, Nikhil, Oliver and so on): it is now 78 names and 183 nicknames. A sound-alike ("Mai" for Mia) or a near miss is still "almost": not counted as correct, but not treated as forgotten. The README row and `llms.txt` now say this.

Tests: every one of the 183 nicknames is checked in both directions, plus the cases from the report, short forms for names not in the table, and 13 answers that must still be wrong ("Owen" for Nikhil, "Bob" for Rob, "Emma" for Emily): 40 of 40. In a real session on day 4, I typed "Nik", "Soph", "Lachie", "Liv" and "Charlie" for the five demo students with an obvious short form, and each was marked "Correct! On the list as ..." and counted (in the phase 1 version "Lachie" got "Close! It's Lachlan" and was a miss).

One limit: with an Alex and an Alexander in the same class, "Alex" typed at Alexander's photo counts. The app cannot know which you meant.

### Looking after the data: the backup round trip

In a class with a student added by hand (consent recorded), a "goes by" name, a class list and a study session: Export Backup saved a file of about 320 KB; Clear All Data (which asks first, with a button that says "Delete everything") emptied every store; Import Backup brought it back. **Classes, students, cards and sessions were identical to before, photos byte for byte, consent and "goes by" included**, and the restored class opened a study session. That is the way to move a class between laptop and phone with no server.

## Phase 2 test results

All in headless Chrome 158 with real clicks, taps and key presses, on the finished branch:

| Suite | Result |
|---|---|
| Phase 2 checks, one group per audit item (`p2.py after`) | 97 of 97 |
| The same checks against the phase 1 version (`p2.py before`), to confirm each problem was real | 34 of the same checks did not hold in the phase 1 version, at least one for every audit item from 1 to 18 and for 20 (item 19, the missing tab icon, showed up in the phase 1 baseline as a missing-file error on every load) |
| Stored-data upgrade: main, then this branch, then main again | 22 of 22 |
| Phase 1 suites re-run on the finished branch: baseline 8 of 8, class-list units 33 of 33, add a student 62 of 62, laptop camera 20 of 20, class list 38 of 38, phone 13 of 13, phone over plain http 5 of 5, reload and network off 20 of 20 | All pass |
| Typed-answer units (nicknames and short forms) | 40 of 40 |
| A made-up class of 160 (the demo faces reused under made-up names): import 1.0 s, Students screen 0.2 s, slowest search keystroke 3 ms, class list of 163 compared in 0.4 s, Five before class, a 13 MB backup out in 0.4 s and back in 0.5 s, identical | 12 of 12 |

The network log is as in phase 1: the only requests that leave the machine are the two library files from the CDNs, which `main` fetches too. Phase 2 adds none (the demo button fetches `/demo_students.zip` from the app's own address, as `?demo=1` always did).

## Ideas I chose not to build, and why

- **Keeping Dexie and JSZip inside the app** instead of fetching them from CDNs. It would make the first visit work offline and make "nothing leaves your machine" literally true. Not done: it adds two third-party files to your repo and changes two import lines that everything depends on. I think it is worth doing; it should be your decision.
- **Making the "2/20 students learned" bar honest.** It adds about 8 per cent on purpose. The new overview shows real counts, so the two can disagree. Left because it was a deliberate design choice of yours.
- **Removing the unreachable dashboard and progress-screen code.** The overview replaces them, but deleting your code was not mine to do.
- **A pause for the four-second study card.** "Got it" already moves on early; holding it longer would need a new control on a deliberately bare card.
- **Putting a student you have just added at the front of the queue.** Today they wait their turn behind students not yet met. "Five before class" does not jump them forward either. A real change to scheduling, so left.
- **Moving the phone's main buttons into thumb reach** (a bottom bar). The layout works one-handed as it is, and a redesign of the card was more than the audit justified.
- **Merging a backup into existing classes** rather than replacing everything. Useful for two devices in parallel, but it needs rules for conflicts, and a wrong merge is worse than none.
- **A reminder to back up.** Settings now says when the last one was. A nag felt wrong for this app.
- **Keyboard hint for the 1 to 4 keys** on multiple choice. The keys work; the hint row is already full.
- **Guarding against overlapping names** (Alex and Alexander in one class). See the nickname note.
- **Changes to the landing page.** Out of scope.

## What still needs a person

- **A real phone**: the camera, Home Screen install, tap comfort, and whether iOS keeps the data over weeks.
- **A real class**: the made-up class of 160 was quick on this laptop, but real photos on a real phone are untested, as is a real class list from the university.
- **Safari and Firefox.** Everything was run in Chrome.
- **A screen reader.** The dialog and announcements follow the rules, but nobody has listened to them.
- **Taste.** The wording throughout, the status names (Know well, Learning, Shaky, New), "Five before class" and "Ready for class", the look of the faces view, and whether nicknames should count as fully correct or only as "almost".
- **If your device is in dark mode**, the app will now be dark the first time you open this version (audit 13). Settings switches it back.

## Housekeeping

- The service worker cache name is now `v6` (phase 1 made it `v5`), so anyone who ran the phase 1 version gets the new files.
- The numbered screenshots `01` to `25` were taken again at the end, so they show the finished branch. How those screens looked after phase 1 only is in `audit_before/` and the `_before` pictures.
- Three fixes have nothing to photograph (audit 1, 15 and 16 are about timers, dates and what is recorded); their before and after are the numbers in the table above.
- `CHANGES.md` and `AUDIT.md` are listed in `.vercelignore`, so they are not published if the branch is deployed.

## After the merge: wrong answers that could be right (20 November 2026)

On the branch `plausible-wrong-answers`. Not committed, merged or pushed when this was written; the live site still has the old behaviour.

**What Jason saw on his iPhone.** He added his mum, Suzanne, to the demo class by photo (the photo worked). Her name then turned up as a wrong answer beside men's faces.

**Why.** The app chooses wrong answers by guessing, from the first name only, whether a name is usually a woman's or a man's. It never used ethnicity and never looks at a photo. The guess came from two short lists (115 women's names, 80 men's) and a few endings. "Suzanne" was on neither list, and nor were seven of the ten men in the demo class (Nikhil, Dev, Lachlan, Rohan, Arjun, Jai, Tom). Names it couldn't place were treated as a group of their own, so Suzanne was drawn with those seven men. "Riley" was on the women's list; the demo's Riley is a man.

**What changed.**
- The guess and the choice moved to `app/js/name-guess.js` (added to the offline list; cache name is now `v8`).
- Longer lists: 655 women's names, 599 men's, and 136 that are used for anyone (Riley, Alex, Sam, Wei) and are deliberately not guessed. (624, 572 and 125 as first written by hand; the rest were added after the check against Queensland's names, below.)
- The order is now: names of the same likely gender, then names that can't be placed, then the other gender only when nothing else is left. When the right name can't be placed, the wrong answers come from the whole class.
- It reads the name a student goes by first, then the name on the class list. Accents and hyphens are handled (José, Zoë, Jo-Anne).
- It is still a guess from a first name. Nothing about it is stored or shown.

**Tested.** On the demo class plus Suzanne, 20,000 questions per person, old code against new: questions with at least one wrong answer of the other gender went from 55.6% to 4.4%. All of the 4.4% is Riley, whose name can't be placed. Suzanne's own question had a man beside her every time before, and never after. Then in headless Chrome at phone size, with the app's own scheduler on its own records: 6,300 questions, 281 mixed, all Riley's; a session tapped through with no page errors.

**How well it does on names it wasn't built from.** It is a list to look names up in. It does not learn, and it does not work anything out from a photo. Checked against names the hand-written lists were not built from: the top 100 girls' and boys' names registered in Queensland (Registry of Births, Deaths and Marriages, CC BY 3.0 AU).

| Queensland's top 100 | Names | Old code: right / wrong / can't tell | New code, as first written: right / wrong / can't tell |
|---|---|---|---|
| 2007 | 201 | 109 / 2 / 90 | 177 / 0 / 24 |
| Every year 1960 to 2005 (names used for one sex) | 560 | 248 / 3 / 309 | 465 / 0 / 95 |

Counted by babies and not by names, the new code placed 90.6% (2007) and 95.6% (1960 to 2005), because the names it missed are the rarer ones. The six names Queensland's own lists show for both sexes (Jordan, Kerry, Ashley, Taylor, Shannon, Morgan) were all on the "anyone" list already. The 58 clear names it missed were then added, and 11 more were moved to "anyone", so these figures can't be repeated as a fair test on the same lists.

What this does not show: names from outside the English-speaking world, and rarer names of any kind. Nothing here was tested on them, and it will do worse.

**Not tested.** A real iPhone, Safari, or a real class list. Real classes will have more names it can't place than the demo does, especially given names written in English letters from Chinese, which mostly can't be guessed.

**Not built: matching on ethnicity.** It would mean guessing each student's ethnicity from their photo or their name. Left for Jason to decide; the suggestion put to him instead was to remember his own mix-ups and offer those names again.

## A much bigger list of names (20 November 2026)

Built on the branch `bigger-name-list` at Jason's word ("let's go with the bigger list"), after the fix above went live.

**What changed.**
- `app/js/name-data.js` is new and generated: 21,967 women's names, 12,712 men's and 3,916 that are used for both, from the US Social Security Administration's national names data (births 1940 to 2025). `tools/build_name_data.py` rebuilds it. The file is 275 KB (100 KB as sent, compressed) and is on the offline list; the cache name is now `v9`.
- A name is in it when at least 100 people have it, and it is placed only when we can be confident that at least 90% of them are one sex. Rare names have to be nearly all one way.
- The hand-written lists are still read first (652 women's names, 594 men's, 159 for anyone). Nineteen hand-placed names that the US data shows as mixed moved to "anyone" (Akira, Ali, Krishna, Marion, Rory and others), unless Queensland's lists agreed or at least 80% of the US data pointed the same way.
- The name endings were tried on 39,635 rarer names the big list leaves out. Only those right at least 95% of the time were kept (-a, -ette, -anne, -ard, -ert, -ew). Seven were dropped (-elle, -lyn, -een, -ine, -son, -ton, -old).

**Tested.**
- The big list alone, on Queensland's names, which it was not built from: 2007, 187 of 201 right, none wrong, 14 can't tell; 1960 to 2005, 518 of 560 right, 1 wrong (Lindsay, a woman's name in the US and a man's in Queensland then; the hand list already has it under "anyone"), 41 can't tell.
- The hand lists against the big list, two sources made separately: of the 1,254 names typed by hand, the US data places 1,167 the same way and none the other way; 47 it shows as mixed and 40 it doesn't hold.
- Labels made from alternate years of the US data were borne out by the other years: 1 name in about 25,000 came out the other way.
- The demo class plus Suzanne, 20,000 questions a person: 4.4% with a wrong answer of the other gender, all Riley's, as before. The app in headless Chrome at phone size: 6,300 questions from its own scheduler, 275 mixed, all Riley's; no page errors. The first guesses, which build the lists, took about 4 milliseconds in Node.

**What it still can't do.**
- Most given names from Chinese written in English letters. They are rare or mixed in the US data (Yuxin, Zihan, Jiayi), so the app says it can't tell, which is the honest answer.
- Sikh names such as Harpreet and Gurpreet, and Vietnamese names such as Anh and Linh: used for anyone, and listed that way.
- Men's names ending in -a from India, Indonesia and Japan that are on no list would be guessed as women's. The common ones are on the lists.
- There was no list of names from outside the English-speaking world, with the answers, to test against. That part rests on the US data having them.
- It never looks at a photo.

## Remembering mix-ups (20 November 2026)

Built on the branch `remember-mix-ups` at Jason's word ("Build it"), then merged into `main` and pushed on 20 November 2026 when he had seen a picture of it and said "Push".

**What it does.**
- **Notices a mix-up.** Pick the wrong name for a face, type another student's name, or pick the wrong face for a name. A typed answer counts only when it is wrong for this student and is the name of exactly one other student in the class ("Sam", with a Samuel and a Samantha, tells us nothing). "I don't know" and a wrong answer that is nobody's name are not mix-ups.
- **Shows the two side by side, straight away.** The photo area splits in two: "This is Mei Li" and "You said Sophie Chen" (or "You picked", for a face). The message reads "Not quite. You said Sophie."
- **Keeps a note of the pair**, as a count on the card of the student who was on screen (`mixUps`). It is saved with the card's result, so it travels in a backup with the rest of the progress. Nothing else about the card or its schedule changes.
- **Uses the pair for wrong answers.** In a multiple-choice or pick-the-face question, the people this student has been mixed up with take the first places, most often first, and it counts both ways round. The rest are chosen by name as before.

**Where the note gets used, plainly.** Multiple choice is asked once for each student, the first time they are tested, and again only while it is being got wrong. Forgetting someone later does not send them back to it: they stay on typing. Pick-the-face questions are a setting that is off unless turned on. So the note changes the options in fewer places than the side-by-side appears, and the side-by-side is the larger part of this change.

**Tested**, on the demo class in headless Chrome at phone size, with real taps and typing (22 checks, all passed): the side-by-side after a wrong name, a typed name and a wrong face, with the right names, labels and message; nothing spilling off the side of a phone; the side-by-side gone on the next card; the same face coming back with the mixed-up name among its options; the note read back from the database by a new session, both ways round, and always among the other's wrong answers over 200 draws; a backup saved and restored keeping the notes; a deleted student being left out without trouble; no page errors. Cards from before this change have no notes and behave as they did.

**Not tested.** A real iPhone, Safari, a real class.

**Not built.** A question, after a mix-up, that asks you to choose between the two. A list of your mix-ups in the class overview or the session summary.


# Audit: using Learn My Students as a lecturer would

Done on 20 November 2026 against the branch as it stood after phase 1 (commit `6632f10`), with the demo class only.
I used it in headless Chrome 158 with real clicks, taps and key presses: a first visit, the demo import, study sessions on day 0 and again 1, 4 and 9 days later (the page's clock moved forward, so cards came due and reached typed recall), the summary, settings, and a reload. Laptop width (1280 by 900 and 1440 by 780), phone width (390 by 844, touch), light and dark, keyboard only, and with reduced motion switched on. I also read the code for problems that do not show yet.

Screenshots from the walk-through are in `app_changes/audit_before/` beside the phase 1 screenshots (in the Handover episode folder).

"How much it matters": **High** = gets in the way of the main job or can quietly spoil data; **Medium** = a real annoyance or an access problem; **Low** = polish.

## What a lecturer runs into

| # | What happens | How much it matters | What I would do | Outcome |
|---|---|---|---|---|
| 1 | **Leaving a session on a "study" card does not stop its four-second timer.** The hidden session keeps going: I left on a study card with 6 cards marked as seen, sat on the class list for 9.5 seconds, and there were 7. Students get marked as seen that you never saw, and a left-over timer can skip the first card of the next session. | High (spoils data) | Stop the timer whenever the quiz is left or the card changes. | To do |
| 2 | **Typing a student's full name is marked wrong.** Only the first name is accepted: "Mia Baker" for Mia Baker gets "Close! It's Mia" and counts as a miss; "Sophie Chen" gets "Almost". | High | Accept the first name, the full name in either order, and the name they go by. | To do |
| 3 | **On a laptop the flashcard does not fit the screen.** At 1440 by 780 the photo is 605 pixels tall, so the answer box and the Next button are below the fold on every card. | High | Limit the photo's height to the window, as the phone and tablet layouts already do. | To do |
| 4 | **You cannot see where you stand.** The README promises a dashboard and a progress screen, and the code for both exists, but nothing links to either. There is no way to see who you know, to search for a student, or to look someone up when they are standing in front of you. | High | Make the Students screen the class overview: each student marked Know well, Learning, Shaky or New, with counts, a search box, filters, and a faces view. Show what is due on each class row. | To do |
| 5 | **No short session.** A session is 15 reviews by default and introduces six new students, studied once and tested once, then nothing until days later. There is no "learn these five now", which is what the episode asks viewers to do. | High | A "Five before class" button: five students, each taken from seeing the name to typing it from memory, in a few minutes. | To do |
| 6 | **The first visit explains nothing.** A class-name box, two dashed buttons and a file-name pattern. No word on where photos come from, no demo, and two icon-only buttons. A first-time visitor who arrives at `/app/` from the video has nothing to click. | High | When there are no classes yet: a "Try the demo class" button and a short "Where do I get the photos?". Label the two buttons. | To do |
| 7 | **"A new version is available" on a first visit.** The banner appears the first time anyone opens the app and covers the Back button in a session. | Medium | Only show it when an older version was actually running. | To do |
| 8 | **Names are not handled the way people use them.** No "goes by" name, and the "how it's said" field exists in the data but nothing lets you fill it in. | Medium | Two optional fields on the student form, shown wherever the name is, and used by the "Hear name" button. | To do |
| 9 | **Grey text is too faint to read.** Measured contrast against white: "Who is this student?" 2.7 to 1, hints and the file-name pattern 1.9 to 1, the keyboard hints 1.7 to 1, labels under the numbers 2.6 to 1. The accepted minimum for small text is 4.5 to 1. | Medium (access) | Darken the text greys to at least 4.5 to 1 in both themes. | To do |
| 10 | **Reduced motion is ignored.** With the system setting on, cards still slide and bars still animate. | Medium (access) | Honour the setting. | To do |
| 11 | **The confirm box is not a proper dialog.** No dialog role, keyboard focus stays on the page behind it, Escape does nothing, and its red button always says "Confirm". Toasts are never announced to a screen reader. | Medium (access) | Dialog role, focus moved in and put back, Escape cancels, the button says what it does ("Delete"). Announce toasts. | To do |
| 12 | **Small tap targets on a phone.** Back is 80 by 30, Study 76 by 31, the bin 30 by 30, the settings tick boxes 13 by 13. The usual minimum is 44. | Medium | 44-pixel minimum on touch screens. | To do |
| 13 | **Dark mode does not follow the system, though Settings says it does.** With the system in dark mode and no choice made, the app is light and Settings reads "Currently following system preference". | Medium | Follow the system until the lecturer chooses. | To do |
| 14 | **A failed import leaves an empty class behind**, and the message is the zip library's own: "Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/...". | Medium | Remove the half-made class and say what to do in plain words. | To do |
| 15 | **The streak counts days in UTC, not local time.** In Brisbane the "day" changes at 10am, so studying at 8am and 11am counts as two days. | Medium | Count by the local date. | To do |
| 16 | **Leaving a session part-way throws the session away.** The cards you answered are saved, but the session is not recorded, so 14 reviews and then Back earns no streak day. | Medium | Record the session when it is left with reviews done. | To do |
| 17 | **Reloading on any inner screen shows an empty card** (Settings, the summary, a session). The browser's Forward button does the same. | Medium | Go to the class list when a screen has nothing to show. | To do |
| 18 | **The backup is there but easy to miss, and nothing says when you last made one.** Export and Import work (tested, see CHANGES.md), but Settings does not explain that this is how a class moves between laptop and phone. | Medium | Say what the backup is for and show when the last one was saved. | To do |
| 19 | The app page has no icon for the browser tab; every load logs a missing-file error, and offline the service worker logs errors for it. | Low | Point the tab icon at the app's existing icon. | To do |

## Things I found and left alone (your call)

- **"2/20 students learned" before you have learned anyone.** The progress bar adds about 8 per cent on purpose ("endowed progress", in `scheduler.js`). It is a deliberate nudge, but it is not a true number, and the new overview shows the real counts, so the two can disagree on the same day. I did not change it. If you want the bar honest, it is a two-line change.
- **Pinch-to-zoom is blocked on iOS** (`gesturestart` is cancelled in `app.js`). That stops accidental zooming mid-session but also stops someone with low vision zooming in. Left as is.
- **The four-second auto-advance on study cards** cannot be paused. "Got it" moves on sooner, but nothing lets you linger. Left as is.
- **The two libraries (Dexie, JSZip) come from CDNs.** A first visit needs the network and contacts two other hosts. Keeping copies in the app would make it fully self-contained and make "nothing leaves your machine" literally true. Not done because it adds third-party files to the repo, which is your decision.
- **The dashboard and progress-screen code** (`renderDashboardScreen`, `renderProgressScreen` in `app.js`) is still unreachable. The new overview replaces what they were for. I left the dead code in place rather than delete your work.
- **The landing page** (`/index.html`) was not part of this pass.

## Problems a user would not see yet (from reading the code)

- **Classes of 150 or more.** Import decodes ten photos at a time and writes the class in one transaction, which is fine. The Students screen draws every row at once (150 small thumbnails): fine at that size, and search and filters hide rows rather than redraw them. A backup of 150 photos is roughly 15 MB of text built in memory in one go: it should work on a laptop, and might struggle on an old phone. Not tested at that size because there is no made-up class that big.
- **Storage running out** during import is caught and explained. During a backup import it is not: the old data has already been cleared inside the same transaction, which the browser rolls back on failure, so nothing is lost, but the message is the browser's raw error.
- **An answer is saved a moment after it is shown.** The Next button works before the save finishes. I could not make this lose a review in testing, and left it.
- **iOS can clear a website's stored data after weeks without use** unless the app is on the Home Screen. The app already says so once. A backup is the real protection, which is one reason for item 18.

## What still needs a person

A real phone (camera, Home Screen install, storage over weeks), a real class of 150, a real class list from the university, Safari and Firefox, a screen reader, and your eye on the wording and the look.

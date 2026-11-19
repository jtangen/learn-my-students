# Libraries kept inside the app

These two libraries used to be fetched from public servers on a first visit. Copies are now kept here, so the app asks nothing of any server but its own, and a first visit works offline once the page has loaded.

| Library | Version | File | Licence | Where it came from | SHA-256 |
|---|---|---|---|---|---|
| Dexie.js | 4.4.7 | `dexie.min.mjs` | Apache-2.0 (`LICENSE-dexie.txt`, `NOTICE-dexie.txt`) | the npm package's `dist/modern/dexie.min.mjs`; the same file from two mirrors matched | `85077346efab34a236028c59ab6140d446a0b8c26f88e40d8bdf3b7f15252662` |
| JSZip | 3.10.1 | `jszip.min.js` | MIT or GPLv3, your choice (`LICENSE-jszip.md`) | the npm package's `dist/jszip.min.js`; matches the hash cdnjs publishes for it | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

Added on 20 November 2026. To update one, replace its file, change the version and hash here, and bump the cache name in `sw.js`.

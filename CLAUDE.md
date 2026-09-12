# Working in this repo

A static single-page mock-exam app: plain ES modules, no build step, no
dependencies. `index.html` loads `js/app.js`; Vercel serves the folder as-is.

- `js/sets.js` — `SET_MANIFEST`, the only list of sets. Entries are small on
  purpose (no question data) so the home screen renders without loading any
  set. `loadSet` dynamically imports a set's module on open.
- `js/sets/<set-id>.js` — one module per set, generated from its CSV. Never
  hand-edit these; fix the CSV and re-run the importer.
- `js/logic.js`, `js/storage.js`, `js/sync.js` — scoring/timer, localStorage,
  optional Supabase sync. `DEFAULT_SET_ID` in `storage.js` and `SET_ID` in
  `sync.js` are legacy migration defaults pinned to `set-02`; leave them.
- `test/` — `node:test`, run with `npm test`. `npm run check` is a syntax pass
  over every module.

## Adding a mock set

Sets arrive as a refined CSV with these columns: `eligible_position`,
`spreadsheet_row`, `canonical_topic`, `exam_years`, `refined_question`,
`choice_a`–`choice_e`, `correct_answer`, `explanation`.

```bash
npm run add-set -- path/to/ENT_R1_Basic_Science_Mock_Set_05_refined.csv set-05
npm run check && npm test
```

That writes `js/sets/set-05.js` and appends the manifest entry. Nothing else
needs editing — not the tests, not `package.json`, not `index.html`. The data
tests iterate over every active manifest entry, so a new set is validated the
moment it is added, and one test fails deliberately if a manifest set is not
covered.

Defaults the importer applies, worth overriding by hand in `js/sets.js` if a
set differs: title `Basic Science Mock`, 90 minutes, `status: "active"`. Use
`status: "soon"` with no `module` for a set that is announced but not ready.

Re-running the importer for an existing set overwrites its module and leaves
the manifest untouched, so a corrected CSV can be re-imported safely.

### What the tests will hold you to

- 5 choices labeled A–E, all nonblank; `correctAnswer` one of them.
- `highYieldReview` is the *full* `explanation`, identical text — the review
  screen shows the whole thing. Explanations must be ≥120 characters, at least
  two sentences, and end on a complete sentence.
- `sourceRow` and `eligiblePosition` ascend across the set and are unique, so
  questions stay in source-spreadsheet order.
- `examYears` are whole years, ascending, no repeats.
- The manifest's `questionCount` must equal the module's question count —
  otherwise the home screen and review screen would report different totals.

If a CSV can't satisfy those, fix the CSV rather than loosening a test.

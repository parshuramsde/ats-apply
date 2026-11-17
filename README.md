# ATS Apply Helper (Chrome extension)

Same idea as the LinkedIn Easy Apply Helper, for company career sites: **Workday**, **Keka**, and (via the toolbar
button) any other application page. You browse normally in your own Chrome; the helper fills every page from
`profile.json`, uploads `resume.pdf`, asks you only for questions it has never seen (and remembers the answer), and
auto-clicks **Next / Save and Continue**. **It never clicks Submit. That is always your own click.**

## Install (once)
```bash
npm install                 # only needed for the mock test
node sync-extension.js      # copies profile.json + resume.pdf into extension/
```
1. Chrome → `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → choose the `extension/` folder.
3. Open any Workday or Keka job. A small "⚡ ATS Apply Helper" panel appears bottom-right.
   On any other career site, click the extension's toolbar icon to inject the panel.

## Daily flow
1. Open the job page. The helper clicks **Apply**, then **Use My Last Application** (if that company already has one
   from you) or **Apply Manually**.
2. Workday asks for an account: the helper **creates it / signs in** with `account.email` + `account.workdayPassword`.
   If the company wants the email verified, click the link in the mail and come back.
3. Every page is filled as it appears: My Information, My Experience (both jobs, both degrees, skills, resume,
   websites, LinkedIn), Application Questions, Voluntary Disclosures, Self Identify.
   - "How did you hear about us" picks the company's own careers-site option first.
   - Questions it cannot answer are listed in the panel. Answer them and click **Save & Next**; it never asks again.
4. On **Review**, read it, then click Workday's own **Submit**.

Shortcuts: **Alt+F** fill this page · **Alt+N** next. Auto-Next can be switched off in the panel or options page.

## Keka
The helper uploads the resume first (Keka parses it), waits, then fills whatever is still empty. Keka forms differ per
company, so watch the first run on each new company and answer what the panel asks; those answers are remembered.

## Editing your info
- `profile.json` in this folder is the master copy. After editing run `node sync-extension.js`, then click ↻ in the panel
  (or the reload icon in `chrome://extensions`).
- **`account.workdayPassword` must be set** (8+ chars with upper, lower, number, symbol). One password for every
  Workday company.
- `schooling` (10th / 12th) is `FILL_ME` until you add it.
- `answers`: ordered `{ "match": [regex…], "answer": "…" }` rules; first match wins. `@path.to.field` points at another
  profile value, `SKIP` leaves a field blank on purpose, `FILL_ME` means "ask me".
- Answers typed into the panel are stored in the extension. Options page (right-click the icon → Options) lets you edit
  or export them; fold them back with `node sync-extension.js --import ~/Downloads/profile.json`.
- Replace `resume.pdf` and re-run `node sync-extension.js` to change the resume.

## Test without a real company
```bash
node test/run-ext-mock.js          # loads the extension into Chromium and drives test/mock-workday.html to Review
node test/run-ext-mock.js --show   # same, with a visible window
```

## Layout
- `extension/manifest.json`, `background.js` — MV3; seeds `profile.json` into storage; toolbar click injects on any site
- `extension/engine.js` — form engine: scans controls (inputs, selects, radios, Workday listboxes & search prompts,
  month/year dates, ng-select, mat-select), sets values, uploads the resume, reads errors
- `extension/answers.js` — profile access, `@ref` resolution, regex rules, option matching
- `extension/adapters/workday.js`, `keka.js`, `generic.js` — per-platform flow
- `extension/content.js`, `panel.css`, `options.html/js` — the panel, watch loop, learned answers
- `sync-extension.js` — copies `profile.json` and the resume into `extension/`

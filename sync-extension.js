// Copies profile.json and the resume into extension/ so the Chrome extension bundles them. Run after editing either.
//   node sync-extension.js                    copy into extension/
//   node sync-extension.js --import x.json    merge learned answers exported from the extension's options page into profile.json
const fs = require('fs'); const path = require('path');
const root = __dirname, ext = path.join(root, 'extension');
const profilePath = path.join(root, 'profile.json');
const prof = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
if (process.argv[2] === '--import') {
  const inc = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const have = new Set(prof.answers.map(a => a.match.join('|')));
  const add = (inc.answers || inc).filter(a => !have.has(a.match.join('|')));
  prof.answers.unshift(...add); fs.writeFileSync(profilePath, JSON.stringify(prof, null, 2));
  console.log(`merged ${add.length} new answer(s) into profile.json`);
}
const resume = path.resolve(root, prof.resumePath || './resume.pdf');
fs.copyFileSync(resume, path.join(ext, 'resume.pdf'));
fs.writeFileSync(path.join(ext, 'profile.json'), JSON.stringify({ ...prof, resumePath: 'resume.pdf' }, null, 2));
console.log('extension/profile.json and extension/resume.pdf updated. In chrome://extensions click the reload icon on "ATS Apply Helper" (or ↻ in the panel).');

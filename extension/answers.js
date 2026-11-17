// Profile access + answer lookup, running inside the page. Learned answers (typed into the panel) are tried first.
window.ATS = window.ATS || {};
ATS.pickOption = function pickOption(options, prefs) {
  const list = (Array.isArray(prefs) ? prefs : [prefs]).filter(p => p != null && p !== '').map(p => String(p).toLowerCase().trim());
  const t = options.map(o => (o || '').toLowerCase().replace(/\s+/g, ' ').trim());
  const byIdx = i => (i >= 0 ? options[i] : null);
  for (const a of list) { const i = t.findIndex(x => x === a); if (i >= 0) return byIdx(i); }
  for (const a of list) { if (/^\d+(\.\d+)?$/.test(a)) continue; const i = t.findIndex(x => x.startsWith(a)); if (i >= 0) return byIdx(i); }
  for (const a of list) {
    if (/^\d+(\.\d+)?$/.test(a) || a.length < 2) continue;
    const hits = t.map((x, i) => ({ x, i })).filter(({ x }) => x.includes(a) || (a.length > 6 && a.includes(x) && x.length > 3));
    if (hits.length) return byIdx(hits.sort((p, q) => p.x.length - q.x.length)[0].i);
  }
  for (const a of list) {
    if (!/^\d+(\.\d+)?$/.test(a)) continue;
    const n = parseFloat(a);
    const range = inclusive => x => {
      const m = x.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/); if (m) return n >= +m[1] && (inclusive ? n <= +m[2] : n < +m[2]);
      const p = x.match(/(\d+)\s*\+/); if (p) return n >= +p[1];
      const lt = x.match(/(?:less than|under|<)\s*(\d+)/); if (lt) return n < +lt[1];
      const s = x.match(/^(\d+)(?!\d)/); return !!s && +s[1] === n;
    };
    let i = t.findIndex(range(false)); if (i < 0) i = t.findIndex(range(true)); if (i >= 0) return byIdx(i);
    if (n === 0) { i = t.findIndex(x => /^(none|no experience|fresher|0)/.test(x)); if (i >= 0) return byIdx(i); }
  }
  for (const a of list) {
    if (/^(yes|y|true)$/.test(a)) { const i = t.findIndex(x => /^yes\b/.test(x)); if (i >= 0) return byIdx(i); }
    if (/^(no|n|false)$/.test(a)) { const i = t.findIndex(x => /^no\b/.test(x)); if (i >= 0) return byIdx(i); }
  }
  return null;
};

ATS.Answers = class {
  constructor(profile, learned) { this.profile = profile || {}; this.learned = learned || []; }
  ref(v, depth = 0) {
    if (typeof v !== 'string' || !v.startsWith('@') || depth > 5) return v;
    if (v === '@today') { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
    const out = v.slice(1).split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.profile);
    if (out === undefined) return v;
    return typeof out === 'string' ? this.ref(out, depth + 1) : out;
  }
  prefs(list) { return (Array.isArray(list) ? list : [list]).map(x => this.ref(x)).filter(x => x != null && x !== '' && x !== 'FILL_ME').map(String); }
  isUnknown(v) { return v == null || v === '' || v === 'FILL_ME'; }
  lookup(question) {
    const q = (question || '').toLowerCase();
    for (const rule of [...this.learned, ...(this.profile.answers || [])]) {
      for (const pat of rule.match || []) {
        let re; try { re = new RegExp(pat, 'i'); } catch { continue; }
        if (re.test(q)) {
          if (Array.isArray(rule.answer)) { const list = this.prefs(rule.answer); return list.length ? { answer: list, rule } : { answer: null, rule }; }
          const a = this.ref(rule.answer); return this.isUnknown(a) ? { answer: null, rule } : { answer: String(a), rule };
        }
      }
    }
    return null;
  }
  answerFor(q) { const h = this.lookup(q); return h ? h.answer : null; }
};

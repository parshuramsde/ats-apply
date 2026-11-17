const $ = id => document.getElementById(id);
async function load() { const s = await chrome.storage.local.get(['learned', 'settings']); $('learned').value = JSON.stringify(s.learned || [], null, 2); $('autoNext').checked = (s.settings || {}).autoNext !== false; $('autofill').checked = (s.settings || {}).autofill === true; }
$('save').onclick = async () => { try { const learned = JSON.parse($('learned').value); await chrome.storage.local.set({ learned, settings: { autoNext: $('autoNext').checked, autofill: $('autofill').checked } }); $('msg').textContent = 'Saved.'; } catch (e) { $('msg').textContent = 'Invalid JSON: ' + e.message; } };
$('export').onclick = async () => { const s = await chrome.storage.local.get(['learned', 'profile']); const merged = { ...s.profile, answers: [...(s.learned || []), ...((s.profile || {}).answers || [])] }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' })); a.download = 'profile.json'; a.click(); };
$('reseed').onclick = async () => { await chrome.runtime.sendMessage({ type: 'reseed' }); $('msg').textContent = 'Profile reloaded.'; };
load();

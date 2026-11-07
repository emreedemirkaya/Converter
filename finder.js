const { execFile } = require('child_process');
const path = require('path');

function runAppleScript(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve('');
      resolve(stdout.trim());
    });
  });
}

// Öndeki uygulama Finder mi?
async function isFinderFrontmost() {
  const out = await runAppleScript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  return out === 'Finder';
}

// Finder'da seçili dosyaların yollarını döndürür
async function getSelectedFiles() {
  const script = `
    tell application "Finder"
      set sel to selection as alias list
      set out to ""
      repeat with f in sel
        set out to out & POSIX path of f & linefeed
      end repeat
      return out
    end tell
  `;
  const out = await runAppleScript(script);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Ana fonksiyon: Finder öndeyse ve dosya seçiliyse bilgi döndürür
async function getFinderSelection() {
  if (!(await isFinderFrontmost())) return null;

  const files = await getSelectedFiles();
  if (files.length === 0) return null;

  return files.map((p) => ({
    path: p,
    name: path.basename(p),
    ext: path.extname(p).replace('.', '').toLowerCase(),
  }));
}

module.exports = { getFinderSelection };
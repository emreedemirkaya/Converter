const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const IS_WIN = process.platform === 'win32';

const PF = process.env.ProgramFiles || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

// Windows'ta araçların sık kurulduğu klasörler (winget, scoop, choco, kurulum programları)
function windowsToolDirs() {
  const local = process.env.LOCALAPPDATA || '';
  const home = process.env.USERPROFILE || '';
  const dirs = [
    path.join(PF, 'LibreOffice', 'program'),
    path.join(PF86, 'LibreOffice', 'program'),
    path.join(PF, 'Pandoc'),
    path.join(local, 'Pandoc'),
    path.join(local, 'Microsoft', 'WinGet', 'Links'),
    path.join(home, 'scoop', 'shims'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin'),
  ];
  // ImageMagick sürüm numaralı klasöre kurulur: "ImageMagick-7.1.1-Q16-HDRI"
  try {
    for (const d of fs.readdirSync(PF)) if (d.startsWith('ImageMagick')) dirs.push(path.join(PF, d));
  } catch {}
  return dirs.filter((d) => fs.existsSync(d));
}

// extraPath: kurulumdan sonra kayıt defterinden okunan güncel PATH (Windows)
function buildEnv(extraPath = '') {
  const env = { ...process.env };
  if (!IS_WIN) {
    // .app olarak çalışınca Homebrew yolu PATH'te olmaz, elle ekliyoruz
    env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`;
    return env;
  }
  // Windows'ta değişkenin adı "Path" olabilir; tek anahtarda birleştir
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'Path';
  const current = env[key] || '';
  delete env[key];
  env.Path = [current, extraPath, ...windowsToolDirs()].filter(Boolean).join(';');
  return env;
}

let ENV = buildEnv();

// Windows'ta eksik araçlar winget ile kurulur: araç adı → { görünen ad, winget paketi }
const WINGET_TOOLS = {
  soffice: { name: 'LibreOffice', id: 'TheDocumentFoundation.LibreOffice' },
  ffmpeg: { name: 'FFmpeg', id: 'Gyan.FFmpeg' },
  pandoc: { name: 'Pandoc', id: 'JohnMacFarlane.Pandoc' },
  pdftotext: { name: 'Poppler', id: 'oschwartz10612.Poppler' },
  pdftoppm: { name: 'Poppler', id: 'oschwartz10612.Poppler' },
  magick: { name: 'ImageMagick', id: 'ImageMagick.ImageMagick' },
};

const INSTALL_HINT = IS_WIN
  ? Object.fromEntries(Object.entries(WINGET_TOOLS).map(([tool, t]) => [tool, `winget install ${t.id}`]))
  : {
      soffice: 'brew install --cask libreoffice',
      ffmpeg: 'brew install ffmpeg',
      pandoc: 'brew install pandoc',
      pdftotext: 'brew install poppler',
      sips: 'macOS ile gelir',
    };

function run(cmd, args, timeout = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { env: ENV, maxBuffer: 50 * 1024 * 1024, timeout },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed) {
            err.message = `${path.basename(cmd)} yanıt vermedi, işlem durduruldu.`;
          } else if (err.code === 'ENOENT') {
            const name = path.basename(cmd).replace(/\.(exe|com)$/i, '');
            err.message = `"${name}" bulunamadı. Kurulum: ${INSTALL_HINT[name] || name}`;
            err.missingTool = name; // main.js bunu görünce kurmayı teklif eder
          } else {
            err.message = (stderr || err.message).toString().trim().split('\n').slice(-3).join(' ');
          }
          return reject(err);
        }
        resolve(stdout);
      }
    );
  });
}

// Aynı isimde dosya varsa "ad (1).uzantı" gibi yeni isim üretir
function uniqueOutPath(srcPath, toExt) {
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  let out = path.join(dir, `${base}.${toExt}`);
  let n = 1;
  while (fs.existsSync(out)) out = path.join(dir, `${base} (${n++}).${toExt}`);
  return out;
}

function moveFile(from, to) {
  fs.copyFileSync(from, to);
  fs.unlinkSync(from);
}

// ---------- LibreOffice ----------
function findSoffice() {
  const candidates = IS_WIN
    ? [
        // soffice.com konsol sürümüdür: işlem bitene kadar bekler
        path.join(PF, 'LibreOffice', 'program', 'soffice.com'),
        path.join(PF86, 'LibreOffice', 'program', 'soffice.com'),
      ]
    : ['/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  return candidates.find((p) => fs.existsSync(p)) || 'soffice';
}

// Ayrı LibreOffice profili: açık LibreOffice ile çakışmasın
const LO_PROFILE_DIR = path.join(os.tmpdir(), 'conv-lo-profile');
const LO_PROFILE = IS_WIN ? pathToFileURL(LO_PROFILE_DIR).href : 'file:///tmp/conv-lo-profile';

// Windows'ta LibreOffice, kapanırken profile yazdığı registrymodifications.xcu yüzünden
// bir sonraki açılışta çöküp takılabiliyor (LibreOffice 26.8'de doğrulandı). Her dönüşümden
// önce bu dosyayı ve çökmeden kalan kilidi siliyoruz; profilin geri kalanı hız için kalıyor.
function prepareLoProfile() {
  if (!IS_WIN) return;
  fs.rmSync(path.join(LO_PROFILE_DIR, 'user', 'registrymodifications.xcu'), { force: true });
  fs.rmSync(path.join(LO_PROFILE_DIR, '.lock'), { force: true });
}

function resetLoProfile() {
  fs.rmSync(LO_PROFILE_DIR, { recursive: true, force: true });
}

const LO_TARGET = {
  txt: 'txt:Text',
  docx: 'docx:MS Word 2007 XML',
  xlsx: 'xlsx:Calc MS Excel 2007 XML',
  pptx: 'pptx:Impress MS PowerPoint 2007 XML',
};

async function viaLibreOffice(src, to, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'));
  const args = [
    `-env:UserInstallation=${LO_PROFILE}`,
    '--headless',
  ];
  if (path.extname(src).toLowerCase() === '.pdf') args.push('--infilter=writer_pdf_import');
  args.push('--convert-to', LO_TARGET[to] || to, '--outdir', tmp, src);

  const produced = path.join(tmp, path.basename(src, path.extname(src)) + '.' + to);

  try {
    if (!IS_WIN) {
      await run(findSoffice(), args); // her seferinde bak: uygulama açıkken kurulmuş olabilir
    } else {
      // Takılırsa 10 dk değil 2 dk bekle; başarısız olursa profili sıfırlayıp bir kez daha dene
      try {
        prepareLoProfile();
        await run(findSoffice(), args, 2 * 60 * 1000);
        if (!fs.existsSync(produced)) throw new Error('LibreOffice çıktı üretemedi.');
      } catch (err) {
        if (err.missingTool) throw err;
        console.warn('LibreOffice başarısız, profil sıfırlanıp yeniden deneniyor:', err.message);
        resetLoProfile();
        await run(findSoffice(), args, 2 * 60 * 1000);
      }
    }
    if (!fs.existsSync(produced)) throw new Error('LibreOffice çıktı üretemedi.');
    moveFile(produced, out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- sips (resimler) ----------
const SIPS_FORMAT = { jpg: 'jpeg', png: 'png', pdf: 'pdf', heic: 'heic', tiff: 'tiff', gif: 'gif', bmp: 'bmp' };

async function viaSips(src, to, out) {
  await run('sips', ['-s', 'format', SIPS_FORMAT[to] || to, src, '--out', out]);
}

// ---------- ImageMagick + pdftoppm (Windows'ta sips yerine) ----------
const SINGLE_FRAME = new Set(['jpg', 'png', 'bmp', 'heic']);

async function viaMagick(src, to, out) {
  // PDF'in ilk sayfası: Ghostscript gerektirmesin diye poppler ile
  if (path.extname(src).toLowerCase() === '.pdf') {
    const prefix = out.slice(0, -path.extname(out).length);
    await run('pdftoppm', [to === 'png' ? '-png' : '-jpeg', '-r', '150', '-f', '1', '-l', '1', '-singlefile', src, prefix]);
    return;
  }
  // Çok kareli dosyalarda (GIF, TIFF) sips gibi yalnızca ilk kareyi al
  const input = SINGLE_FRAME.has(to) ? `${src}[0]` : src;
  await run('magick', [input, out]);
}

// Resim motoru: macOS'ta sips, Windows'ta ImageMagick
const viaImage = IS_WIN ? viaMagick : viaSips;

// ---------- ffmpeg ----------
const FFMPEG_ARGS = {
  mp3: ['-vn', '-codec:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn'],
  m4a: ['-vn', '-codec:a', 'aac', '-b:a', '192k'],
  flac: ['-vn'],
  ogg: ['-vn', '-codec:a', 'libvorbis', '-q:a', '5'],
  mp4: ['-codec:v', 'libx264', '-pix_fmt', 'yuv420p', '-codec:a', 'aac'],
  mov: ['-codec:v', 'libx264', '-pix_fmt', 'yuv420p', '-codec:a', 'aac'],
  webm: ['-codec:v', 'libvpx-vp9', '-codec:a', 'libopus'],
  gif: ['-vf', 'fps=12,scale=480:-1:flags=lanczos', '-an'],
};

async function viaFfmpeg(src, to, out) {
  await run('ffmpeg', ['-y', '-i', src, ...(FFMPEG_ARGS[to] || []), out]);
}

// ---------- pandoc ----------
async function viaPandoc(src, to, out) {
  const title = path.basename(src, path.extname(src));

  // PDF için LaTeX gerekmesin: önce HTML, sonra LibreOffice ile PDF
  if (to === 'pdf') {
    const tmpHtml = path.join(os.tmpdir(), `conv-${Date.now()}.html`);
    try {
      await run('pandoc', [src, '-s', '--metadata', `pagetitle=${title}`, '-o', tmpHtml]);
      await viaLibreOffice(tmpHtml, 'pdf', out);
    } finally {
      fs.rmSync(tmpHtml, { force: true });
    }
    return;
  }

  const args = [src, '-s', '--metadata', `pagetitle=${title}`];
  if (to === 'txt') args.push('-t', 'plain');
  if (to === 'md') args.push('-t', 'gfm');
  args.push('-o', out);
  await run('pandoc', args);
}

// ---------- poppler (PDF → TXT) ----------
async function viaPoppler(src, to, out) {
  await run('pdftotext', ['-layout', src, out]);
}

const ENGINES = {
  libreoffice: viaLibreOffice,
  sips: viaImage,
  ffmpeg: viaFfmpeg,
  pandoc: viaPandoc,
  poppler: viaPoppler,
};

// Ana fonksiyon: dönüştürür, çıktı yolunu döndürür
async function convert(srcPath, option) {
  const fn = ENGINES[option.engine];
  if (!fn) throw new Error(`Bilinmeyen motor: ${option.engine}`);
  const out = uniqueOutPath(srcPath, option.to);
  await fn(srcPath, option.to, out);
  if (!fs.existsSync(out)) throw new Error('Dönüştürme başarısız oldu.');
  return out;
}

// ---------- Eksik araçları kurma (Windows, winget) ----------
// winget'in "zaten kurulu" / "yükseltme yok" çıkış kodları hata sayılmaz
const WINGET_OK = new Set([0, 0x8a15002b, 0x8a150061]);

// Kurulabilecek araçların görünen adları (aynı paket tek kez): ['LibreOffice', 'Poppler']
function toolNames(tools) {
  return [...new Set(tools.filter((t) => WINGET_TOOLS[t]).map((t) => WINGET_TOOLS[t].name))];
}

function canInstall(tools) {
  return IS_WIN && tools.some((t) => WINGET_TOOLS[t]);
}

function wingetInstall(id) {
  return new Promise((resolve, reject) => {
    execFile(
      'winget',
      [
        'install', '--id', id, '--exact', '--source', 'winget', '--silent',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity',
      ],
      { windowsHide: true, maxBuffer: 50 * 1024 * 1024, timeout: 30 * 60 * 1000 },
      (err, stdout) => {
        if (!err) return resolve();
        if (err.code === 'ENOENT') {
          return reject(new Error('winget bulunamadı. Microsoft Store\'dan "Uygulama Yükleyicisi"ni (App Installer) kur.'));
        }
        if (typeof err.code === 'number' && WINGET_OK.has(err.code >>> 0)) return resolve();
        const last = (stdout || '').toString().trim().split('\n').filter(Boolean).slice(-1)[0];
        reject(new Error(`${id} kurulamadı${last ? `: ${last.trim()}` : ''}`));
      }
    );
  });
}

// Kurulumdan sonra yeni PATH'i kayıt defterinden oku (çalışan süreç bunu kendiliğinden görmez)
function refreshEnv() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
      ],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        ENV = buildEnv(err ? '' : stdout.toString().trim());
        resolve();
      }
    );
  });
}

// Açılışta da güncel PATH'i oku: araç, Converter'ı başlatan program (Gezgin, terminal)
// açıldıktan sonra kurulduysa process.env'de görünmez
if (IS_WIN) refreshEnv();

async function installTools(tools) {
  const ids = [...new Set(tools.filter((t) => WINGET_TOOLS[t]).map((t) => WINGET_TOOLS[t].id))];
  try {
    for (const id of ids) await wingetInstall(id);
  } finally {
    await refreshEnv();
  }
}

module.exports = { convert, canInstall, toolNames, installTools };
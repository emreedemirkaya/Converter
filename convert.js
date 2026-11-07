const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// .app olarak çalışınca Homebrew yolu PATH'te olmaz, elle ekliyoruz
const ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
};

const INSTALL_HINT = {
  soffice: 'brew install --cask libreoffice',
  ffmpeg: 'brew install ffmpeg',
  pandoc: 'brew install pandoc',
  pdftotext: 'brew install poppler',
  sips: 'macOS ile gelir',
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { env: ENV, maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            const name = path.basename(cmd);
            err.message = `"${name}" bulunamadı. Kurulum: ${INSTALL_HINT[name] || name}`;
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
const SOFFICE = fs.existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice')
  ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  : 'soffice';

const LO_TARGET = {
  txt: 'txt:Text',
  docx: 'docx:MS Word 2007 XML',
  xlsx: 'xlsx:Calc MS Excel 2007 XML',
  pptx: 'pptx:Impress MS PowerPoint 2007 XML',
};

async function viaLibreOffice(src, to, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'));
  const args = [
    '-env:UserInstallation=file:///tmp/conv-lo-profile', // açık LibreOffice ile çakışmasın
    '--headless',
  ];
  if (path.extname(src).toLowerCase() === '.pdf') args.push('--infilter=writer_pdf_import');
  args.push('--convert-to', LO_TARGET[to] || to, '--outdir', tmp, src);

  try {
    await run(SOFFICE, args);
    const produced = path.join(tmp, path.basename(src, path.extname(src)) + '.' + to);
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
  sips: viaSips,
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

module.exports = { convert };
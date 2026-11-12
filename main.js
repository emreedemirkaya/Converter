const {
  app, BrowserWindow, ipcMain, screen, Notification, shell, Tray, Menu, nativeImage,
} = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { getOptions } = require('./converters');
const { convert, canInstall, toolNames, installTools } = require('./convert');

const IS_WIN = process.platform === 'win32';
// macOS'ta Finder (AppleScript), Windows'ta Dosya Gezgini (PowerShell/COM)
const explorer = IS_WIN ? require('./explorer') : null;
const getSelection = IS_WIN ? explorer.getExplorerSelection : require('./finder').getFinderSelection;
const FILE_MANAGER = IS_WIN ? "Gezgin'de" : "Finder'da";

app.setName('Converter');
if (app.dock) app.dock.hide();
// Windows bildirimleri için uygulama kimliği (geliştirirken electron.exe yolu)
if (IS_WIN) app.setAppUserModelId(app.isPackaged ? 'com.emre.converter' : process.execPath);
app.setLoginItemSettings({ openAtLogin: false }); // açılışta otomatik başlamasın

// Uygulama iki kez açılırsa ikinci kopya hemen kapansın
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let current = null; // { files, options }

// ---------- Bildirimler ----------
const liveNotifications = new Set();

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return console.log(`🔔 ${title}: ${body}`);
  const n = new Notification({ title, body, silent: true });
  liveNotifications.add(n);
  n.on('click', () => onClick && onClick());
  n.on('close', () => liveNotifications.delete(n));
  n.show();
  return n;
}

// ---------- Pencere ----------
function createWindow() {
  win = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  if (!IS_WIN) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  // Odak kaybolunca çark kapanır; kurulum sorusu ise cevap verilene kadar ekranda kalır
  win.on('blur', () => {
    if (!answerAsk) hideWindow();
  });
}

// Pencereyi imlecin olduğu ekranın ortasında gösterir ve odağı alır
function presentWindow() {
  const size = 600;
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - size) / 2),
    y: Math.round(workArea.y + (workArea.height - size) / 2),
    width: size,
    height: size,
  });
  // Windows, arka plandaki uygulamanın odak almasını engeller; tek bir Alt
  // basışı bu kilidi kaldırır (yoksa 1-9 / Esc tuşları pencereye ulaşmaz)
  if (IS_WIN) uIOhook.keyTap(UiohookKey.Alt);
  win.show();
  app.focus({ steal: true });
  win.focus();
}

function showWindow(file, options, count) {
  win.webContents.send('show', { name: file.name, ext: file.ext, count, options });
  presentWindow();
}

// Kurulum sorusu açıkken cevabı bekleyen fonksiyon
let answerAsk = null;

function hideWindow() {
  // Soru açıkken pencere kapanırsa (Esc, boşluğa tıklama, başka pencereye geçme) = Vazgeç
  if (answerAsk) {
    const answer = answerAsk;
    answerAsk = null;
    answer(false);
  }
  if (!win || !win.isVisible()) return;
  // Windows'ta gizlenen pencere odakta kalır; odağı alttaki pencereye (Gezgin) geri ver
  if (IS_WIN) win.minimize();
  win.hide();
}

// ---------- Menü çubuğu simgesi ----------
function createTray() {
  if (IS_WIN) {
    // Windows'ta başlık (setTitle) yok, simge gerekli; tray@2x.png yüksek DPI'da otomatik seçilir
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  } else {
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('⇄');
  }
  tray.setToolTip('Converter');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Converter', enabled: false },
      { label: `${FILE_MANAGER} dosya seç → Shift`, enabled: false },
      { type: 'separator' },
      { label: 'Çıkış', role: 'quit' },
    ])
  );
  // Windows'ta sol tık da menüyü açsın
  if (IS_WIN) tray.on('click', () => tray.popUpContextMenu());
}

// ---------- Seçenekler ----------
// Birden fazla dosya seçiliyse: hepsinin dönüştürülebildiği ortak hedefler
function commonOptions(files) {
  const lists = files.map((f) => getOptions(f.ext));
  return lists[0].filter((o) => lists.every((l) => l.some((x) => x.to === o.to)));
}

// ---------- Dönüştürme ----------
// Sırayla işle (LibreOffice aynı anda tek işlem kabul eder)
async function convertFiles(files, to) {
  let ok = 0;
  let lastOut = null;
  const errors = [];
  const failed = [];
  const missing = new Set(); // bulunamayan araçlar (ör. soffice)

  for (const file of files) {
    try {
      // Her dosya için kendi motorunu bul (ör. png→pdf: sips)
      const opt = getOptions(file.ext).find((o) => o.to === to);
      if (!opt) throw new Error('Bu dosya için bu tür desteklenmiyor.');
      lastOut = await convert(file.path, opt);
      ok++;
      console.log(`✅ ${lastOut}`);
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
      failed.push(file);
      if (err.missingTool) missing.add(err.missingTool);
      console.error(`❌ ${file.name}:`, err.message);
    }
  }
  return { ok, lastOut, errors, failed, missing };
}

// "X gerekli, kurulsun mu?" sorusu. Sistem iletişim kutusu Windows'ta Gezgin'in
// arkasında kaldığı için soru, öne gelmesi garanti olan çark penceresinde sorulur.
// Kur → true, Vazgeç / Esc / dışarı tıklama → false
function askInstall(tools) {
  return new Promise((resolve) => {
    answerAsk = resolve;
    win.webContents.send('ask', { names: toolNames(tools) });
    // Çark az önce kapandı ve Windows odağı Gezgin'e geri veriyor; o bitmeden
    // açarsak soru odağı hemen kaybeder. Kısa bir bekleme yeterli.
    setTimeout(() => {
      if (answerAsk === resolve) presentWindow();
    }, 350);
  });
}

ipcMain.on('answer', (_e, yes) => {
  if (!answerAsk) return;
  const answer = answerAsk;
  answerAsk = null;
  hideWindow();
  answer(yes === true);
});

// ---------- Seçim yapılınca dönüştür ----------
let converting = false;

ipcMain.on('choose', async (_e, index) => {
  if (!current || converting) return;
  const { files, options } = current;
  const chosen = options[index];
  hideWindow();

  converting = true;
  const total = files.length;
  console.log(`🎯 ${total} dosya → .${chosen.to}`);
  // Ara bildirimler ("Dönüştürülüyor…", "Kuruluyor…") iş bitince silinir, sadece sonuç kalır
  const progress = [];
  progress.push(notify(
    'Dönüştürülüyor…',
    total === 1 ? `${files[0].name} → .${chosen.to.toUpperCase()}` : `${total} dosya → .${chosen.to.toUpperCase()}`
  ));

  let ok = 0;
  let lastOut = null;
  let errors = [];

  try {
    let pending = files;
    // Windows'ta eksik araç çıkarsa kurmayı teklif et, kurulunca kalan dosyaları yeniden dene.
    // (pandoc → PDF önce pandoc'u, sonra LibreOffice'i isteyebilir; o yüzden birkaç tur)
    for (let round = 0; round < 3 && pending.length; round++) {
      const r = await convertFiles(pending, chosen.to);
      ok += r.ok;
      lastOut = r.lastOut || lastOut;
      errors = r.errors;
      pending = r.failed;

      const missing = [...r.missing];
      if (!missing.length || !canInstall(missing)) break;
      if (!(await askInstall(missing))) break;

      const names = toolNames(missing).join(', ');
      progress.push(notify('Kuruluyor…', `${names} indiriliyor, birkaç dakika sürebilir`));
      console.log(`📦 kuruluyor: ${names}`);
      try {
        await installTools(missing);
      } catch (err) {
        errors = [err.message];
        break;
      }
      progress.push(notify('Kurulum tamam ✅', 'Dönüştürmeye devam ediliyor…'));
    }
  } finally {
    converting = false;
    progress.forEach((n) => n && n.close());
  }

  if (errors.length === 0) {
    const body = total === 1 ? `${path.basename(lastOut)} (göstermek için tıkla)` : `${ok} dosya hazır (göstermek için tıkla)`;
    notify('Dönüştürme tamam ✅', body, () => shell.showItemInFolder(lastOut));
  } else if (ok > 0) {
    notify(`${ok} başarılı, ${errors.length} hatalı ⚠️`, errors[0], () => shell.showItemInFolder(lastOut));
  } else {
    notify('Dönüştürme başarısız ❌', errors[0]);
  }
});

ipcMain.on('close', hideWindow);

// ---------- Başlangıç ----------
app.whenReady().then(() => {
  createWindow();
  createTray();

  let shiftDown = false;
  let otherKeyPressed = false;
  let busy = false;

  const isShift = (k) => k === UiohookKey.Shift || k === UiohookKey.ShiftRight;

  async function onShiftTap() {
    if (busy || converting) return;
    if (win.isVisible()) return hideWindow();

    busy = true;
    try {
      const files = await getSelection();
      if (!files) return;

      const options = commonOptions(files);
      current = { files, options };
      showWindow(files[0], options, files.length);
    } finally {
      busy = false;
    }
  }

  uIOhook.on('keydown', (e) => {
    if (isShift(e.keycode)) {
      if (!shiftDown) {
        shiftDown = true;
        otherKeyPressed = false;
      }
    } else {
      otherKeyPressed = true;
    }
  });

  uIOhook.on('keyup', (e) => {
    if (isShift(e.keycode)) {
      if (shiftDown && !otherKeyPressed) onShiftTap();
      shiftDown = false;
    }
  });

  uIOhook.start();
  if (explorer) explorer.warmUp(); // ilk Shift basışında beklememek için PowerShell'i önceden aç
  console.log(`Hazır. ${FILE_MANAGER} bir dosya seç ve Shift'e bas...`);
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
  uIOhook.stop();
  if (explorer) explorer.stop();
});
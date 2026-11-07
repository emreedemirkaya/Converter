const {
  app, BrowserWindow, ipcMain, screen, Notification, shell, Tray, Menu, nativeImage,
} = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { getFinderSelection } = require('./finder');
const { getOptions } = require('./converters');
const { convert } = require('./convert');

app.setName('Converter');
if (app.dock) app.dock.hide();
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
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.on('blur', () => hideWindow());
}

function showWindow(file, options, count) {
  const size = 600;
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - size) / 2),
    y: Math.round(workArea.y + (workArea.height - size) / 2),
    width: size,
    height: size,
  });
  win.webContents.send('show', { name: file.name, ext: file.ext, count, options });
  win.show();
  app.focus({ steal: true });
  win.focus();
}

function hideWindow() {
  if (win && win.isVisible()) win.hide();
}

// ---------- Menü çubuğu simgesi ----------
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('⇄');
  tray.setToolTip('Converter');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Converter', enabled: false },
      { label: "Finder'da dosya seç → Shift", enabled: false },
      { type: 'separator' },
      { label: 'Çıkış', role: 'quit' },
    ])
  );
}

// ---------- Seçenekler ----------
// Birden fazla dosya seçiliyse: hepsinin dönüştürülebildiği ortak hedefler
function commonOptions(files) {
  const lists = files.map((f) => getOptions(f.ext));
  return lists[0].filter((o) => lists.every((l) => l.some((x) => x.to === o.to)));
}

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
  notify(
    'Dönüştürülüyor…',
    total === 1 ? `${files[0].name} → .${chosen.to.toUpperCase()}` : `${total} dosya → .${chosen.to.toUpperCase()}`
  );

  let ok = 0;
  let lastOut = null;
  const errors = [];

  // Sırayla işle (LibreOffice aynı anda tek işlem kabul eder)
  for (const file of files) {
    try {
      // Her dosya için kendi motorunu bul (ör. png→pdf: sips)
      const opt = getOptions(file.ext).find((o) => o.to === chosen.to);
      if (!opt) throw new Error('Bu dosya için bu tür desteklenmiyor.');
      lastOut = await convert(file.path, opt);
      ok++;
      console.log(`✅ ${lastOut}`);
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
      console.error(`❌ ${file.name}:`, err.message);
    }
  }
  converting = false;

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
      const files = await getFinderSelection();
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
  console.log("Hazır. Finder'da bir dosya seç ve Shift'e bas...");
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => uIOhook.stop());
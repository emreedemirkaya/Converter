// Windows: Dosya Gezgini'nde (veya masaüstünde) seçili dosyaları okur.
// finder.js'in (macOS / AppleScript) Windows karşılığıdır.
//
// Her Shift basışında yeni bir PowerShell açmak yavaş olduğu için
// arka planda tek bir PowerShell süreci açık tutulur, istekler stdin'den gönderilir.
const { spawn } = require('child_process');
const path = require('path');

// Öndeki pencere Gezgin/masaüstü ise seçili öğelerin yollarını satır satır döndürür.
// Windows 11 sekmelerinde yalnızca etkin sekmenin seçimi alınır.
const CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class ConverterExplorer {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

  [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IServiceProvider { [PreserveSig] int QueryService(ref Guid sid, ref Guid iid, out IntPtr ppv); }

  [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellBrowser { [PreserveSig] int GetWindow(out IntPtr phwnd); }

  static string ClassOf(IntPtr h) {
    var sb = new StringBuilder(256);
    GetClassName(h, sb, sb.Capacity);
    return sb.ToString();
  }

  // Gezgin sekmesinin kendi pencere tutamacı (ShellTabWindowClass)
  static IntPtr TabHwnd(object w) {
    try {
      var sp = (IServiceProvider)w;
      Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"); // SID_STopLevelBrowser
      Guid iid = typeof(IShellBrowser).GUID;
      IntPtr p;
      if (sp.QueryService(ref sid, ref iid, out p) != 0 || p == IntPtr.Zero) return IntPtr.Zero;
      var browser = (IShellBrowser)Marshal.GetObjectForIUnknown(p);
      Marshal.Release(p);
      IntPtr h;
      browser.GetWindow(out h);
      return h;
    } catch { return IntPtr.Zero; }
  }

  public static string Get() {
    IntPtr fg = GetForegroundWindow();
    string cls = ClassOf(fg);
    dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
    dynamic target = null;

    if (cls == "CabinetWClass" || cls == "ExploreWClass") {
      foreach (dynamic w in shell.Windows()) {
        try {
          if (Convert.ToInt64(w.HWND) != fg.ToInt64()) continue;
          IntPtr tab = TabHwnd((object)w);
          if (tab != IntPtr.Zero && !IsWindowVisible(tab)) continue; // arka plandaki sekme
          target = w;
          break;
        } catch { }
      }
    } else if (cls == "Progman" || cls == "WorkerW") {
      target = Desktop(shell);
    } else {
      return "";
    }
    return PathsOf(target);
  }

  // Masaüstünün kabuk görünümü
  public static object Desktop(dynamic shell) {
    object loc = 0;            // CSIDL_DESKTOP
    object root = Type.Missing;
    int hwnd;
    return shell.Windows().FindWindowSW(ref loc, ref root, 8 /* SWC_DESKTOP */, out hwnd, 1 /* SWFO_NEEDDISPATCH */);
  }

  public static string PathsOf(dynamic target) {
    if (target == null) return "";
    var paths = new List<string>();
    foreach (dynamic item in target.Document.SelectedItems()) {
      try {
        string p = item.Path;
        if (!string.IsNullOrEmpty(p) && (File.Exists(p) || Directory.Exists(p))) paths.Add(p);
      } catch { }
    }
    return string.Join("\n", paths);
  }
}
`;

const END = '<<END>>';

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -ReferencedAssemblies Microsoft.CSharp, System.Core -TypeDefinition @'
${CSHARP}
'@
[Console]::Out.Write("${END}\`n"); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try { $r = [ConverterExplorer]::Get() } catch { $r = '' }
  [Console]::Out.Write($r + "\`n${END}\`n"); [Console]::Out.Flush()
}
`;

let proc = null;
let buffer = '';
let waiters = []; // sırayla gelen yanıtları bekleyenler (ilki: açılış)

function start() {
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
  proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
  );
  buffer = '';
  const ready = new Promise((resolve) => waiters.push(resolve));

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf(END)) !== -1) {
      const reply = buffer.slice(0, i);
      buffer = buffer.slice(i + END.length).replace(/^\r?\n/, '');
      const w = waiters.shift();
      if (w) w(reply);
    }
  });

  const dead = () => {
    proc = null;
    waiters.splice(0).forEach((w) => w(null));
  };
  proc.on('exit', dead);
  proc.on('error', dead);
  return ready;
}

let starting = null;
function ensureStarted() {
  if (proc) return starting;
  starting = start();
  return starting;
}

function stop() {
  if (proc) proc.kill();
  proc = null;
}

// Satır satır yol listesi döndürür; zaman aşımında süreç yeniden başlatılır
async function getSelectedFiles() {
  await ensureStarted();
  if (!proc) return [];

  const reply = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(done);
      if (idx !== -1) waiters.splice(idx, 1);
      stop(); // takılmış olabilir, bir sonraki istekte yeniden açılır
      resolve(null);
    }, 4000);
    function done(r) {
      clearTimeout(timer);
      resolve(r);
    }
    waiters.push(done);
    proc.stdin.write('get\n');
  });

  return (reply || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Ana fonksiyon: Gezgin öndeyse ve dosya seçiliyse bilgi döndürür
async function getExplorerSelection() {
  const files = await getSelectedFiles();
  if (files.length === 0) return null;

  return files.map((p) => ({
    path: p,
    name: path.basename(p),
    ext: path.extname(p).replace('.', '').toLowerCase(),
  }));
}

module.exports = { getExplorerSelection, warmUp: ensureStarted, stop };

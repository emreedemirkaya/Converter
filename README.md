# Converter ⇄

Finder'da (macOS) ya da Dosya Gezgini'nde (Windows) bir dosya seç, **Shift** tuşuna bas, menüden dönüştürmek istediğin türü seç. Dosya, orijinalin yanına dönüştürülür.

## Özellikler

- Finder'da / Gezgin'de seçili dosyada **Shift**'e tek başına basınca açılan dairesel seçim çarkı
- Seçenekler `1-9` tuşlarıyla ya da tıklayarak seçilir
- Birden fazla dosyayı aynı anda dönüştürme
- Dönüşüm bitince bildirim, bildirime tıklayınca dosyayı klasöründe gösterme
- macOS'ta menü çubuğunda, Windows'ta sistem tepsisinde **⇄** simgesi (Dock'ta / görev çubuğunda ikon yok)
- Windows'ta masaüstünde seçili dosyalar ve Windows 11 Gezgin sekmeleri de desteklenir

## Desteklenen dönüşümler

| Tür | Örnekler | Kullanılan araç |
|---|---|---|
| Ofis belgeleri | DOCX, XLSX, PPTX, ODT, CSV → PDF, TXT, HTML... | LibreOffice |
| Resimler | JPG, PNG, HEIC, TIFF, GIF, BMP | sips (macOS ile gelir) · Windows'ta ImageMagick |
| Ses | MP3, WAV, M4A, FLAC, OGG | ffmpeg |
| Video | MP4, MOV, WebM, MKV → MP4, GIF, MP3... | ffmpeg |
| Metin / işaretleme | MD, HTML, TXT → PDF, DOCX... | pandoc |
| PDF | → DOCX (deneysel), PNG, JPG, TXT | LibreOffice, sips / poppler (Windows), poppler |

## Gereksinimler (macOS)

- macOS (Apple Silicon veya Intel)
- [Node.js](https://nodejs.org) 18+
- [Homebrew](https://brew.sh)

Dönüştürme araçlarını kur:

```bash
brew install --cask libreoffice
brew install ffmpeg pandoc poppler
```

## Kurulum

```bash
git clone https://github.com/KULLANICI_ADIN/converter.git
cd converter
npm install
npm start
```

## Uygulama olarak paketleme

```bash
npm run build
cp -R dist/mac-arm64/Converter.app /Applications/
```

Intel Mac'te `package.json` içindeki `sign` komutunda `mac-arm64` yerine `mac` yaz.

## Windows

### Gereksinimler

- Windows 10 / 11 (x64 veya ARM64)
- [Node.js](https://nodejs.org) 18+

Dönüştürme araçlarını önceden kurmak zorunda değilsin: bir dönüşüm için gereken araç eksikse Converter çarkta **"Kurulum gerekli"** diye sorar, **Kur**'a (veya Enter'a) basınca aracı winget ile kendisi kurar ve dönüştürmeye kaldığı yerden devam eder. LibreOffice gibi bazı kurulumlar Windows yönetici izni isteyebilir.

İstersen hepsini baştan elle de kurabilirsin (PowerShell veya Komut İstemi):

```powershell
winget install TheDocumentFoundation.LibreOffice
winget install Gyan.FFmpeg JohnMacFarlane.Pandoc oschwartz10612.Poppler ImageMagick.ImageMagick
```

Kurulumdan sonra Converter'ı yeniden başlat ki yeni `PATH` görülsün. Uygulama LibreOffice'i, ImageMagick'i ve winget / scoop / Chocolatey klasörlerini `PATH`'te olmasa da kendisi arar.

### Kurulum

```powershell
git clone https://github.com/emreedemirkaya/Converter.git
cd Converter
npm install
npm start
```

### Uygulama olarak paketleme

```powershell
npm run build:win
```

`dist\Converter Setup 1.0.0.exe` kurulum dosyası oluşur. Kurulumla gelen Başlat menüsü kısayolu Windows bildirimlerinin uygulama adıyla görünmesini sağlar.

### Windows notları

- Ek izin gerekmez; Gezgin seçimi arka planda çalışan gizli bir PowerShell süreciyle okunur.
- Shift'e art arda 5 kez basmak Windows'un **Yapışkan Tuşlar** penceresini açabilir. İstersen **Ayarlar → Erişilebilirlik → Klavye → Yapışkan tuşlar** altından kısayolu kapat.
- Kurulum dosyası imzasız olduğu için SmartScreen uyarı verebilir: **Ek bilgi → Yine de çalıştır**.

## macOS izinleri

**Sistem Ayarları → Gizlilik ve Güvenlik** bölümünde `Converter` (geliştirirken VS Code veya Terminal) için şunlar açık olmalı:

- **Erişilebilirlik**
- **Girdi İzleme**
- **Otomasyon** (Finder ve System Events)

## Kullanım

1. Uygulamayı aç, menü çubuğunda (Windows'ta sistem tepsisinde) **⇄** görünür
2. Finder'da / Gezgin'de bir veya birden fazla dosya seç
3. **Shift**'e tek başına bas
4. Çarktan bir seçenek seç ya da `1-9` tuşuna bas
5. Dönüştürülen dosya aynı klasörde oluşur

Çıkmak için **⇄ → Çıkış**.

## Teknolojiler

Electron, uiohook-napi, AppleScript (macOS), PowerShell + Shell COM (Windows)

## Bilinen sınırlar

- macOS ve Windows (Linux desteklenmiyor)
- Dönüştürme araçları sistemde kurulu olmalı, uygulamanın içinde gömülü değil
- PDF → DOCX düzeni bozabilir
- Uygulama imzasız (ad-hoc), her derlemede izinleri yeniden vermek gerekebilir
- Windows'ta HEIC'e dönüştürme, ImageMagick derlemesinin HEIC yazma desteğine bağlıdır

## İndir

[**Converter'ı indir (macOS, Apple Silicon)**](https://github.com/emreedemirkaya/Converter)

İndirdikten sonra `Converter.app` dosyasını Uygulamalar klasörüne taşı. İlk açılışta uyarı çıkarsa sağ tık → Aç de.
# Converter ⇄

Finder'da bir dosya seç, **Shift** tuşuna bas, menüden dönüştürmek istediğin türü seç. Dosya, orijinalin yanına dönüştürülür.

## Özellikler

- Finder'da seçili dosyada **Shift**'e tek başına basınca açılan dairesel seçim çarkı
- Seçenekler `1-9` tuşlarıyla ya da tıklayarak seçilir
- Birden fazla dosyayı aynı anda dönüştürme
- Dönüşüm bitince bildirim, bildirime tıklayınca Finder'da gösterme
- Menü çubuğunda **⇄** simgesi (Dock'ta ikon yok)

## Desteklenen dönüşümler

| Tür | Örnekler | Kullanılan araç |
|---|---|---|
| Ofis belgeleri | DOCX, XLSX, PPTX, ODT, CSV → PDF, TXT, HTML... | LibreOffice |
| Resimler | JPG, PNG, HEIC, TIFF, GIF, BMP | sips (macOS ile gelir) |
| Ses | MP3, WAV, M4A, FLAC, OGG | ffmpeg |
| Video | MP4, MOV, WebM, MKV → MP4, GIF, MP3... | ffmpeg |
| Metin / işaretleme | MD, HTML, TXT → PDF, DOCX... | pandoc |
| PDF | → DOCX (deneysel), PNG, JPG, TXT | LibreOffice, sips, poppler |

## Gereksinimler

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

## macOS izinleri

**Sistem Ayarları → Gizlilik ve Güvenlik** bölümünde `Converter` (geliştirirken VS Code veya Terminal) için şunlar açık olmalı:

- **Erişilebilirlik**
- **Girdi İzleme**
- **Otomasyon** (Finder ve System Events)

## Kullanım

1. Uygulamayı aç, menü çubuğunda **⇄** görünür
2. Finder'da bir veya birden fazla dosya seç
3. **Shift**'e tek başına bas
4. Çarktan bir seçenek seç ya da `1-9` tuşuna bas
5. Dönüştürülen dosya aynı klasörde oluşur

Çıkmak için **⇄ → Çıkış**.

## Teknolojiler

Electron, uiohook-napi, AppleScript

## Bilinen sınırlar

- Sadece macOS
- Dönüştürme araçları sistemde kurulu olmalı, uygulamanın içinde gömülü değil
- PDF → DOCX düzeni bozabilir
- Uygulama imzasız (ad-hoc), her derlemede izinleri yeniden vermek gerekebilir
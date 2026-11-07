// Her seçenek: { to: hedef uzantı, label: ekranda görünen ad, engine: kullanılacak motor }
const opt = (to, label, engine) => ({ to, label, engine });

const OFFICE_TEXT = [
  opt('pdf', 'PDF', 'libreoffice'),
  opt('txt', 'Düz Metin (TXT)', 'libreoffice'),
  opt('html', 'Web Sayfası (HTML)', 'libreoffice'),
  opt('docx', 'Word (DOCX)', 'libreoffice'),
  opt('odt', 'OpenDocument (ODT)', 'libreoffice'),
  opt('rtf', 'Zengin Metin (RTF)', 'libreoffice'),
];

const OFFICE_SHEET = [
  opt('pdf', 'PDF', 'libreoffice'),
  opt('csv', 'CSV', 'libreoffice'),
  opt('xlsx', 'Excel (XLSX)', 'libreoffice'),
  opt('ods', 'OpenDocument (ODS)', 'libreoffice'),
  opt('html', 'Web Sayfası (HTML)', 'libreoffice'),
];

const OFFICE_SLIDE = [
  opt('pdf', 'PDF', 'libreoffice'),
  opt('pptx', 'PowerPoint (PPTX)', 'libreoffice'),
  opt('odp', 'OpenDocument (ODP)', 'libreoffice'),
];

const IMAGE = [
  opt('jpg', 'JPG', 'sips'),
  opt('png', 'PNG', 'sips'),
  opt('pdf', 'PDF', 'sips'),
  opt('heic', 'HEIC', 'sips'),
  opt('tiff', 'TIFF', 'sips'),
  opt('gif', 'GIF', 'sips'),
  opt('bmp', 'BMP', 'sips'),
];

const AUDIO = [
  opt('mp3', 'MP3', 'ffmpeg'),
  opt('wav', 'WAV', 'ffmpeg'),
  opt('m4a', 'M4A (AAC)', 'ffmpeg'),
  opt('flac', 'FLAC', 'ffmpeg'),
  opt('ogg', 'OGG', 'ffmpeg'),
];

const VIDEO = [
  opt('mp4', 'MP4', 'ffmpeg'),
  opt('mov', 'MOV', 'ffmpeg'),
  opt('webm', 'WebM', 'ffmpeg'),
  opt('gif', 'Animasyonlu GIF', 'ffmpeg'),
  opt('mp3', 'Sadece Ses (MP3)', 'ffmpeg'),
];

const MARKUP = [
  opt('pdf', 'PDF', 'pandoc'),
  opt('docx', 'Word (DOCX)', 'pandoc'),
  opt('html', 'Web Sayfası (HTML)', 'pandoc'),
  opt('md', 'Markdown (MD)', 'pandoc'),
  opt('txt', 'Düz Metin (TXT)', 'pandoc'),
];

const PDF = [
  opt('docx', 'Word (DOCX) · deneysel', 'libreoffice'),
  opt('png', 'PNG (ilk sayfa)', 'sips'),
  opt('jpg', 'JPG (ilk sayfa)', 'sips'),
  opt('txt', 'Düz Metin (TXT)', 'poppler'),
];

// Uzantı → seçenek listesi
const MAP = {};
const assign = (exts, list) => exts.forEach((e) => (MAP[e] = list));

assign(['docx', 'doc', 'odt', 'rtf'], OFFICE_TEXT);
assign(['xlsx', 'xls', 'ods', 'csv'], OFFICE_SHEET);
assign(['pptx', 'ppt', 'odp'], OFFICE_SLIDE);
assign(['jpg', 'jpeg', 'png', 'heic', 'tiff', 'tif', 'gif', 'bmp', 'webp'], IMAGE);
assign(['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'], AUDIO);
assign(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'], VIDEO);
assign(['md', 'html', 'htm', 'txt'], MARKUP);
assign(['pdf'], PDF);

const ALIASES = { jpeg: 'jpg', tif: 'tiff', htm: 'html' };
const normalize = (e) => ALIASES[e] || e;

// Verilen uzantı için en fazla 9 seçenek döndürür (kendi uzantısı hariç)
function getOptions(ext) {
  const list = MAP[ext];
  if (!list) return [];
  return list.filter((o) => o.to !== normalize(ext)).slice(0, 9);
}

module.exports = { getOptions };
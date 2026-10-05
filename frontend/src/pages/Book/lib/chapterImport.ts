const SUPPORTED_IMPORT_EXTENSIONS = ['txt'];

export function getChapterImportFileExtension(file: File): string {
  const parts = file.name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function isSupportedChapterImportFile(file: File): boolean {
  return SUPPORTED_IMPORT_EXTENSIONS.includes(getChapterImportFileExtension(file));
}

export function getChapterImportFileTitle(file: File): string {
  return file.name.replace(/\.[^/.]+$/, '') || 'Imported chapter';
}

export function getChapterImportError(file: File): string {
  return `Unsupported chapter file: ${file.name}. Supported format: .txt.`;
}

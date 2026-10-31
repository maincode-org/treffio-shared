import type { Locale } from './types';

/**
 * Programs and web pages a download link refuses. Everything else (documents, spreadsheets,
 * images, video, archives) is allowed. Keep in sync with `event_files_extension_allowed` in
 * treffio-backend-orm (SQL/functions/storage/event_files_helpers.sql).
 */
export const BLOCKED_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'drv', 'ocx', 'msc', 'lnk', 'reg', 'inf',
  'hta', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'wsc', 'sct', 'scf', 'url', 'gadget',
  'sh', 'bash', 'zsh', 'csh', 'command', 'run', 'bin', 'app', 'dmg', 'pkg', 'mpkg', 'deb', 'rpm', 'appimage',
  'jar', 'apk', 'aab', 'ipa', 'appx', 'msix', 'iso', 'img', 'vhd', 'vhdx',
  'html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml',
]);

/** Largest file a download link accepts (the storage upload limit). */
export const FILE_SHARE_MAX_BYTES = 50 * 1024 * 1024;

/** Lowercase extension without the dot, or '' when the name has none. */
export function fileExtension(fileName: string): string {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function isBlockedFileName(fileName: string): boolean {
  return BLOCKED_FILE_EXTENSIONS.has(fileExtension(fileName));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A download link id (`event_file_share.id`), or null when the value is not a uuid. */
export function sanitizeShareId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

/** Resolves to the download page link of a share: `{{event.files_url;;id=<share id>}}`. */
export const FILES_URL_TAG_CODE = 'event.files_url';

export function filesLinkTagRaw(shareId: string): string {
  return `{{${FILES_URL_TAG_CODE};;id=${shareId}}}`;
}

/** Button text when the block has none. */
export const FILES_DEFAULT_LABELS: Record<Locale, string> = {
  en: 'Download files',
  da: 'Download filer',
  de: 'Dateien herunterladen',
  swe: 'Ladda ner filer',
};

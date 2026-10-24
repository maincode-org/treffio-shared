const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGBA_COLOR_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i;

function channelHex(channel: number): string {
  return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0');
}

/** Hex, or rgb()/rgba(). Anything else (names, url(), expressions) is rejected so it can be inlined safely. */
export function normalizeColor(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(RGBA_COLOR_PATTERN);
  if (!match) return null;
  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  if ([red, green, blue].some((channel) => !Number.isFinite(channel) || channel > 255)) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  const hex = `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
  if (alpha >= 1) return hex;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function isColor(value: string): boolean {
  return normalizeColor(value) !== null;
}

/** Solid hex for `bgcolor` attributes. Outlook ignores rgba() there. */
export function opaqueColor(value: string, fallback = '#ffffff'): string {
  const normalized = normalizeColor(value);
  if (!normalized) return fallback;
  if (normalized.startsWith('#')) return normalized;
  const match = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return fallback;
  return `#${channelHex(Number(match[1]))}${channelHex(Number(match[2]))}${channelHex(Number(match[3]))}`;
}

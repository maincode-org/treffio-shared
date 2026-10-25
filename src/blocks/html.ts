const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Escapes an attribute value but keeps `{{tags}}` readable for later resolution. */
export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const SAFE_URL_PATTERN = /^(?:https?:\/\/|mailto:|tel:|#|\/)/i;
const TAG_ONLY_PATTERN = /^\{\{([^{}]+)\}\}$/;

/** No quotes, parentheses, brackets, backslashes or spaces: the URL goes into attributes and CSS `url()`. */
const BACKGROUND_IMAGE_PATTERN = /^https?:\/\/[^\s"'()<>\\]{1,2000}$/i;

/** A background image URL, or null when it is not a plain http(s) URL that is safe to put into CSS. */
export function sanitizeBackgroundImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return BACKGROUND_IMAGE_PATTERN.test(trimmed) ? trimmed : null;
}

/** A link a recipient may click. Tags are allowed; javascript: and data: are not. */
export function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (TAG_ONLY_PATTERN.test(trimmed)) return trimmed;
  if (SAFE_URL_PATTERN.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
  return `https://${trimmed}`;
}

/** `{{code;text;params}}` when the whole value is a single tag. */
export function parseTagOnlyValue(value: string): { code: string; params: string | null } | null {
  const match = value.trim().match(TAG_ONLY_PATTERN);
  if (!match?.[1]) return null;
  const parts = match[1].split(';');
  const code = parts[0]?.trim() ?? '';
  if (!code) return null;
  const params = parts[2]?.trim() || null;
  return { code, params };
}

/** Text placed inside a `{{code;text}}` tag cannot contain the tag delimiters. */
export function toTagSafeText(value: string): string {
  return value.replace(/[{}]/g, '').replace(/;/g, ',').trim();
}

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the HTML shows nothing: no text, tags, images or rules. */
export function isBlankHtml(value: string | null | undefined): boolean {
  if (!value) return true;
  if (/\{\{[^}]+\}\}/.test(value)) return false;
  if (/<(img|hr|table|iframe|video)\b/i.test(value)) return false;
  return stripHtml(value).replace(/[\u200B-\u200D\uFEFF]/g, '').length === 0;
}

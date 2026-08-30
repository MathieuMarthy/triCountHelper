export const TRICOUNT_FEATURE_ENABLED = import.meta.env.VITE_TRICOUNT_ENABLED === 'true';

const RELAY_URL_FROM_BUILD = (
  (import.meta.env.VITE_TRICOUNT_RELAY_URL as string | undefined) ?? ''
).trim();

export const TRICOUNT_RELAY_URL_DEFAULT =
  RELAY_URL_FROM_BUILD === '' ? '/api/tricount' : RELAY_URL_FROM_BUILD;

export function resolveRelayUrl(override: string | undefined): string {
  const value = (override ?? '').trim();
  return value === '' ? TRICOUNT_RELAY_URL_DEFAULT : value;
}

export function isValidRelayUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const SHARE_URL = /tricount\.com\/(?:t\/)?([A-Za-z0-9]{6,})/;

export function parseShareCode(url: string): string | null {
  const match = SHARE_URL.exec(url.trim());
  return match ? (match[1] as string) : null;
}

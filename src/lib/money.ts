export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function parseAmountToCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/^[$€]+|[$€]+$/g, '')
    .replace(/^\+/, '');
  if (cleaned === '' || cleaned === '-') return null;

  const match = /^(-?)(\d*)(?:[.,](\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, wholeRaw, decimalRaw] = match;
  const whole = wholeRaw ?? '';
  if (whole === '' && (decimalRaw === undefined || decimalRaw === '')) return null;

  const decimals = (decimalRaw ?? '').padEnd(2, '0');
  const cents = Number(whole || '0') * 100 + Number(decimals || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

const CAD = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return CAD.format(cents / 100);
}

export function formatCentsPlain(cents: number): string {
  return centsToInput(cents);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

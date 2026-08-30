import { parseAmountToCents } from '../lib/money';
import {
  EMPTY_EXTRACTION,
  type ExtractedLine,
  type ExtractedTax,
  type ExtractionResult,
} from './types';

export type RawExtraction = {
  merchant?: unknown;
  purchaseDate?: unknown;
  subtotal?: unknown;
  total?: unknown;
  taxes?: unknown;
  lines?: unknown;
};

const CONFIDENCE_SURE = 95;
const CONFIDENCE_UNSURE = 50;

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asCents(value: unknown): number | null {
  const text = asString(value);
  return text === null ? null : parseAmountToCents(text);
}

export function parseRatePercent(value: unknown): number | null {
  const text = asString(value);
  if (text === null) return null;
  const rate = Number(text.replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(rate) || rate <= 0 || rate > 30) return null;
  return Math.round(rate * 1000) / 1000;
}

const TAX_ALIASES: Record<string, string> = {
  TPS: 'TPS',
  GST: 'TPS',
  TVQ: 'TVQ',
  QST: 'TVQ',
  TVH: 'TVH',
  HST: 'TVH',
  TVP: 'TVP',
  PST: 'TVP',
  RST: 'TVP',
};

export function canonicalTaxCode(label: string): string {
  const key = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  for (const [alias, code] of Object.entries(TAX_ALIASES)) {
    if (key.startsWith(alias)) return code;
  }
  return key === '' ? 'TAXE' : key.slice(0, 6);
}

function normalizeTaxes(raw: unknown): ExtractedTax[] {
  if (!Array.isArray(raw)) return [];
  const taxes: ExtractedTax[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const label = asString(record.label);
    const amountCents = asCents(record.amount);
    if (label === null || amountCents === null) continue;
    const code = canonicalTaxCode(label);
    const existing = taxes.find((tax) => tax.code === code);
    if (existing) {
      existing.amountCents += amountCents;
      continue;
    }
    taxes.push({ code, label, ratePercent: parseRatePercent(record.rate), amountCents });
  }
  return taxes;
}

function asQuantity(value: unknown): number {
  const quantity =
    typeof value === 'number' ? value : Number(asString(value)?.replace(',', '.') ?? Number.NaN);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return 1;
  return Math.round(quantity);
}

function asIsoDate(value: unknown): string | null {
  const text = asString(value);
  if (text === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeLine(raw: unknown): ExtractedLine | { discarded: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { discarded: JSON.stringify(raw) };
  }
  const record = raw as Record<string, unknown>;
  const label = asString(record.label);
  const totalCents = asCents(record.total);

  if (totalCents === null) {
    return { discarded: label ?? JSON.stringify(raw) };
  }

  const quantity = asQuantity(record.quantity);
  const unitFromModel = asCents(record.unitPrice);
  const unitPriceCents =
    unitFromModel !== null && unitFromModel * quantity === totalCents
      ? unitFromModel
      : Math.round(totalCents / quantity);

  return {
    label: label ?? 'Article',
    quantity,
    unitPriceCents,
    totalCents,
    taxCodes: record.taxable === false ? [] : null,
    confidence: record.uncertain === true ? CONFIDENCE_UNSURE : CONFIDENCE_SURE,
  };
}

export function normalizeExtraction(raw: unknown): ExtractionResult {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_EXTRACTION };
  const record = raw as RawExtraction;

  const lines: ExtractedLine[] = [];
  const discarded: string[] = [];

  if (Array.isArray(record.lines)) {
    for (const item of record.lines) {
      const normalized = normalizeLine(item);
      if ('discarded' in normalized) discarded.push(normalized.discarded);
      else lines.push(normalized);
    }
  }

  return {
    lines,
    taxes: normalizeTaxes(record.taxes),
    statedSubtotalCents: asCents(record.subtotal),
    statedTotalCents: asCents(record.total),
    merchant: asString(record.merchant),
    purchaseDate: asIsoDate(record.purchaseDate),
    discarded,
  };
}

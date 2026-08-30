import { formatCentsPlain } from './money';
import type { PersonTotals, Settlement } from './compute';
import type { Person, Receipt } from '../types';

export function formatFrenchDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function receiptTitle(receipt: Pick<Receipt, 'merchant' | 'purchaseDate' | 'createdAt'>): string {
  const merchant = receipt.merchant?.trim() || 'Ticket';
  const date = formatFrenchDate(receipt.purchaseDate ?? receipt.createdAt);
  return date ? `${merchant} — ${date}` : merchant;
}

export function buildSummaryText(
  receipt: Pick<Receipt, 'merchant' | 'purchaseDate' | 'createdAt'>,
  settlement: Settlement,
  people: readonly Person[],
): string {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Inconnu';
  const lines = [receiptTitle(receipt)];
  if (settlement.taxesTotalCents !== 0) {
    lines.push(
      `Sous-total : ${formatCentsPlain(settlement.subtotalCents)} $ · taxes : ${formatCentsPlain(
        settlement.taxesTotalCents,
      )} $`,
    );
  }
  if (settlement.tipCents !== 0) {
    lines.push(`Pourboire : ${formatCentsPlain(settlement.tipCents)} $`);
  }
  lines.push(`Total : ${formatCentsPlain(settlement.distributedTotalCents)} $`, '');
  for (const person of settlement.people) {
    if (person.totalCents === 0 && person.lineCount === 0) continue;
    lines.push(`${nameOf(person.personId)} : ${formatCentsPlain(person.totalCents)} $`);
  }
  return lines.join('\n');
}

export function buildDetailedText(
  receipt: Pick<Receipt, 'merchant' | 'purchaseDate' | 'createdAt'>,
  settlement: Settlement,
  people: readonly Person[],
): string {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Inconnu';
  const out = [receiptTitle(receipt), ''];
  for (const person of settlement.people) {
    if (person.totalCents === 0 && person.lineCount === 0) continue;
    out.push(`${nameOf(person.personId)} : ${formatCentsPlain(person.totalCents)} $`);
    for (const item of person.items) {
      out.push(`  ${item.label} — ${formatCentsPlain(item.amountCents)} $`);
    }
    out.push('');
  }
  out.push(`Total : ${formatCentsPlain(settlement.distributedTotalCents)} $`);
  return out.join('\n');
}

export function personAmountText(person: PersonTotals): string {
  return formatCentsPlain(person.totalCents);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

import { describe, expect, it } from 'vitest';
import { buildDetailedText, buildSummaryText, receiptTitle } from './export';
import { settle } from './compute';
import type { Person, ReceiptLine, ReceiptTax } from '../types';

const people: Person[] = [
  { id: 'p1', name: 'Mathieu' },
  { id: 'p2', name: 'Léa' },
  { id: 'p3', name: 'Absent' },
];

const line = (id: string, label: string, cents: number, ids: string[]): ReceiptLine => ({
  id,
  label,
  quantity: 1,
  unitPriceCents: cents,
  totalCents: cents,
  taxCodes: null,
  assignments: ids.map((personId) => ({ personId, shares: 1 })),
  confidence: 100,
  isManual: false,
});

const taxes: ReceiptTax[] = [
  { id: 'tps', code: 'TPS', label: 'TPS', ratePercent: 5, amountCents: 250 },
  { id: 'tvq', code: 'TVQ', label: 'TVQ', ratePercent: 9.975, amountCents: 499 },
];

const receipt = {
  merchant: 'Chez Victoire',
  purchaseDate: '2026-03-14',
  createdAt: '2026-03-14T18:42:00.000Z',
  lines: [line('l1', 'Tartare', 3000, ['p1']), line('l2', 'Pâtes', 2000, ['p2'])],
  taxes,
  adjustments: [],
  statedTotalCents: 5749,
  tipCents: 900,
  tipBasis: 'subtotal' as const,
};

describe('export texte', () => {
  const settlement = settle(receipt, people);

  it('produit un récapitulatif prêt à coller, taxes et pourboire compris', () => {
    expect(buildSummaryText(receipt, settlement, people)).toBe(
      [
        'Chez Victoire — 14/03/2026',
        'Sous-total : 50,00 $ · taxes : 7,49 $',
        'Pourboire : 9,00 $',
        'Total : 66,49 $',
        '',
        'Mathieu : 39,89 $',
        'Léa : 26,60 $',
      ].join('\n'),
    );
  });

  it('les montants annoncés retombent sur le total', () => {
    const total = settlement.people.reduce((sum, person) => sum + person.totalCents, 0);
    expect(total).toBe(6649);
  });

  it('omet les personnes qui ne doivent rien', () => {
    expect(buildSummaryText(receipt, settlement, people)).not.toContain('Absent');
  });

  it('détaille lignes, taxes et pourboire de chacun', () => {
    const text = buildDetailedText(receipt, settlement, people);
    expect(text).toContain('  Tartare — 30,00 $');
    expect(text).toContain('  TPS — ');
    expect(text).toContain('  Pourboire — 5,40 $');
  });

  it('tait le pourboire quand il n’y en a pas', () => {
    const sansPourboire = { ...receipt, tipCents: 0 };
    const text = buildSummaryText(sansPourboire, settle(sansPourboire, people), people);
    expect(text).not.toContain('Pourboire');
    expect(text).toContain('Total : 57,49 $');
  });

  it('se rabat sur la date de création faute de date d’achat', () => {
    expect(receiptTitle({ ...receipt, purchaseDate: null })).toBe('Chez Victoire — 14/03/2026');
    expect(receiptTitle({ merchant: null, purchaseDate: null, createdAt: 'invalide' })).toBe(
      'Ticket',
    );
  });
});

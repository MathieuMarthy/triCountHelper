import { describe, expect, it } from 'vitest';
import { canonicalTaxCode, normalizeExtraction, parseRatePercent } from './normalize';

describe('normalizeExtraction — cas nominal', () => {
  const raw = {
    merchant: 'IGA EXTRA',
    purchaseDate: '2026-03-14',
    subtotal: '16,95',
    total: '19,20',
    taxes: [
      { label: 'TPS', rate: '5', amount: '0,75' },
      { label: 'TVQ', rate: '9,975', amount: '1,50' },
    ],
    lines: [
      { label: 'PAIN TRANCHE', quantity: 1, unitPrice: '3,49', total: '3,49', taxable: false },
      { label: 'YOGOURT NATURE', quantity: 2, unitPrice: '1,50', total: '3,00', taxable: false },
      { label: 'SAVON A VAISSELLE', quantity: 1, unitPrice: '10,46', total: '10,46', taxable: true },
    ],
  };

  it('convertit les montants en centimes entiers', () => {
    const result = normalizeExtraction(raw);
    expect(result.lines.map((l) => l.totalCents)).toEqual([349, 300, 1046]);
    expect(result.statedSubtotalCents).toBe(1695);
    expect(result.statedTotalCents).toBe(1920);
  });

  it('lit les taxes du pied de ticket', () => {
    const result = normalizeExtraction(raw);
    expect(result.taxes).toEqual([
      { code: 'TPS', label: 'TPS', ratePercent: 5, amountCents: 75 },
      { code: 'TVQ', label: 'TVQ', ratePercent: 9.975, amountCents: 150 },
    ]);
  });

  it('marque les lignes détaxées, et seulement celles-là', () => {
    const [pain, yogourt, savon] = normalizeExtraction(raw).lines;
    expect(pain?.taxCodes).toEqual([]);
    expect(yogourt?.taxCodes).toEqual([]);
    expect(savon?.taxCodes).toBeNull();
  });

  it('conserve quantité et prix unitaire', () => {
    const [, yogourt] = normalizeExtraction(raw).lines;
    expect(yogourt).toMatchObject({ quantity: 2, unitPriceCents: 150 });
  });

  it('lit le commerçant et la date', () => {
    const result = normalizeExtraction(raw);
    expect(result.merchant).toBe('IGA EXTRA');
    expect(result.purchaseDate).toBe('2026-03-14');
  });

  it('sous-total + taxes retombe sur le total imprimé', () => {
    const result = normalizeExtraction(raw);
    const taxes = result.taxes.reduce((sum, tax) => sum + tax.amountCents, 0);
    expect((result.statedSubtotalCents ?? 0) + taxes).toBe(result.statedTotalCents);
  });
});

describe('normalizeExtraction — sorties fautives du modèle', () => {
  it('écarte une ligne sans montant lisible plutôt que d’y mettre zéro', () => {
    const result = normalizeExtraction({
      lines: [
        { label: 'PAIN', total: '1,05' },
        { label: 'ILLISIBLE', total: 'environ 3 euros' },
        { label: 'RIEN' },
      ],
    });
    expect(result.lines).toHaveLength(1);
    expect(result.discarded).toEqual(['ILLISIBLE', 'RIEN']);
  });

  it('accepte un nombre là où une chaîne était demandée', () => {
    const result = normalizeExtraction({ lines: [{ label: 'PAIN', total: 1.05 }] });
    expect(result.lines[0]?.totalCents).toBe(105);
  });

  it('recalcule le prix unitaire quand il ne tombe pas sur le total', () => {
    const result = normalizeExtraction({
      lines: [{ label: 'POMMES', quantity: 3, unitPrice: '0,99', total: '2,98' }],
    });
    expect(result.lines[0]).toMatchObject({ totalCents: 298, unitPriceCents: 99 });
  });

  it('garde les remises imprimées en négatif', () => {
    const result = normalizeExtraction({ lines: [{ label: 'REMISE FIDELITE', total: '-2,50' }] });
    expect(result.lines[0]?.totalCents).toBe(-250);
  });

  it('ramène une quantité aberrante à 1', () => {
    const result = normalizeExtraction({
      lines: [
        { label: 'A', total: '1,00', quantity: 0 },
        { label: 'B', total: '1,00', quantity: -3 },
        { label: 'C', total: '1,00', quantity: 5000 },
        { label: 'D', total: '1,00', quantity: 2.4 },
      ],
    });
    expect(result.lines.map((l) => l.quantity)).toEqual([1, 1, 1, 2]);
  });

  it('marque les lignes que le modèle dit incertaines', () => {
    const result = normalizeExtraction({
      lines: [
        { label: 'SUR', total: '1,00' },
        { label: 'DOUTEUX', total: '2,00', uncertain: true },
      ],
    });
    expect(result.lines[0]?.confidence).toBeGreaterThanOrEqual(70);
    expect(result.lines[1]?.confidence).toBeLessThan(70);
  });

  it('refuse une date inventée ou mal formée', () => {
    expect(normalizeExtraction({ purchaseDate: '14/03/2026' }).purchaseDate).toBeNull();
    expect(normalizeExtraction({ purchaseDate: '1789-07-14' }).purchaseDate).toBeNull();
    expect(normalizeExtraction({ purchaseDate: '2026-13-45' }).purchaseDate).toBeNull();
    expect(normalizeExtraction({ purchaseDate: '2026-03-14' }).purchaseDate).toBe('2026-03-14');
  });

  it('survit à une réponse vide, nulle ou d’un autre type', () => {
    for (const value of [null, undefined, 42, 'texte', [], {}]) {
      const result = normalizeExtraction(value);
      expect(result.lines).toEqual([]);
      expect(result.statedTotalCents).toBeNull();
    }
  });

  it('ne perd jamais un montant dans un flottant', () => {
    const result = normalizeExtraction({
      lines: [
        { label: 'A', total: '0,07' },
        { label: 'B', total: '29,29' },
        { label: 'C', total: '1234,56' },
      ],
    });
    expect(result.lines.map((l) => l.totalCents)).toEqual([7, 2929, 123456]);
  });
});

describe('taxes', () => {
  it('ramène les libellés anglais et français au même code', () => {
    expect(canonicalTaxCode('TPS')).toBe('TPS');
    expect(canonicalTaxCode('GST')).toBe('TPS');
    expect(canonicalTaxCode('TVQ 9,975%')).toBe('TVQ');
    expect(canonicalTaxCode('QST')).toBe('TVQ');
    expect(canonicalTaxCode('HST')).toBe('TVH');
    expect(canonicalTaxCode('PST')).toBe('TVP');
  });

  it('additionne une taxe imprimée deux fois au lieu d’en choisir une', () => {
    const result = normalizeExtraction({
      taxes: [
        { label: 'TPS', amount: '1,00' },
        { label: 'GST', amount: '0,50' },
      ],
      lines: [],
    });
    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0]?.amountCents).toBe(150);
  });

  it('écarte une taxe sans montant lisible', () => {
    const result = normalizeExtraction({
      taxes: [{ label: 'TPS' }, { label: 'TVQ', amount: 'illisible' }, { amount: '1,00' }],
      lines: [],
    });
    expect(result.taxes).toEqual([]);
  });

  it('accepte une taxe à zéro : c’est une information, pas une absence', () => {
    const result = normalizeExtraction({ taxes: [{ label: 'TPS', amount: '0,00' }], lines: [] });
    expect(result.taxes[0]?.amountCents).toBe(0);
  });

  it('survit à des taxes qui ne sont pas un tableau', () => {
    expect(normalizeExtraction({ taxes: 'TPS 1,00', lines: [] }).taxes).toEqual([]);
  });
});

describe('parseRatePercent', () => {
  it.each([
    ['5', 5],
    ['9,975', 9.975],
    ['13 %', 13],
    ['14.975', 14.975],
  ])('lit « %s »', (input, expected) => {
    expect(parseRatePercent(input)).toBe(expected);
  });

  it.each(['', '0', '-5', '95', 'A', null, {}])('écarte « %s »', (input) => {
    expect(parseRatePercent(input)).toBeNull();
  });
});

describe('montants au centime', () => {
  const lineOf = (raw: object) =>
    normalizeExtraction({ lines: [{ label: 'Article', quantity: 1, ...raw }] });

  it('accepte les nombres JSON autant que les chaînes', () => {
    expect(lineOf({ total: 10.5 }).lines[0]?.totalCents).toBe(1050);
    expect(lineOf({ total: '10,50' }).lines[0]?.totalCents).toBe(1050);
  });

  it('ne perd pas une ligne sur un artefact de virgule flottante', () => {
    // Ce qu'un 3,33 devient parfois une fois passé par du JSON.
    const result = lineOf({ total: 3.3300000000000005 });
    expect(result.lines[0]?.totalCents).toBe(333);
    expect(result.discarded).toEqual([]);
  });

  it('arrondit au centime au lieu de jeter la ligne', () => {
    expect(lineOf({ total: 10.999 }).lines[0]?.totalCents).toBe(1100);
    expect(lineOf({ total: '10,994' }).lines[0]?.totalCents).toBe(1099);
  });

  it('écarte toujours ce qui n’est pas un montant', () => {
    expect(lineOf({ total: 'gratuit' }).lines).toHaveLength(0);
    expect(lineOf({ total: Number.NaN }).lines).toHaveLength(0);
  });

  it('applique la même règle au total et au sous-total lus', () => {
    const result = normalizeExtraction({ subtotal: 16.949999999999999, total: 19.2 });
    expect(result.statedSubtotalCents).toBe(1695);
    expect(result.statedTotalCents).toBe(1920);
  });
});

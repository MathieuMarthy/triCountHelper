import { describe, expect, it } from 'vitest';
import { splitCents } from './split';
import { sumCents } from './money';

describe('splitCents — méthode du plus fort reste', () => {
  it('conserve un centime partagé entre trois personnes', () => {
    const parts = splitCents(1, [1, 1, 1]);
    expect(sumCents(parts)).toBe(1);
    expect(parts).toEqual([1, 0, 0]);
  });

  it('partage 10,00 € en trois : 3,34 / 3,33 / 3,33', () => {
    const parts = splitCents(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(sumCents(parts)).toBe(1000);
  });

  it('répartit 47,82 € en 70/30', () => {
    const parts = splitCents(4782, [70, 30]);
    expect(parts).toEqual([3347, 1435]);
    expect(sumCents(parts)).toBe(4782);
  });

  it('répartit une remise négative sans perdre de centime', () => {
    const parts = splitCents(-250, [1, 1, 1]);
    expect(sumCents(parts)).toBe(-250);
    expect(parts).toEqual([-84, -83, -83]);
  });

  it('départage les restes égaux par un ordre stable, pas au hasard', () => {
    const a = splitCents(1000, [1, 1, 1]);
    const b = splitCents(1000, [1, 1, 1]);
    expect(a).toEqual(b);
    const withTieBreak = splitCents(1000, [1, 1, 1], { tieBreak: [2, 1, 0] });
    expect(withTieBreak).toEqual([333, 333, 334]);
  });

  it('tombe sur des parts égales quand les poids sont tous nuls', () => {
    expect(splitCents(300, [0, 0, 0])).toEqual([100, 100, 100]);
  });

  it('ignore les poids négatifs ou non finis', () => {
    const parts = splitCents(1000, [1, -5, Number.NaN]);
    expect(parts).toEqual([1000, 0, 0]);
  });

  it('gère un montant nul et une liste vide', () => {
    expect(splitCents(0, [1, 2])).toEqual([0, 0]);
    expect(splitCents(500, [])).toEqual([]);
  });

  it('refuse un montant non entier', () => {
    expect(() => splitCents(10.5, [1])).toThrow();
  });

  it('conserve toujours le total, sur 2 000 tirages aléatoires', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let n = 0; n < 2000; n += 1) {
      const total = Math.floor(rand() * 200000) - 50000;
      const count = 1 + Math.floor(rand() * 8);
      const weights = Array.from({ length: count }, () => 1 + Math.floor(rand() * 100));
      const parts = splitCents(total, weights);
      expect(sumCents(parts)).toBe(total);
      expect(parts).toHaveLength(count);
    }
  });
});

export type SplitOptions = {
  tieBreak?: number[];
};

export function splitCents(
  totalCents: number,
  weights: readonly number[],
  options: SplitOptions = {},
): number[] {
  const count = weights.length;
  if (count === 0) return [];
  if (!Number.isInteger(totalCents)) {
    throw new Error(`splitCents attend un entier de centimes, reçu ${totalCents}`);
  }

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  let weightSum = safeWeights.reduce((acc, w) => acc + w, 0);
  if (weightSum <= 0) {
    safeWeights.fill(1);
    weightSum = count;
  }

  const sign = totalCents < 0 ? -1 : 1;
  const absTotal = Math.abs(totalCents);

  const base = new Array<number>(count);
  const remainder = new Array<number>(count);
  let distributed = 0;

  for (let i = 0; i < count; i += 1) {
    const numerator = absTotal * (safeWeights[i] as number);
    const share = Math.floor(numerator / weightSum);
    base[i] = share;
    remainder[i] = numerator - share * weightSum;
    distributed += share;
  }

  let leftover = absTotal - distributed;

  const order = options.tieBreak ?? safeWeights.map((_, i) => i);
  const ranking = safeWeights
    .map((_, i) => i)
    .sort((a, b) => {
      const diff = (remainder[b] as number) - (remainder[a] as number);
      if (diff !== 0) return diff;
      return (order[a] as number) - (order[b] as number);
    });

  for (let i = 0; leftover > 0 && i < ranking.length; i += 1) {
    const winner = ranking[i] as number;
    base[winner] = (base[winner] as number) + 1;
    leftover -= 1;
  }

  if (leftover !== 0) {
    throw new Error('splitCents: reste non distribué, invariant rompu');
  }

  return sign === 1 ? base : base.map((cents) => -cents);
}

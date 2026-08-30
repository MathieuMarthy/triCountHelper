import type { Person } from '../types';

export const PERSON_COLORS = [
  'var(--person-1)',
  'var(--person-2)',
  'var(--person-3)',
  'var(--person-4)',
  'var(--person-5)',
  'var(--person-6)',
] as const;

export function colorForIndex(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length] as string;
}

export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return (words[0] as string).slice(0, 2).toUpperCase();
  }
  return `${(words[0] as string)[0]}${(words[1] as string)[0]}`.toUpperCase();
}

export function personById(people: readonly Person[], id: string): Person | undefined {
  return people.find((p) => p.id === id);
}

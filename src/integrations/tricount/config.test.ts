import { describe, expect, it } from 'vitest';
import { TRICOUNT_RELAY_URL_DEFAULT, isValidRelayUrl, parseShareCode, resolveRelayUrl } from './config';

describe('parseShareCode', () => {
  it.each([
    ['https://tricount.com/t/ABC12345', 'ABC12345'],
    ['https://www.tricount.com/t/abcdef123', 'abcdef123'],
    ['tricount.com/t/XYZ98765', 'XYZ98765'],
  ])('extrait le code de « %s »', (url, expected) => {
    expect(parseShareCode(url)).toBe(expected);
  });

  it.each(['', 'https://example.com/t/ABC12345', 'https://tricount.com/', 'n’importe quoi'])(
    'refuse « %s »',
    (url) => {
      expect(parseShareCode(url)).toBeNull();
    },
  );
});

describe('resolveRelayUrl', () => {
  it('retient l’adresse configurée sur l’appareil', () => {
    expect(resolveRelayUrl('https://relais.exemple.net/tricount')).toBe(
      'https://relais.exemple.net/tricount',
    );
  });

  it('ignore les espaces autour de l’adresse', () => {
    expect(resolveRelayUrl('  https://relais.exemple.net/tricount  ')).toBe(
      'https://relais.exemple.net/tricount',
    );
  });

  it.each<[string, string | undefined]>([
    ['vide', ''],
    ['blanc', '   '],
    ['absent', undefined],
  ])('revient au défaut du build quand le réglage est %s', (_cas, value) => {
    expect(resolveRelayUrl(value)).toBe(TRICOUNT_RELAY_URL_DEFAULT);
  });
});

describe('isValidRelayUrl', () => {
  it.each([
    '',
    '/api/tricount',
    'https://relais.exemple.net/tricount',
    'http://192.168.1.20:8787/api/tricount',
  ])('accepte « %s »', (value) => {
    expect(isValidRelayUrl(value)).toBe(true);
  });

  it.each(['relais.exemple.net', 'ftp://relais.exemple.net', '//relais.exemple.net', 'n’importe quoi'])(
    'refuse « %s »',
    (value) => {
      expect(isValidRelayUrl(value)).toBe(false);
    },
  );
});

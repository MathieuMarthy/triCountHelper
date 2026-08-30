import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushExpense, type ExpensePayload } from './client';

const PAYLOAD: ExpensePayload = {
  shareUrl: 'https://tricount.com/t/ABC12345',
  description: 'Chez Victoire — 14/03/2026',
  totalCents: 6649,
  payerName: 'Mathieu',
  shares: [
    { name: 'Mathieu', amountCents: 3989 },
    { name: 'Léa', amountCents: 2660 },
  ],
  date: '2026-03-14',
};

function relayResponds(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

function lastCall(): [string, RequestInit] {
  const mock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } };
  return mock.mock.calls[0] as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pushExpense', () => {
  it('appelle l’adresse configurée et joint le jeton', async () => {
    vi.stubGlobal('fetch', relayResponds({ ok: true, value: { id: 'e1' } }));

    const result = await pushExpense(PAYLOAD, {
      url: 'https://relais.exemple.net/tricount',
      token: 'jeton-secret',
    });

    expect(result).toEqual({ ok: true, value: { id: 'e1' } });
    const [url, init] = lastCall();
    expect(url).toBe('https://relais.exemple.net/tricount');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jeton-secret');
  });

  it('n’envoie aucun en-tête d’authentification sans jeton', async () => {
    vi.stubGlobal('fetch', relayResponds({ ok: true, value: { id: 'e1' } }));

    await pushExpense(PAYLOAD, { url: '/api/tricount', token: '   ' });

    const [, init] = lastCall();
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('nomme le refus d’authentification plutôt que l’échec générique', async () => {
    vi.stubGlobal('fetch', relayResponds({ ok: false }, 401));

    const result = await pushExpense(PAYLOAD, { url: '/api/tricount', token: 'périmé' });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('jeton') });
  });

  it('refuse d’appeler sans adresse de relais', async () => {
    const fetchSpy = relayResponds({ ok: true, value: { id: 'e1' } });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await pushExpense(PAYLOAD, { url: '  ', token: 'jeton' });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('n’envoie rien quand la répartition ne tombe pas sur le total', async () => {
    const fetchSpy = relayResponds({ ok: true, value: { id: 'e1' } });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await pushExpense(
      { ...PAYLOAD, totalCents: 6650 },
      { url: '/api/tricount', token: '' },
    );

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { parseShareCode } from './config';

export type TricountResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export type RelayConnection = {
  url: string;
  token: string;
};

const FAILURE = "L'envoi automatique n'a pas fonctionné. Utilisez la copie manuelle.";

const UNAUTHORIZED =
  "Le relais a refusé l'authentification. Vérifiez le jeton dans les réglages.";

async function callRelay<T>(
  body: unknown,
  connection: RelayConnection,
  timeoutMs = 15000,
): Promise<TricountResult<T>> {
  const url = connection.url.trim();
  if (url === '') return { ok: false, reason: "Aucune adresse de relais n'est configurée." };

  const token = connection.token.trim();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== '') headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      value?: T;
      reason?: string;
    } | null;
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: payload?.reason ?? UNAUTHORIZED };
    }
    if (!response.ok || !payload?.ok) return { ok: false, reason: payload?.reason ?? FAILURE };
    if (payload.value === undefined) return { ok: false, reason: FAILURE };
    return { ok: true, value: payload.value };
  } catch {
    return { ok: false, reason: FAILURE };
  } finally {
    clearTimeout(timer);
  }
}

export type ExpensePayload = {
  shareUrl: string;
  description: string;
  totalCents: number;
  payerName: string;
  shares: { name: string; amountCents: number }[];
  date: string | null;
};

export async function pushExpense(
  payload: ExpensePayload,
  connection: RelayConnection,
): Promise<TricountResult<{ id: string }>> {
  const code = parseShareCode(payload.shareUrl);
  if (!code) return { ok: false, reason: 'Lien de partage invalide.' };
  const total = payload.shares.reduce((sum, share) => sum + share.amountCents, 0);
  if (total !== payload.totalCents) {
    return { ok: false, reason: 'La répartition ne correspond pas au total. Envoi annulé.' };
  }
  return callRelay<{ id: string }>({ action: 'expense', code, ...payload }, connection);
}

import { useState } from 'react';
import { Button } from '../../ui/Button';
import { useAppStore } from '../../store/useAppStore';
import { receiptTitle } from '../../lib/export';
import { personById } from '../../lib/people';
import type { Settlement } from '../../lib/compute';
import type { Receipt } from '../../types';
import { TRICOUNT_FEATURE_ENABLED, parseShareCode, resolveRelayUrl } from './config';
import { pushExpense } from './client';

type TricountPanelProps = {
  receipt: Receipt;
  settlement: Settlement;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string };

export function TricountPanel({ receipt, settlement }: TricountPanelProps) {
  const people = useAppStore((s) => s.people);
  const settings = useAppStore((s) => s.settings);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const named = settlement.people
    .map((entry) => ({ ...entry, name: personById(people, entry.personId)?.name ?? '' }))
    .filter((entry) => entry.name !== '');

  const [payer, setPayer] = useState<string>(named[0]?.name ?? '');

  if (!TRICOUNT_FEATURE_ENABLED || !settings.tricountEnabled) return null;
  if (parseShareCode(settings.tricountShareUrl) === null) return null;

  const activePayer = named.some((entry) => entry.name === payer)
    ? payer
    : (named[0]?.name ?? '');

  const shares = named
    .filter((entry) => entry.totalCents !== 0)
    .map((entry) => ({ name: entry.name, amountCents: entry.totalCents }));

  const send = async () => {
    setStatus({ kind: 'busy' });
    const result = await pushExpense(
      {
        shareUrl: settings.tricountShareUrl,
        description: receiptTitle(receipt),
        totalCents: settlement.distributedTotalCents,
        payerName: activePayer,
        shares,
        date: receipt.purchaseDate,
      },
      {
        url: resolveRelayUrl(settings.tricountRelayUrl),
        token: settings.tricountToken,
      },
    );
    setStatus(result.ok ? { kind: 'done' } : { kind: 'failed', message: result.reason });
  };

  return (
    <section className="section">
      <h2>Tricount</h2>
      <p className="muted">
        Envoi expérimental : une dépense unique, répartie selon les montants ci-dessus. Les
        participants sont retrouvés par leur nom dans le tricount.
      </p>
      <label className="field">
        <span className="field__label">Qui a payé</span>
        <select value={activePayer} onChange={(event) => setPayer(event.target.value)}>
          {named.map((entry) => (
            <option key={entry.personId} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="primary"
        full
        disabled={status.kind === 'busy' || shares.length === 0 || activePayer === ''}
        onClick={() => void send()}
      >
        {status.kind === 'busy' ? 'Envoi…' : 'Envoyer vers Tricount'}
      </Button>
      {status.kind === 'done' ? <p className="muted">Dépense envoyée.</p> : null}
      {status.kind === 'failed' ? <p className="warnText">{status.message}</p> : null}
    </section>
  );
}

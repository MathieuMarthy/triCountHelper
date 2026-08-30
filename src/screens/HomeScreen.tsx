import { useMemo, useState, type ReactNode } from 'react';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { useAppStore } from '../store/useAppStore';
import { receiptTotal } from '../lib/compute';
import { formatCents } from '../lib/money';
import { formatFrenchDate } from '../lib/export';
import { useLongPress } from '../hooks/useLongPress';
import type { Receipt } from '../types';

function HistoryButton({
  onOpen,
  onLongPress,
  children,
}: {
  onOpen: () => void;
  onLongPress: () => void;
  children: ReactNode;
}) {
  const press = useLongPress({ onLongPress, onClick: onOpen });
  return (
    <button type="button" className="list__main" {...press}>
      {children}
    </button>
  );
}

function participantCount(receipt: Receipt): number {
  const ids = new Set<string>();
  for (const line of receipt.lines) {
    for (const assignment of line.assignments) ids.add(assignment.personId);
  }
  return ids.size;
}

export function HomeScreen() {
  const receipts = useAppStore((s) => s.receipts);
  const navigate = useAppStore((s) => s.navigate);
  const createReceipt = useAppStore((s) => s.createReceipt);
  const removeReceipt = useAppStore((s) => s.removeReceipt);
  const [pendingDelete, setPendingDelete] = useState<Receipt | null>(null);

  const sorted = useMemo(
    () => [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [receipts],
  );

  const start = async (manual: boolean) => {
    const receipt = await createReceipt(
      manual ? { step: 'verify', imageBlobKey: '' } : { step: 'capture' },
    );
    navigate({ name: 'receipt', id: receipt.id, step: receipt.step });
  };

  return (
    <Screen
      title="SplitTicket"
      action={
        <button
          type="button"
          className="linkButton"
          onClick={() => navigate({ name: 'settings' })}
        >
          Réglages
        </button>
      }
      footer={
        <>
          <Button variant="primary" full onClick={() => void start(false)}>
            Nouveau ticket
          </Button>
          <button type="button" className="linkButton linkButton--center" onClick={() => void start(true)}>
            Saisir un ticket à la main
          </button>
        </>
      }
    >
      {sorted.length === 0 ? (
        <p className="empty">
          Aucun ticket pour l’instant. Photographiez-en un, corrigez les lignes, répartissez.
        </p>
      ) : (
        <ul className="list">
          {sorted.map((receipt) => {
            const people = participantCount(receipt);
            return (
              <li key={receipt.id} className="list__row">
                <HistoryButton
                  onOpen={() => navigate({ name: 'receipt', id: receipt.id, step: receipt.step })}
                  onLongPress={() => setPendingDelete(receipt)}
                >
                  <span className="list__title">
                    {receipt.merchant?.trim() || 'Ticket sans nom'}
                    {receipt.status === 'settled' ? (
                      <span className="tag">réglé</span>
                    ) : null}
                  </span>
                  <span className="list__meta">
                    {formatFrenchDate(receipt.purchaseDate ?? receipt.createdAt)}
                    {' · '}
                    {receipt.lines.length} ligne{receipt.lines.length > 1 ? 's' : ''}
                    {people > 0 ? ` · ${people} participant${people > 1 ? 's' : ''}` : ''}
                  </span>
                </HistoryButton>
                <span className="list__amount num">{formatCents(receiptTotal(receipt))}</span>
                <button
                  type="button"
                  className="iconButton iconButton--quiet"
                  aria-label={`Supprimer ${receipt.merchant ?? 'ce ticket'}`}
                  onClick={() => setPendingDelete(receipt)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={pendingDelete !== null}
        title="Supprimer ce ticket"
        onClose={() => setPendingDelete(null)}
        footer={
          <div className="row row--gap">
            <Button full onClick={() => setPendingDelete(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                if (pendingDelete) void removeReceipt(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Supprimer
            </Button>
          </div>
        }
      >
        <p className="muted">
          {pendingDelete?.merchant?.trim() || 'Ce ticket'} et sa photo seront effacés
          définitivement de cet appareil.
        </p>
      </Sheet>
    </Screen>
  );
}

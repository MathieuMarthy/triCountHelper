import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { getImage } from '../db';
import { ExtractionError, extractWithGemini } from '../extraction/gemini';
import { uid } from '../lib/id';
import { useAppStore } from '../store/useAppStore';
import type { Receipt, ReceiptLine } from '../types';

type ProcessingScreenProps = {
  receipt: Receipt;
  onBack: () => void;
  onDone: () => void;
};

type Phase =
  | { kind: 'working'; label: string }
  | { kind: 'error'; message: string; retryable: boolean };

export function ProcessingScreen({ receipt, onBack, onDone }: ProcessingScreenProps) {
  const updateReceipt = useAppStore((s) => s.updateReceipt);
  const settings = useAppStore((s) => s.settings);
  const navigate = useAppStore((s) => s.navigate);
  const [phase, setPhase] = useState<Phase>({ kind: 'working', label: 'Chargement de la photo' });
  const started = useRef(false);

  const toManualEntry = useCallback(() => {
    updateReceipt(receipt.id, { step: 'verify' });
    onDone();
  }, [receipt.id, updateReceipt, onDone]);

  const run = useCallback(async () => {
    setPhase({ kind: 'working', label: 'Chargement de la photo' });
    try {
      const image = await getImage(receipt.imageBlobKey);
      if (!image) throw new ExtractionError("La photo n'est plus disponible.", false);

      const result = await extractWithGemini(image, {
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        onProgress: ({ label }) => setPhase({ kind: 'working', label }),
      });

      const lines: ReceiptLine[] = result.lines.map((line) => ({
        id: uid(),
        label: line.label,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.totalCents,
        taxCodes: line.taxCodes,
        assignments: [],
        confidence: line.confidence,
        isManual: false,
      }));

      updateReceipt(receipt.id, (current) => ({
        ...current,
        lines,
        taxes: result.taxes.map((tax) => ({ ...tax, id: uid() })),
        merchant: current.merchant ?? result.merchant,
        purchaseDate: current.purchaseDate ?? result.purchaseDate,
        statedSubtotalCents: result.statedSubtotalCents,
        statedTotalCents: result.statedTotalCents,
        step: 'verify',
      }));
      onDone();
    } catch (error) {
      setPhase({
        kind: 'error',
        message:
          error instanceof ExtractionError ? error.message : "La lecture n'a pas abouti.",
        retryable: error instanceof ExtractionError ? error.retryable : true,
      });
    }
  }, [receipt.id, receipt.imageBlobKey, settings.geminiApiKey, settings.geminiModel, updateReceipt, onDone]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const missingKey = settings.geminiApiKey.trim() === '';

  return (
    <Screen title="Lecture" onBack={onBack}>
      {phase.kind === 'error' ? (
        <div className="stack">
          <p className="warnText">{phase.message}</p>
          <p className="muted">
            La saisie manuelle reste disponible : les lignes se corrigent aussi vite qu’elles
            se tapent.
          </p>
          <div className="row row--gap">
            {phase.retryable ? (
              <Button full onClick={() => void run()}>
                Réessayer
              </Button>
            ) : null}
            {missingKey ? (
              <Button full onClick={() => navigate({ name: 'settings' })}>
                Ouvrir les réglages
              </Button>
            ) : null}
            <Button variant="primary" full onClick={toManualEntry}>
              Saisir à la main
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack stack--center">
          <p className="progress__label">{phase.label}</p>
          <div className="progress" role="progressbar" aria-label={phase.label}>
            <div className="progress__bar progress__bar--pulse" />
          </div>
          <p className="muted">
            La photo est envoyée au service de lecture. Comptez quelques secondes.
          </p>
        </div>
      )}
    </Screen>
  );
}

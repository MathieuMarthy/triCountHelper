import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ReceiptStep } from '../types';
import { CaptureScreen } from './CaptureScreen';
import { ProcessingScreen } from './ProcessingScreen';
import { VerifyScreen } from './VerifyScreen';
import { AssignScreen } from './AssignScreen';
import { ResultsScreen } from './ResultsScreen';

type ReceiptFlowProps = { receiptId: string; step: ReceiptStep };

export function ReceiptFlow({ receiptId, step }: ReceiptFlowProps) {
  const receipt = useAppStore((s) => s.receipts.find((r) => r.id === receiptId));
  const navigate = useAppStore((s) => s.navigate);
  const updateReceipt = useAppStore((s) => s.updateReceipt);

  useEffect(() => {
    if (receipt && receipt.step !== step) updateReceipt(receiptId, { step });
  }, [receipt, receiptId, step, updateReceipt]);

  useEffect(() => {
    if (!receipt) navigate({ name: 'home' });
  }, [receipt, navigate]);

  if (!receipt) return null;

  const goTo = (next: ReceiptStep) => navigate({ name: 'receipt', id: receiptId, step: next });
  const goHome = () => navigate({ name: 'home' });

  switch (step) {
    case 'capture':
      return (
        <CaptureScreen
          receipt={receipt}
          onBack={goHome}
          onDone={() => goTo('processing')}
          onSkip={receipt.lines.length > 0 ? () => goTo('verify') : undefined}
        />
      );
    case 'processing':
      return (
        <ProcessingScreen
          receipt={receipt}
          onBack={() => goTo('capture')}
          onDone={() => goTo('verify')}
        />
      );
    case 'verify':
      return (
        <VerifyScreen
          receipt={receipt}
          onBack={() => (receipt.imageBlobKey ? goTo('capture') : goHome())}
          onDone={() => goTo('assign')}
        />
      );
    case 'assign':
      return (
        <AssignScreen receipt={receipt} onBack={() => goTo('verify')} onDone={() => goTo('results')} />
      );
    case 'results':
      return <ResultsScreen receipt={receipt} onBack={() => goTo('assign')} onHome={goHome} />;
    default:
      return null;
  }
}

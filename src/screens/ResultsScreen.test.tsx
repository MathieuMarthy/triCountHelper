import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAllData, putPerson, putReceipt } from '../db';
import { emptyReceipt, useAppStore } from '../store/useAppStore';
import { DEFAULT_SETTINGS, type Assignment, type ReceiptLine } from '../types';

function lineOf(id: string, label: string, totalCents: number, assignments: Assignment[]): ReceiptLine {
  return {
    id,
    label,
    quantity: 1,
    unitPriceCents: totalCents,
    totalCents,
    taxCodes: [],
    assignments,
    confidence: 100,
    isManual: true,
  };
}

describe('récapitulatif par personne', () => {
  beforeEach(async () => {
    await clearAllData();
    useAppStore.setState({
      ready: false,
      people: [],
      receipts: [],
      settings: DEFAULT_SETTINGS,
      route: { name: 'home' },
      online: true,
    });
  });

  async function openResults() {
    await putPerson({ id: 'p1', name: 'Mathieu', color: 'var(--person-1)' });
    await putPerson({ id: 'p2', name: 'Léa', color: 'var(--person-2)' });
    await putReceipt(
      emptyReceipt({
        merchant: 'Chez Victoire',
        step: 'results',
        imageBlobKey: '',
        lines: [
          lineOf('l1', 'Tartare', 3000, [{ personId: 'p1', shares: 1 }]),
          lineOf('l2', 'Vin', 2000, [
            { personId: 'p1', shares: 1 },
            { personId: 'p2', shares: 1 },
          ]),
          // Personne n'a réclamé le pain : il revient à tout le monde.
          lineOf('l3', 'Pain', 400, []),
        ],
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Chez Victoire'));
    await screen.findByRole('heading', { name: 'Résultats' });
    return user;
  }

  it('répartit d’office la ligne que personne n’a prise', async () => {
    await openResults();

    // 3000 + 1000 + 200 pour Mathieu, 1000 + 200 pour Léa : rien n'est perdu.
    expect(screen.getByText(/^42,00/)).toBeInTheDocument();
    expect(screen.getByText(/^12,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 ligne non attribuée/).textContent).toMatch(
      /1 ligne non attribuée — 4,00.+partagé entre les 2 participants/,
    );
  });

  it('distingue à l’icône ce qui est payé seul de ce qui est partagé', async () => {
    const user = await openResults();

    const mathieu = screen.getByRole('button', { name: 'Mathieu' }).closest('li') as HTMLElement;
    expect(within(mathieu).getByText(/1 seul$/)).toBeInTheDocument();
    expect(within(mathieu).getByText(/2 partagés$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mathieu' }));

    expect(within(mathieu).getByTitle('Payé seul')).toBeInTheDocument();
    expect(within(mathieu).getByTitle('Partagé à 2')).toBeInTheDocument();
    expect(
      within(mathieu).getByTitle('Partagé à 2 — réparti par défaut'),
    ).toBeInTheDocument();
  });
});

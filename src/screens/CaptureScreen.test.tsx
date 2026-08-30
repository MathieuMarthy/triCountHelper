import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAllData, putImage, putReceipt } from '../db';
import { emptyReceipt, useAppStore } from '../store/useAppStore';
import { DEFAULT_SETTINGS, type ReceiptLine } from '../types';

function lineOf(id: string): ReceiptLine {
  return {
    id,
    label: 'Café',
    quantity: 1,
    unitPriceCents: 300,
    totalCents: 300,
    taxCodes: null,
    assignments: [],
    confidence: 100,
    isManual: false,
  };
}

describe('photo d’un ticket rouvert', () => {
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
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:ticket'),
      revokeObjectURL: vi.fn(),
    });
  });

  async function openStoredReceipt() {
    await putReceipt(
      emptyReceipt({
        merchant: 'Chez Victoire',
        step: 'verify',
        imageBlobKey: 'img-1',
        lines: [lineOf('l1')],
      }),
    );
    await putImage('img-1', new Blob(['photo'], { type: 'image/jpeg' }));

    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await user.click(await screen.findByText('Chez Victoire'));
    await screen.findByRole('heading', { name: 'Vérification' });
    return user;
  }

  it('affiche la photo enregistrée en revenant sur l’écran de capture', async () => {
    const user = await openStoredReceipt();

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await screen.findByRole('heading', { name: 'Photo du ticket' });

    expect(await screen.findByAltText(/ticket/i)).toHaveAttribute('src', 'blob:ticket');
    expect(screen.queryByText(/Déposez une photo ici/)).not.toBeInTheDocument();
  });

  it('rouvre le ticket depuis l’accueil sur sa photo, sans relancer la lecture', async () => {
    const user = await openStoredReceipt();

    // Le pas en arrière fige l’étape « capture » sur le ticket.
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await screen.findByRole('heading', { name: 'Photo du ticket' });
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await screen.findByRole('button', { name: 'Nouveau ticket' });

    await user.click(await screen.findByText('Chez Victoire'));
    await screen.findByRole('heading', { name: 'Photo du ticket' });
    expect(await screen.findByAltText(/ticket/i)).toHaveAttribute('src', 'blob:ticket');

    await user.click(screen.getByRole('button', { name: 'Garder la lecture actuelle' }));
    await screen.findByRole('heading', { name: 'Vérification' });
    expect(screen.getByDisplayValue('Chez Victoire')).toBeInTheDocument();
  });
});

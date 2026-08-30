import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAllData, putReceipt } from '../db';
import { emptyReceipt, useAppStore } from '../store/useAppStore';
import { DEFAULT_SETTINGS } from '../types';

describe('centimes d’une ligne', () => {
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

  /** 3 bières à 10,00 $ : le prix unitaire ne tombe pas juste, 10,00 / 3 = 3,33. */
  async function openLine() {
    await putReceipt(
      emptyReceipt({
        merchant: 'Chez Victoire',
        step: 'verify',
        imageBlobKey: '',
        statedTotalCents: 1000,
        lines: [
          {
            id: 'l1',
            label: 'Bière',
            quantity: 3,
            unitPriceCents: 333,
            totalCents: 1000,
            taxCodes: [],
            assignments: [],
            confidence: 100,
            isManual: false,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Chez Victoire'));
    await screen.findByRole('heading', { name: 'Vérification' });
    return user;
  }

  const line = () => useAppStore.getState().receipts[0]?.lines[0];

  it('ne perd pas un centime quand on traverse le champ sans rien changer', async () => {
    const user = await openLine();

    await user.click(screen.getByLabelText('Prix unitaire'));
    await user.tab();
    expect(line()?.totalCents).toBe(1000);

    await user.click(screen.getByLabelText('Total de la ligne'));
    await user.tab();
    expect(line()?.totalCents).toBe(1000);
  });

  it('ne perd pas un centime quand on vide le champ quantité pour retaper le même chiffre', async () => {
    const user = await openLine();
    const quantity = screen.getByLabelText('Quantité');

    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.tab();

    expect(line()?.quantity).toBe(3);
    expect(line()?.totalCents).toBe(1000);
  });

  it('met le total à l’échelle de la quantité, sans dérive d’arrondi', async () => {
    const user = await openLine();
    const quantity = screen.getByLabelText('Quantité');

    await user.clear(quantity);
    await user.type(quantity, '6');
    await user.tab();

    // 6 × 3,33 donnerait 19,98 $ : c'est le total réel qu'on double.
    expect(line()?.totalCents).toBe(2000);
  });

  it('laisse le prix unitaire saisi commander le total', async () => {
    const user = await openLine();
    const unit = screen.getByLabelText('Prix unitaire');

    await user.clear(unit);
    await user.type(unit, '4,00');
    await user.tab();

    expect(line()?.unitPriceCents).toBe(400);
    expect(line()?.totalCents).toBe(1200);
  });
});

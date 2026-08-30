import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAllData } from './db';
import { flushReceipts, useAppStore } from './store/useAppStore';
import { DEFAULT_SETTINGS } from './types';

describe('parcours complet, sans photo', () => {
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

  async function startManualReceipt(user: ReturnType<typeof userEvent.setup>) {
    render(<App />);
    await screen.findByRole('button', { name: 'Nouveau ticket' });
    await user.click(screen.getByRole('button', { name: 'Saisir un ticket à la main' }));
    await screen.findByRole('heading', { name: 'Vérification' });
  }

  async function fillAmount(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
    await user.clear(field);
    await user.type(field, value);
  }

  it('mène d’un souper à deux jusqu’au récapitulatif copiable', async () => {
    const user = userEvent.setup();
    await startManualReceipt(user);

    await user.type(screen.getByPlaceholderText('Carrefour, boulangerie…'), 'Chez Victoire');

    const addLine = screen.getByRole('button', { name: '+ Ajouter une ligne' });
    await user.click(addLine);
    await user.click(addLine);

    const labels = screen.getAllByLabelText('Libellé de la ligne');
    await user.type(labels[0] as HTMLElement, 'Tartare');
    await user.type(labels[1] as HTMLElement, 'Pâtes');

    const totals = screen.getAllByLabelText('Total de la ligne');
    await fillAmount(user, totals[0] as HTMLElement, '30,00');
    await fillAmount(user, totals[1] as HTMLElement, '20,00');

    await user.click(screen.getByRole('button', { name: '+ Québec' }));
    await fillAmount(user, await screen.findByLabelText('Montant de TPS'), '2,50');
    await fillAmount(user, screen.getByLabelText('Montant de TVQ'), '4,99');

    await user.type(screen.getByLabelText('Total lu sur le ticket'), '57,49');

    await waitFor(() => {
      const banner = screen.getByRole('group', { name: 'Contrôle du total' });
      expect(banner).toHaveTextContent('50,00');
      expect(banner).toHaveTextContent('7,49');
      expect(banner).toHaveTextContent('✓');
    });

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));

    await screen.findByRole('heading', { name: 'Attribution' });
    for (const name of ['Mathieu', 'Léa']) {
      await user.click(screen.getByRole('button', { name: 'Ajouter un participant' }));
      await user.type(await screen.findByLabelText('Prénom'), name);
      await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    }

    await user.click(await screen.findByRole('button', { name: 'Léa' }));
    await user.click(screen.getByText('Tartare'));
    await user.click(screen.getByRole('button', { name: 'Léa' }));
    await user.click(screen.getByRole('button', { name: 'Mathieu' }));
    await user.click(screen.getByText('Pâtes'));

    await waitFor(() => expect(screen.queryByText(/non attribuée/)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Voir les résultats' }));

    await screen.findByRole('heading', { name: 'Résultats' });
    const mathieu = () => screen.getByRole('button', { name: 'Mathieu' }).closest('li') as HTMLElement;
    expect(within(mathieu()).getByText('34,49 $')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '18 %' }));
    await waitFor(() => expect(within(mathieu()).getByText('39,89 $')).toBeInTheDocument());
    expect(within(mathieu()).getByText(/pourboire/)).toHaveTextContent('5,40');

    const total = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(total).getByText('66,49 $')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copier le récapitulatif' }));
    await waitFor(async () => {
      const copied = await navigator.clipboard.readText();
      expect(copied).toContain('Sous-total : 50,00 $ · taxes : 7,49 $');
      expect(copied).toContain('Pourboire : 9,00 $');
      expect(copied).toContain('Total : 66,49 $');
      expect(copied).toContain('Mathieu : 39,89 $');
      expect(copied).toContain('Léa : 26,60 $');
    });
  });

  it('ne fait pas payer la taxe à qui n’a acheté que du détaxé', async () => {
    const user = userEvent.setup();
    await startManualReceipt(user);

    const addLine = screen.getByRole('button', { name: '+ Ajouter une ligne' });
    await user.click(addLine);
    await user.click(addLine);

    const labels = screen.getAllByLabelText('Libellé de la ligne');
    await user.type(labels[0] as HTMLElement, 'Bière');
    await user.type(labels[1] as HTMLElement, 'Pain');

    const totals = screen.getAllByLabelText('Total de la ligne');
    await fillAmount(user, totals[0] as HTMLElement, '60,00');
    await fillAmount(user, totals[1] as HTMLElement, '40,00');

    await user.click(screen.getByLabelText('Pain : soumise aux taxes'));

    await user.click(screen.getByRole('button', { name: '+ Québec' }));
    await fillAmount(user, await screen.findByLabelText('Montant de TPS'), '3,00');
    await fillAmount(user, screen.getByLabelText('Montant de TVQ'), '5,99');

    await user.click(screen.getByRole('button', { name: 'Attribuer' }));
    await screen.findByRole('heading', { name: 'Attribution' });

    for (const name of ['Mathieu', 'Léa']) {
      await user.click(screen.getByRole('button', { name: 'Ajouter un participant' }));
      await user.type(await screen.findByLabelText('Prénom'), name);
      await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    }
    await user.click(await screen.findByRole('button', { name: 'Léa' }));
    await user.click(screen.getByText('Bière'));
    await user.click(screen.getByRole('button', { name: 'Léa' }));
    await user.click(screen.getByRole('button', { name: 'Mathieu' }));
    await user.click(screen.getByText('Pain'));

    await user.click(screen.getByRole('button', { name: 'Voir les résultats' }));
    await screen.findByRole('heading', { name: 'Résultats' });

    const lea = screen.getByRole('button', { name: 'Léa' }).closest('li') as HTMLElement;
    expect(within(lea).getByText('40,00 $')).toBeInTheDocument();
    expect(within(lea).getByText(/dont taxes/)).toHaveTextContent('0,00');

    const mathieu = screen.getByRole('button', { name: 'Mathieu' }).closest('li') as HTMLElement;
    expect(within(mathieu).getByText('68,99 $')).toBeInTheDocument();
  });

  it('signale l’écart avec le total du ticket, et sait l’absorber', async () => {
    const user = userEvent.setup();
    await startManualReceipt(user);

    await user.click(screen.getByRole('button', { name: '+ Ajouter une ligne' }));
    await fillAmount(user, screen.getByLabelText('Total de la ligne'), '10,00');
    await user.type(screen.getByLabelText('Total lu sur le ticket'), '8,80');

    const gap = await screen.findByText(/Écart de/);
    expect(gap).toHaveTextContent('1,20');
    await user.click(screen.getByRole('button', { name: 'Ajouter en ajustement' }));

    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Contrôle du total' })).toHaveTextContent('✓'),
    );
    expect(screen.getByText('Écart de saisie')).toBeInTheDocument();
  });

  it('restaure la session interrompue à l’étape où elle s’était arrêtée', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await screen.findByRole('button', { name: 'Nouveau ticket' });
    await user.click(screen.getByRole('button', { name: 'Saisir un ticket à la main' }));
    await screen.findByRole('heading', { name: 'Vérification' });
    await user.type(screen.getByPlaceholderText('Carrefour, boulangerie…'), 'Boulangerie');
    await user.click(screen.getByRole('button', { name: '+ Ajouter une ligne' }));

    await flushReceipts();
    unmount();
    useAppStore.setState({ ready: false, people: [], receipts: [], route: { name: 'home' } });

    render(<App />);
    await screen.findByText('Boulangerie');
    await user.click(screen.getByText('Boulangerie'));
    await screen.findByRole('heading', { name: 'Vérification' });
    expect(screen.getAllByLabelText('Libellé de la ligne')).toHaveLength(1);
  });
});

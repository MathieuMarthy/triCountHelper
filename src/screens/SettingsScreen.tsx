import { useEffect, useState } from 'react';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { PersonPill } from '../ui/PersonPill';
import { useAppStore } from '../store/useAppStore';
import { estimateStorage, purgeOldImages } from '../db';
import { DEFAULT_GEMINI_MODEL } from '../extraction/model';
import { listModels, type AvailableModel } from '../extraction/gemini';
import { TricountSettings } from '../integrations/tricount/TricountSettings';
import { TAX_REGIMES, type TipBasis } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function SettingsScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const people = useAppStore((s) => s.people);
  const settings = useAppStore((s) => s.settings);
  const addPerson = useAppStore((s) => s.addPerson);
  const renamePerson = useAppStore((s) => s.renamePerson);
  const removePerson = useAppStore((s) => s.removePerson);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const wipeEverything = useAppStore((s) => s.wipeEverything);

  const [newName, setNewName] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AvailableModel[] | null>(null);
  const [modelsStatus, setModelsStatus] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const refreshStorage = () => {
    void estimateStorage().then(setStorage);
  };

  useEffect(refreshStorage, []);

  return (
    <Screen title="Réglages" onBack={() => navigate({ name: 'home' })}>
      <section className="section">
        <h2>Participants</h2>
        <p className="muted">Ils sont conservés d’un ticket à l’autre.</p>
        <ul className="people">
          {people.map((person) => (
            <li key={person.id} className="people__row">
              <PersonPill person={person} size="sm" />
              <input
                type="text"
                value={person.name}
                aria-label={`Nom de ${person.name}`}
                onChange={(event) => void renamePerson(person.id, event.target.value)}
              />
              <button
                type="button"
                className="iconButton iconButton--quiet"
                aria-label={`Retirer ${person.name}`}
                onClick={() => void removePerson(person.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row row--gap"
          onSubmit={(event) => {
            event.preventDefault();
            void addPerson(newName);
            setNewName('');
          }}
        >
          <input
            type="text"
            className="grow"
            value={newName}
            placeholder="Ajouter un participant"
            aria-label="Nom du nouveau participant"
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" disabled={newName.trim() === ''}>
            Ajouter
          </Button>
        </form>
      </section>

      <section className="section">
        <h2>Lecture des tickets</h2>
        <p className="muted">
          Les tickets sont lus par un modèle Gemini. <strong>La photo est envoyée à
          Google</strong> pour cette seule opération : c’est la seule donnée qui quitte
          l’appareil. Sans clé, tout le reste de l’application fonctionne, en saisie
          manuelle.
        </p>
        <label className="field">
          <span className="field__label">
            Clé API
            <span className="muted"> — conservée sur cet appareil uniquement</span>
          </span>
          <div className="row row--gap">
            <input
              type={showKey ? 'text' : 'password'}
              className="grow"
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={settings.geminiApiKey}
              onChange={(event) => void updateSettings({ geminiApiKey: event.target.value })}
            />
            <Button onClick={() => setShowKey((value) => !value)}>
              {showKey ? 'Masquer' : 'Afficher'}
            </Button>
          </div>
        </label>
        <label className="field">
          <span className="field__label">
            Modèle
            <span className="muted"> — ces noms changent, demandez la liste à jour</span>
          </span>
          {models === null ? (
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={DEFAULT_GEMINI_MODEL}
              value={settings.geminiModel}
              onChange={(event) => void updateSettings({ geminiModel: event.target.value })}
            />
          ) : (
            <select
              value={models.some((m) => m.name === settings.geminiModel) ? settings.geminiModel : ''}
              onChange={(event) => void updateSettings({ geminiModel: event.target.value })}
            >
              <option value="" disabled>
                Choisir un modèle…
              </option>
              {models.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <Button
          disabled={settings.geminiApiKey.trim() === '' || modelsStatus === 'Vérification…'}
          onClick={() => {
            setModelsStatus('Vérification…');
            void listModels(settings.geminiApiKey)
              .then((found) => {
                setModels(found);
                setModelsStatus(
                  found.some((m) => m.name === settings.geminiModel)
                    ? `Clé valide, ${found.length} modèles. Le modèle choisi existe.`
                    : `Clé valide, ${found.length} modèles. « ${settings.geminiModel} » n’en fait pas partie : choisissez-en un.`,
                );
              })
              .catch((error: unknown) => {
                setModels(null);
                setModelsStatus(error instanceof Error ? error.message : 'Échec de la vérification.');
              });
          }}
        >
          Vérifier la clé et lister les modèles
        </Button>
        {modelsStatus !== null ? (
          <p className={models === null && modelsStatus !== 'Vérification…' ? 'warnText' : 'muted'}>
            {modelsStatus}
          </p>
        ) : null}
      </section>

      <section className="section">
        <h2>Taxes et pourboire</h2>
        <label className="field">
          <span className="field__label">
            Régime fiscal
            <span className="muted"> — proposé quand le ticket n’imprime pas ses taxes</span>
          </span>
          <select
            value={settings.taxRegimeCode}
            onChange={(event) => void updateSettings({ taxRegimeCode: event.target.value })}
          >
            {TAX_REGIMES.map((regime) => (
              <option key={regime.code} value={regime.code}>
                {regime.label} — {regime.taxes.map((tax) => tax.label).join(' + ')}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Les prix des lignes sont hors taxes : les taxes lues en pied de ticket s’ajoutent au
          sous-total, et chacune se répartit sur les seules lignes qui y sont soumises.
        </p>
        <div className="row row--gap">
          <label className="field field--grow">
            <span className="field__label">Pourboire proposé</span>
            <select
              value={settings.defaultTipPercent}
              onChange={(event) =>
                void updateSettings({ defaultTipPercent: Number(event.target.value) })
              }
            >
              {[0, 10, 15, 18, 20, 25].map((percent) => (
                <option key={percent} value={percent}>
                  {percent === 0 ? 'aucun' : `${percent} %`}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--grow">
            <span className="field__label">Calculé sur</span>
            <select
              value={settings.defaultTipBasis}
              onChange={(event) =>
                void updateSettings({ defaultTipBasis: event.target.value as TipBasis })
              }
            >
              <option value="subtotal">avant taxes</option>
              <option value="total">taxes comprises</option>
            </select>
          </label>
        </div>
      </section>

      <section className="section">
        <h2>Photos</h2>
        <label className="field">
          <span className="field__label">Effacer les photos après</span>
          <select
            value={settings.imageRetentionDays}
            onChange={(event) =>
              void updateSettings({ imageRetentionDays: Number(event.target.value) })
            }
          >
            {[30, 60, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                {days} jours
              </option>
            ))}
            <option value={0}>Jamais</option>
          </select>
        </label>
        <p className="muted">
          {storage
            ? `Espace utilisé : ${formatBytes(storage.usage)}${
                storage.quota ? ` sur ${formatBytes(storage.quota)}` : ''
              }`
            : 'Espace utilisé : inconnu'}
        </p>
        <Button
          variant="quiet"
          onClick={() => {
            void purgeOldImages(settings.imageRetentionDays).finally(refreshStorage);
          }}
        >
          Purger les anciennes photos
        </Button>
      </section>

      <section className="section">
        <h2>Apparence</h2>
        <label className="field">
          <span className="field__label">Thème</span>
          <select
            value={settings.theme}
            onChange={(event) =>
              void updateSettings({ theme: event.target.value as typeof settings.theme })
            }
          >
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
      </section>

      <TricountSettings />

      <section className="section">
        <h2>Données</h2>
        <p className="muted">
          Les photos, les tickets, les participants et la clé API sont stockés localement, dans
          le navigateur de cet appareil. Rien n’est synchronisé, rien n’est partagé. Deux
          exceptions, toutes deux explicites : la photo envoyée à Google au moment de la lecture
          d’un ticket, et le récapitulatif transmis à Tricount si vous activez cet envoi.
        </p>
        <Button variant="danger" onClick={() => setConfirmWipe(true)}>
          Tout effacer
        </Button>
      </section>

      <Sheet
        open={confirmWipe}
        title="Tout effacer"
        onClose={() => setConfirmWipe(false)}
        footer={
          <div className="row row--gap">
            <Button full onClick={() => setConfirmWipe(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                void wipeEverything();
                setConfirmWipe(false);
              }}
            >
              Tout effacer
            </Button>
          </div>
        }
      >
        <p className="muted">
          Tous les tickets, les photos, les participants et les réglages seront supprimés. Cette
          action est irréversible.
        </p>
      </Sheet>
    </Screen>
  );
}

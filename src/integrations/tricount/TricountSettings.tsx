import { useState } from 'react';
import { Button } from '../../ui/Button';
import { useAppStore } from '../../store/useAppStore';
import {
  TRICOUNT_FEATURE_ENABLED,
  TRICOUNT_RELAY_URL_DEFAULT,
  isValidRelayUrl,
  parseShareCode,
} from './config';

export function TricountSettings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [showToken, setShowToken] = useState(false);

  if (!TRICOUNT_FEATURE_ENABLED) return null;

  const codeValid = settings.tricountShareUrl === '' || parseShareCode(settings.tricountShareUrl) !== null;
  const relayValid = isValidRelayUrl(settings.tricountRelayUrl);

  return (
    <section className="section">
      <h2>Tricount</h2>
      <p className="muted">
        Envoi automatique <strong>expérimental</strong>. Tricount ne publie aucune interface
        officielle : cet envoi peut cesser de fonctionner du jour au lendemain, et il transmet
        le récapitulatif à un relais. La copie manuelle, elle, marche toujours.
      </p>
      <label className="field">
        <span className="field__label">Envoi automatique</span>
        <select
          value={settings.tricountEnabled ? 'on' : 'off'}
          onChange={(event) => void updateSettings({ tricountEnabled: event.target.value === 'on' })}
        >
          <option value="off">Désactivé</option>
          <option value="on">Activé</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Lien de partage du tricount</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://tricount.com/t/XXXXXXXX"
          value={settings.tricountShareUrl}
          onChange={(event) => void updateSettings({ tricountShareUrl: event.target.value })}
        />
      </label>
      {!codeValid ? <p className="warnText">Ce lien ne ressemble pas à un lien de partage.</p> : null}
      <label className="field">
        <span className="field__label">
          Adresse du relais
          <span className="muted"> — vide : {TRICOUNT_RELAY_URL_DEFAULT}</span>
        </span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={TRICOUNT_RELAY_URL_DEFAULT}
          value={settings.tricountRelayUrl}
          onChange={(event) => void updateSettings({ tricountRelayUrl: event.target.value })}
        />
      </label>
      {!relayValid ? (
        <p className="warnText">
          Indiquez une adresse complète (https://…) ou un chemin commençant par « / ».
        </p>
      ) : null}
      <label className="field">
        <span className="field__label">
          Jeton du relais
          <span className="muted"> — conservé sur cet appareil uniquement</span>
        </span>
        <div className="row row--gap">
          <input
            type={showToken ? 'text' : 'password'}
            className="grow"
            autoComplete="off"
            spellCheck={false}
            placeholder="jeton Bearer"
            value={settings.tricountToken}
            onChange={(event) => void updateSettings({ tricountToken: event.target.value })}
          />
          <Button onClick={() => setShowToken((value) => !value)}>
            {showToken ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
      </label>
    </section>
  );
}

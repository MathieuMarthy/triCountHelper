import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { registerServiceWorker, subscribeInstall, subscribeUpdates, promptInstall, refreshApp } from './pwa';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ReceiptFlow } from './screens/ReceiptFlow';

function useTheme(): void {
  const theme = useAppStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

function StatusStrip() {
  const online = useAppStore((s) => s.online);
  const [installable, setInstallable] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeInstall(setInstallable), []);
  useEffect(() => subscribeUpdates((state) => setNeedRefresh(state.needRefresh)), []);

  if (needRefresh) {
    return (
      <div className="strip">
        <span>Une nouvelle version est prête.</span>
        <button type="button" className="strip__link" onClick={refreshApp}>
          Recharger
        </button>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="strip">
        <span>Hors ligne — la lecture d’une photo attendra ; la saisie manuelle, non.</span>
      </div>
    );
  }

  if (installable && !dismissed) {
    return (
      <div className="strip">
        <span>Installer SplitTicket sur cet appareil ?</span>
        <button type="button" className="strip__link" onClick={() => void promptInstall()}>
          Installer
        </button>
        <button type="button" className="strip__link" onClick={() => setDismissed(true)}>
          Plus tard
        </button>
      </div>
    );
  }

  return null;
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const route = useAppStore((s) => s.route);
  const init = useAppStore((s) => s.init);
  useTheme();

  useEffect(() => {
    void init();
    void registerServiceWorker();
  }, [init]);

  if (!ready) {
    return (
      <div className="app">
        <div className="app__loading">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <StatusStrip />
      {route.name === 'home' ? <HomeScreen /> : null}
      {route.name === 'settings' ? <SettingsScreen /> : null}
      {route.name === 'receipt' ? <ReceiptFlow receiptId={route.id} step={route.step} /> : null}
    </div>
  );
}

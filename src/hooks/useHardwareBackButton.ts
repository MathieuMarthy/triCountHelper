import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store/useAppStore';

export function useHardwareBackButton(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;

    App.addListener('backButton', () => {
      // 1. If any modal / sheet is open, close it via Escape
      const openSheet = document.querySelector('.sheet');
      if (openSheet) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }

      const { route, receipts, navigate } = useAppStore.getState();

      if (route.name === 'home') {
        void App.exitApp();
        return;
      }

      if (route.name === 'settings') {
        navigate({ name: 'home' });
        return;
      }

      if (route.name === 'receipt') {
        const receipt = receipts.find((r) => r.id === route.id);
        switch (route.step) {
          case 'results':
            navigate({ name: 'receipt', id: route.id, step: 'assign' });
            break;
          case 'assign':
            navigate({ name: 'receipt', id: route.id, step: 'verify' });
            break;
          case 'verify':
            if (receipt?.imageBlobKey) {
              navigate({ name: 'receipt', id: route.id, step: 'capture' });
            } else {
              navigate({ name: 'home' });
            }
            break;
          case 'processing':
            navigate({ name: 'receipt', id: route.id, step: 'capture' });
            break;
          case 'capture':
            navigate({ name: 'home' });
            break;
          default:
            navigate({ name: 'home' });
            break;
        }
      }
    })
      .then((handle) => {
        removeListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {});

    return () => {
      removeListener?.();
    };
  }, []);
}

import { useEffect, useState } from 'react';
import { getImage } from '../db';

export function useReceiptImage(key: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return undefined;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      const blob = await getImage(key);
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}

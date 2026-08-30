import { useState } from 'react';
import { Sheet } from './Sheet';

type PhotoSheetProps = {
  open: boolean;
  src: string | null;
  onClose: () => void;
};

export function PhotoSheet({ open, src, onClose }: PhotoSheetProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <Sheet open={open} title="Photo du ticket" onClose={onClose} full>
      {src ? (
        <div className={`photo${zoomed ? ' photo--zoom' : ''}`}>
          <img
            src={src}
            alt="Ticket de caisse"
            onClick={() => setZoomed((value) => !value)}
            title={zoomed ? 'Réduire' : 'Agrandir'}
          />
        </div>
      ) : (
        <p className="muted">Aucune photo n’est associée à ce ticket.</p>
      )}
    </Sheet>
  );
}

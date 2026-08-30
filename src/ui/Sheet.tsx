import { useEffect, useRef, type ReactNode } from 'react';

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
};

export function Sheet({ open, title, onClose, children, footer, full = false }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet__scrim" aria-label="Fermer" onClick={onClose} />
      <div className={`sheet__panel${full ? ' sheet__panel--full' : ''}`} ref={panel} tabIndex={-1}>
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

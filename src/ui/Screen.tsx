import type { ReactNode } from 'react';

type ScreenProps = {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  subtitle?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Screen({ title, onBack, action, subtitle, banner, footer, children }: ScreenProps) {
  return (
    <div className="screen">
      <header className="screen__head">
        <div className="screen__headRow">
          {onBack ? (
            <button type="button" className="iconButton" onClick={onBack} aria-label="Retour">
              ←
            </button>
          ) : null}
          <h1 className="screen__title">{title}</h1>
          {action ? <div className="screen__action">{action}</div> : null}
        </div>
        {subtitle ? <p className="screen__subtitle">{subtitle}</p> : null}
      </header>

      <main className="screen__body">{children}</main>

      {banner || footer ? (
        <div className="screen__foot">
          {banner}
          {footer ? <div className="screen__footAction">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from 'react';

type BannerProps = {
  tone?: 'neutral' | 'warn';
  label?: string;
  children: ReactNode;
  action?: ReactNode;
};

export function Banner({ tone = 'neutral', label, children, action }: BannerProps) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={label ? 'group' : undefined}
      aria-label={label}
      aria-live={tone === 'warn' ? 'polite' : undefined}
    >
      <div className="banner__text">{children}</div>
      {action ? <div className="banner__action">{action}</div> : null}
    </div>
  );
}

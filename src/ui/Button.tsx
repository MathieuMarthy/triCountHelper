import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  full?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  full = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${full ? ' btn--full' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

import type { CSSProperties } from 'react';
import { initialsOf } from '../lib/people';
import { useLongPress } from '../hooks/useLongPress';
import type { Person } from '../types';

type PersonPillProps = {
  person: Person;
  selected?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  onLongPress?: () => void;
  title?: string;
};

export function PersonPill({
  person,
  selected = false,
  size = 'md',
  onClick,
  onLongPress,
  title,
}: PersonPillProps) {
  const press = useLongPress({ onLongPress: onLongPress ?? (() => undefined), onClick });
  const style = { '--pill-color': person.color ?? 'var(--person-1)' } as CSSProperties;
  const content = (
    <>
      <span className="pill__initials" aria-hidden="true">
        {initialsOf(person.name)}
      </span>
      <span className="visually-hidden">{person.name}</span>
    </>
  );

  if (!onClick && !onLongPress) {
    return (
      <span className={`pill pill--${size}`} style={style} title={title ?? person.name}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`pill pill--${size}${selected ? ' pill--on' : ''}`}
      style={style}
      title={title ?? person.name}
      aria-pressed={onClick ? selected : undefined}
      {...(onLongPress ? press : { onClick })}
    >
      {content}
    </button>
  );
}

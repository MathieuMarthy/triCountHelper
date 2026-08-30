import { useRef, type MouseEvent } from 'react';

type LongPressOptions = {
  onLongPress: () => void;
  onClick?: () => void;
  delay?: number;
};

export function useLongPress({ onLongPress, onClick, delay = 450 }: LongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onClick: () => {
      cancel();
      if (fired.current) {
        fired.current = false;
        return;
      }
      onClick?.();
    },
    onPointerDown: () => {
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  };
}

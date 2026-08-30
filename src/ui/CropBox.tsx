import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CropRect } from '../capture/image';

type CropBoxProps = {
  src: string;
  crop: CropRect;
  onChange: (crop: CropRect) => void;
};

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

const MIN_SIZE = 0.08;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function CropBox({ src, crop, onChange }: CropBoxProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const origin = useRef<{ x: number; y: number; crop: CropRect } | null>(null);

  const pointerToRatio = (event: ReactPointerEvent) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const begin = (handle: Handle) => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    origin.current = { ...pointerToRatio(event), crop };
    setDragging(handle);
  };

  const move = (event: ReactPointerEvent) => {
    if (!dragging || !origin.current) return;
    const point = pointerToRatio(event);
    const start = origin.current;
    const base = start.crop;

    if (dragging === 'move') {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      onChange({
        ...base,
        x: clamp(base.x + dx, 0, 1 - base.width),
        y: clamp(base.y + dy, 0, 1 - base.height),
      });
      return;
    }

    let { x, y, width, height } = base;
    const right = base.x + base.width;
    const bottom = base.y + base.height;

    if (dragging === 'nw' || dragging === 'sw') {
      x = clamp(point.x, 0, right - MIN_SIZE);
      width = right - x;
    } else {
      width = clamp(point.x, base.x + MIN_SIZE, 1) - base.x;
    }
    if (dragging === 'nw' || dragging === 'ne') {
      y = clamp(point.y, 0, bottom - MIN_SIZE);
      height = bottom - y;
    } else {
      height = clamp(point.y, base.y + MIN_SIZE, 1) - base.y;
    }
    onChange({ x, y, width, height });
  };

  const end = () => {
    setDragging(null);
    origin.current = null;
  };

  const style = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };

  return (
    <div
      className="cropBox"
      ref={frame}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <img
        className="cropBox__image"
        src={src}
        alt="Aperçu du ticket"
        draggable={false}
      />
      <div className="cropBox__rect" style={style} onPointerDown={begin('move')}>
        {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
          <span
            key={handle}
            className={`cropBox__handle cropBox__handle--${handle}`}
            onPointerDown={begin(handle)}
          />
        ))}
      </div>
    </div>
  );
}

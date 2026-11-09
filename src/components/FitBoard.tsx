import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Scales a fixed-size board down to fit its container. Dragology maps pointer
 * positions through the SVG's rendered size, so a CSS transform is safe.
 */
export function FitBoard({
  width,
  height,
  label,
  children,
}: {
  width: number;
  height: number;
  /** Accessible name for the board. */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={ref} className="board" role="group" aria-label={label}>
      <div className="board-sizer" style={{ height: height * scale }}>
        <div className="board-inner" style={{ width, height, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

interface IconProps {
  className?: string;
  color?: string;
}

export function KnightIcon({ className }: IconProps) {
  return (
    <img
      className={`pixel-sprite ${className || ''}`}
      src="/quest-assets/knight-pixel.png"
      alt=""
      aria-hidden="true"
    />
  );
}

export function DragonIcon({ className, color = '#ef4444' }: IconProps) {
  return (
    <span
      className={`pixel-sprite dragon-pixel-sprite ${className || ''}`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

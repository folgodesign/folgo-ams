// Folgo wordmark rendered as text with the surname-in-orange treatment the
// brand kit uses. The real build swaps this for the supplied SVG wordmark
// (PRD §14.3); kept as live text here so the demo needs no binary asset.

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Folgo<span className="text-accent">.</span>
    </span>
  );
}

export function AppMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="rounded-md flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, background: '#EB5E29', fontSize: size * 0.5 }}
      aria-label="Folgo"
    >
      F
    </div>
  );
}

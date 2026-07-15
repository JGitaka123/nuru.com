/**
 * Nuru logo — a minimalist rising-sun mark ("nuru" = light in Swahili)
 * paired with a serif wordmark. Pure SVG, no external assets.
 */

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Nuru">
      {/* horizon disc */}
      <defs>
        <clipPath id="nuru-horizon">
          <rect x="0" y="0" width="40" height="24" />
        </clipPath>
      </defs>
      <circle cx="20" cy="24" r="11" fill="#d97a1e" clipPath="url(#nuru-horizon)" />
      {/* rays */}
      <g stroke="#d97a1e" strokeWidth="2.2" strokeLinecap="round">
        <line x1="20" y1="3" x2="20" y2="8" />
        <line x1="6.5" y1="8.5" x2="9.8" y2="11.8" />
        <line x1="33.5" y1="8.5" x2="30.2" y2="11.8" />
        <line x1="2" y1="21" x2="6.5" y2="21" />
        <line x1="33.5" y1="21" x2="38" y2="21" />
      </g>
      {/* horizon line */}
      <line x1="3" y1="30" x2="37" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8 text-ink-900" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[1.55rem] font-semibold tracking-tightish text-ink-900">Nuru</span>
        <span className="mt-0.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-ink-400">
          Nairobi homes
        </span>
      </span>
    </span>
  );
}

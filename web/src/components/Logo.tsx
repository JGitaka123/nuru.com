/**
 * Nuru logo — "nuru" is Swahili for *light*. The mark is a sunrise cresting
 * a rooftop: light over a home, the idea of finding the right place anywhere
 * in Kenya. Pure inline SVG (gradient + strokes), no external assets, and it
 * inherits `currentColor` for the roofline so it reads in light and dark.
 */

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} role="img" aria-label="Nuru">
      <defs>
        <linearGradient id="nuru-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2a93b" />
          <stop offset="1" stopColor="#d97a1e" />
        </linearGradient>
        {/* Clip the sun so it sits *behind* the rooftop horizon. */}
        <clipPath id="nuru-sky">
          <rect x="0" y="0" width="44" height="27" />
        </clipPath>
      </defs>

      {/* Rays — short, evenly splayed, warm. */}
      <g stroke="url(#nuru-sun)" strokeWidth="2.4" strokeLinecap="round" clipPath="url(#nuru-sky)">
        <line x1="22" y1="3.5" x2="22" y2="8.5" />
        <line x1="9.5" y1="8" x2="12.8" y2="11.3" />
        <line x1="34.5" y1="8" x2="31.2" y2="11.3" />
        <line x1="3.5" y1="19" x2="8.2" y2="19" />
        <line x1="35.8" y1="19" x2="40.5" y2="19" />
      </g>

      {/* The sun disc, cresting the roofline. */}
      <circle cx="22" cy="27" r="10.5" fill="url(#nuru-sun)" clipPath="url(#nuru-sky)" />

      {/* Rooftop: a home's gable sitting on the horizon. currentColor = ink. */}
      <path
        d="M6 27 L22 15 L38 27"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Horizon / ground line under the home. */}
      <line x1="7" y1="33.5" x2="37" y2="33.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9 text-ink-900" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[1.55rem] font-semibold tracking-tightish text-ink-900">Nuru</span>
        <span className="mt-0.5 text-[0.6rem] font-medium uppercase tracking-[0.2em] text-ink-400">
          Homes across Kenya
        </span>
      </span>
    </span>
  );
}

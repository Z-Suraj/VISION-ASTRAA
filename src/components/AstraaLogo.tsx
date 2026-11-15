import { useId } from 'react';

interface AstraaLogoProps {
  variant?: 'full' | 'compact' | 'icon';
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function AstraaLogo({
  variant = 'compact',
  tone = 'dark',
  size = 'md',
  className = '',
}: AstraaLogoProps) {
  const rawId = useId().replace(/:/g, '');
  const sphereGradId = `astraa-sphere-${rawId}`;
  const orbitGradId = `astraa-orbit-${rawId}`;
  const haloGradId = `astraa-halo-${rawId}`;

  const iconSizes = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-12 w-12',
  }[size];

  const titleSizes = {
    sm: 'text-sm tracking-[0.14em]',
    md: 'text-[15px] tracking-[0.14em]',
    lg: 'text-xl tracking-[0.16em]',
  }[size];

  const primaryWordColor = tone === 'light' ? 'text-slate-900' : 'text-white';
  const accentWordColor = tone === 'light' ? 'text-sky-600' : 'text-cyan-400';
  const taglineColor = tone === 'light' ? 'text-slate-600' : 'text-slate-400';

  const sphereStart = tone === 'light' ? '#0284C7' : '#38BDF8';
  const sphereMid = tone === 'light' ? '#0369A1' : '#0EA5E9';
  const sphereEnd = tone === 'light' ? '#1E3A8A' : '#1D4ED8';
  const orbitStart = tone === 'light' ? '#0284C7' : '#22D3EE';
  const orbitEnd = tone === 'light' ? '#4338CA' : '#818CF8';
  const starColor = tone === 'light' ? '#0369A1' : '#E0F2FE';
  const meridianColor = tone === 'light' ? '#FFFFFF' : '#E0F2FE';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <svg
        viewBox="0 0 64 64"
        className={`${iconSizes} shrink-0`}
        role="img"
        aria-label="VISION ASTRAA planetary emblem"
      >
        <defs>
          <linearGradient id={sphereGradId} x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={sphereStart} />
            <stop offset="55%" stopColor={sphereMid} />
            <stop offset="100%" stopColor={sphereEnd} />
          </linearGradient>
          <linearGradient id={orbitGradId} x1="6" y1="42" x2="58" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={orbitStart} stopOpacity="0.4" />
            <stop offset="50%" stopColor={orbitStart} />
            <stop offset="100%" stopColor={orbitEnd} />
          </linearGradient>
          <radialGradient id={haloGradId} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor={orbitStart} stopOpacity="0.16" />
            <stop offset="100%" stopColor={orbitStart} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle Atmospheric Halo */}
        <circle cx="32" cy="32" r="28" fill={`url(#${haloGradId})`} />

        {/* Back Orbital Trajectory */}
        <path
          d="M 9 39 C 5 28, 22 15, 43 17 C 53 18, 58 23, 55 30"
          fill="none"
          stroke={`url(#${orbitGradId})`}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.42"
        />

        {/* Planetary Sphere (Earth / Moon / Mars triad) */}
        <circle cx="32" cy="32" r="15.5" fill={`url(#${sphereGradId})`} />

        {/* Geodetic Meridian & Parallel Arcs */}
        <path
          d="M 22 20 C 26 26, 26 38, 22 44"
          fill="none"
          stroke={meridianColor}
          strokeWidth="1.35"
          strokeOpacity="0.55"
          strokeLinecap="round"
        />
        <path
          d="M 18 30 C 27 27, 37 27, 46 30"
          fill="none"
          stroke={meridianColor}
          strokeWidth="1.2"
          strokeOpacity="0.4"
          strokeLinecap="round"
        />

        {/* Front Orbital Trajectory */}
        <path
          d="M 55 26 C 59 34, 42 47, 20 46 C 10 45, 6 40, 9 33"
          fill="none"
          stroke={`url(#${orbitGradId})`}
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Celestial Navigation Star */}
        <path
          d="M 50 9 L 51.7 13.8 L 56.5 15.5 L 51.7 17.2 L 50 22 L 48.3 17.2 L 43.5 15.5 L 48.3 13.8 Z"
          fill={starColor}
        />

        {/* Orbital Moon / Satellite Node */}
        <circle cx="14.5" cy="43.5" r="2.3" fill={orbitStart} />
      </svg>

      {variant !== 'icon' && (
        <div className="min-w-0 leading-none">
          <div className={`font-display font-extrabold whitespace-nowrap ${titleSizes}`}>
            <span className={primaryWordColor}>VISION </span>
            <span className={accentWordColor}>ASTRAA</span>
          </div>
          {variant === 'full' && (
            <div className={`mt-1 text-[11px] font-medium tracking-wide ${taglineColor}`}>
              Explore Worlds. Discover Analogues. Advance Exploration.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

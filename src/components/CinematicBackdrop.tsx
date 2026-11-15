import { useState } from 'react';

interface CinematicBackdropProps {
  src: string;
  alt: string;
  opacityClass?: string;
  objectPositionClass?: string;
  scrimClass?: string;
  eager?: boolean;
  className?: string;
}

function getFallbackUrl(src: string): string {
  return src.endsWith('.webp') ? src.replace(/\.webp$/, '.jpg') : src;
}

export default function CinematicBackdrop({
  src,
  alt,
  opacityClass = 'opacity-30',
  objectPositionClass = 'object-center',
  scrimClass = 'bg-gradient-to-r from-[#050814]/95 via-[#050814]/80 to-[#050814]/65',
  eager = false,
  className = '',
}: CinematicBackdropProps) {
  const [failed, setFailed] = useState(false);
  const fallbackSrc = getFallbackUrl(src);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#050814] ${className}`}
    >
      {!failed && (
        <picture>
          {src.endsWith('.webp') && <source srcSet={src} type="image/webp" />}
          <img
            src={fallbackSrc}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover ${objectPositionClass} ${opacityClass} transition-opacity duration-500`}
          />
        </picture>
      )}
      <div className={`absolute inset-0 ${scrimClass}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050814]/90 via-transparent to-[#050814]/35" />
    </div>
  );
}

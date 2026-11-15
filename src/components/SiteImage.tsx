import { useState } from 'react';
import { Globe2 } from 'lucide-react';

interface SiteImageProps {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export default function SiteImage({
  src,
  alt,
  className = 'h-40 w-full object-cover',
  eager = false,
}: SiteImageProps) {
  const [failed, setFailed] = useState(false);
  const jpgFallback = src.endsWith('.webp') ? src.replace(/\.webp$/, '.jpg') : src;

  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#081229] via-[#0c1938] to-[#050814] text-slate-400 ${className}`}
      >
        <div className="flex flex-col items-center gap-1.5 px-3 text-center">
          <Globe2 className="h-5 w-5 text-cyan-400/70" />
          <span className="text-[11px] text-slate-400 line-clamp-1">{alt}</span>
        </div>
      </div>
    );
  }

  return (
    <picture>
      {src.endsWith('.webp') && <source srcSet={src} type="image/webp" />}
      <img
        src={jpgFallback}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={className}
      />
    </picture>
  );
}

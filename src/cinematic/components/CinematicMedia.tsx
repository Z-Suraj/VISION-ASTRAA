import { useEffect, useRef, useState } from 'react';

type Props = {
  poster: string;
  video?: string;
  caption: string;
  description: string;
  className?: string;
  priority?: boolean;
  playOnce?: boolean;
  sourceUrl?: string;
};

export default function CinematicMedia({
  poster, video, caption, description, className = '', priority = false, playOnce = false, sourceUrl,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const completed = useRef(false);
  const [loaded, setLoaded] = useState(priority);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [intent, setIntent] = useState<'automatic' | 'play' | 'pause'>('automatic');
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduceMotion(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element || !video) return;
    const preloader = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoaded(true);
        preloader.disconnect();
      }
    }, { rootMargin: '180px' });
    const visibility = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.18);
    }, { threshold: [0, 0.18] });
    preloader.observe(element);
    visibility.observe(element);
    return () => {
      preloader.disconnect();
      visibility.disconnect();
    };
  }, [video]);

  useEffect(() => {
    const element = player.current;
    if (!element || !loaded || failed) return;
    const shouldPlay = () => visible && !document.hidden && !completed.current && intent !== 'pause' &&
      (intent === 'play' || !reduceMotion);
    const syncPlayback = () => {
      if (shouldPlay()) void element.play().catch(() => {});
      else element.pause();
    };
    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    return () => document.removeEventListener('visibilitychange', syncPlayback);
  }, [visible, loaded, failed, reduceMotion, intent]);

  function togglePlayback() {
    const element = player.current;
    if (!element || failed) return;
    if (element.paused) {
      completed.current = false;
      setIntent('play');
      void element.play().catch(() => {});
    } else {
      setIntent('pause');
      element.pause();
    }
  }

  return (
    <div ref={frame} className={`cinematic ${className}`}>
      <img className="cinematic__poster" src={poster} alt={description}
        loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} />
      {video && !failed && (
        <video ref={player} className={`cinematic__video${ready ? ' is-ready' : ''}`}
          src={loaded ? video : undefined} poster={poster} muted playsInline
          loop={!playOnce} preload={priority ? 'auto' : 'metadata'} aria-hidden="true"
          onCanPlay={() => { if (!completed.current) setReady(true); }}
          onPlay={() => { setPlaying(true); if ((player.current?.readyState ?? 0) >= 2) setReady(true); }}
          onPause={() => setPlaying(false)} onError={() => { setFailed(true); setReady(false); }}
          onEnded={playOnce ? () => { completed.current = true; setPlaying(false); setReady(false); } : undefined} />
      )}
      <div className="cinematic__veil" aria-hidden="true" />
      <div className="cinematic__note">
        {video && !failed && loaded && (
          <button type="button" className="media-play" onClick={togglePlayback}
            aria-label={playing ? 'Pause cinematic footage' : 'Play cinematic footage'}>
            <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
          </button>
        )}
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{caption} ↗</a> : <span>{caption}</span>}
      </div>
    </div>
  );
}

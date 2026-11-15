import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import AstraaLogo from './AstraaLogo.tsx';

interface MissionVideoModalProps {
  open: boolean;
  onClose: () => void;
}

const CHAPTERS = [
  {
    id: 'earth',
    title: 'Earth Terrestrial Analogues',
    subtitle: 'Hyper-arid deserts, polar permafrost & Himalayan high-altitude basins',
    image: '/assets/earth/ladakh_valley.jpg',
    accent: '#38bdf8',
  },
  {
    id: 'moon',
    title: 'Lunar South Pole Targets',
    subtitle: 'Shackleton rim illumination ridges & cryogenic volatile cold traps',
    image: '/assets/moon/lunar_south_pole.jpg',
    accent: '#cbd5e1',
  },
  {
    id: 'mars',
    title: 'Martian Fluvial-Deltaic Basins',
    subtitle: 'Jezero Crater layered sediments & Gale Crater sulfate transitions',
    image: '/assets/mars/mars_jezero_crater.jpg',
    accent: '#f97316',
  },
];

export default function MissionVideoModal({ open, onClose }: MissionVideoModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [chapterIdx, setChapterIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    const img = new Image();
    img.src = CHAPTERS[chapterIdx].image;

    const render = () => {
      if (playing) t += 0.015;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#050814';
      ctx.fillRect(0, 0, w, h);

      // Slow Ken Burns pan/zoom across the conceptual chapter backdrop
      if (img.complete && img.naturalWidth > 0) {
        const scale = 1.08 + Math.sin(t * 0.4) * 0.04;
        const dw = w * scale;
        const dh = h * scale;
        const dx = (w - dw) / 2 + Math.cos(t * 0.3) * 14;
        const dy = (h - dh) / 2 + Math.sin(t * 0.25) * 10;
        ctx.globalAlpha = 0.72;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      }

      // Contrast scrim
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(5, 8, 20, 0.35)');
      grad.addColorStop(1, 'rgba(5, 8, 20, 0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Animated orbital scan reticle
      const cx = w * 0.5;
      const cy = h * 0.44;
      const r = 74 + Math.sin(t * 1.4) * 4;
      ctx.strokeStyle = CHAPTERS[chapterIdx].accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, t * 0.5, t * 0.5 + Math.PI * 1.35);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, -t * 0.7, -t * 0.7 + Math.PI * 1.1);
      ctx.stroke();

      // Sweep line
      const scanY = ((t * 45) % h);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(w, scanY);
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [open, playing, chapterIdx]);

  if (!open) return null;
  const chapter = CHAPTERS[chapterIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700/80 bg-[#070c1b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <AstraaLogo variant="icon" tone="dark" size="sm" />
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                VISION ASTRAA Mission Briefing Loop
              </h3>
              <p className="text-xs text-slate-400">
                Conceptual mission visualization · Real-time canvas synthesis (offline-safe)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close mission video"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-video w-full bg-[#050814]">
          <canvas ref={canvasRef} width={960} height={540} className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute bottom-5 left-5 right-5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
              Chapter 0{chapterIdx + 1} / 03 · Illustrative Mission Sequence
            </div>
            <div className="mt-1 font-display text-xl font-bold text-white">{chapter.title}</div>
            <div className="text-sm text-slate-300">{chapter.subtitle}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/30"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {muted ? 'Muted' : 'Audio Off (Visual Mode)'}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {CHAPTERS.map((ch, idx) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChapterIdx(idx)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  idx === chapterIdx
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {ch.id.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

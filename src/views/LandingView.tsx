import { useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Compass,
  Database,
  FileText,
  Globe2,
  MapPin,
  Menu,
  Mountain,
  Play,
  Send,
  X,
} from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import SiteImage from '../components/SiteImage.tsx';
import type { OverviewStats } from '../types/astraa.ts';
import type { NavRoute } from './DashboardView.tsx';

interface LandingViewProps {
  overview: OverviewStats | null;
  onEnterApp: (targetRoute: NavRoute) => void;
  onOpenDemo: () => void;
}

export default function LandingView({
  overview,
  onEnterApp,
  onOpenDemo,
}: LandingViewProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<'home' | 'features' | 'about' | 'resources' | 'contact'>('home');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const scrollToSection = (id: 'home' | 'features' | 'about' | 'resources' | 'contact') => {
    setActiveNav(id);
    setMobileNavOpen(false);
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleContactSubmit = (e: FormEvent) => {
    e.preventDefault();
    setContactError(null);
    if (!contactName.trim() || !contactEmail.includes('@') || !contactMessage.trim()) {
      setContactError('Please enter your name, a valid email address, and a brief research note.');
      return;
    }
    setContactSubmitted(true);
    setContactName('');
    setContactEmail('');
    setContactOrg('');
    setContactMessage('');
  };

  const featureCards: {
    id: NavRoute;
    title: string;
    description: string;
    icon: typeof Globe2;
    iconColor: string;
    glowClass: string;
  }[] = [
    {
      id: 'explorer',
      title: '3D Planetary Visualization',
      description: 'Explore Earth, Moon & Mars in stunning 3D detail.',
      icon: Globe2,
      iconColor: 'text-cyan-400',
      glowClass: 'hover:border-cyan-400/50 hover:shadow-[0_0_28px_rgba(34,211,238,0.16)]',
    },
    {
      id: 'comparison',
      title: 'Terrain Comparison',
      description: 'Analyze and compare planetary terrains.',
      icon: Mountain,
      iconColor: 'text-sky-400',
      glowClass: 'hover:border-sky-400/50 hover:shadow-[0_0_28px_rgba(56,189,248,0.16)]',
    },
    {
      id: 'analogs',
      title: 'Earth Analog Finder',
      description: 'Discover terrestrial sites with lunar & Martian potential.',
      icon: MapPin,
      iconColor: 'text-blue-400',
      glowClass: 'hover:border-blue-400/50 hover:shadow-[0_0_28px_rgba(96,165,250,0.16)]',
    },
    {
      id: 'assistant',
      title: 'AI Research Assistant',
      description: 'Get expert insights and generate scientific reports.',
      icon: Brain,
      iconColor: 'text-violet-400',
      glowClass: 'hover:border-violet-400/50 hover:shadow-[0_0_28px_rgba(167,139,250,0.16)]',
    },
  ];

  return (
    <div id="home" className="min-h-screen bg-[#030612] text-slate-100 selection:bg-cyan-500/30">
      {/* Sticky Transparent Dark Navigation Bar — Mirrors Reference Screenshot */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030612]/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-4 py-3.5 sm:px-8">
          {/* Left: Brand Emblem & Wordmark */}
          <button
            type="button"
            onClick={() => scrollToSection('home')}
            className="flex items-center gap-3 text-left whitespace-nowrap shrink-0"
          >
            <svg
              viewBox="0 0 36 36"
              className="h-8 w-8 shrink-0"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="astraaRing" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22D3EE" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>
              <circle cx="18" cy="18" r="8" fill="url(#astraaRing)" opacity="0.9" />
              <ellipse
                cx="18"
                cy="18"
                rx="15"
                ry="5.5"
                transform="rotate(-28 18 18)"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
              />
              <circle cx="29" cy="11" r="2" fill="#E0F2FE" />
            </svg>
            <span className="font-display text-base font-extrabold tracking-[0.14em] text-white sm:text-lg">
              VISION ASTRAA
            </span>
          </button>

          {/* Center: Clean Single-Line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => scrollToSection('home')}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeNav === 'home' ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Home
              {activeNav === 'home' && (
                <span className="absolute right-0 -bottom-1 left-0 h-[2px] rounded-full bg-cyan-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeNav === 'features' ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Features
              {activeNav === 'features' && (
                <span className="absolute right-0 -bottom-1 left-0 h-[2px] rounded-full bg-cyan-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onEnterApp('explorer')}
              className="py-1 text-slate-300 transition-colors hover:text-cyan-300 whitespace-nowrap"
            >
              Explore
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('about')}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeNav === 'about' ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              About
              {activeNav === 'about' && (
                <span className="absolute right-0 -bottom-1 left-0 h-[2px] rounded-full bg-cyan-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('resources')}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeNav === 'resources' ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Resources
              {activeNav === 'resources' && (
                <span className="absolute right-0 -bottom-1 left-0 h-[2px] rounded-full bg-cyan-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeNav === 'contact' ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Contact
              {activeNav === 'contact' && (
                <span className="absolute right-0 -bottom-1 left-0 h-[2px] rounded-full bg-cyan-400" />
              )}
            </button>
          </nav>

          {/* Right: Direct Get Started Button (Zero Auth Gate) + Mobile Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onEnterApp('dashboard')}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/50 bg-[#0b1228]/80 px-4 py-2 text-xs font-semibold text-white transition-all hover:border-cyan-400 hover:bg-cyan-500/15 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)] whitespace-nowrap"
            >
              <span>Get Started</span>
              <ChevronRight className="h-3.5 w-3.5 text-cyan-300" />
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="rounded-lg border border-white/15 p-2 text-slate-300 hover:text-white lg:hidden"
              aria-label="Toggle navigation menu"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="border-t border-white/10 bg-[#050918]/95 px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={() => scrollToSection('home')}
                className="rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-white/5"
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('features')}
                className="rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-white/5"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onEnterApp('explorer');
                }}
                className="rounded-lg px-3 py-2 text-left text-cyan-300 hover:bg-white/5"
              >
                Explore
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('about')}
                className="rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-white/5"
              >
                About
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('resources')}
                className="rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-white/5"
              >
                Resources
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('contact')}
                className="rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-white/5"
              >
                Contact
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Cinematic Full-Viewport Hero Stage */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* Layered Deep Space Starfield & Planetary Horizon Composition */}
        <CinematicBackdrop
          src="/assets/backgrounds/hero_cosmos_panorama.webp"
          alt="Astronaut standing on rocky planetary terrain facing Earth, Moon, and Mars in deep space"
          eager
          opacityClass="opacity-85"
          objectPositionClass="object-[72%_center] sm:object-center"
          scrimClass="bg-transparent"
        />
        {/* Cinematic Atmospheric Scrims for WCAG Contrast on Left Typography & Bottom Cards */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 62% 38%, rgba(14, 165, 233, 0.14) 0%, rgba(3, 6, 18, 0.28) 46%, rgba(3, 6, 18, 0.88) 85%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#030612]/95 via-[#030612]/65 to-transparent lg:w-[68%]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#030612] via-[#030612]/70 to-transparent" />

        {/* Hero Foreground Container */}
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-66px)] max-w-[1400px] flex-col justify-between px-4 pt-12 pb-8 sm:px-8 lg:pt-20">
          {/* Upper Left Hero Proposition */}
          <div className="max-w-2xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-[#081024]/75 px-3.5 py-1.5 text-xs font-medium text-cyan-200 backdrop-blur-sm">
              <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Earth · Moon · Mars</span>
            </div>

            <h1 className="font-display text-4xl font-extrabold tracking-[0.06em] text-white sm:text-6xl lg:text-[64px] lg:leading-[1.06]">
              VISION{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-400 bg-clip-text text-transparent">
                ASTRAA
              </span>
            </h1>

            <p className="font-display text-lg font-semibold text-white/95 sm:text-xl text-balance">
              Explore Worlds. Discover Analogues. Advance Exploration.
            </p>

            <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              An advanced planetary intelligence platform for identifying and characterizing Earth
              analogs, with immersive 3D visualization, geospatial analytics and AI-powered insights.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                type="button"
                onClick={() => onEnterApp('explorer')}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.42)] transition-all hover:brightness-110 hover:-translate-y-0.5 whitespace-nowrap"
              >
                <span>Explore the Universe</span>
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onOpenDemo}
                className="inline-flex items-center gap-2.5 rounded-full border border-indigo-400/40 bg-[#080f23]/75 px-6 py-3 text-sm font-medium text-white backdrop-blur-md transition-all hover:border-cyan-400/70 hover:bg-[#0c1633]/90 whitespace-nowrap"
              >
                <span>Watch Demo</span>
                <Play className="h-3.5 w-3.5 fill-current text-cyan-300" />
              </button>
            </div>
          </div>

          {/* Lower 4 Glassmorphism Feature Cards + Scroll Indicator — Mirrors Reference Screenshot */}
          <div className="mt-14 space-y-6 lg:mt-20">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featureCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onEnterApp(card.id)}
                    className={`group flex flex-col justify-between rounded-2xl border border-white/12 bg-[#091024]/70 p-5 text-left backdrop-blur-md transition-all duration-200 hover:-translate-y-1 ${card.glowClass}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0d1836]/80">
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                    </div>
                    <div className="mt-4">
                      <h2 className="font-display text-base font-semibold text-white">
                        {card.title}
                      </h2>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        {card.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => scrollToSection('features')}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#070d1f]/80 px-4 py-1.5 text-xs text-slate-300 backdrop-blur-sm transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
              >
                <span>Scroll to Explore</span>
                <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Features & Scientific Capabilities */}
      <section id="features" className="relative overflow-hidden border-b border-white/10">
        <CinematicBackdrop
          src="/assets/planets/earth_orbit_horizon.webp"
          alt="Earth atmospheric limb observed from orbit"
          opacityClass="opacity-28"
          scrimClass="bg-gradient-to-b from-[#030612]/95 via-[#030612]/72 to-[#030612]/95"
        />
        <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-20 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
            <div className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
                Platform Capabilities
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-4xl text-balance">
                Built for planetary terrain intelligence and analogue validation
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onEnterApp('dashboard')}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-200 backdrop-blur-sm hover:bg-cyan-500/20 whitespace-nowrap"
            >
              <span>Open Mission Control</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-[#080f23]/80 backdrop-blur-md p-6 space-y-3">
              <Compass className="h-6 w-6 text-cyan-400" />
              <h3 className="font-display text-lg font-semibold text-white">
                Multi-Parameter Analogue Ranking
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Evaluate established benchmarks (Atacama Desert, Haughton Crater, Death Valley)
                alongside candidate sites (Ladakh, Spiti Valley, Rann of Kutch, Lonar Crater, McMurdo
                Dry Valleys, Iceland) using configurable weights and explicit missing-data tracking.
              </p>
              <button
                type="button"
                onClick={() => onEnterApp('analogs')}
                className="inline-flex items-center gap-1.5 pt-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                <span>Launch Analog Finder</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-2xl border border-white/12 bg-[#080f23]/80 backdrop-blur-md p-6 space-y-3">
              <Database className="h-6 w-6 text-sky-400" />
              <h3 className="font-display text-lg font-semibold text-white">
                Real Geospatial DEM Ingestion
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Parse NASA SRTM <span className="font-mono text-xs">.hgt</span> /{' '}
                <span className="font-mono text-xs">.zip</span>, Esri{' '}
                <span className="font-mono text-xs">.asc</span>,{' '}
                <span className="font-mono text-xs">.csv</span>/<span className="font-mono text-xs">.tsv</span>,
                and <span className="font-mono text-xs">.geojson</span> files server-side to compute
                Horn 3×3 slope, Riley TRI, hypsometric curves, and 3D terrain digital twins.
              </p>
              <button
                type="button"
                onClick={() => onEnterApp('datacenter')}
                className="inline-flex items-center gap-1.5 pt-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                <span>Open Data Center</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-2xl border border-white/12 bg-[#080f23]/80 backdrop-blur-md p-6 space-y-3">
              <FileText className="h-6 w-6 text-violet-400" />
              <h3 className="font-display text-lg font-semibold text-white">
                Evidence-Grounded Research Reports
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Separate verified SQLite database facts from hypotheses with the server-side AI
                Research Assistant and export citation-ready scientific reports accounting for
                gravity, atmosphere, and planetary datum limitations.
              </p>
              <button
                type="button"
                onClick={() => onEnterApp('reports')}
                className="inline-flex items-center gap-1.5 pt-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                <span>View Reports</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: About the Scientific Challenge */}
      <section id="about" className="relative overflow-hidden border-b border-white/10 bg-[#050a1a]">
        <CinematicBackdrop
          src="/assets/missions/observatory_horizon.webp"
          alt="Deep space planetary observatory horizon"
          opacityClass="opacity-26"
          scrimClass="bg-gradient-to-r from-[#050a1a]/95 via-[#050a1a]/82 to-[#050a1a]/70"
        />
        <div className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-20 sm:px-8 lg:grid-cols-12 lg:items-center">
          <div className="space-y-5 lg:col-span-6">
            <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
              About VISION ASTRAA
            </p>
            <h2 className="font-display text-2xl font-bold text-white sm:text-4xl text-balance">
              Bridging extreme Earth landscapes with Moon and Mars exploration
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Selecting safe landing zones and future surface habitats depends on local slope
              distributions, surface ruggedness, thermal extremes, mineralogical composition, and
              potential water-ice resources. Terrestrial analogues allow mission teams to test rovers,
              drills, and scientific protocols before launch—yet many candidate regions remain
              under-characterized.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2 sm:grid-cols-3 font-mono">
              <div className="rounded-xl border border-white/10 bg-[#080f23] p-4">
                <div className="text-2xl font-bold text-cyan-300">
                  {overview?.totalEarthAnalogs ?? 9}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Earth Analogue Regions</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#080f23] p-4">
                <div className="text-2xl font-bold text-white">
                  {overview?.planetaryTargets ?? 6}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Moon &amp; Mars Targets</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#080f23] p-4 col-span-2 sm:col-span-1">
                <div className="text-2xl font-bold text-emerald-300">
                  {overview?.processedDatasets ?? 2}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Processed DEM Grids</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-6">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080f23]/85 backdrop-blur-md">
              <SiteImage
                src="/assets/earth/ladakh_valley.webp"
                alt="High-altitude cold arid landscape representing Ladakh analogue environment"
                className="h-44 w-full object-cover"
              />
              <div className="p-3">
                <div className="font-display text-xs font-semibold text-white">Earth Candidates</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Ladakh, Atacama &amp; Polar Valleys
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080f23]/85 backdrop-blur-md">
              <SiteImage
                src="/assets/moon/lunar_south_pole.webp"
                alt="Lunar south pole crater rim visualization"
                className="h-44 w-full object-cover"
              />
              <div className="p-3">
                <div className="font-display text-xs font-semibold text-white">Lunar Targets</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Shackleton Rim &amp; Mare Basins
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080f23]/85 backdrop-blur-md">
              <SiteImage
                src="/assets/mars/mars_jezero_crater.webp"
                alt="Mars Jezero Crater delta conceptual orbital visualization"
                className="h-44 w-full object-cover"
              />
              <div className="p-3">
                <div className="font-display text-xs font-semibold text-white">Martian Targets</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Jezero, Gale &amp; Valles Marineris
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Resources & Open Data Provenance */}
      <section id="resources" className="relative overflow-hidden border-b border-white/10">
        <CinematicBackdrop
          src="/assets/satellite/satellite_swath_telemetry.webp"
          alt="Orbital radar elevation swath texture"
          opacityClass="opacity-22"
          scrimClass="bg-gradient-to-b from-[#030612]/90 via-[#030612]/78 to-[#030612]/95"
        />
        <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-20 sm:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
              Resources &amp; Data Standards
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              Open planetary data pipelines &amp; cross-datum rigor
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Direct access to VISION ASTRAA analytical tools, supported geospatial formats, and
              multi-agency baseline attributions.
            </p>
          </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onEnterApp('datacenter')}
            className="rounded-xl border border-white/10 bg-[#080f23] p-5 text-left transition-colors hover:border-cyan-400/50"
          >
            <div className="font-mono text-xs text-cyan-300">01. Ingestion</div>
            <div className="mt-1 font-display text-base font-semibold text-white">
              SRTM .HGT &amp; GeoJSON Parser
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Upload local elevation grids or analog tables to validate CRS, bounds, and NoData.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEnterApp('vizlab')}
            className="rounded-xl border border-white/10 bg-[#080f23] p-5 text-left transition-colors hover:border-cyan-400/50"
          >
            <div className="font-mono text-xs text-cyan-300">02. Morphometry</div>
            <div className="mt-1 font-display text-base font-semibold text-white">
              Visualization Lab
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Inspect hypsometric curves, slope distributions, and cross-planet clustering plots.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEnterApp('comparison')}
            className="rounded-xl border border-white/10 bg-[#080f23] p-5 text-left transition-colors hover:border-cyan-400/50"
          >
            <div className="font-mono text-xs text-cyan-300">03. Cross-Planet</div>
            <div className="mt-1 font-display text-base font-semibold text-white">
              Datum Normalization
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Compare relative relief, local slope, and TRI without mixing EGM96, LOLA, or MOLA
              datums.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEnterApp('settings')}
            className="rounded-xl border border-white/10 bg-[#080f23] p-5 text-left transition-colors hover:border-cyan-400/50"
          >
            <div className="font-mono text-xs text-cyan-300">04. Calibration</div>
            <div className="mt-1 font-display text-base font-semibold text-white">
              Model Weight Settings
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Adjust feature weighting profiles and review planetary reference datum notes.
            </p>
          </button>
        </div>
        </div>
      </section>

      {/* Section 5: Contact & Launch */}
      <section id="contact" className="relative overflow-hidden border-t border-white/10 bg-[#050a1a]">
        <CinematicBackdrop
          src="/assets/textures/deep_space_nebula_research.webp"
          alt="Deep space astronomical starfield backdrop"
          opacityClass="opacity-45"
          scrimClass="bg-gradient-to-b from-[#050a1a]/90 via-[#050a1a]/75 to-[#030612]/95"
        />
        <div className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-20 sm:px-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
              Research Collaboration
            </p>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Connect with the VISION ASTRAA team
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Propose new terrestrial analogue field sites, share orbital DEM datasets, or jump
              directly into the Mission Control dashboard with zero login barriers.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onEnterApp('dashboard')}
                className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                <span>Launch Mission Control Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <form
            onSubmit={handleContactSubmit}
            className="rounded-2xl border border-white/10 bg-[#080f23] p-6 space-y-4 lg:col-span-7"
          >
            {contactSubmitted && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  Research inquiry recorded. You can continue exploring all modules immediately via
                  Get Started.
                </span>
              </div>
            )}
            {contactError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
                {contactError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Dr. A. Sharma"
                  className="w-full rounded-xl border border-slate-700 bg-[#050918] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="researcher@observatory.org"
                  className="w-full rounded-xl border border-slate-700 bg-[#050918] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Institution / Mission Team (Optional)
              </label>
              <input
                type="text"
                value={contactOrg}
                onChange={(e) => setContactOrg(e.target.value)}
                placeholder="Planetary Geomorphology Lab"
                className="w-full rounded-xl border border-slate-700 bg-[#050918] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Message</label>
              <textarea
                rows={3}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Describe candidate analog sites, SRTM/MOLA tiles, or mission testing objectives..."
                className="w-full rounded-xl border border-slate-700 bg-[#050918] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-5 py-2.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25"
            >
              <Send className="h-3.5 w-3.5" />
              Send Research Note
            </button>
          </form>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#030612] px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="font-display font-semibold text-slate-200">
            VISION ASTRAA · Earth, Moon &amp; Mars Terrain Intelligence
          </div>
          <div>
            NASA Space Apps Challenge · Public Research Access (No Authentication Required)
          </div>
        </div>
      </footer>
    </div>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import CinematicMedia from './components/CinematicMedia';
import {
  EarthRegionExplorer, EarthMoonComparison, EarthMarsComparison, TerrainIntelligence, EarthAnalogueFinder,
} from './components/TerrainScience';
import Research from './components/Research';
import { regions } from './science';
import type { Region } from './science';

gsap.registerPlugin(ScrollTrigger);
const DigitalTwin = lazy(() => import('./components/DigitalTwin'));
const planets = ['Earth', 'Moon', 'Mars'] as const;
type Planet = Region['planet'];

const chapters = [
  ['beginning', 'The Beginning'],
  ['the-question', 'The Question'],
  ['earth', 'Earth Laboratory'],
  ['earth-moon', 'Earth vs Moon'],
  ['earth-mars', 'Earth vs Mars'],
  ['terrain-intelligence', 'Terrain Intelligence'],
  ['digital-twin', 'The Digital Twin'],
  ['research', 'Research Intelligence'],
  ['mission-control', 'Mission Control'],
] as const;

const planetaryIntroductions = {
  Earth: {
    image: '/media/planet-earth.webp',
    summary: 'Water, ice, volcanism and tectonics sculpt an extraordinary variety of landforms. Earth gives planetary researchers a place to test how terrain measurements respond to those different processes.',
    source: 'NASA · Apollo 17',
    sourceUrl: 'https://images.nasa.gov/details/as17-148-22727',
  },
  Moon: {
    image: '/media/planet-moon.webp',
    summary: 'Impact craters, volcanic plains and rugged highlands shape the lunar surface. Laser altimetry from orbit reveals the relief across these landforms.',
    source: 'NASA · Artemis II',
    sourceUrl: 'https://images.nasa.gov/details/art002e009057',
  },
  Mars: {
    image: '/media/planet-mars.webp',
    summary: 'Impact basins, shield volcanoes and ancient channels record different chapters in Martian history. Regional elevation profiles reveal the shapes of these features at a common map scale.',
    source: 'NASA / JPL / USGS',
    sourceUrl: 'https://science.nasa.gov/photojournal/global-color-views-of-mars/',
  },
};

const missionItems = [
  ['the-question', 'Planetary Explorer', 'Explore Earth, the Moon and Mars.'],
  ['analogue-finder', 'Earth Analogue Finder', 'Rank available Earth terrain samples.'],
  ['earth-moon', 'Earth–Moon Comparison', 'Compare paired elevation and relief.'],
  ['earth-mars', 'Earth–Mars Comparison', 'Explore Jezero and other Mars regions.'],
  ['digital-twin', '3D Digital Twin', 'Inspect sampled terrain in three dimensions.'],
  ['data-center', 'Scientific Data Center', 'Review data sources and download samples.'],
  ['copilot', 'Research Copilot', 'Ask about the active regions and methods.'],
  ['reports', 'Reports', 'Download a provenance-rich research report.'],
] as const;

function preferredRegion(planet: Planet, name: string) {
  return (regions.find(region => region.planet === planet && region.name.includes(name)) ??
    regions.find(region => region.planet === planet))?.id ?? '';
}

function useChapterProgress() {
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    let pending = 0;
    const progress = document.querySelector<HTMLElement>('.reading-progress span');
    const nodes = chapters.map(([id]) => document.getElementById(id));

    function update() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const fraction = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      progress?.style.setProperty('transform', `scaleX(${Math.min(1, Math.max(0, fraction))})`);
      const readingLine = Math.min(230, window.innerHeight * 0.36);
      let active = 0;
      nodes.forEach((node, index) => {
        if (node && node.getBoundingClientRect().top <= readingLine) active = index;
      });
      setChapter(active);
    }

    function onScroll() {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        update();
      });
    }

    update();
    const heightWatcher = new ResizeObserver(onScroll);
    heightWatcher.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(pending);
      heightWatcher.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return chapter;
}

function ChapterHeading({
  index, eyebrow, children, intro, className = '',
}: { index: number; eyebrow: string; children: ReactNode; intro?: string; className?: string }) {
  return (
    <div className={`chapter-heading ${className}`} data-reveal>
      <div className="eyebrow"><span className="eyebrow-dot" />CHAPTER {String(index).padStart(2, '0')} <span className="eyebrow-rule" /> {eyebrow}</div>
      <h2 id={`chapter-title-${index}`}>{children}</h2>
      {intro && <p>{intro}</p>}
    </div>
  );
}

function PlanetSelector({ onExplore }: { onExplore: (planet: Planet) => void }) {
  const [planet, setPlanet] = useState<Planet>('Earth');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = planetaryIntroductions[planet];

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'ArrowRight' ? (index + 1) % planets.length :
      event.key === 'ArrowLeft' ? (index + planets.length - 1) % planets.length :
      event.key === 'Home' ? 0 : event.key === 'End' ? planets.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    setPlanet(planets[target]);
    tabs.current[target]?.focus();
  }

  return (
    <div className="planet-selector">
      <div className="planet-tabs" role="tablist" aria-label="Choose a world">
        {planets.map((body, index) => (
          <button key={body} ref={node => { tabs.current[index] = node; }}
            type="button" role="tab" id={`planet-tab-${body}`} aria-controls="planet-description"
            aria-selected={planet === body} tabIndex={planet === body ? 0 : -1}
            className={`planet-tab planet-${body.toLowerCase()}`}
            onClick={() => setPlanet(body)} onKeyDown={event => handleKeys(event, index)}>
            <span className="planet-still"><img src={planetaryIntroductions[body].image} alt="" loading="lazy" /></span>
            <span className="planet-tab__label">{body} <span aria-hidden="true">↗</span></span>
          </button>
        ))}
      </div>
      <div className="planet-description" id="planet-description" role="tabpanel" aria-labelledby={`planet-tab-${planet}`}>
        <div><h3>{planet}</h3><p>{current.summary}</p><a className="dataset-credit" href={current.sourceUrl} target="_blank" rel="noreferrer">Globe imagery · {current.source} ↗</a></div>
        <button type="button" className="text-link" onClick={() => onExplore(planet)}>Explore {planet} terrain <span aria-hidden="true">↗</span></button>
      </div>
    </div>
  );
}

export default function App() {
  const [selection, setSelection] = useState<Record<Planet, string>>(() => ({
    Earth: preferredRegion('Earth', 'Atacama'),
    Moon: preferredRegion('Moon', 'Shackleton'),
    Mars: preferredRegion('Mars', 'Jezero'),
  }));
  const [twinTarget, setTwinTarget] = useState<{ id: string; comparisonId?: string }>();
  const [twinRequest, setTwinRequest] = useState(0);
  const [showTwin, setShowTwin] = useState(false);
  const [analogueOpen, setAnalogueOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const twinSection = useRef<HTMLElement>(null);
  const activeChapter = useChapterProgress();
  const activeRegions = {
    earth: regions.find(region => region.id === selection.Earth),
    moon: regions.find(region => region.id === selection.Moon),
    mars: regions.find(region => region.id === selection.Mars),
  };

  useEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.hero__body > *', { y: 20, opacity: 0, duration: 0.75, stagger: 0.09, ease: 'power2.out', clearProps: 'opacity,transform' });
      gsap.utils.toArray<HTMLElement>('[data-reveal]', page.current ?? undefined).forEach(element => {
        gsap.from(element, {
          y: 27, opacity: 0.72, duration: 0.7, ease: 'power2.out', clearProps: 'opacity,transform',
          scrollTrigger: { trigger: element, start: 'top 90%', once: true },
        });
      });
    });
    return () => media.revert();
  }, []);

  useEffect(() => {
    if (showTwin || !twinSection.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setShowTwin(true);
    }, { rootMargin: '260px' });
    observer.observe(twinSection.current);
    return () => observer.disconnect();
  }, [showTwin]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    if (hash === 'analogue-finder') setAnalogueOpen(true);
    const frame = requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, []);

  function goTo(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    setMenuOpen(false);
    if (id === 'analogue-finder') setAnalogueOpen(true);
    if (id === 'digital-twin') setShowTwin(true);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function follow(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    goTo(id);
  }

  function selectRegion(planet: Planet, id: string) {
    setSelection(previous => ({ ...previous, [planet]: id }));
  }

  function openTerrain(planet: Planet, id: string) {
    selectRegion(planet, id);
    setTwinTarget({ id, comparisonId: planet === 'Earth' ? undefined : selection.Earth });
    setTwinRequest(previous => previous + 1);
    setShowTwin(true);
    goTo('digital-twin');
  }

  const panelProps = {
    selection, onSelect: selectRegion, onOpenTerrain: openTerrain,
    onOpenComparison: (planet: 'Moon' | 'Mars') => goTo(planet === 'Moon' ? 'earth-moon' : 'earth-mars'),
  };

  return (
    <div ref={page} className="storytelling-layout">
      <a href="#beginning" className="skip-link">Skip to story</a>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="#beginning" onClick={event => follow(event, 'beginning')} aria-label="Vision Astraa, beginning">
            <img src="/favicon.svg" width="36" height="36" alt="" />
            <span>VISION <strong>ASTRAA</strong></span>
          </a>
          <nav className="top-nav" aria-label="Main navigation">
            <a href="#the-question" onClick={event => follow(event, 'the-question')}>The Story</a>
            <a href="#earth-moon" onClick={event => follow(event, 'earth-moon')}>Comparisons</a>
            <a href="#research" onClick={event => follow(event, 'research')}>Research</a>
          </nav>
          <div className="header-actions">
            <a className="mission-link" href="#mission-control" onClick={event => follow(event, 'mission-control')}>MISSION CONTROL <span aria-hidden="true">↗</span></a>
            <button type="button" className="chapter-menu-toggle" aria-expanded={menuOpen}
              aria-controls="chapter-nav" aria-label={menuOpen ? 'Close chapter menu' : 'Open chapter menu'}
              onClick={() => setMenuOpen(previous => !previous)}>
              <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>
        <div className="reading-progress" aria-hidden="true"><span /></div>
      </header>

      <nav id="chapter-nav" className={`chapter-nav${menuOpen ? ' is-open' : ''}`} aria-label="Story chapters">
        {chapters.map(([id, label], index) => (
          <a href={`#${id}`} key={id} aria-label={`Chapter ${index + 1}. ${label}`}
            aria-current={activeChapter === index ? 'location' : undefined}
            onClick={event => follow(event, id)}>
            <span className="chapter-nav__label">{String(index + 1).padStart(2, '0')} / {label}</span>
            <span className="chapter-nav__marker" aria-hidden="true" />
          </a>
        ))}
      </nav>

      <main>
        <section id="beginning" className="hero" tabIndex={-1} aria-labelledby="hero-title">
          <CinematicMedia priority className="cinematic--hero" playOnce poster="/media/earth-intro.webp"
            video="/media/earth-intro.mp4" caption="CINEMATIC VISUALIZATION · EARTH ORBIT"
            description="Cinematic visualization of Earth from orbit against a star field" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap hero__inner">
            <div className="hero__body">
              <div className="eyebrow"><span className="eyebrow-dot" /> A PLANETARY FIELD GUIDE</div>
              <h1 id="hero-title"><span>VISION</span><span>ASTRAA<span className="hero-period" aria-hidden="true">.</span></span></h1>
              <p className="hero__tagline">ONE EARTH. TWO WORLDS. INFINITE POSSIBILITIES.</p>
              <p className="hero__description">Study the landscapes we know to understand the worlds we have yet to explore.</p>
              <div className="hero__actions">
                <a className="button button--primary" href="#the-question" onClick={event => follow(event, 'the-question')}>
                  Explore the Story <span aria-hidden="true">↓</span>
                </a>
                <a className="button button--outline" href="#mission-control" onClick={event => follow(event, 'mission-control')}>
                  Skip to Exploration <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
          <div className="wrap hero__base">
            <a className="scroll-cue" href="#the-question" onClick={event => follow(event, 'the-question')}><span aria-hidden="true" /> SCROLL TO EXPLORE</a>
            <div className="hero__chapter"><strong>01</strong><span> / 09</span></div>
          </div>
        </section>

        <section id="the-question" className="chapter question-chapter" tabIndex={-1} aria-labelledby="chapter-title-2">
          <div className="wrap">
            <ChapterHeading index={2} eyebrow="THE QUESTION" intro="Planetary exploration means learning to read unfamiliar landscapes. Some terrain on Earth shares measurable forms with regions on the Moon and Mars.">
              What if the answers to other worlds are already on Earth?
            </ChapterHeading>
            <PlanetSelector onExplore={planet => goTo(planet === 'Earth' ? 'earth' : planet === 'Moon' ? 'earth-moon' : 'earth-mars')} />
            <p className="scientific-note">Similar landforms can come from different geological processes. Terrain morphology alone cannot establish shared geology or determine whether a site is suitable for exploration.</p>
          </div>
        </section>

        <section id="earth" className="chapter field-chapter field-earth" tabIndex={-1} aria-labelledby="chapter-title-3">
          <div className="field-intro">
            <CinematicMedia poster="/media/earth-landscape.webp" caption="GRAND CANYON FROM THE ISS · NASA"
              sourceUrl="https://images.nasa.gov/details/iss074e0208838"
              description="NASA photograph of the Grand Canyon from the International Space Station" />
            <div className="wrap">
              <ChapterHeading index={3} eyebrow="EARTH LABORATORY" intro="Explore the terrestrial reference regions and see how elevation, slope and ruggedness are derived from sampled elevation grids.">
                Before we explore other worlds, we study our own.
              </ChapterHeading>
            </div>
          </div>
          <div className="wrap field-tool"><EarthRegionExplorer {...panelProps} /></div>
        </section>

        <section id="earth-moon" className="chapter field-chapter field-moon" tabIndex={-1} aria-labelledby="chapter-title-4">
          <div className="field-intro">
            <CinematicMedia poster="/media/moon-terrain.webp" video="/media/moon-terrain.mp4"
              caption="CINEMATIC VISUALIZATION · LUNAR FLYOVER" description="Cinematic visualization of cratered lunar terrain" />
            <div className="wrap">
              <ChapterHeading index={4} eyebrow="EARTH VS MOON" intro="Put terrestrial landforms alongside lunar terrain and examine how their elevation profiles and ruggedness vary at the same sampling scale.">
                Different worlds. Comparable terrain.
              </ChapterHeading>
            </div>
          </div>
          <div className="wrap field-tool"><EarthMoonComparison {...panelProps} /></div>
        </section>

        <section id="earth-mars" className="chapter field-chapter field-mars" tabIndex={-1} aria-labelledby="chapter-title-5">
          <div className="field-intro">
            <CinematicMedia poster="/media/mars-terrain.webp" video="/media/mars-terrain.mp4"
              caption="CINEMATIC VISUALIZATION · JEZERO CRATER" description="Cinematic visualization inspired by Jezero Crater on Mars" />
            <div className="wrap">
              <ChapterHeading index={5} eyebrow="EARTH VS MARS" intro="Start at Jezero Crater, then compare other Martian regions against a terrestrial reference using transparent, scale-matched terrain metrics.">
                Searching Earth for clues to Mars.
              </ChapterHeading>
            </div>
          </div>
          <div className="wrap field-tool"><EarthMarsComparison {...panelProps} /></div>
        </section>

        <section id="terrain-intelligence" className="chapter method-chapter" tabIndex={-1} aria-labelledby="chapter-title-6">
          <div className="wrap">
            <ChapterHeading index={6} eyebrow="TERRAIN INTELLIGENCE" intro="Follow the steps from a grid of elevation measurements to a comparison you can reproduce.">
              Turning landscapes into measurable intelligence.
            </ChapterHeading>
            <TerrainIntelligence {...panelProps} />
          </div>
        </section>

        <section id="digital-twin" ref={twinSection} className="chapter twin-chapter" tabIndex={-1} aria-labelledby="chapter-title-7">
          <div className="twin-chapter__landscape">
            <CinematicMedia poster="/media/moon-landscape.webp" caption="DAEDALUS CRATER · NASA / APOLLO 11" sourceUrl="https://images.nasa.gov/details/as11-44-6609" description="Apollo 11 photograph of Daedalus crater on the Moon" />
          </div>
          <div className="wrap">
            <ChapterHeading index={7} eyebrow="THE DIGITAL TWIN" intro="Orbit a terrain mesh built from source elevation samples. Inspect elevation, switch surface colors and compare worlds side by side.">
              From terrain data to explorable worlds.
            </ChapterHeading>
            {showTwin ? (
              <Suspense fallback={<p className="loading-panel" role="status">Loading the 3D terrain viewer…</p>}>
                <DigitalTwin key={twinRequest} regionId={twinTarget?.id ?? (selection.Mars || selection.Earth)}
                  comparisonRegionId={twinTarget?.comparisonId} compareByDefault={!!twinTarget?.comparisonId}
                  onRegionChange={id => {
                    const region = regions.find(candidate => candidate.id === id);
                    if (region) {
                      selectRegion(region.planet, id);
                      setTwinTarget(previous => ({ ...previous, id }));
                    }
                  }} />
              </Suspense>
            ) : <p className="loading-panel" role="status">The terrain viewer loads as you approach this chapter.</p>}
          </div>
        </section>

        <section id="research" className="chapter research-chapter" tabIndex={-1} aria-labelledby="chapter-title-8">
          <div className="wrap">
            <ChapterHeading index={8} eyebrow="RESEARCH INTELLIGENCE" intro="Trace the sources behind each sample, ask about your selected regions and export a report with the measurements and their limitations.">
              From exploration to scientific insight.
            </ChapterHeading>
            <Research {...activeRegions} />
          </div>
        </section>

        <section id="mission-control" className="chapter mission-chapter" tabIndex={-1} aria-labelledby="chapter-title-9">
          <div className="field-intro mission-intro">
            <CinematicMedia poster="/media/planetary-finale.webp" video="/media/planetary-finale.mp4"
              caption="CINEMATIC VISUALIZATION · EARTH, MOON & MARS" description="Cinematic visualization of Earth, the Moon and Mars" />
            <div className="wrap">
              <ChapterHeading index={9} eyebrow="MISSION CONTROL" intro="Return to a world, find an Earth analogue or continue your investigation with the research tools.">
                Three worlds. One exploration platform.
              </ChapterHeading>
            </div>
          </div>
          <div className="wrap mission-workspace">
            <nav className="mission-directory" aria-label="Exploration tools">
              {missionItems.map(([id, label, copy]) => (
                <a key={id} href={`#${id}`} onClick={event => follow(event, id)}>
                  <div><strong>{label}</strong><span>{copy}</span></div><span className="mission-arrow" aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
            <details id="analogue-finder" className="analogue-drawer" tabIndex={-1} open={analogueOpen}
              onToggle={event => setAnalogueOpen(event.currentTarget.open)}>
              <summary>Earth Analogue Finder</summary>
              {analogueOpen && <EarthAnalogueFinder {...panelProps} />}
            </details>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-content">
          <a className="wordmark" href="#beginning" onClick={event => follow(event, 'beginning')}>
            <img src="/favicon.svg" width="35" height="35" alt="" /><span>VISION <strong>ASTRAA</strong></span>
          </a>
          <p>Earth, the Moon and Mars through terrain science.</p>
          <a className="text-link" href="#beginning" onClick={event => follow(event, 'beginning')}>Back to the beginning <span aria-hidden="true">↑</span></a>
        </div>
      </footer>
    </div>
  );
}

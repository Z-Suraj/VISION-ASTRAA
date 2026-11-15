import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Home, Menu, Play, Search, Settings, X } from 'lucide-react';
import type { AnalogSite } from '../types/astraa.ts';
import { ALL_NAV_ITEMS, getNavItem, type NavRoute } from '../types/navigation.ts';

interface GlobalHeaderProps {
  activeRoute: NavRoute;
  sites: AnalogSite[];
  onOpenMobileMenu: () => void;
  onNavigate: (route: NavRoute) => void;
  onNavigateLanding: () => void;
  onSelectSite: (siteId: string) => void;
  onOpenMissionVideo: () => void;
}

export default function GlobalHeader({
  activeRoute,
  sites,
  onOpenMobileMenu,
  onNavigate,
  onNavigateLanding,
  onSelectSite,
  onOpenMissionVideo,
}: GlobalHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const currentItem = useMemo(() => getNavItem(activeRoute), [activeRoute]);

  const matchingModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.groupTitle.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [searchQuery]);

  const matchingSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return sites
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [searchQuery, sites]);

  const showDropdown =
    searchFocused &&
    searchQuery.trim().length > 0 &&
    (matchingModules.length > 0 || matchingSites.length > 0);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-800/80 bg-[#050814]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Left: Mobile Drawer Trigger + Breadcrumbs & Current Page Title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-cyan-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400"
            >
              <button
                type="button"
                onClick={onNavigateLanding}
                className="inline-flex items-center gap-1 hover:text-cyan-300 transition-colors whitespace-nowrap"
              >
                <Home className="h-3 w-3" />
                <span>VISION ASTRAA</span>
              </button>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span className="truncate text-slate-400">{currentItem.groupTitle}</span>
              <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
              <span className="truncate font-medium text-cyan-300">{currentItem.label}</span>
            </nav>
            <div className="truncate font-display text-sm font-bold text-white sm:text-base">
              {currentItem.label}
            </div>
          </div>
        </div>

        {/* Center: Quick Navigation & Planetary Site Search */}
        <div ref={searchRef} className="relative hidden md:block w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchFocused(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                setSearchFocused(false);
              }
            }}
            placeholder="Quick jump: Ladakh, Jezero, Morphometric, Reports..."
            aria-label="Search planetary sites or modules"
            className="w-full rounded-xl border border-slate-800 bg-[#091024]/95 py-2 pr-8 pl-9 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-500 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {showDropdown && (
            <div className="absolute right-0 left-0 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-slate-700/90 bg-[#081024] p-2 shadow-2xl">
              {matchingModules.length > 0 && (
                <div className="mb-1.5">
                  <div className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    Modules
                  </div>
                  {matchingModules.map((mod) => {
                    const ModIcon = mod.icon;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchFocused(false);
                          onNavigate(mod.id);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-800/80"
                      >
                        <span className="flex items-center gap-2 font-medium text-slate-100">
                          <ModIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          {mod.label}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {mod.groupTitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {matchingSites.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    Planetary Sites
                  </div>
                  {matchingSites.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchFocused(false);
                        onSelectSite(s.id);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-800/80"
                    >
                      <span className="truncate font-medium text-slate-100">{s.name}</span>
                      <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                        {s.body}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Mission Brief & Settings Access */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenMissionVideo}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Mission Brief</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Open Platform Settings"
            title="Platform Calibration & Settings"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              activeRoute === 'settings'
                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-cyan-500/40 hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

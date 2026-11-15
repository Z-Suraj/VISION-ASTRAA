import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import AstraaLogo from './AstraaLogo.tsx';
import SiteImage from './SiteImage.tsx';
import { NAV_GROUPS, type NavItemConfig, type NavRoute } from '../types/navigation.ts';

interface AppSidebarProps {
  activeRoute: NavRoute;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onSelectRoute: (route: NavRoute) => void;
  onNavigateLanding: () => void;
}

interface FloatingTooltipState {
  label: string;
  description: string;
  groupTitle: string;
  top: number;
  left: number;
}

export default function AppSidebar({
  activeRoute,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
  onSelectRoute,
  onNavigateLanding,
}: AppSidebarProps) {
  const [tooltip, setTooltip] = useState<FloatingTooltipState | null>(null);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  // Clear floating tooltip when expanding
  useEffect(() => {
    if (!collapsed) setTooltip(null);
  }, [collapsed]);

  const showItemTooltip = (el: HTMLElement, item: NavItemConfig) => {
    if (!collapsed) return;
    const rect = el.getBoundingClientRect();
    setTooltip({
      label: item.label,
      description: item.shortDescription,
      groupTitle: item.groupTitle,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideTooltip = () => setTooltip(null);

  const handleItemClick = (route: NavRoute) => {
    setTooltip(null);
    onSelectRoute(route);
    onCloseMobile();
  };

  const getToneDotColor = (tone?: NavItemConfig['accentTone']) => {
    if (tone === 'emerald') return 'text-emerald-400';
    if (tone === 'orange') return 'text-orange-400';
    if (tone === 'violet') return 'text-violet-400';
    if (tone === 'slate') return 'text-slate-300';
    return 'text-cyan-400';
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Primary application navigation"
        className={`no-print fixed inset-y-0 left-0 z-50 flex flex-col justify-between border-r border-slate-800/90 bg-[#060b1a] transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          collapsed ? 'lg:w-[76px]' : 'lg:w-[272px]'
        } w-[272px] ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        {/* Top Brand + Collapse Toggle */}
        <div className="flex flex-col border-b border-slate-800/80">
          <div
            className={`flex items-center px-3.5 py-3.5 ${
              collapsed ? 'lg:flex-col lg:gap-2.5 lg:px-2' : 'justify-between gap-2'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onNavigateLanding();
              }}
              title="VISION ASTRAA — Return to Landing Page"
              className="group flex items-center rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <AstraaLogo
                variant={collapsed ? 'icon' : 'compact'}
                tone="dark"
                size="sm"
                className={collapsed ? 'lg:justify-center' : ''}
              />
            </button>

            {/* Desktop Expand / Collapse Toggle Button */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            {/* Mobile Drawer Close Button */}
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Organized Navigation Groups */}
        <nav
          className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-4 ${
            collapsed ? 'lg:px-2 px-3' : 'px-3'
          }`}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
              {/* Group Header (hidden smoothly in collapsed desktop mode, visible on mobile drawer) */}
              <div
                className={`px-2.5 pb-1 transition-opacity duration-150 ${
                  collapsed ? 'lg:hidden' : 'block'
                }`}
              >
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {group.title}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{group.description}</div>
              </div>

              {collapsed && (
                <div
                  className="hidden lg:block mx-2 my-1.5 border-t border-slate-800/70 first:hidden"
                  aria-hidden="true"
                />
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeRoute === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item.id)}
                        onMouseEnter={(e) => showItemTooltip(e.currentTarget, item)}
                        onMouseLeave={hideTooltip}
                        onFocus={(e) => showItemTooltip(e.currentTarget, item)}
                        onBlur={hideTooltip}
                        aria-current={active ? 'page' : undefined}
                        aria-label={item.label}
                        className={`group relative flex w-full items-center rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                          collapsed
                            ? 'lg:justify-center lg:px-0 lg:py-2.5 gap-3 px-3 py-2.5'
                            : 'gap-3 px-3 py-2'
                        } ${
                          active
                            ? 'border border-cyan-500/45 bg-gradient-to-r from-cyan-500/18 to-blue-500/10 text-white'
                            : 'border border-transparent text-slate-300 hover:bg-slate-900/90 hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            active
                              ? getToneDotColor(item.accentTone)
                              : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        <span
                          className={`truncate whitespace-nowrap transition-opacity duration-150 ${
                            collapsed ? 'lg:hidden' : 'block'
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom Observatory Card (Expanded / Mobile) or Compact Tag (Collapsed) */}
        <div className="border-t border-slate-800/80 p-3">
          {collapsed ? (
            <div className="hidden lg:flex flex-col items-center gap-1 py-1 text-center">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-400">
                VA
              </span>
              <span className="font-mono text-[8px] text-slate-500">E·M·M</span>
            </div>
          ) : null}
          <div
            className={`relative overflow-hidden rounded-xl border border-slate-800/80 ${
              collapsed ? 'lg:hidden' : 'block'
            }`}
          >
            <SiteImage
              src="/assets/missions/observatory_horizon.webp"
              alt="Planetary observatory horizon"
              className="h-24 w-full object-cover opacity-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-[#050814]/55 to-transparent" />
            <div className="relative z-10 -mt-11 p-3">
              <div className="font-display text-xs font-semibold text-white">
                NASA Space Apps
              </div>
              <div className="text-[10px] text-slate-300">
                Explore Worlds · Advance Exploration
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Unclipped Floating Tooltip for Collapsed Desktop State */}
      {collapsed && tooltip && (
        <div
          role="tooltip"
          style={{ top: tooltip.top, left: tooltip.left }}
          className="pointer-events-none fixed z-[70] hidden -translate-y-1/2 lg:block"
        >
          <div className="w-60 rounded-xl border border-cyan-500/40 bg-[#081024]/95 px-3 py-2.5 shadow-2xl backdrop-blur-md">
            <div className="font-mono text-[9px] uppercase tracking-wider text-cyan-400">
              {tooltip.groupTitle}
            </div>
            <div className="mt-0.5 font-display text-xs font-semibold text-white">
              {tooltip.label}
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-slate-300">
              {tooltip.description}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import type { AnalogSite } from '../types/astraa.ts';
import type { NavRoute } from '../types/navigation.ts';
import AppSidebar from './AppSidebar.tsx';
import AstraaLogo from './AstraaLogo.tsx';
import CinematicBackdrop from './CinematicBackdrop.tsx';
import GlobalHeader from './GlobalHeader.tsx';

const SIDEBAR_STORAGE_KEY = 'vision_astraa_sidebar_collapsed';

interface AppShellProps {
  activeRoute: NavRoute;
  sites: AnalogSite[];
  loading: boolean;
  onNavigate: (route: NavRoute) => void;
  onNavigateLanding: () => void;
  onSelectSite: (siteId: string) => void;
  onOpenMissionVideo: () => void;
  children: ReactNode;
}

function getBackdropForRoute(route: NavRoute): {
  src: string;
  opacityClass: string;
} {
  switch (route) {
    case 'dashboard':
      return { src: '/assets/planets/earth_orbit_horizon.webp', opacityClass: 'opacity-[0.20]' };
    case 'explorer':
    case 'explorer-earth':
      return { src: '/assets/planets/earth_orbit_horizon.webp', opacityClass: 'opacity-[0.20]' };
    case 'explorer-moon':
      return { src: '/assets/moon/lunar_south_pole.webp', opacityClass: 'opacity-[0.22]' };
    case 'explorer-mars':
      return { src: '/assets/mars/mars_valles_canyon.webp', opacityClass: 'opacity-[0.22]' };
    case 'comparison':
    case 'similarity-results':
      return { src: '/assets/geological/volcanic_iceland_basalt.webp', opacityClass: 'opacity-[0.18]' };
    case 'analogs':
      return { src: '/assets/landscapes/atacama_hyperarid_basin.webp', opacityClass: 'opacity-[0.20]' };
    case 'datacenter':
      return { src: '/assets/satellite/satellite_swath_telemetry.webp', opacityClass: 'opacity-[0.16]' };
    case 'vizlab':
    case 'morphometrics':
      return { src: '/assets/satellite/satellite_swath_telemetry.webp', opacityClass: 'opacity-[0.12]' };
    case 'assistant':
      return { src: '/assets/textures/deep_space_nebula_research.webp', opacityClass: 'opacity-30' };
    case 'reports':
      return { src: '/assets/geological/impact_crater_basalt.webp', opacityClass: 'opacity-[0.16]' };
    case 'settings':
    case 'help':
    default:
      return { src: '/assets/missions/observatory_horizon.webp', opacityClass: 'opacity-[0.20]' };
  }
}

export default function AppShell({
  activeRoute,
  sites,
  loading,
  onNavigate,
  onNavigateLanding,
  onSelectSite,
  onOpenMissionVideo,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore storage quota errors in restricted frames
    }
  }, [collapsed]);

  const backdrop = getBackdropForRoute(activeRoute);

  return (
    <div className="min-h-screen bg-[#050814] text-slate-100 flex overflow-x-hidden">
      <AppSidebar
        activeRoute={activeRoute}
        collapsed={collapsed}
        mobileOpen={mobileMenuOpen}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectRoute={onNavigate}
        onNavigateLanding={onNavigateLanding}
      />

      <div className="relative flex min-w-0 flex-1 flex-col bg-[#050814]">
        <CinematicBackdrop
          className="no-print"
          src={backdrop.src}
          alt="Planetary atmospheric backdrop"
          opacityClass={backdrop.opacityClass}
          scrimClass="bg-gradient-to-b from-[#050814]/90 via-[#050814]/82 to-[#050814]/95"
        />

        <GlobalHeader
          activeRoute={activeRoute}
          sites={sites}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={onNavigate}
          onNavigateLanding={onNavigateLanding}
          onSelectSite={onSelectSite}
          onOpenMissionVideo={onOpenMissionVideo}
        />

        <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {loading ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-[#080f23]/90 p-8 text-center backdrop-blur-md">
              <div className="animate-pulse">
                <AstraaLogo variant="full" tone="dark" size="lg" />
              </div>
              <div className="text-xs text-slate-400">
                Initializing planetary elevation grids and analogue repository...
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

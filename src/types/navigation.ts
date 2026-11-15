import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Compass,
  Database,
  FileText,
  Globe2,
  Home,
  Layers,
  MapPin,
  Orbit,
  Settings,
  Sparkles,
  Table2,
} from 'lucide-react';

export type NavRoute =
  | 'dashboard'
  | 'explorer'
  | 'explorer-earth'
  | 'explorer-moon'
  | 'explorer-mars'
  | 'comparison'
  | 'analogs'
  | 'morphometrics'
  | 'similarity-results'
  | 'datacenter'
  | 'vizlab'
  | 'reports'
  | 'assistant'
  | 'settings'
  | 'help';

export type AppRoute = 'landing' | NavRoute;

export interface NavItemConfig {
  id: NavRoute;
  label: string;
  shortDescription: string;
  icon: LucideIcon;
  groupId: string;
  groupTitle: string;
  accentTone?: 'cyan' | 'emerald' | 'slate' | 'orange' | 'violet';
}

export interface NavGroupConfig {
  id: string;
  title: string;
  description: string;
  items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'overview',
    title: 'Overview',
    description: 'Platform command & status',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        shortDescription: 'Mission telemetry, KPI overview, and active 3D globe',
        icon: Home,
        groupId: 'overview',
        groupTitle: 'Overview',
      },
    ],
  },
  {
    id: 'planetary',
    title: 'Planetary Exploration',
    description: '3D globes & GIS coordinates',
    items: [
      {
        id: 'explorer',
        label: 'Planetary Explorer',
        shortDescription: 'Multi-body 3D sphere & 2D GIS explorer',
        icon: Orbit,
        groupId: 'planetary',
        groupTitle: 'Planetary Exploration',
      },
      {
        id: 'explorer-earth',
        label: 'Earth Explorer',
        shortDescription: '9 terrestrial analogue sites on Three.js Blue Marble',
        icon: Globe2,
        groupId: 'planetary',
        groupTitle: 'Planetary Exploration',
        accentTone: 'emerald',
      },
      {
        id: 'explorer-moon',
        label: 'Moon Explorer',
        shortDescription: 'Lunar south pole & volcanic plateau study targets',
        icon: MapPin,
        groupId: 'planetary',
        groupTitle: 'Planetary Exploration',
        accentTone: 'slate',
      },
      {
        id: 'explorer-mars',
        label: 'Mars Explorer',
        shortDescription: 'Jezero, Valles Marineris & Gale Crater terrain targets',
        icon: MapPin,
        groupId: 'planetary',
        groupTitle: 'Planetary Exploration',
        accentTone: 'orange',
      },
    ],
  },
  {
    id: 'analysis',
    title: 'Scientific Analysis',
    description: 'Morphometry & cross-planet scoring',
    items: [
      {
        id: 'comparison',
        label: 'Terrain Comparison Studio',
        shortDescription: 'Side-by-side 3D DEM, radar & physical limitations',
        icon: Layers,
        groupId: 'analysis',
        groupTitle: 'Scientific Analysis',
      },
      {
        id: 'analogs',
        label: 'Earth Analog Finder',
        shortDescription: 'Weighted discovery & uncertainty-aware ranking',
        icon: Compass,
        groupId: 'analysis',
        groupTitle: 'Scientific Analysis',
      },
      {
        id: 'morphometrics',
        label: 'Morphometric Analysis',
        shortDescription: 'Slope vs. Riley TRI clustering across all 15 regions',
        icon: Activity,
        groupId: 'analysis',
        groupTitle: 'Scientific Analysis',
      },
      {
        id: 'similarity-results',
        label: 'Similarity Results',
        shortDescription: '54-pair planetary similarity comparison matrix',
        icon: Table2,
        groupId: 'analysis',
        groupTitle: 'Scientific Analysis',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data & Visualization',
    description: 'DEM ingestion, charts & dossiers',
    items: [
      {
        id: 'datacenter',
        label: 'Data Center',
        shortDescription: 'Upload SRTM .hgt, .asc, .csv & GeoJSON grids',
        icon: Database,
        groupId: 'data',
        groupTitle: 'Data & Visualization',
      },
      {
        id: 'vizlab',
        label: 'Visualization Lab',
        shortDescription: 'Hypsometric curves, histograms & 3D terrain meshes',
        icon: BarChart3,
        groupId: 'data',
        groupTitle: 'Data & Visualization',
      },
      {
        id: 'reports',
        label: 'Research Reports',
        shortDescription: 'Citation-ready scientific reports & Markdown/PDF export',
        icon: FileText,
        groupId: 'data',
        groupTitle: 'Data & Visualization',
      },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    description: 'AI-assisted synthesis',
    items: [
      {
        id: 'assistant',
        label: 'AI Research Assistant',
        shortDescription: 'Gemini-grounded planetary geomorphology synthesis',
        icon: Sparkles,
        groupId: 'intelligence',
        groupTitle: 'Intelligence',
        accentTone: 'violet',
      },
    ],
  },
  {
    id: 'system',
    title: 'System',
    description: 'Calibration & methodology',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        shortDescription: 'Similarity weights, planetary datums & data policy',
        icon: Settings,
        groupId: 'system',
        groupTitle: 'System',
      },
      {
        id: 'help',
        label: 'Help & Documentation',
        shortDescription: 'Formulas, datum rigor, file formats & keyboard guide',
        icon: BookOpen,
        groupId: 'system',
        groupTitle: 'System',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItemConfig[] = NAV_GROUPS.flatMap((g) => g.items);

export function getNavItem(route: NavRoute): NavItemConfig {
  return ALL_NAV_ITEMS.find((item) => item.id === route) ?? ALL_NAV_ITEMS[0];
}

import type { AnalogSite, DatasetRecord } from '../types/astraa.ts';

export interface SiteDatasetMatch {
  dataset: DatasetRecord;
  matchReason: string;
}

/**
 * Matches an AnalogSite against real DatasetRecord entries stored in SQLite.
 * Never fabricates dataset availability or measurements.
 */
export function getAvailableDatasetsForSite(
  site: AnalogSite,
  datasets: DatasetRecord[]
): SiteDatasetMatch[] {
  const matches: SiteDatasetMatch[] = [];
  const siteTokens = [
    site.name.toLowerCase(),
    site.region.toLowerCase(),
    site.countryOrSector.toLowerCase(),
  ];

  for (const ds of datasets) {
    if (ds.planet !== site.body && ds.planet !== 'Multi-Planet') {
      continue;
    }

    // 1. Exact spatial bounding box match
    if (ds.spatialExtent) {
      const { minLat, maxLat, minLon, maxLon } = ds.spatialExtent;
      const inBounds =
        site.latitude >= minLat - 0.5 &&
        site.latitude <= maxLat + 0.5 &&
        site.longitude >= minLon - 0.5 &&
        site.longitude <= maxLon + 0.5;
      if (inBounds) {
        matches.push({
          dataset: ds,
          matchReason:
            ds.processingStatus === 'Processed'
              ? 'Processed elevation grid covering region coordinates'
              : 'Spatial extent matches region coordinates (awaiting file upload)',
        });
        continue;
      }
    }

    // 2. Region / keyword match (e.g., Ladakh N34E077, Global Terrestrial Analogs)
    const dsRegion = ds.region.toLowerCase();
    const dsFilename = ds.filename.toLowerCase();
    const isLadakh =
      site.id === 'earth-ladakh' &&
      (dsRegion.includes('ladakh') || dsFilename.includes('n34e077'));
    const isGlobalCatalog =
      site.body === 'Earth' &&
      (dsRegion.includes('global terrestrial') || dsRegion.includes('multi-agency terrestrial'));
    const tokenHit = siteTokens.some(
      (tok) => tok.length > 4 && (dsRegion.includes(tok.split(' ')[0]) || dsFilename.includes(tok.split(' ')[0]))
    );

    if (isLadakh || isGlobalCatalog || tokenHit) {
      matches.push({
        dataset: ds,
        matchReason:
          ds.processingStatus === 'Processed'
            ? 'Processed dataset linked to region'
            : isGlobalCatalog
              ? 'Multi-region terrestrial catalog (awaiting upload in Data Center)'
              : 'Region reference file (awaiting upload in Data Center)',
      });
    }
  }

  return matches;
}

export function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileUp,
  Trash2,
} from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type { DatasetRecord } from '../types/astraa.ts';

interface DataCenterViewProps {
  datasets: DatasetRecord[];
  onRefresh: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Not mounted (0 B)';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DataCenterView({ datasets, onRefresh }: DataCenterViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedId, setSelectedId] = useState<string>(datasets[0]?.id ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0] ?? null;

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadStatus(null);

    try {
      let processedCount = 0;
      let totalSites = 0;
      let lastId = '';

      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/datasets/upload', {
          method: 'POST',
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Failed to process ${file.name}`);
        }
        processedCount++;
        totalSites += data.extractedSitesCount ?? 0;
        lastId = data.dataset?.id ?? '';
      }

      await onRefresh();
      if (lastId) setSelectedId(lastId);
      setUploadStatus({
        type: 'success',
        message: `Validated and stored ${processedCount} dataset(s) in SQLite${
          totalSites > 0 ? ` (${totalSites} site records indexed into Analog Finder)` : ''
        }.`,
      });
    } catch (err) {
      setUploadStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Header + Upload Dropzone */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23] p-5 lg:col-span-7 flex flex-col justify-between">
          <CinematicBackdrop
            src="/assets/satellite/satellite_swath_telemetry.webp"
            alt="Orbital Earth observation elevation swath texture"
            eager
            opacityClass="opacity-35"
            scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/70"
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-cyan-400" />
              <h1 className="font-display text-xl font-bold text-white">
                Geospatial Data Center
              </h1>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Inspect dataset format, coordinate reference system (CRS), spatial extent, resolution,
              NoData counts, and data quality. Upload NASA SRTM <span className="font-mono">.hgt</span> /{' '}
              <span className="font-mono">.zip</span>, Esri <span className="font-mono">.asc</span>,{' '}
              <span className="font-mono">.csv</span> / <span className="font-mono">.tsv</span>, or{' '}
              <span className="font-mono">.geojson</span> files directly for real server-side parsing.
            </p>
          </div>

          <div className="relative z-10 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              External File Audit Transparency
            </div>
            <p className="mt-1 text-slate-300">
              The 4 externally referenced files (<span className="font-mono">VISION_ASTRAA_Unified_Terrestrial_Analogs.csv</span>,{' '}
              <span className="font-mono">N34E077.SRTMGL1.hgt(3).zip</span>,{' '}
              <span className="font-mono">VISION_ASTRAA_N34E077_Elevation_Grid.csv</span>,{' '}
              <span className="font-mono">space_agency_terrestrial_analogs-v2(3).zip</span>) were not mounted inside the container filesystem. Drop them in the uploader on the right to ingest their real contents.
            </p>
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleUploadFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-cyan-500/50 bg-[#071127] p-6 text-center lg:col-span-5"
        >
          <FileUp className="h-9 w-9 text-cyan-400" />
          <h2 className="mt-3 font-display text-sm font-semibold text-white">
            Upload &amp; Validate Geospatial Dataset
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Drag &amp; drop <span className="font-mono">.hgt, .zip, .asc, .csv, .tsv, .geojson</span> (max 64 MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".hgt,.zip,.asc,.csv,.tsv,.geojson,.json"
            onChange={(e) => handleUploadFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {uploading ? 'Parsing & Computing Terrain Physics...' : 'Select Local Dataset File(s)'}
          </button>

          {uploadStatus && (
            <div
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs text-left ${
                uploadStatus.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              }`}
            >
              {uploadStatus.message}
            </div>
          )}
        </div>
      </div>

      {/* Dataset Registry Table */}
      <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/92 backdrop-blur-md p-5">
        <h2 className="font-display text-sm font-semibold text-white mb-4">
          Dataset Inventory ({datasets.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                <th className="py-2.5 pr-3">Dataset</th>
                <th className="py-2.5 pr-3">Format</th>
                <th className="py-2.5 pr-3">Planet / Region</th>
                <th className="py-2.5 pr-3">Resolution</th>
                <th className="py-2.5 pr-3">CRS</th>
                <th className="py-2.5 pr-3">Quality</th>
                <th className="py-2.5 pr-3">Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {datasets.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`cursor-pointer transition-colors ${
                    selected?.id === d.id ? 'bg-cyan-500/10' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <td className="py-3 pr-3 font-mono text-slate-100">{d.filename}</td>
                  <td className="py-3 pr-3 font-mono text-cyan-300">{d.format}</td>
                  <td className="py-3 pr-3 text-slate-300">
                    {d.planet} · {d.region}
                  </td>
                  <td className="py-3 pr-3 font-mono text-slate-400">{d.resolution}</td>
                  <td className="py-3 pr-3 text-slate-400 max-w-[180px] truncate">{d.crs}</td>
                  <td className="py-3 pr-3 font-mono text-slate-200">
                    {d.processingStatus === 'Processed' ? `${d.qualityScore}%` : '—'}
                  </td>
                  <td className="py-3 pr-3 font-mono text-[11px]">
                    {d.processingStatus === 'Processed' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Processed
                      </span>
                    ) : (
                      <span className="text-amber-300">{d.processingStatus}</span>
                    )}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {d.processingStatus === 'Processed' && (
                      <a
                        href={`/api/datasets/${d.id}/download`}
                        className="mr-2 inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-cyan-200"
                      >
                        <Download className="h-3 w-3" />
                        Export
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="inline-flex items-center rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                      title="Delete dataset record"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Dataset Validation & Preview Inspector */}
      {selected && (
        <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/92 backdrop-blur-md p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-white">{selected.filename}</h3>
              <p className="text-xs text-slate-400">{selected.source}</p>
            </div>
            <span className="font-mono text-xs text-slate-400">
              Size: {formatBytes(selected.fileSizeBytes)} · Records: {selected.totalRecords}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
            <div className="rounded-lg bg-slate-900/70 p-3">
              <div className="text-[10px] text-slate-400">CRS</div>
              <div className="mt-0.5 text-slate-100">{selected.crs}</div>
            </div>
            <div className="rounded-lg bg-slate-900/70 p-3">
              <div className="text-[10px] text-slate-400">Units &amp; NoData</div>
              <div className="mt-0.5 text-slate-100">
                {selected.units} / {selected.noDataValue}
              </div>
            </div>
            <div className="rounded-lg bg-slate-900/70 p-3">
              <div className="text-[10px] text-slate-400">Missing Values</div>
              <div className="mt-0.5 text-slate-100">{selected.missingValueCount}</div>
            </div>
            <div className="rounded-lg bg-slate-900/70 p-3">
              <div className="text-[10px] text-slate-400">Spatial Bounds</div>
              <div className="mt-0.5 text-slate-100">
                {selected.spatialExtent
                  ? `${selected.spatialExtent.minLat.toFixed(2)}..${selected.spatialExtent.maxLat.toFixed(2)}°N, ${selected.spatialExtent.minLon.toFixed(2)}..${selected.spatialExtent.maxLon.toFixed(2)}°E`
                  : 'Unavailable'}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-300">{selected.notes}</p>

          {selected.previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-slate-900/90 text-slate-400">
                  <tr>
                    {selected.columns.map((col) => (
                      <th key={col} className="px-3 py-2">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {selected.previewRows.map((row, idx) => (
                    <tr key={idx}>
                      {selected.columns.map((col) => (
                        <td key={col} className="px-3 py-2">
                          {row[col] === null || row[col] === undefined ? 'null' : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

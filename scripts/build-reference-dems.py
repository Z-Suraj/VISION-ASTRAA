#!/usr/bin/env python3
"""Regenerate the local 1 km DEMs with Python, NumPy, Pillow, curl and GDAL CLI."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / 'public/data'
CACHE = Path(os.getenv('VISION_DEM_CACHE', tempfile.gettempdir())) / 'vision-astraa-dems'
SIZE = 109
CELL = 1000
ZOOM = 10
RADIUS = {'Earth': 6371008.8, 'Moon': 1737400, 'Mars': 3396000}
LUNAR_ARCHIVE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/'
MARS_ARCHIVE = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/'
TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/'

# Centers are sampling coordinates. They are not assertions about feature boundaries.
SITES = [
    ('earth-atacama', 'Atacama Desert (Yungay Sector)', 'Earth', -24.083, -69.917, 'Antofagasta, Chile. Salt-bearing desert pavement and alluvial gravels frame this hyperarid benchmark. This regional grid reaches the coast.', ''),
    ('earth-haughton', 'Haughton Impact Structure', 'Earth', 75.383, -89.65, 'Devon Island, Canada. An impact structure in the Arctic polar desert. This regional grid includes surrounding coastal terrain.', ''),
    ('earth-death-valley', 'Death Valley (Badwater & Ubehebe)', 'Earth', 36.242, -116.825, 'California and Nevada, United States. A low desert basin borders steep fault-block ranges.', ''),
    ('earth-ladakh', 'Ladakh (Leh–Nubra Cold Desert)', 'Earth', 34.1526, 77.5771, 'India. High-altitude arid valleys, ridges and alluvial fans in the mountains of Ladakh.', ''),
    ('earth-spiti', 'Spiti Valley Cold Desert', 'Earth', 32.246, 78.034, 'Himachal Pradesh, India. The mountain river cuts through a steep, cold-desert valley.', ''),
    ('earth-rann-kutch', 'Rann of Kutch (Matanomadh / Salt Marsh)', 'Earth', 23.545, 68.948, 'Gujarat, India. An evaporitic salt flat near basaltic terrain with altered minerals.', ''),
    ('earth-lonar', 'Lonar Impact Crater', 'Earth', 19.9758, 76.5069, 'Maharashtra, India. The regional window is centered on a small impact crater in the basaltic Deccan Plateau.', ''),
    ('earth-dry-valleys', 'McMurdo Dry Valleys (Beacon Valley)', 'Earth', -77.83, 160.65, 'Antarctica. A polar desert valley with ice-rich permafrost and wind-shaped terrain.', 'rema'),
    ('earth-iceland', 'Krafla & Askja Volcanic Highlands', 'Earth', 65.047, -16.75, 'Iceland. Basaltic volcanic terrain and caldera fields in the central highlands.', ''),
    ('moon-shackleton', 'Shackleton Crater Rim (Lunar South Pole)', 'Moon', -89.67, 129.78, 'Lunar south pole. A steep impact crater with a deeply shadowed interior.', 'lola-polar'),
    ('moon-mare-tranq', 'Mare Tranquillitatis (Basalt & Skylight)', 'Moon', 8.33, 33.22, 'Lunar near side. Broad basalt plains punctuated by impact craters and collapse pits.', ''),
    ('moon-aristarchus', 'Aristarchus Plateau & Vallis Schröteri', 'Moon', 23.73, -47.49, 'Lunar near side. A raised volcanic plateau cut by a sinuous lava channel.', ''),
    ('mars-jezero', 'Jezero Crater (Western Fan Delta)', 'Mars', 18.38, 77.58, 'Western Isidis Planitia. The impact crater contains a preserved delta and is the Perseverance rover landing site.', 'megt44n000hb'),
    ('mars-valles', 'Valles Marineris (Melas Chasma)', 'Mars', -10.6, -70.5, 'A deep canyon in Valles Marineris with layered interior deposits.', 'megt00n270hb'),
    ('mars-gale', 'Gale Crater (Aeolis Mons / Mount Sharp)', 'Mars', -5.4, 137.8, 'Near the Martian equator. A layered mountain rises from the floor of the crater explored by Curiosity.', 'megt00n090hb'),
]


def fetch(url, byte_range=None):
    """Cache source bytes and response metadata, verifying every requested range."""
    extension = url.removeprefix('https://').replace('/', '__')
    cache_file = CACHE / (extension + (f'.{byte_range[0]}-{byte_range[1]}' if byte_range else ''))
    header_file = cache_file.with_suffix(cache_file.suffix + '.headers')
    if not cache_file.exists() or not header_file.exists():
        with tempfile.NamedTemporaryFile(dir=CACHE) as payload, tempfile.NamedTemporaryFile(dir=CACHE) as headers:
            command = ['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '30', '--dump-header', headers.name, '--output', payload.name]
            if byte_range:
                command += ['--range', f'{byte_range[0]}-{byte_range[1]}']
            subprocess.run([*command, url], check=True)
            header_text = Path(headers.name).read_text()
            binary = Path(payload.name).read_bytes()
            if byte_range:
                first, last = byte_range
                assert re.search(rf'(?im)^content-range: bytes {first}-{last}/\d+', header_text), f'Invalid range from {url}'
                assert len(binary) == last - first + 1, f'Invalid response length from {url}'
            cache_file.write_bytes(binary)
            header_file.write_text(header_text)
    return cache_file.read_bytes(), header_file.read_text()


def target_coords(planet, center_lat, center_lon):
    """Inverse local azimuthal equidistant projection, sampled at a 4×4 subgrid per cell."""
    centers = (np.arange(SIZE) - (SIZE - 1) / 2) * CELL
    subcells = (np.arange(4) + 0.5) / 4 - 0.5
    mesh = (centers[:, None] + CELL * subcells).reshape(-1)
    x, y = np.meshgrid(mesh, -mesh)
    angular = np.hypot(x, y) / RADIUS[planet]
    bearing = np.arctan2(x, y)
    origin = np.deg2rad(center_lat)
    lat = np.arcsin(np.sin(origin) * np.cos(angular) + np.cos(origin) * np.sin(angular) * np.cos(bearing))
    lon = np.deg2rad(center_lon) + np.arctan2(np.sin(bearing) * np.sin(angular) * np.cos(origin), np.cos(angular) - np.sin(origin) * np.sin(lat))
    return np.rad2deg(lat), np.rad2deg(lon)


def bilinear(data, row, col):
    """Sample a pixel-centered raster with its containing four neighbors."""
    i, j = np.floor(row).astype(int), np.floor(col).astype(int)
    v, u = row - i, col - j
    return (data[i, j] * (1 - u) + data[i, j + 1] * u) * (1 - v) + (data[i + 1, j] * (1 - u) + data[i + 1, j + 1] * u) * v


def earth_tile(x, y):
    url = f'{TERRAIN_TILES}{ZOOM}/{x}/{y}.png'
    img, header = fetch(url)
    rgb = np.asarray(Image.open(BytesIO(img)).convert('RGB'), dtype=np.float64)
    elevation = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
    sources_header = re.search(r'(?im)^x-amz-meta-x-imagery-sources: ([^\r\n]+)', header)
    return x, y, elevation, url, sources_header[1].split(', ') if sources_header else []


def earth_window(lat, lon):
    total_pixels = 256 * 2 ** ZOOM
    x = (lon + 180) / 360 * total_pixels - 0.5
    y = (1 - np.arcsinh(np.tan(np.deg2rad(lat))) / np.pi) / 2 * total_pixels - 0.5
    west, east = int(x.min()) // 256, (int(x.max()) + 1) // 256
    north, south = int(y.min()) // 256, (int(y.max()) + 1) // 256
    data = np.empty(((south - north + 1) * 256, (east - west + 1) * 256))
    inputs = []
    contributors = set()
    with ThreadPoolExecutor(max_workers=6) as pool:
        for tile_x, tile_y, tile, url, sources in pool.map(lambda idx: earth_tile(*idx), [(col, row) for col in range(west, east + 1) for row in range(north, south + 1)]):
            i, j = (tile_y - north) * 256, (tile_x - west) * 256
            data[i:i + 256, j:j + 256] = tile
            inputs.append(url)
            contributors.update(sources)
    return bilinear(data, y - north * 256, x - west * 256), inputs, sorted(contributors)


def read_label_field(label, name):
    return float(re.search(rf'(?m)^\s*{name}\s*=\s*([-+\d.]+)', label)[1])


def pds_window(planet, product, lat, lon):
    archive = LUNAR_ARCHIVE if planet == 'Moon' else MARS_ARCHIVE
    product = 'ldem_64' if planet == 'Moon' else product
    label_url, raster_url = f'{archive}{product}.lbl', f'{archive}{product}.img'
    label = fetch(label_url)[0].decode('ascii')
    width = int(read_label_field(label, 'LINE_SAMPLES'))
    height = int(read_label_field(label, 'LINES'))
    ppd = read_label_field(label, 'MAP_RESOLUTION')
    west = read_label_field(label, 'WESTERNMOST_LONGITUDE')
    north = read_label_field(label, 'MAXIMUM_LATITUDE')
    row = (north - lat) * ppd - 0.5
    col = (lon % 360 - west) * ppd - 0.5
    start, stop = int(np.floor(row.min())), int(np.floor(row.max())) + 2
    assert 0 <= start < stop <= height and 0 <= col.min() <= col.max() < width - 1, f'{product} does not cover these coordinates'
    binary = fetch(raster_url, (start * width * 2, stop * width * 2 - 1))[0]
    if planet == 'Moon':
        # LOLA elevations above the documented reference sphere are DN × 0.5 m.
        assert read_label_field(label, 'SCALING_FACTOR') == 0.5 and read_label_field(label, 'OFFSET') == RADIUS['Moon']
        data = np.frombuffer(binary, dtype='<i2').reshape(stop - start, width).astype(float) * 0.5
    else:
        # MEGT is areoid-relative topography in integer meters, not planetary radius.
        data = np.frombuffer(binary, dtype='>i2').reshape(stop - start, width).astype(float)
    return bilinear(data, row - start, col), [label_url, raster_url], []


def hillshade(elevation, planet, target):
    """Render a tinted source-DEM hillshade from fixed northwest illumination."""
    south, east = np.gradient(elevation, CELL)
    normal_length = np.sqrt(1 + east ** 2 + south ** 2)
    sun_intensity = np.clip((0.5 * (east + south) + 2 ** -0.5) / normal_length, 0, 1)
    lo, hi = np.percentile(elevation, [1, 99])
    height = np.clip((elevation - lo) / max(1, hi - lo), 0, 1)
    accent = {
        'Earth': ([30, 39, 45], [174, 169, 141]),
        'Moon': ([33, 39, 48], [193, 195, 192]),
        'Mars': ([51, 25, 20], [203, 136, 92]),
    }
    dark, light = map(np.asarray, accent[planet])
    palette = dark + height[..., None] * (light - dark)
    rgb = np.clip(palette * (0.39 + 0.87 * sun_intensity[..., None]), 0, 255)
    Image.fromarray(rgb.astype(np.uint8)).resize((436, 436), Image.Resampling.BICUBIC).save(target, quality=86)


POLAR_PRODUCTS = {
    'lola-polar': {
        'url': 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF',
        'page': 'https://pgda.gsfc.nasa.gov/products/90',
        'source': 'NASA Goddard · adjusted LOLA south-polar elevation model',
        'id': 'LDEM_80S_80MPP_ADJ',
        'native': '80 m projected pixels',
        'datum': 'Moon Mean Earth/polar axis (DE421) · height above 1,737.4 km reference sphere',
        'attribution': 'NASA Goddard Planetary Geodesy Data Archive, Barker et al. (2021) adjusted LOLA digital elevation models.',
    },
    'rema': {
        'url': 'https://data.pgc.umn.edu/elev/dem/setsm/REMA/mosaic/v1.1/200m/REMA_200m_dem_filled.tif',
        'page': 'https://www.pgc.umn.edu/data/rema/',
        'source': 'Polar Geospatial Center · Reference Elevation Model of Antarctica',
        'id': 'REMA mosaic v1.1 · 200 m · provider void filled',
        'native': '200 m projected pixels',
        'datum': 'EPSG:3031 WGS 84 Antarctic Polar Stereographic · WGS 84 ellipsoid heights',
        'attribution': 'Reference Elevation Model of Antarctica, Polar Geospatial Center, Howat et al. (2019), doi:10.5194/tc-13-665-2019.',
    },
}


def polar_window(planet, product, center_lat, center_lon):
    """Request the projected source window remotely and resample a 4×4 output subgrid with GDAL."""
    label = POLAR_PRODUCTS[product]
    cache_grid = CACHE / f'{Path(label["url"]).stem}-{center_lat}-{center_lon}.samples.txt'
    if not cache_grid.exists():
        with tempfile.TemporaryDirectory() as work:
            extent = SIZE * CELL / 2
            warp = Path(work) / 'polar.tif'
            sampled = Path(work) / 'polar.xyz'
            grid_crs = f'+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} +R={RADIUS[planet]} +units=m +no_defs +type=crs'
            subprocess.run([
                'gdalwarp', '--config', 'GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR',
                '--config', 'GDAL_HTTP_MAX_RETRY', '3', '--config', 'GDAL_HTTP_RETRY_DELAY', '1',
                '-q', '-of', 'GTiff', '-t_srs', grid_crs,
                '-te', str(-extent), str(-extent), str(extent), str(extent),
                '-tr', str(CELL / 4), str(CELL / 4), '-ot', 'Float32',
                '-r', 'bilinear', '-dstnodata', 'nan', '-et', '0',
                f'/vsicurl/{label["url"]}', str(warp),
            ], check=True)
            subprocess.run(['gdal_translate', '-q', '-of', 'XYZ', str(warp), str(sampled)], check=True)
            cache_grid.write_text(sampled.read_text())
    subgrid = np.loadtxt(cache_grid, usecols=(2,)).reshape(SIZE * 4, SIZE * 4)
    if not np.isfinite(subgrid).all():
        raise ValueError(f'Incomplete source data for {product}')
    return subgrid


def make_product(site):
    slug, name, planet, center_lat, center_lon, summary, product = site
    if product in POLAR_PRODUCTS:
        label = POLAR_PRODUCTS[product]
        subgrid = polar_window(planet, product, center_lat, center_lon)
        source, source_id, source_url = label['source'], label['id'], label['page']
        resolution, datum, attribution = label['native'], label['datum'], label['attribution']
        inputs, contributors = [label['page'], label['url']], []
    elif planet == 'Earth':
        lat, lon = target_coords(planet, center_lat, center_lon)
        subgrid, inputs, contributors = earth_window(lat, lon)
        source = 'Mapzen Terrain Tiles · AWS Open Data'
        source_id = 'Mapzen Terrarium z10'
        source_url = 'https://registry.opendata.aws/terrain-tiles/'
        resolution = f'~{np.cos(np.deg2rad(center_lat)) * 2 * np.pi * 6378137 / (256 * 2 ** ZOOM):.0f} m tile pixels at window center, original inputs vary'
        datum = 'WGS 84 horizontal frame · source-specific vertical datums'
        attribution_list = []
        usgs_products = [name for prefix, name in [('srtm/', 'SRTM'), ('gmted/', 'GMTED2010'), ('ned/', '3DEP')] if any(item.startswith(prefix) for item in contributors)]
        if usgs_products:
            attribution_list.append(f'{" and ".join(usgs_products)} terrain data courtesy of the U.S. Geological Survey.')
        if any(item.startswith('etopo1/') for item in contributors):
            attribution_list.append('Global ETOPO1 terrain data courtesy of the U.S. National Oceanic and Atmospheric Administration.')
        if any(item.startswith('eu_dem/') or item.startswith('eudem/') for item in contributors):
            attribution_list.append('Europe terrain data produced using Copernicus data and information funded by the European Union — EU-DEM layers.')
        if any(item.startswith('arcticdem/') for item in contributors):
            attribution_list.append('ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736.')
        attribution = ' '.join(['Mapzen Terrain Tiles.', *attribution_list])
    elif planet == 'Moon':
        lat, lon = target_coords(planet, center_lat, center_lon)
        subgrid, inputs, contributors = pds_window(planet, product, lat, lon)
        source = 'NASA LRO · Lunar Orbiter Laser Altimeter'
        source_id = 'LRO-L-LOLA-4-GDR-V1.0 / LDEM_64'
        source_url = inputs[0]
        resolution = '64 pixels/degree · 473.802 m nominal equatorial spacing'
        datum = 'Mean Earth/polar axis (DE421) · height above 1,737.4 km reference sphere'
        attribution = 'NASA Lunar Reconnaissance Orbiter, Lunar Orbiter Laser Altimeter team and NASA Planetary Data System Geosciences Node.'
    else:
        lat, lon = target_coords(planet, center_lat, center_lon)
        subgrid, inputs, contributors = pds_window(planet, product, lat, lon)
        source = 'NASA Mars Global Surveyor · Mars Orbiter Laser Altimeter'
        source_id = f'MGS-M-MOLA-5-MEGDR-L3-V1.0 / {product.upper()}'
        source_url = inputs[0]
        resolution = '128 pixels/degree · 463 m nominal equatorial spacing'
        datum = 'Planetocentric IAU 2000 · height above MOLA areoid (GMM3 model)'
        attribution = 'NASA Mars Global Surveyor, Mars Orbiter Laser Altimeter team and NASA Planetary Data System Geosciences Node.'
    # Average a 4×4 quadrature of bilinearly interpolated source elevations per cell.
    raster = np.round(subgrid.reshape(SIZE, 4, SIZE, 4).mean(axis=(1, 3)), 1)
    assert np.isfinite(raster).all() and abs(raster).max() < 25000 and np.ptp(raster) > 0, f'Invalid raster for {slug}'
    OUTPUT.joinpath(f'{slug}.json').write_text(json.dumps({
        'width': SIZE, 'height': SIZE, 'cellSizeMeters': CELL, 'elevations': raster.ravel().tolist(),
    }, separators=(',', ':')) + '\n')
    hillshade(raster, planet, OUTPUT / f'{slug}.webp')
    print(f'{slug}: {raster.min():.1f} to {raster.max():.1f} m', flush=True)
    return {
        'id': slug, 'name': name, 'planet': planet, 'lat': center_lat, 'lon': center_lon, 'summary': summary,
        'source': source, 'sourceId': source_id, 'sourceUrl': source_url, 'datum': datum, 'attribution': attribution,
        'resolution': '1,000 m local grid', 'nativeResolution': resolution, 'cellSizeMeters': CELL,
        'demUrl': f'/data/{slug}.json', 'image': f'/data/{slug}.webp', 'inputs': inputs, 'contributors': contributors,
    }


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        catalog = list(pool.map(make_product, SITES))
    PROJECT.joinpath('src/cinematic/catalog.ts').write_text('// Generated by scripts/build-reference-dems.py.\nexport const referenceRegions = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ' as const\n')
    OUTPUT.joinpath('provenance.json').write_text(json.dumps({
        'grid': '109 × 109 cells at 1 km spacing in a spherical azimuthal equidistant projection centered on each sample. Rows run north to south, columns west to east.',
        'sampling': 'Each cell is the mean of 16 regularly spaced, bilinearly interpolated source elevations within the output cell, rounded to 0.1 m for storage. Rounding is not a statement of accuracy.',
        'notes': 'DEM windows are independently sourced at the 15 original Vision Astraa benchmark coordinates. Derived terrain metrics are independent of the original catalogue values. Elevation datums differ across worlds. Earth coastal samples can include bathymetry. MOLA and LOLA source products include interpolated coverage. The Antarctic provider mosaic is void filled.',
        'regions': catalog,
    }, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

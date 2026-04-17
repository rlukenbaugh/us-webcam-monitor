# US Webcam Monitor

Desktop-packaged Next.js MVP for discovering and browsing public webcams across the United States.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- SQLite for local desktop builds
- Electron for Windows packaging
- MapLibre GL JS

## Local App Setup

```bash
npm install
npm run build:web
npm run build:win
```

Desktop output:

- Installer: `dist/us-webcam-monitor-0.1.0-setup.exe`
- Portable app: `dist/win-unpacked/US Webcam Monitor.exe`
- Portable zip (release workflow): `dist/US-Webcam-Monitor-Portable-0.1.0-win-x64.zip`

## GitHub Release Flow

- The app version lives in `package.json`
- Tag releases with matching semantic versions such as `v0.1.0`
- The GitHub Actions workflow in `.github/workflows/desktop-release.yml` installs dependencies, lints, builds the Windows desktop package, smoke-tests the unpacked EXE, zips the portable build, and publishes a GitHub Release

## Database Prep

The desktop build uses a bundled SQLite database prepared with:

```bash
npm run db:prepare:sqlite
```

This seeds the local database and then attempts adapter imports for sources that have credentials configured.

Environment variables:

- `DATABASE_URL`
- `WSDOT_ACCESS_CODE`
- `WSDOT_API_URL`
- `OHGO_API_URL`
- `OHGO_API_KEY`
- `ADAPTER_FETCH_TIMEOUT_MS`
- `IMAGE_CHECK_TIMEOUT_MS`
- `MAX_IMAGE_CHECKS`
- `OPENWEBCAMDB_API_KEY`
- `WINDY_API_KEY`

## Operational Refresh

Several of the “tool, not toy” upgrades are now wired in:

- adapter config is centralized in `src/lib/adapters/config.ts`
- adapter fetches use retry plus exponential backoff
- map marker clustering is already enabled in the MapLibre client
- SQLite remains the default local cache for the desktop app

Run image health checks:

```bash
npm run check:images
```

Run the daily refresh pipeline:

```bash
npm run refresh:daily
```

That daily refresh command:

- imports enabled source adapters
- checks primary image URLs
- writes `camera_checks`
- updates camera status, `lastCheckedAt`, `lastSuccessAt`, and rolling uptime
- runs the optional public-webcam discovery scan and imports newly found crawler CSV candidates into `submissions` when Python crawler dependencies are available

Run just the discovery step:

```bash
npm run discover:daily
```

For Windows desktop use, this is a good candidate for Task Scheduler once your source credentials are in place.

## Python Webcam Finder

`scripts/webcam_finder.py` is a fallback discovery tool for finding candidate webcam URLs on public seed sites. It is intentionally separate from the main app ingestion path, which should continue to prefer structured APIs and official source adapters first.

Install Python requirements:

```bash
pip install -r scripts/webcam-finder-requirements.txt
```

For the broader public-directory crawlers:

```bash
pip install -r scripts/crawler-requirements.txt
```

Run with the default seed set:

```bash
python scripts/webcam_finder.py
```

Choose a custom output file:

```bash
python scripts/webcam_finder.py --output data/webcams_found.csv
```

Override or add seed URLs:

```bash
python scripts/webcam_finder.py --seed https://www.nps.gov/subjects/webcams/index.htm --seed https://www.dot.state.mn.us/cameras/
```

Tuning options:

- `--max-pages`
- `--max-depth`
- `--timeout`
- `--sleep`

The finder currently looks for common public webcam patterns such as:

- MJPEG endpoints like `video.mjpg`, `mjpg/video.mjpg`, `axis-cgi/mjpg/video.cgi`
- HLS playlists like `master.m3u8`, `live/playlist.m3u8`, `live/stream.m3u8`
- Snapshot images like `snapshot.jpg`, `current.jpg`, `live.jpg`, `webcam.jpg`, `image.jpg`
- Common webcam page paths like `/camera/`, `/webcam/`, `/livecam/`

Safety guardrails:

- The fallback finder only follows `http` and `https` links.
- It skips `localhost`, `.local`, and private/reserved IP ranges so it does not ingest accidentally exposed local-network cameras.
- Search-engine “dorking” is intentionally not part of the app workflow.

Output columns:

- `source_page`
- `candidate_url`
- `ok`
- `status_code`
- `content_type`
- `stream_type`

## Public Directory Crawlers

The project also includes two broader public-directory crawlers:

- `scripts/webcam_public_crawler.py`
- `scripts/spain_beach_webcam_crawler.py`

They generate:

- JSON output for review
- CSV output for import into the moderation queue

Run them:

```bash
python scripts/webcam_public_crawler.py
python scripts/spain_beach_webcam_crawler.py
```

Import crawler CSV output:

```bash
npm run import:public-webcam-csv -- --input data/generated/sample_public_webcams.csv
```

Commit imported rows into `submissions`:

```bash
npm run import:public-webcam-csv -- --input path/to/spain_beach_webcams.csv --commit
```

## Webcam Finder CSV Importer

`scripts/import-webcam-finder-csv.ts` takes CSV output from `webcam_finder.py`, builds a review preview, and can optionally import commit-ready rows into the app's `submissions` queue as `NEEDS_REVIEW`.

Dry run with a preview file:

```bash
npm run import:webcam-finder -- --input webcams_found.csv
```

Commit rows that have inferred or fallback coordinates:

```bash
npm run import:webcam-finder -- --input webcams_found.csv --commit
```

If a crawl is from one known area, provide fallback coordinates so rows without location hints can still enter moderation:

```bash
npm run import:webcam-finder -- --input webcams_found.csv --commit --state-code MN --lat 46.7296 --lng -94.6859
```

Optional flags:

- `--preview-path`
- `--limit`
- `--state-code`
- `--city`
- `--lat`
- `--lng`

The importer writes a JSON preview file by default to:

```text
data/generated/webcam_finder_import_preview.json
```

Rows that still lack a usable location are not inserted and remain in the preview for manual handling.

## Synthetic Seed Dataset Generator

`scripts/generate_webcam_seed_dataset.py` generates a synthetic seed dataset of 10,000 geographically distributed webcam records for discovery bootstrapping. It writes 20 JSON batch files of 500 records each plus an index manifest.

Run it:

```bash
python scripts/generate_webcam_seed_dataset.py
```

Default outputs:

```text
data/generated/webcam_seed_batches/
data/generated/webcam_seed_index.json
```

## Traffic Camera GeoJSON Harvester

`scripts/harvest_traffic_cameras.py` exports traffic cameras to GeoJSON for dataset inspection and quick map experiments.

Current support:

- `WSDOT` using the same official API family as the app adapter
- optional `511GA` template, disabled by default until its live endpoint/account payload is confirmed

Run it with a Washington access code:

```bash
$env:WSDOT_ACCESS_CODE="your-access-code"
python scripts/harvest_traffic_cameras.py
```

Optional environment variables:

- `WSDOT_API_URL`
- `GA511_API_KEY`
- `GA511_API_URL`
- `TRAFFIC_CAMERA_OUTPUT`

Default output:

```text
data/generated/traffic_cameras.geojson
```

## Notes

- Adapter-backed ingestion remains the preferred path for production reliability.
- The Python finder is best used for fallback discovery and manual review.
- The synthetic seed dataset is for bootstrapping and demos. Its stream URLs are placeholder-style seed endpoints and are not validated live feeds.
- Some public sites block crawlers, rate-limit requests, or require attribution and reuse checks.
- The desktop packaging path now assumes a Windows environment and an unsigned fallback when no code-signing certificate is configured.

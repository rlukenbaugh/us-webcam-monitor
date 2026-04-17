# SitDeck Roadmap

## Product Shape

US Webcam Monitor should feel like a focused discovery product, not a random cam directory. The safest identity for v1 is:

- traffic cameras
- weather and aviation cameras
- harbor and beach cameras
- a storm mode that overlays NOAA alerts onto nearby public cameras

The app should stay snapshot-first until the feed health checker is mature. Embeddable live video is a bonus, not the backbone.

## Stability First

Before expanding source count, the desktop app needs to remain calm under failure:

- packaged Windows app runs on bundled SQLite, not a separately managed Postgres instance
- Electron stays single-instance and never recursively spawns itself
- startup errors render one clear fallback screen instead of cascading dialogs
- camera APIs degrade safely when a source or check fails

## Safe Source Backbone

These are the first production-safe source groups to prioritize:

1. Washington DOT cameras
2. Ohio OHGO cameras
3. FAA / weather / aviation camera feeds
4. NOAA weather alerts and storm overlays
5. moderated manual submissions

These give the product a real U.S. footprint without scraping brittle tourism pages too early.

## Expansion Order

After the backbone is stable, add sources in this order:

1. more state DOT / 511 camera feeds
2. national park and public nature cams
3. selected harbor, beach, and tourism partners with clear attribution rules
4. trending, favorites, and route-based discovery
5. health-check automation and dedupe tooling

## Avoid Early

Avoid these until the ingestion pipeline and legal review are stronger:

- blind scraping of arbitrary webcam directories
- private or accidentally exposed camera indexes
- proprietary aggregators without explicit API or licensing clearance
- stream-only ingestion with no snapshot fallback

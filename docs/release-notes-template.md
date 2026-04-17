# US Webcam Monitor {{VERSION}}

## Highlights

- Windows desktop build for monitoring, reviewing, and browsing public U.S. webcam feeds
- Electron-packaged Next.js app with bundled SQLite data for local desktop startup
- Admin ingestion tools for CSV imports, validator-aware JSON imports, moderation, and promotion workflows

## Desktop Experience

- Windows installer
- Portable Windows package
- Embedded local server startup with packaged database bootstrapping

## What To Configure Next

- Add `CSC_LINK` and `CSC_KEY_PASSWORD` if you want signed Windows releases
- Add additional source credentials in GitHub repository secrets if future release verification needs live adapter coverage

## Release Assets

- Windows installer
- Portable Windows zip package
- Electron release metadata (`latest.yml` and installer blockmap)

## Notes

- This `v{{VERSION}}` release was published from `{{REPO_URL}}`
- The current `v{{VERSION}}` binaries are unsigned

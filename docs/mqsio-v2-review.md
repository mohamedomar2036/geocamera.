# MQSIO v2.0 — feature-branch review

Branch: `feature/mqsio-v2`.
Baseline/main: `510b7f6da9ac395e5f99455e4cdeb1f27d218ee8`.
Scope: the five requested changes only. No merge, production deployment command, deployment URL change, or Vercel configuration change is included.

## Baseline protected

- Existing camera controls/navigation and photo capture remain in place.
- `useGeolocation.ts`, Retry GPS, accuracy validation, WGS84/UTM formulas, zone/hemisphere exceptions and sharing payload structure are retained.
- IndexedDB remains `geocamera`, version 1, store `records`, primary key `id`; existing project/report localStorage keys are unchanged.
- Existing records and media bytes are never rewritten. No destructive migration, storage clearing or uninstall workflow exists.
- CSV's original columns and the ZIP `records.csv` + `media/` structure remain; only country/city/area columns and visible product branding are added.
- Inspection report heading, eight columns, data order, Photo Number semantics, Inspection activity, fonts/colors, logos and settings are retained. Only photo geometry/associated row height and necessary page breaks change.

## Five changes

1. **Branding:** MQSIO — مقسيو / GIS FIELD TOOLS. The approved `09_39_27` icon is resized directly to 180/192/512; `09_39_55` is copied byte-for-byte for launch/recovery. Legacy public assets and internal identifiers remain available. Manifest identity/start URL/scope are unchanged.
2. **Video pixels:** shared Canvas metadata painter, canvas capture stream and MediaRecorder, preferred supported MP4/H.264 then supported alternatives. A decoded-frame stamp-band check and actual MP4/WebM container detection run before saving. The exported file contains the overlay, not a CSS layer. No audio. Changing clock, fresh GPS, country/city/area and project/stage/assigned Asset ID are included. Unsupported or unreliable devices get an explicit warning and stamped-photo fallback. Background/orientation/frame loss and bounded duration/size have cleanup paths.
3. **Place labels:** optional consent inside the existing Location card. BigDataCloud keyless client endpoint, no credentials/referrer/media upload, local 50-entry/30-day cache with a 20 m match, client throttle and timeout. Missing/uncertain data stays Unavailable; capture never waits. No nearest-locality/IP substitution for city. Current provider terms and privacy implications are documented in README. Legacy optional fields remain absent rather than being retroactively populated.
4. **Report photos:** complete landscape/portrait images contained at maximum useful size inside existing Photo columns, centered, with proportional sizing and corresponding bounded row heights. Excel native anchors/page breaks and Word non-splitting rows remain appropriate for A4 landscape; no unrelated report values change.
5. **Shared identifier sequence:** final numeric group only, preserved padding/prefix/separators/suffixes, including Arabic/Persian digits. `FENCE` assigns `FENCE001` to the first saved capture and proposes `FENCE002` afterward. Numeric/mixed starting values are assigned literally first. Updates happen only after a successful IndexedDB transaction and use the existing settings key. Manual edits during encoding survive. A busy guard plus a serial read/write duplicate check protects new concurrent captures. Old duplicate identifiers remain untouched; an empty Asset ID retains its legacy no-ID behavior.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 56 passed.
- `npm run build`: passed.
- `npm run test:e2e -- --workers=2`: 28 Chromium tests passed, including real encoded-frame inspection, stale GPS during video, original report logos, portrait/landscape geometry, mixed photo/video identifiers, overlapping clicks, failed IndexedDB writes, cancelled recording/recovery, reopen persistence, GPS/startup recovery and existing CSV/ZIP/sharing/report workflows.
- Actual same-origin Service Worker upgrade: built the unchanged baseline in an isolated temporary directory, captured a real JPEG and recorded video using the test camera, then switched the server to the feature build and updated the installed worker. Original media SHA-256 hashes, legacy IDs, project/preparer settings and DB version remained identical. A new capture then saved successfully and advanced KEEP-009 → KEEP-010. No storage clearing or reinstall was used.
- Encoded-video frames were independently extracted and OCR inspected: MQSIO, changing clock, assigned identifier, WGS84/UTM, accuracy and country/city appeared in the media itself; later frames replaced stale location/names with Unavailable. ffprobe showed a video-only track.
- Word and Excel portrait/landscape artifacts were rendered to A4-landscape PDFs and visually checked: full photographs/stamps inside cells, repeated headings/logos, two expected pages, no clipping/blank page.
- `npm run test:webkit -- --max-failures=1`: blocked before browser launch because the Playwright WebKit executable is not installed. One launch error; ten tests unrun. No WebKit or physical-device pass is claimed.
- Place-provider integration tests use mocked responses. Live third-party availability/terms enforcement is not certified by these tests.

## Browser limitations and manual release gate

No physical iPhone or Android was tested. Review the feature branch before any production merge. On **both iPhone Safari/Home Screen and Android Chrome/Home Screen**:

1. Open an existing installation/profile without uninstalling; confirm old media, IDs, project and preparer settings. Confirm MQSIO launch/header/manifest/icon; the OS may defer Home Screen icon/name refresh.
2. Enter `IN_PH_009`: save photo, then video; verify assigned IDs 009/010, next value 011, and retention after reopen. Check `FENCE` first record 001/next 002, manual starting values, and failed/cancelled captures.
3. Deny GPS then use the existing Retry GPS flow. Test offline capture, optional place-lookup consent/opt-out, cached/Unavailable labels, and a real live-provider response. Capture must not wait for names.
4. Play the downloaded video in the native player/Files: metadata must be in the file, clock updates, stale GPS/names disappear, and audio is absent. Test rotating and leaving the foreground; supported clips should finish with a clear reason. On unsupported devices, verify the warning/photo fallback rather than an unstamped success.
5. Export day/all Excel and Word reports with portrait and landscape photos; verify unchanged title/logos/columns/Photo Number values and complete stamps. Check existing CSV+Media ZIP and WhatsApp sharing.

Keep recording in the foreground. Safari/Android may suspend or terminate a background page before a clip can finalize. The safety limits are three minutes and approximately 64 MiB; a failed/unverifiable clip is not reported as successfully stamped or used to advance the identifier.

## Exact changed files

- `README.md`
- `docs/mqsio-v2-review.md`
- `e2e/identifiers.spec.ts`
- `e2e/mqsio.spec.ts`
- `e2e/report-fit.spec.ts`
- `e2e/startup-gps.spec.ts`
- `index.html`
- `package-lock.json`
- `package.json`
- `public/mqsio-full-logo.png`
- `public/mqsio-icon-180.png`
- `public/mqsio-icon-192.png`
- `public/mqsio-icon-512.png`
- `src/App.tsx`
- `src/capture-sequence.test.ts`
- `src/domain.ts`
- `src/identifiers.test.ts`
- `src/identifiers.ts`
- `src/inspection/export.ts`
- `src/inspection/generate.ts`
- `src/inspection/layout.test.ts`
- `src/inspection/layout.ts`
- `src/main.tsx`
- `src/media/recording.test.ts`
- `src/media/recording.ts`
- `src/media/stamp.test.ts`
- `src/media/stamp.ts`
- `src/places.test.ts`
- `src/places.ts`
- `src/startup.tsx`
- `src/storage.ts`
- `src/style.css`
- `src/usePlaceNames.ts`
- `vite.config.ts`

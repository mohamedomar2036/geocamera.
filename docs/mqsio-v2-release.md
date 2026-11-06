# MQSIO v2.0 release verification

Release preparation date: 2026-11-06 (Asia/Riyadh).
Approved feature baseline: `74a14736cb627f74f66019b85839e4cc32ddb6e8`.
Pre-release main / rollback source: `510b7f6da9ac395e5f99455e4cdeb1f27d218ee8`.

## Scope and branch review

Reviewed main through the approved feature baseline: the previously approved five v2 changes, Safari retry/freshness handling, opt-in memory-only GPS diagnostics and Apple-epoch normalization. Dependency versions were not changed; package/lockfile version changes already on the feature branch are 1.0.0 to 2.0.0 only.

This release preparation changes only browser title / logo alternative text to **MQSIO — GIS FIELD TOOLS**, documentation branding, and the corresponding existing E2E title expectation. No image, CSS, layout, GPS, capture, stamping, sharing, place lookup, identifier, report, export, storage, manifest or deployment configuration changes are included in this preparation.

Incremental files: `index.html`, `src/App.tsx`, `src/startup.tsx`, `e2e/mqsio.spec.ts`, `README.md`, `docs/mqsio-v2-review.md`, this document.

## Validation

- Typecheck: passed.
- Unit tests: 60 passed across 11 files.
- Production build: passed.
- Full Chromium E2E suite: 38 passed; the branding test initially expected the former Arabic title. Updated only that expectation and reran that test successfully (all 39 cases passed across those runs).
- Full suite covers actual stamped photo/video capture, GPS freshness/retry/epoch normalization, diagnostics privacy, sharing, optional mocked place lookup, identifiers, Excel/Word photos and page geometry, CSV/media ZIP, persistence, offline use and startup recovery.
- Independent local same-origin Service Worker upgrade from pre-release main to this release build: passed. Captured an actual JPEG and video in the baseline application using Chromium's test camera. Compared original media SHA-256, IDs, Asset IDs, project/stage/asset and preparer settings, DB version and store before/after the update: identical. Verified CSV plus both actual media files in ZIP before and after. Verified offline reopen without clearing any storage.
- Rolled that isolated test origin back to the pre-release build using a Service Worker update: the same records, media hashes and settings remained identical. No database deletion, cache reset, worker unregistration or reinstall was used.
- WebKit suite could not launch: Playwright WebKit executable is absent. This is an environment limitation, not a Safari pass. No physical macOS Safari, iPhone Safari/Home Screen or Android Chrome/Home Screen testing was completed for this release preparation. Real GPS, native video codecs, Files downloads, installed icon refresh and WhatsApp share targets still require device checks. Provider tests use mocked network responses.

## Artwork and installed identity

All 14 tracked image assets are byte-identical to approved commit `74a1473`. The full launch/recovery logo is also byte-identical to the repository's original `09_39_55` artwork. No crop, resize, redraw, recoloring or replacement was performed.

| Existing asset | Dimensions | SHA-256 |
| --- | --- | --- |
| `public/mqsio-icon-180.png` | 180×180 | `534e4b324d0894066cc8ac187d7f91415d9bc2820cc45b57dc43b58b0e18bb90` |
| `public/mqsio-icon-192.png` | 192×192 | `95b0017f4f343cd68c75294c0c5204ea69b68aa22cf73bc8795c05ca48f9ada1` |
| `public/mqsio-icon-512.png` | 512×512 | `9c790af69ffa40116efbfe151e1c36869dc046c67e2c3293df63651916d8ecb9` |
| `public/mqsio-full-logo.png` | 1448×1086 | `5917bcd73397ac4b2cb949ac56f0bdd44ceb37fbb1b110223a02c1cd6b90c2dc` |

Browser verification confirmed original bytes served for favicon (192), Apple touch icon (180), and manifest Android/PWA icons (192/512). Manifest `name` and `short_name` are MQSIO, header subtitle is GIS FIELD TOOLS, and splash/recovery references the existing full logo. Manifest start URL/scope are unchanged; no new manifest ID was introduced. An OS may retain the previous installed label/icon until it refreshes; do not uninstall or clear data to force an update. Original artwork lettering is preserved, including any lettering inside the pixels.

## Data protection and backup

- Keep the existing origin `https://geocamera-chi.vercel.app`, browser profile and installed PWA. Its IndexedDB and localStorage remain tied to that origin.
- Database `geocamera`, version 1, object store `records`, key `id` are retained. Existing settings keys are retained, including `geocamera-settings` and `geocamera-inspection-settings`. No migrations or record rewriting are part of this preparation.
- Before relying on the release in the field, export **each recorded day** using **CSV + media ZIP** from the old URL, save copies outside browser storage, and open the ZIPs to confirm `records.csv` and all photo/video files. Note current project/stage/next Asset ID and Prepared By / Job Title separately. Inspection reports are photo-only and are not full media backups. ZIP is an archival export; an automatic ZIP restore/import is not provided.
- A new URL starts with a separate storage origin. Existing records/settings do not automatically move there. This release does not migrate data. Continue using the old URL for old records.
- Do not delete site data, reset storage, uninstall the PWA or unregister its worker as part of release or rollback.

## Hosting access and pending manual verification

No Vercel connector, CLI credentials or project binding is available. GitHub status API access also returned Forbidden. HTTPS requests to both `https://geocamera-chi.vercel.app` and `https://mqsio.vercel.app` were blocked by the execution environment's outbound proxy (CONNECT 403). This is not an application HTTP result and establishes neither URL availability nor ownership. No hostname was configured, redirected, renamed or deleted; no repository rename or Vercel deployment command was issued.

After the authorized main merge, the existing Vercel Git integration may build automatically; that deployment must be checked by an authenticated project owner:

1. In the existing Vercel project, verify the Production deployment corresponds to the merge SHA reported in the release delivery. If Git integration did not deploy, deploy that exact main commit in the existing project with its existing settings.
2. Open the old URL, confirm successful HTTPS without a redirect to another hostname, verify MQSIO title/icons, capture and GPS recovery, existing records/settings, download exports, and offline reopen. Keep the old domain assigned to the same project.
3. Check `mqsio.vercel.app` availability **and account/team ownership** using authenticated Vercel domain/alias management. A DNS result or public 404 alone is insufficient. Add it only as an additional supported alias/domain to the existing project after both checks pass, keeping the old hostname. Do not rename the project to obtain it. If that alias is unavailable or unsupported, report available alternatives for owner approval before configuring any.
4. If supported and verified, an authenticated owner can use `vercel alias set <verified-production-deployment-url> mqsio.vercel.app --scope <owning-team>`. Confirm both hostnames afterwards; a manually assigned deployment alias may need updating on future releases. Do not configure redirects.
5. Complete the physical Safari/iOS/Android checks above. Do not describe a deployment or preferred URL as verified until these hosting checks have actually been performed.

## Rollback

Keep the prior Production deployment in Vercel deployment history; do not delete it. If release verification fails, promote that known-good deployment (source main `510b7f6da9ac395e5f99455e4cdeb1f27d218ee8`) back to Production in the **same project and old hostname**, without clearing browser data. Browser workers may need an online update/reopen to receive rollback assets; offline clients can retain their cached build until then.

For a source-level rollback, use a new commit rather than reset/force-push: `git revert -m 1 <release-merge-SHA>`, run validation, then push the revert to main under the repository's release process. The merge has the old main as its first parent. This reverses the code release; it does not delete captured records or settings. Do not execute a rollback unless a real release failure warrants it.

Final feature and merge SHAs are reported in the delivery message and available from `git rev-parse feature/mqsio-v2` and `git rev-parse main` after the merge.

# FLOWSTATE — Midnight UI implementation

Prepared 2026-09-05. **Published to `main` as `8f0e224`; GitHub Pages deployment succeeded.**
Deployment: https://github.com/satyagaurav7/phone-dashboard/actions/runs/33985044268
Live app: https://satyagaurav7.github.io/phone-dashboard/
Base: `764a18b` on `origin/main`. Branch: `design/midnight-editorial`.

## What changed

The dashboard now uses the approved midnight editorial direction: deep petrol surfaces, ivory Newsreader headlines, celadon actions, an original static filament illustration and a warm paper evening review. It stays a static HTML application; no framework migration or Google API bridge was introduced.

| Destination | Purpose |
| --- | --- |
| Today | One chosen first step, direct Google Tasks/Calendar links, optional check-in, expandable complete local activity log |
| Plan | Clear entry points to Google Tasks, Calendar and Home, with speaker commands explicitly marked for testing |
| Record | Written reflections and existing activity history, with independent reflection deletion |
| More | Existing Money, PR, Health and historical timetable views; notification and quiet-time controls |

Saved timetable content is labeled historical. Saved figures and reference material are labeled for verification. No dates or account values were updated from conversation memory.

## Files and architecture

- `index.html`: existing authentication, schema, Firestore writer, queue and delegated event controller; imports the presentation module.
- `ui/midnight.mjs`: escaped HTML presentation functions. No network requests or persistence.
- `ui/midnight.css`: presentation tokens, responsive layout, keyboard focus, touch targets, reduced motion.
- `assets/filament.svg`: original decorative SVG, no animation or third-party dependency.
- `fonts/newsreader.woff2`, `fonts/OFL.txt`, `THIRD-PARTY-NOTICES.md`: self-hosted open-source font and attribution.
- `sw.js`: cache revision and new shell assets. Existing messaging and cache isolation logic retained.
- `tests/`: isolated DOM/controller tests and a local synthetic preview server. No production auth or Firebase SDK is included in the fixture runtime.

The GitLab UI project was considered, but its Vue framework is unnecessary for this app. Newsreader provides the useful open-source design asset without adding a UI runtime. Sources and license are in the notices file.

## Behavioral guarantees retained

1. Google Tasks remains the full checklist and completion authority. Dashboard actions do not complete Google tasks. No live Google data or connected status is fabricated.
2. Calendar remains for timed commitments. No Google records or automations were changed.
3. Optional reflections remain in `S.checkIns[date]`, outside `S.days`. No score reads check-in data. Delete removes reflection records only.
4. Low capacity changes suggestions only; rest is a real choice. Morning can be skipped; evening can be closed and reopened; check-ins can be turned off and back on.
5. Existing cue values remain separately editable. A new optional `morningSkipped` field lives only inside check-ins and is ignored by old clients.
6. All local activity rows, financial records, health references and milestones remain available. Older fixed spending estimates are explicitly labeled as estimates.
7. Field-path saves, durable queued patches, no-decay behavior, reminder preferences and the manual dry-run publisher remain intact.
8. UI changes do not resolve earlier live-setup questions about appointments, classes, blank tasks, duplicate notifications or physical speaker behavior.

## Interaction fixes in this implementation

- Reflection `change`/`blur` saves use `Dash.set(..., {render:false})`. A blur no longer replaces the next button just before its click.
- Empty text is normalized before comparison, so change plus blur does not enqueue duplicate deletions.
- The chosen step updates safely through `textContent`, including when cleared.
- Disclosure state survives redraws; logging an activity does not collapse its list.
- Keyboard focus returns to the selected control after redraw; closing a review focuses Reopen.
- Screen navigation focuses the main region. Only the save status is a live region, avoiding whole-page announcements.
- Record uses readable labels for saved focus and obstacle keys.

## Verification completed

**11 tests passed** in JSDOM using the real `initApp` controller and real presentation module, with synthetic state and stubbed cloud writes:

- All four main screens plus four retained reference screens render and navigate.
- Low capacity, rest, skip, reopen and off/on preserve action records.
- Reflection editing leaves the next target intact and avoids duplicate blur writes.
- Evening answers survive close/reopen; delete preserves days, flow and rewards.
- HTML-like stored text remains text in Today, inputs and Record.
- Expanded activity log remains open; action writes use narrow paths.
- Offline reflection survives reload, replays over fresh state and retries without replacing unrelated cloud fields.
- Google entry points remain external and disclose the missing bridge.
- Every service-worker shell asset exists; form buttons do not submit; inputs have labels.
- Keyboard focus survives choice redraws and closing.
- Existing reflection keys and cue notes remain readable.

Inline app JavaScript, the presentation module and service worker pass syntax checks. `git diff --check` passes. The upstream branch was refreshed before the release candidate; it remained at the base above.

Run locally:

```sh
npm ci --prefix tests --ignore-scripts
npm test --prefix tests
python tests/preview_server.py
```

Then open `http://127.0.0.1:8765/phone.html` in your own browser. This is a synthetic, local-only preview. Do not use its save labels as evidence of production Firebase success.

## Required before calling the redesign verified on a phone

The cloud browser rejected both the loopback preview URL and shared-file URL under its URL security policy. No browser workaround was attempted after the explicit rejection. **This version has not been visually inspected in a rendering browser.** JSDOM does not validate layout, screenshots or browser event ordering.

Check at 320, 375 and 430 px, plus desktop:

- Today morning, low/usual capacity, rest, skipped and off states.
- Evening empty, filled, closed and reopened states; keyboard open on a phone.
- Plan, Record and More, plus retained reference views.
- Long notes and 200% text zoom: no horizontal page overflow or clipped controls.
- Focus rings, bottom navigation safe area, paper form contrast and font fallback.
- A text edit followed immediately by a button tap using actual touch input.
- Existing signed-in account: one harmless edit, wait for save, reload and verify.
- Updated service worker loads all presentation files; warm offline reload. Cold offline authentication remains an existing limitation.

## Release status and publication restriction

The complete implementation is published and GitHub Pages reports a successful deployment. The phone and signed-in interaction checks above remain outstanding. Prior automatic approval review rejected public publication of app payloads containing existing personal account, health and financial details. The user has now explicitly approved publishing those existing details to the public repository. This redesign preserves those existing source records; it does not sanitize them or add new private data. That rejection has not been bypassed or retried via another publishing route.

Explicit authorization to republish the existing details is now recorded in the conversation. Do not publish only half the UI: the HTML, presentation module, CSS, font, SVG and cache revision must ship together.

Publication was authorized and completed through the authenticated GitHub connector. Run the phone checks above on the live app. A local commit, a remote push and a live deployment are distinct milestones.

Rollback is a normal revert of the UI commit. No database migration is required; previous clients ignore `morningSkipped`. Retain the font license whenever the font is distributed.

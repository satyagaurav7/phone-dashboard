# Focused Day board repair brief

Reviewed local clean HEAD ec60353 on 2026-09-08. This is a source review and implementation brief, not a claim of live verification or completed repairs.

## Evidence and priorities

1. Protect work, commuting, and sleep in both Now selection and Adjust day. Reproduced with the real schedule and synthetic state: office 10:00 selects a 25-minute personal outcome and places it at 10:00 in the preview; 23:10 selects an outcome ending 23:35 despite a 23:00 sleep target. buildDayPlan passes only routine blocks to previewAdjustment; Now only checks the next routine. Use one shared set of protected intervals and preserve declared lunch availability. Include transition time in admission checks.
2. Respect laundry dependencies. The caller does not put computed machine handoffs into the adjustment's fixed intervals, despite the helper's comment promising this. It also schedules each whole chore's active minutes as one chunk even while a stage is waiting. Model the next executable stage and remaining active stages; reserve handoffs without counting machine waiting as personal effort. Never infer stage completion.
3. Repair chosen-outcome lifecycle. focusDone is stored at day level, while editing firstStep does not reset or version its completion. A replacement outcome can remain hidden as already complete. Define an outcome identity, explicit completion/reopen, and preserve history without treating text edits as completion.
4. Use the schedule timezone consistently. Board rendering and countdown callers use browser-local getHours/getMinutes; scoring uses Toronto-aware wallParts. Drive date and minute from the same zoned clock, including midnight and DST tests.
5. Correct the visible chore reward. index.html says +3 on time; CHORE_POINTS.onTime is 8. Render constants and the daily floor from their actual sources.

The first two items are the highest-value batch. Parts of this planner were introduced in the previous Codex pass; passing tests did not establish these guarantees.

## Verification

Fresh targeted run: 31/31 tests passed across day-plan.test.mjs and integration-view.test.mjs. The two synthetic probes above expose missing coverage. No new runtime edits or deployment were performed during this review. Latest Workspace transport handles failed reads without dropping its source cards; production permissions and populated snapshots remain unverified here.

## Usage and execution scope

Account snapshot: five-hour window 0% used; weekly window 89% used, therefore 11% remaining. Weekly reset returned September 12, 2026, 00:29 America/Toronto. These percentages do not provide a token count or a reliable conversion to work hours. There are no available reset credits in the returned snapshot.

Use Astra with reasoning effort Medium selected in the app. This review has not changed the model setting. Complete one coherent batch before expanding scope; do not aim to exhaust the allowance. Reserve time for regression tests, visual inspection, commit, deployment, and verification. Do not promise perfection or a specific percentage cost.

## Implementation prompt

Continue in phone-dashboard from the latest checked-out code. Read CLAUDE.md, docs/integration/START-HERE.md, STATUS.md, and this brief. Check for other agent changes and preserve them.

Prioritize making the Day board's next action trustworthy and simple. First reproduce and fix protected work/commute/sleep intervals and staged laundry dependencies in day-plan.mjs. Use a common availability calculation for Now and Adjust day so their recommendations agree. Preserve fixed scoring windows and existing task completion records. Add behavior tests for work hours, commute boundaries, declared lunch, pre-wake and post-bedtime periods, transition buffers, active laundry waits, due handoffs, and partial stages. Keep background waiting separate from active effort.

Then repair outcome identity/completion editing, zoned clock consistency, and the stale reward label if the first batch is fully verified. Keep the existing visual structure and avoid new settings, dashboards, dependencies, and decorative effects. Do not activate Google writes or money stakes.

Run the relevant tests, then the full module/controller suites once before release. Check real browser layouts at 320/375/430/1280px, direct completion, reload, and reduced motion. Update the shared status with concrete evidence and limitations. Commit and push under the user's existing deployment authorization, verify the exact workflow and served assets, and report what actually shipped. If blocked, preserve completed work and state the exact remaining step.

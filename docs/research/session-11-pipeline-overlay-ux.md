# Session 11 – Pipeline Overlay UX Heuristic Review

**Date:** 2025-11-04  
**Author:** Codex  
**Backlog Link:** IMP-CLIENT-06 (Narrative Overlay & Pipeline Status Integration)  
**Focus:** Assess pipeline overlay density and filtering needs ahead of live LangGraph validation.

## Source Inputs
- `client/src/components/OverlayDock.jsx:292` – current pipeline overlay markup (status grid, history list, alerts stack).
- `client/src/styles/app.css:428` – styling for the pipeline grid, badges, and alert list.
- `client/src/hooks/useSessionConnection.js:742` – offline history trimming logic (`appendHistory`, limit 5).

## Observations
- **High cognitive load:** The status grid (`client/src/components/OverlayDock.jsx:302`) renders three metrics with the same visual weight even when certain data is unavailable (e.g., `offlineLastRun`). On 1280px layouts the `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))` rule (`client/src/styles/app.css:428`) packs values tightly, forcing admins to scan multiple columns to locate failures.
- **Alerts blend into history:** Alerts share identical typography and spacing with recent transitions (`client/src/components/OverlayDock.jsx:331` vs `client/src/components/OverlayDock.jsx:321`). Medium severity messages read as routine transitions, which risks missed follow-ups during busy reconciliation windows.
- **Limited filtering:** History trimming to five entries keeps the list short, but mixed statuses (queued → processing → completed) still render every hop. Without filters or grouping, admins cannot focus on failures or long-running jobs. The JSX has no affordance for toggling visibility or isolating alert severities.
- **Vertical overflow risk:** When alerts exist alongside the hub verb catalog panel, cumulative height pushes character/relationship overlays below the fold on 900px-tall displays, reducing at-a-glance clarity for runners sharing the admin screen.

## Recommendations
1. **Add quick filters:** Introduce pill toggles at the top of the panel (e.g., `All`, `Alerts`, `Runs`) to hide completed/queued noise when reviewing incidents. Maintain ARIA `aria-pressed` states for accessibility.
2. **Summarise headline state:** Replace the three-column grid with a compact summary sentence (e.g., `Processing • Job 3b5a2f • Last failure 8m ago`), followed by expandable detail rows. This keeps the critical state above the fold.
3. **Differentiate alerts:** Amplify severity styling beyond colour by adding iconography and bold headings, and consider an acknowledge control that persists to session memory so repeated alerts do not re-render indefinitely.
4. **Throttle history rendering:** Default to showing the latest transition; reveal older entries behind a “Show timeline” disclosure to reduce constant height while keeping data available.
5. **Prep instrumentation:** When filters ship, log interaction metrics (filter selections, alert acknowledgements) via the existing telemetry bus so future UX passes can prioritise high-friction states.

## Next Steps
- Prototype the revised layout, then extend `useSessionConnection` to persist filter state per session.
- Update Playwright coverage to exercise filter toggles and alert acknowledgement once implemented.
- Validate the revised overlay with two admin SMEs during the next LangGraph smoke; capture qualitative feedback for IMP-CLIENT-06 acceptance.

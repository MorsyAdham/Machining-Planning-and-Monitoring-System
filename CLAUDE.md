# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page machining production planning dashboard for military vehicle manufacturing (K9, K10, K11 battalions). It schedules parts machining across machines with multi-shift support, generates Gantt charts, and exports reports to Excel.

- **Type**: Static SPA (no build step)
- **Backend**: Supabase (Postgres) — credentials embedded in `app.js`
- **Stack**: Vanilla JS + CSS, ES modules, SheetJS for Excel export

## Run Locally

```bash
python -m http.server 8000
# or
npx serve .
```
Open `http://localhost:8000`. The app requires a Supabase connection to function.

## Architecture

### File Layout
- `index.html` — Application shell, modal markup, toolbar, script/style includes
- `app.js` — Client state, scheduling engine, Supabase reads/writes, upload, rendering, event listeners (numbered sections 1–25)
- `styles.css` — CSS custom properties (theme tokens), dark/light themes, component styles
- `database.sql` — Reference schema for Supabase tables (read-only context, not executable)
- `v1/` — Legacy snapshot; do not modify during normal feature work

### State Flow
```
init() → loadSettings() → loadShifts() → loadMachines() → loadAllPartsAndRebuild()
                                                                         ↓
                                                              scheduleParts() → rebuildPlan()
                                                                         ↓
                                                     renderDashboard() + renderGanttFiltered()
```

### Scheduling Engine (Section 8)
- Works on **integer working-day slots** (fractional days for sub-day tasks)
- `barDays = opHrs / machineDailyHours` — allows multiple short tasks to stack in one calendar day
- `expandPart()` (Section 7) expands each part row into per-unit tasks using vehicle distribution priority: `unit_overrides > k9/k10/k11_qty > auto flags (O)`
- Tasks are assigned to the **least-loaded machine** of matching type
- Pinned dates are honored but never cause overlap — tasks queue behind existing work

### Week / Working Day Rules
- **Week: Saturday → Friday** (configured via `isWorkingDay()`)
- **Friday is NEVER a working day** regardless of settings
- **Saturday is optional** (`saturday_working` setting)
- Sunday–Thursday are always working days

### Vehicle Battalion Sizes
```js
const BATTALION = { K9: 18, K10: 3, K11: 4 };  // total 25
```

### Key Sections in `app.js`
| Section | Purpose |
|---------|---------|
| 1 · Config | Constants: Supabase URL/keys, battalion sizes, VMETA (vehicle priorities), FALLBACK_SHIFTS |
| 5 · Machine Capacity | `mDailyForMachine()` — sums shift durations, applies capacity % |
| 6 · Vehicle Assignment | `autoVehicleForUnit()` — battalion slot allocation |
| 7 · Expand Part | `expandPart()` — part → unit tasks with priority cascade |
| 8 · Scheduling | `scheduleParts()` — core scheduling algorithm |
| 12 · Machine Modal | Add/edit machines with active shift checkboxes |
| 18 · Part Modal | Per-unit vehicle, shift, and pinned-date overrides |
| 20 · Gantt | Three views: Machine, Part (default), Weekly |

### Supabase Tables
- `building1_settings` — Plan start date, day start/end, saturday_working, time_unit
- `building1_machines` — Name, type, active_shifts (jsonb), capacity_percent, is_active
- `building1_shifts` — Shift number, name, start/end time, active_days (jsonb)
- `building1_parts` — Part data with k9/k10/k11 flags, qty, location, unit_overrides (jsonb)
- `building1_active_parts` — Derived cache table maintained by the app

## Coding Style
- 4-space indentation in HTML, CSS, JS
- `camelCase` for JS functions/variables; `UPPER_SNAKE_CASE` for config constants
- DOM ids: descriptive, hyphenated (e.g. `part-modal-save`, `gantt-filter-machine`)
- CSS class names matching BEM-like patterns (e.g. `.btn-tbl`, `.gantt-container`)
- Preserve numbered section blocks in `app.js` and token-driven structure in `styles.css`

## Security Note
Supabase credentials are embedded in `app.js`. Do not replace credentials, rename tables, or alter persistence behavior without confirming downstream impact.

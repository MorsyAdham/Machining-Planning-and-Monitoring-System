# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page machining production planning dashboard for military vehicle manufacturing (K9, K10, K11 battalions). It schedules parts machining across machines with multi-shift support, generates Gantt charts, and exports reports to Excel and PDF.

- **Type**: Static SPA (no build step)
- **Backend**: Supabase (Postgres) — credentials embedded in `app.js`
- **Stack**: Vanilla JS + CSS, ES modules, SheetJS for Excel export, jsPDF for PDF export

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
- `v1/` — Legacy snapshot; do not modify during normal feature work. Contains earlier version of the dashboard for reference only.

### State Flow
```
init() → loadSettings() → loadShifts() → loadProdSequence() → loadMachines() → loadAllPartsAndRebuild()
                                                                                         ↓
                                                              scheduleParts() → rebuildPlan()
                                                                                         ↓
                                                     renderDashboard() + renderGanttFiltered()
```

**Building Switcher:** The app supports two buildings (B1/B2) via `activeBuildingId` global. All table names are prefixed (`building1_*`, `building2_*`). The switcher is in the header and reloads all data on change.

### Scheduling Engine (Section 8)
- Works on **integer working-day slots** (fractional days for sub-day tasks)
- `barDays = opHrs / machineDailyHours` — allows multiple short tasks to stack in one calendar day
- **Day-fit check**: if a task doesn't fully fit in remaining hours of the current calendar day, it snaps to the next day's start (no partial-day straddling)
- `expandPart()` (Section 7) expands each part row into per-unit tasks using vehicle distribution priority: `unit_overrides > k9/k10/k11_qty > auto flags (O)`
- **Build Sequence** (Section 8b): when `prodSequence` is defined, the scheduler cycles a user-defined repeating pattern until all master-data totals are exhausted, then appends non-pattern parts
- Tasks are assigned to the **least-loaded machine** of matching type
- Pinned dates are honored but never cause overlap — tasks queue behind existing work

### Build Sequence (Section 8b)
- `prodSequence` global array: `[{partId, vehicle, qty}]` stored in `building1_settings.production_sequence`
- Defines a **repeating production pattern** (recipe), not a one-time list
- The scheduler cycles the pattern until every part's master-data total is satisfied
- Parts not in the sequence are scheduled after using `expandPart()`
- UI: "Build Sequence" button in Gantt toolbar opens a modal to manage the pattern

### Week / Working Day Rules
- **Week: Saturday → Friday** (configured via `isWorkingDay()`)
- **Friday is NEVER a working day** regardless of settings
- **Saturday is optional** (`saturday_working` setting)
- Sunday–Thursday are always working days

### Time Units
The `time_unit` setting (`'h'` or `'min'`) controls how `op_hrs` values are interpreted:
- `'h'` (default): Values are hours (e.g., 3.5 = 3.5 hours)
- `'min'`: Values are minutes and are converted to hours by dividing by 60 (e.g., 210 = 3.5 hours)

This affects the scheduling calculation in `expandPart()`.

### Vehicle Battalion Sizes
```js
const BATTALION = { K9: 18, K10: 3, K11: 4 };  // total 25
```

### Key Sections in `app.js`
| Section | Purpose |
|---------|---------|
| 1 · Config | Constants: Supabase URL/keys, battalion sizes, VMETA, FALLBACK_SHIFTS |
| 5 · Machine Capacity | `mDailyForMachine()` — sums shift durations, applies capacity % |
| 6 · Vehicle Auto-Assign | `autoVehicleForUnit()` — battalion slot allocation |
| 7 · Expand Part | `expandPart()` — part → unit tasks with priority cascade |
| 8 · Scheduling | `scheduleParts()` — core scheduling algorithm with day-fit check |
| 8b · Build Sequence | `showSeqModal()`, `renderSeqTable()`, `applySeqAndClose()`, `loadProdSequence()` |
| 10 · Shifts | `loadShifts()`, shift CRUD |
| 11 · Machine CRUD | `loadMachines()`, machine modal |
| 12 · Machines Table | `renderMachinesTable()` |
| 14 · File Upload | `uploadFile()`, XLSX/CSV parsing |
| 15 · Load & Rebuild | `loadAllPartsAndRebuild()` |
| 16 · Dashboard | `renderDashboard()` — KPI cards |
| 17 · Parts Table | `renderPartsTable()`, `getFilteredParts()` |
| 18 · Part Modal | Per-unit vehicle, shift, and pinned-date overrides |
| 19 · Unit Schedule | `refreshUnitSchedule()` — per-unit form in part modal |
| 20 · Gantt | `renderGanttFiltered()`, `renderMachineView()`, `renderPartView()`, `renderWeeklyView()` |
| 21 · Exports | XLSX and PDF exports for all report types |
| 22 · Navbar Dropdowns | Settings, Shifts, Data panels |
| 23 · UI Helpers | `showToast()`, `esc()`, `escAttr()`, `flt()` |
| 24 · Theme | Dark/light toggle via `data-theme` on `<html>` |
| 25 · Event Listeners | `attachListeners()` |

### File Upload Format
The upload modal accepts `.xlsx`, `.xls`, and `.csv` files. Expected columns (Sheet 1):
- `part_number` (required), `part_name` (required)
- `op_hrs` — Operation hours per unit
- `k9`, `k10`, `k11` — Vehicle flags (`'O'` = required for that vehicle type)
- `k9_qty`, `k10_qty`, `k11_qty` — Optional manual distribution quantities
- `remaining_qty` — Units to produce
- `location` — Must match a configured Machine Type
- `status` — `not_started`, `in_progress`, or `complete`
- `sort_order` — Scheduling priority (lower = earlier)

See the template downloaded from the Data panel for the full column specification.

### Gantt Tooltips
- `attachTooltips(container)` — attaches mouseenter/mousemove/mouseleave to `.tb`, `.unit-tick`, `.wk-cell-wrap`
- **Important**: `data-tip` attribute values use `escAttr()` (not `esc()`) — `esc()` escapes `<` and `>` which breaks HTML parsing in attribute context; `escAttr()` only escapes `&`, `"`, `'` leaving `<>` intact

### Keyboard Shortcuts
Implemented in `attachListeners()` (Section 25):

| Key | Action |
|-----|--------|
| `?` | Show shortcuts modal |
| `N` | Add new part |
| `M` | Add new machine |
| `Ctrl+U` | Upload data (focus file input) |
| `Ctrl+S` | Save settings |
| `Esc` | Close modal / cancel |
| `Ctrl+F` | Focus search (parts table) |
| `T` | Jump to today (Gantt) |
| `1` | Machine view (Gantt) |
| `2` | Part view (Gantt) |
| `3` | Weekly view (Gantt) |

### Supabase Tables
- `building1_settings` — Plan start date, day start/end, saturday_working, time_unit, **production_sequence (jsonb)**
- `building1_machines` — Name, type, active_shifts (jsonb), capacity_percent, is_active
- `building1_shifts` — Shift number, name, start/end time, active_days (jsonb)
- `building1_parts` — Part data with k9/k10/k11 flags, qty, location, unit_overrides (jsonb)
- `building1_active_parts` — Derived cache table maintained by the app

**Note:** The `production_sequence` column stores the user-defined build pattern as JSON array `[{partId, vehicle, qty}]`. See `database.sql` for full schema reference.

## Coding Style
- 4-space indentation in HTML, CSS, JS
- `camelCase` for JS functions/variables; `UPPER_SNAKE_CASE` for config constants
- DOM ids: descriptive, hyphenated (e.g. `part-modal-save`, `gantt-filter-machine`)
- CSS class names matching BEM-like patterns (e.g. `.btn-tbl`, `.gantt-container`)
- Preserve numbered section blocks in `app.js` and token-driven structure in `styles.css`
- Use `escAttr()` for HTML attribute string values; use `esc()` for HTML text content

## Security Note
Supabase credentials are embedded in `app.js`. Do not replace credentials, rename tables, or alter persistence behavior without confirming downstream impact.

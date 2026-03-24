# Project Structure

This project now uses a simple browser-module structure instead of one giant root `app.js`.

## Current Layout

```text
/
  index.html
  app.js
  database.sql
  /css
    styles.css
    layout-modes.css
  /js
    app.js
    data.js
    schedule.js
    ui.js
    exports.js
  /docs
    refactor-checklist.md
    project-structure.md
```

## What Each File Does

### `index.html`

- Loads the CSS
- Loads the app entry from `js/app.js`
- Keeps the static markup for panels, tables, modals, and controls

### `css/styles.css`

- Main application styling
- Theme tokens
- Panels, tables, modals, and component styling

### `css/layout-modes.css`

- Layout mode overrides
- Guided/classic layout-specific rules

### `app.js` (repo root)

- Compatibility shim only
- Re-exports the live browser entry by importing `./js/app.js`

### `js/app.js`

- Main browser entrypoint
- Owns live app state
- Coordinates data loading, scheduling, rendering, and event handling
- Still contains most feature-specific UI rendering and modal logic

This file is still the largest file, but it no longer owns all pure logic or all data access.

### `js/data.js`

- Supabase reads and writes
- Loading settings, shifts, machines, parts, and production sequence
- Save, update, delete, and replace database operations

Rule:

- No DOM reads here
- No rendering here

### `js/schedule.js`

- Pure scheduling and business rules
- Part status logic
- Calendar math
- Shift duration math
- Machine capacity math
- Part expansion
- Scheduling engine

Rule:

- No DOM
- No Supabase

### `js/ui.js`

- Shared UI helpers used by the app
- Toast handling
- Loading overlay handling
- Connection badge updates
- Theme loading and theme application

Rule:

- UI helpers live here
- Feature-specific rendering can still stay in `js/app.js` until later cleanup

### `js/exports.js`

- Shared export styles and helpers
- Worksheet helpers
- PDF document helpers
- Template download
- XLSX/PDF report implementations

Rule:

- All export-specific code belongs here

## Practical Architecture

The app now follows this direction:

```text
js/app.js
  -> js/data.js
  -> js/schedule.js
  -> js/ui.js
  -> js/exports.js
```

That means:

- `data.js` handles persistence
- `schedule.js` handles calculations
- `ui.js` handles shared UI utilities
- `exports.js` handles downloads and reports
- `app.js` coordinates everything

## What Was Intentionally Left In `js/app.js`

To avoid breaking functionality during the refactor, these areas are still centralized in `js/app.js`:

- Feature-specific rendering
- Modal open/close logic
- Gantt rendering
- Feature event listeners
- Some controller-style form handlers

This is intentional. The risky parts were not moved until the pure logic and database access were separated first.

## Why This Structure Is Better

- Database code is no longer mixed with scheduling code
- Scheduling code is reusable and easier to reason about
- Export code is separated from normal screen rendering
- Shared UI utilities are separated from business logic
- The app can keep working without a framework or build step

## Safe Next Cleanup

If you want to continue later, the next cleanup should be:

1. Move feature-specific rendering helpers into `js/ui.js`
2. Move modal/controller code into grouped UI sections
3. Reduce `js/app.js` until it becomes mostly startup, state, and orchestration

That is optional. The project structure is already cleaner and much safer than the original single-file layout.

# Refactor Checklist

This checklist is based on the current `app.js` structure and is ordered to keep the app working after each move.

## Current Safe Baseline

- [x] Move the live runtime file from `/app.js` to `/js/app.js`
- [x] Update `index.html` to load `/js/app.js`
- [x] Keep a root `/app.js` compatibility shim
- [x] Create `/js/data.js`, `/js/schedule.js`, `/js/ui.js`, and `/js/exports.js` as target modules

## Step 1: Extract Scheduling Logic

Move these pure helpers from `/js/app.js` into `/js/schedule.js` first:

- [x] `flt`
- [x] `pad`
- [x] `clamp`
- [x] `getPartStatus`
- [x] `getPartStatusLabel`
- [x] `syncDerivedPartStatus`
- [x] `parseTime`
- [x] `shiftDuration`
- [x] `fmtTime`
- [x] `isWorkingDay`
- [x] `genDates`
- [x] `addWD`
- [x] `wdBetween`
- [x] `fmtDate`
- [x] `localDateStr`
- [x] `mDailyForMachine`
- [x] `autoVehicleForUnit`
- [x] `expandPart`
- [x] `scheduleParts`

Verification:

- [ ] Rebuild plan still works
- [ ] Gantt still renders
- [ ] Machine load totals are unchanged

## Step 2: Extract Export Logic

Current progress:

- [x] moved export helper palette and worksheet/pdf utilities into `/js/exports.js`
- [x] moved `downloadTemplate` into `/js/exports.js`
- [x] moved `exportPartsPDF`
- [x] moved `exportScheduleXLSX`
- [x] moved `exportSchedulePDF`
- [x] moved `exportPartsXLSX`
- [x] moved `exportMachineUtilXLSX`
- [x] moved `exportMachineUtilPDF`
- [x] moved `exportWeeklyPlanXLSX`
- [x] moved `exportWeeklyPlanPDF`
- [x] moved `exportExecutiveSummaryXLSX`
- [x] moved `exportExecutiveSummaryPDF`

Move these export functions and their helper blocks into `/js/exports.js`:

- [ ] export palette helpers
- [ ] worksheet helpers
- [ ] shared PDF helpers
- [ ] `exportPartsXLSX`
- [ ] `exportPartsPDF`
- [ ] `exportScheduleXLSX`
- [ ] `exportSchedulePDF`
- [ ] `exportMachineUtilXLSX`
- [ ] `exportMachineUtilPDF`
- [ ] `exportWeeklyPlanXLSX`
- [ ] `exportWeeklyPlanPDF`
- [ ] `exportExecutiveSummaryXLSX`
- [ ] `exportExecutiveSummaryPDF`
- [ ] `downloadTemplate`

Verification:

- [ ] XLSX exports still download
- [ ] PDF exports still download
- [ ] Column sets and report contents are unchanged

## Step 3: Extract Data Access

Current progress:

- [x] moved core Supabase read/write helpers into `/js/data.js`
- [x] routed settings, shifts, machines, parts, upload replace, and stats count through `/js/data.js`
- [ ] move remaining UI-controller form logic away from raw data orchestration if desired

Move Supabase access into `/js/data.js`:

- [ ] `loadProdSequence`
- [ ] `loadSettings`
- [ ] `saveSettings`
- [ ] `loadShifts`
- [ ] `saveShift`
- [ ] `deleteShift`
- [ ] `loadMachines`
- [ ] `saveMachine`
- [ ] `deleteMachine`
- [ ] `loadAllParts`
- [ ] `savePart`
- [ ] `deletePart`
- [ ] `uploadFile`

Important:

- [ ] Keep table names unchanged
- [ ] Keep field names unchanged
- [ ] Keep upsert/delete behavior unchanged

Verification:

- [ ] Settings load/save works
- [ ] Shift add/edit/delete works
- [ ] Machine add/edit/delete works
- [ ] Part add/edit/delete works
- [ ] Upload works

## Step 4: Extract UI Logic

Move DOM-facing logic into `/js/ui.js`:

- [ ] `$`
- [ ] `esc`
- [ ] `escAttr`
- [ ] theme helpers
- [ ] system layout helpers
- [ ] loading helpers
- [ ] toast helpers
- [ ] settings form rendering
- [ ] shifts rendering and modal handlers
- [ ] machines rendering and modal handlers
- [ ] parts rendering and modal handlers
- [ ] build sequence rendering and modal handlers
- [ ] gantt rendering and filters
- [ ] dropdowns and workspace nav
- [ ] `attachListeners`

Verification:

- [ ] Modals still open and close
- [ ] Filters still work
- [ ] Theme toggle still works
- [ ] Layout switch still works
- [ ] Building switch still works
- [ ] Keyboard shortcuts still work

## Final Target Shape

At the end, `/js/app.js` should only keep:

- [ ] app config
- [ ] shared state
- [ ] bootstrapping
- [ ] `init`
- [ ] `switchBuilding`
- [ ] `refreshAllData`
- [ ] `rebuildPlan`
- [ ] high-level wiring across modules

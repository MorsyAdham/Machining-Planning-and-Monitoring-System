import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ═══════════════════════════════════════════════════════════════
   1 · CONFIG
═══════════════════════════════════════════════════════════════ */
const SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8";

const BATTALION = { K9: 18, K10: 3, K11: 4 };
const DEFAULT_SETTINGS = {
    start_date: new Date().toISOString().slice(0, 10),
    saturday_working: false,
    day_start_time: '08:00',
    day_end_time: '17:00',
    time_unit: 'h',   // 'h' = hours (default), 'min' = minutes
    system_layout: 'classic',
};
const FALLBACK_SHIFTS = [
    { id: 1, shift_number: 1, shift_name: 'Morning', start_time: '08:00', end_time: '16:00', active_days: [0, 1, 2, 3, 4], is_active: true },
    { id: 2, shift_number: 2, shift_name: 'Evening', start_time: '16:00', end_time: '00:00', active_days: [1, 2, 3, 4], is_active: false },
    { id: 3, shift_number: 3, shift_name: 'Night', start_time: '00:00', end_time: '08:00', active_days: [1, 2, 3, 4], is_active: false },
];
const VMETA = {
    K9: { cls: 'k9', barCls: 'bar-k9', priority: 0 },
    K10: { cls: 'k10', barCls: 'bar-k10', priority: 1 },
    K11: { cls: 'k11', barCls: 'bar-k11', priority: 2 },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ═══════════════════════════════════════════════════════════════
   2 · STATE
═══════════════════════════════════════════════════════════════ */
let db = null;
let activeBuildingId = 1;   // 1 = Building #1, 2 = Building #2
let appSettings = { ...DEFAULT_SETTINGS };
let allShifts = [...FALLBACK_SHIFTS];
let currentMachines = [];
let currentParts = [];
let allParts = [];
let scheduledTasks = [];
let isOK = false;
let selectedFile = null;
let currentEditPart = null;
let ptSearch = '', ptLoc = '', ptStatus = '', ptVeh = '';
let gSearch = '', gMach = '', gVeh = '';
let prodSequence = [];   // [{partId, partNumber, partName, vehicle, qty}] — user-defined build order

/* ═══════════════════════════════════════════════════════════════
   3 · UTILITIES
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// For data attribute values — only escape quotes, keep < > so browser parses as HTML
function escAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function flt(v) { return parseFloat(String(v ?? '').replace(/,/g, '')) || 0; }
function pad(n, w) { return String(n).padStart(w || 3, '0'); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function vehTags(p) {
    const t = [];
    if (p.k9 && String(p.k9).trim().toUpperCase() === 'O') t.push('<span class="vt k9">K9</span>');
    if (p.k10 && String(p.k10).trim().toUpperCase() === 'O') t.push('<span class="vt k10">K10</span>');
    if (p.k11 && String(p.k11).trim().toUpperCase() === 'O') t.push('<span class="vt k11">K11</span>');
    return t.join(' ') || '<span style="color:var(--tx3)">—</span>';
}

function getPartStatus(part) {
    const remaining = flt(part?.remaining_qty);
    const started = flt(part?.started_qty);
    if (remaining <= 0) return 'complete';
    if (started > 0) return 'in_progress';
    return 'not_started';
}

function getPartStatusLabel(status) {
    return ({ not_started: 'Not Started', in_progress: 'In Progress', complete: 'Complete' })[status] || status || 'Not Started';
}

function syncDerivedPartStatus(part) {
    return { ...part, status: getPartStatus(part) };
}

function updatePartStatusPreview() {
    const preview = $('part-edit-status-preview');
    if (!preview) return;
    const remaining = flt($('part-edit-remaining')?.value);
    const started = flt($('part-edit-started')?.value);
    const status = getPartStatus({ remaining_qty: remaining, started_qty: started });
    preview.textContent = `Status: ${getPartStatusLabel(status)}`;
}

const SYSTEM_LAYOUT_KEY = 'b1_system_layout';

function normalizeSystemLayout(layout) {
    return layout === 'guided' ? 'guided' : 'classic';
}

function getSystemLayoutStorageKey(buildingId = activeBuildingId) {
    return `${SYSTEM_LAYOUT_KEY}_${buildingId}`;
}

function loadStoredSystemLayout(buildingId = activeBuildingId) {
    try {
        return normalizeSystemLayout(localStorage.getItem(getSystemLayoutStorageKey(buildingId)));
    } catch (e) {
        return DEFAULT_SETTINGS.system_layout;
    }
}

function syncLayoutControls(layout) {
    const normalized = normalizeSystemLayout(layout);
    if ($('system-layout')) $('system-layout').value = normalized;
    if ($('header-layout-select')) $('header-layout-select').value = normalized;
}

function applySystemLayout(layout, { persist = true } = {}) {
    const normalized = normalizeSystemLayout(layout);
    document.body.setAttribute('data-system-layout', normalized);
    appSettings = { ...appSettings, system_layout: normalized };
    syncLayoutControls(normalized);
    if (persist) {
        try { localStorage.setItem(getSystemLayoutStorageKey(), normalized); } catch (e) { }
    }
}

/* ═══════════════════════════════════════════════════════════════
   4 · TIME & CALENDAR UTILITIES
═══════════════════════════════════════════════════════════════ */

// '08:00' → minutes from midnight
function parseTime(t) {
    const p = (t || '08:00').split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10);
}

// Shift duration in hours (handles overnight: '16:00'→'00:00' = 8h)
function shiftDuration(shift) {
    const s = parseTime(shift.start_time || '08:00');
    const e = parseTime(shift.end_time || '16:00');
    let h = (e - s) / 60;
    if (h <= 0) h += 24;
    return h;
}

// Format time minutes → '08:00'
function fmtTime(mins) {
    const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
    const m = ((mins % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Is a given date a working day?
// Sun(0)–Thu(4) = yes | Fri(5) = NEVER | Sat(6) = only if saturday_working
function isWorkingDay(d, settings) {
    const dow = d.getDay();
    if (dow === 5) return false;                     // Friday: never
    if (dow === 6) return !!settings.saturday_working; // Saturday: optional
    return true;                                    // Sun–Thu: always
}

// Generate `count` working dates from startStr
function genDates(startStr, count, settings) {
    const out = [], c = new Date(startStr + 'T00:00:00');
    let safety = 0;
    while (out.length < count && safety < count * 10) {
        if (isWorkingDay(c, settings)) out.push(new Date(c));
        c.setDate(c.getDate() + 1); safety++;
    }
    return out;
}

// Add `days` working days to startStr
function addWD(startStr, days, settings) {
    if (days <= 0) return new Date(startStr + 'T00:00:00');
    const d = new Date(startStr + 'T00:00:00');
    let added = 0;
    while (added < Math.floor(days)) {
        d.setDate(d.getDate() + 1);
        if (isWorkingDay(d, settings)) added++;
    }
    return d;
}

// Count working days between two date strings (exclusive start, inclusive end)
function wdBetween(fromStr, toStr, settings) {
    const from = new Date(fromStr + 'T00:00:00'), to = new Date(toStr + 'T00:00:00');
    if (to <= from) return 0;
    let count = 0, cur = new Date(from);
    cur.setDate(cur.getDate() + 1);
    while (cur <= to) {
        if (isWorkingDay(cur, settings)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function fmtDate(d) {
    if (!d || isNaN(d)) return '—';
    return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

// Local date string — avoids UTC shift (toISOString would give yesterday in UTC+2)
function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ═══════════════════════════════════════════════════════════════
   5 · MACHINE CAPACITY
═══════════════════════════════════════════════════════════════ */
function mDailyForMachine(machine) {
    const active = machine.active_shifts;
    let totalH = 0;
    if (active && Array.isArray(active) && active.length > 0) {
        active.forEach(sn => {
            const shift = allShifts.find(s => s.shift_number === sn);
            if (shift) totalH += shiftDuration(shift);
        });
    } else {
        // Legacy fallback: num_shifts × shift_hours
        totalH = (machine.num_shifts || 1) * (machine.shift_hours || 8);
    }
    return totalH * ((machine.capacity_percent || 100) / 100);
}

/* ═══════════════════════════════════════════════════════════════
   6 · VEHICLE AUTO-ASSIGNMENT
   Returns vehicle string for unit `ui` of `total` units of part.
═══════════════════════════════════════════════════════════════ */
function autoVehicleForUnit(part, ui, total) {
    const k9q = part.k9_qty != null ? flt(part.k9_qty) : null;
    const k10q = part.k10_qty != null ? flt(part.k10_qty) : null;
    const k11q = part.k11_qty != null ? flt(part.k11_qty) : null;
    const hasManual = k9q !== null || k10q !== null || k11q !== null;
    let slots = [];
    if (hasManual) {
        if ((k9q || 0) > 0) for (let i = 0; i < Math.ceil(k9q); i++) slots.push('K9');
        if ((k10q || 0) > 0) for (let i = 0; i < Math.ceil(k10q); i++) slots.push('K10');
        if ((k11q || 0) > 0) for (let i = 0; i < Math.ceil(k11q); i++) slots.push('K11');
    } else {
        if (part.k9 && String(part.k9).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K9; i++) slots.push('K9');
        if (part.k10 && String(part.k10).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K10; i++) slots.push('K10');
        if (part.k11 && String(part.k11).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K11; i++) slots.push('K11');
        const R = clamp(total, 0, slots.length);
        slots = slots.slice(-R);
    }
    return slots[ui - 1] || null;
}

/* ═══════════════════════════════════════════════════════════════
   7 · EXPAND PART → UNIT TASKS
   Priority: unit_overrides > k9/k10/k11_qty > auto flags
═══════════════════════════════════════════════════════════════ */
function expandPart(part) {
    let opHrs = flt(part.op_hrs);
    // Convert minutes → hours if the building setting uses minutes
    if ((appSettings.time_unit || 'h') === 'min') opHrs = opHrs / 60;
    const rem = flt(part.remaining_qty);
    if (rem <= 0 || opHrs <= 0) return [];

    const numUnits = Math.ceil(rem);
    const partShift = part.shift_preference ? parseInt(part.shift_preference, 10) : null;
    const base = {
        partId: part.id,
        partNumber: String(part.part_number || '').trim(),
        partName: String(part.part_name || '').trim(),
        opHrs,
        machineType: String(part.location || 'Unknown').trim(),
        preferredMachineId: part.preferred_machine_id != null ? parseInt(part.preferred_machine_id, 10) : null,
        sortOrder: parseInt(part.sort_order, 10) || 0,
    };

    // Case 1: per-unit overrides (highest priority)
    const unitOvs = Array.isArray(part.unit_overrides) ? part.unit_overrides : [];
    if (unitOvs.length > 0) {
        const oMap = {};
        unitOvs.forEach(o => { oMap[o.u] = o; });
        const tasks = [];
        for (let i = 1; i <= numUnits; i++) {
            const ov = oMap[i] || {};
            const vehicle = ov.v || autoVehicleForUnit(part, i, numUnits);
            if (!vehicle) continue;
            const shiftPref = ov.s || partShift;
            const pinnedDate = ov.d || null;
            tasks.push({ ...base, vehicle, unitIndex: i, shiftPref, pinnedDate });
        }
        return tasks;
    }

    // Case 2: manual k9/k10/k11 distribution
    const k9q = part.k9_qty != null ? flt(part.k9_qty) : null;
    const k10q = part.k10_qty != null ? flt(part.k10_qty) : null;
    const k11q = part.k11_qty != null ? flt(part.k11_qty) : null;
    if (k9q !== null || k10q !== null || k11q !== null) {
        const tasks = [];
        if ((k9q || 0) > 0) for (let i = 0; i < Math.ceil(k9q); i++) tasks.push({ ...base, vehicle: 'K9', unitIndex: i + 1, shiftPref: partShift, pinnedDate: null });
        if ((k10q || 0) > 0) for (let i = 0; i < Math.ceil(k10q); i++) tasks.push({ ...base, vehicle: 'K10', unitIndex: i + 1, shiftPref: partShift, pinnedDate: null });
        if ((k11q || 0) > 0) for (let i = 0; i < Math.ceil(k11q); i++) tasks.push({ ...base, vehicle: 'K11', unitIndex: i + 1, shiftPref: partShift, pinnedDate: null });
        return tasks;
    }

    // Case 3: auto from flags
    const slots = [];
    if (part.k9 && String(part.k9).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K9; i++) slots.push('K9');
    if (part.k10 && String(part.k10).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K10; i++) slots.push('K10');
    if (part.k11 && String(part.k11).trim().toUpperCase() === 'O') for (let i = 0; i < BATTALION.K11; i++) slots.push('K11');
    if (!slots.length) return [];
    const R = clamp(numUnits, 0, slots.length);
    return slots.slice(-R).map((vehicle, idx) => ({ ...base, vehicle, unitIndex: idx + 1, shiftPref: partShift, pinnedDate: null }));
}

/* ═══════════════════════════════════════════════════════════════
   8 · SCHEDULING ENGINE
   Uses integer working-day slots. Pinned dates cascade forward.
═══════════════════════════════════════════════════════════════ */
function scheduleParts(parts, machines) {
    const active = machines.filter(m => m.is_active);
    if (!active.length) return { tasks: [], machineLoad: {}, totalWorkDays: 0 };

    const byType = {};
    active.forEach(m => {
        if (!byType[m.machine_type]) byType[m.machine_type] = [];
        byType[m.machine_type].push(m);
    });

    let raw = [];

    // ── Use explicit build sequence if defined ──
    // prodSequence: [{partId, vehicle, qty}] — a REPEATING PATTERN (recipe)
    // The pattern cycles until all master-data totals are exhausted.
    // Entries with 0 remaining are skipped. Parts not in the pattern are appended after.
    if (prodSequence && prodSequence.length > 0) {
        // Count total units needed per partId (from master data via expandPart)
        const partCounts = {};
        parts.forEach(p => {
            const tasks = expandPart(p);
            partCounts[p.id] = tasks.length;
        });

        // Separate pattern parts from non-pattern parts
        const seqPartIds = new Set(prodSequence.map(e => String(e.partId)));
        const nonPatternParts = parts.filter(p => !seqPartIds.has(String(p.id)));

        const unitCounters = { ...partCounts }; // {partId: remaining}
        let seqIdx = 0;

        // Keep cycling until every counter is 0
        while (Object.values(unitCounters).some(v => v > 0)) {
            let madeProgress = false;

            for (let i = 0; i < prodSequence.length; i++) {
                const entry = prodSequence[i];
                const part = parts.find(p => String(p.id) === String(entry.partId));
                if (!part) continue;
                if ((unitCounters[part.id] || 0) <= 0) continue; // exhausted → skip

                madeProgress = true;
                const vehicle = entry.vehicle || 'K9';
                const globalUnitIdx = (partCounts[part.id] || 0) - (unitCounters[part.id] || 0) + 1;
                raw.push({
                    partId: part.id,
                    partNumber: String(part.part_number || '').trim(),
                    partName: String(part.part_name || '').trim(),
                    opHrs: flt(part.op_hrs),
                    machineType: String(part.location || 'Unknown').trim(),
                    preferredMachineId: part.preferred_machine_id != null ? parseInt(part.preferred_machine_id, 10) : null,
                    sortOrder: 0,
                    vehicle,
                    unitIndex: globalUnitIdx,
                    shiftPref: part.shift_preference ? parseInt(part.shift_preference, 10) : null,
                    pinnedDate: null,
                });
                unitCounters[part.id]--;
            }

            // If no progress was made but some counters are still > 0, break to avoid infinite loop
            if (!madeProgress) break;
        }

        // Append non-pattern parts in original sort order (no sequence repetition)
        nonPatternParts.forEach(p => {
            const tasks = expandPart(p);
            raw = raw.concat(tasks);
        });
    } else {
        // Fallback: auto-expand all parts (no explicit sequence)
        parts.forEach(p => { raw = raw.concat(expandPart(p)); });
        // Sort: sort_order (primary) → shiftPref (null last) → vehicle priority
        raw.sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            const sa = a.shiftPref != null ? a.shiftPref : 99, sb = b.shiftPref != null ? b.shiftPref : 99;
            if (sa !== sb) return sa - sb;
            return (VMETA[a.vehicle]?.priority ?? 99) - (VMETA[b.vehicle]?.priority ?? 99);
        });
    }

    // Machine state: integer working-day index (0 = first working day)
    const avail = {};
    active.forEach(m => { avail[m.id] = 0; });

    const scheduled = [];
    let seq = 1;

    raw.forEach(task => {
        const pool = byType[task.machineType];
        if (!pool || !pool.length) return;

        let candidatePool = pool;

        // If a specific machine is requested, restrict scheduling to that machine
        if (task.preferredMachineId != null) {
            candidatePool = pool.filter(m => String(m.id) === String(task.preferredMachineId));
            if (!candidatePool.length) {
                // Preferred machine either does not exist, is inactive, or its type does not match
                return;
            }
        }

        // Choose least-loaded machine from the allowed pool
        const chosen = candidatePool.reduce(
            (best, m) => avail[m.id] < avail[best.id] ? m : best,
            candidatePool[0]
        );
        const daily = mDailyForMachine(chosen);
        // barDays: fractional days this task occupies (used for bar width AND queue advancement)
        // No minimum-1-day floor here — a 3.5h task on an 8h/day machine = 0.4375 days,
        // so the next task can start at 0.4375 and multiple tasks fit in one calendar day.
        const barDays = (daily > 0) ? task.opHrs / daily : 1;

        // Pinned date → working-day index from plan start
        let pinnedDay = null;
        if (task.pinnedDate) {
            pinnedDay = wdBetween(appSettings.start_date, task.pinnedDate, appSettings);
            if (pinnedDay < 0) pinnedDay = 0;
        }

        // Determine start day:
        // - Pinned:  honour the requested date, BUT if the machine is already
        //   busy past that date, queue behind it (no overlap).
        // - Free:    start when machine next becomes available.
        let startDay = (pinnedDay !== null)
            ? Math.max(pinnedDay, avail[chosen.id])
            : avail[chosen.id];

        // Ensure task fully fits within the same calendar day.
        // Calculate remaining hours in the current day at startDay; if not enough, defer to next day.
        const dayEnd = Math.ceil(startDay);
        const remHrs = (dayEnd - startDay) * daily;
        if (task.opHrs > remHrs && remHrs >= 0) {
            startDay = dayEnd; // snap to next day boundary
        }

        const endDay = startDay + barDays;   // fractional — accurate calendar end

        // Advance machine queue by actual task duration (fractional)
        avail[chosen.id] = Math.max(avail[chosen.id], endDay);

        scheduled.push({
            ...task,
            machineId: chosen.id,
            machineName: chosen.name,
            machineType: chosen.machine_type,
            dailyHours: daily,
            barDays,
            startDay,
            endDay,
            seqNum: seq++,
        });
    });

    const totalWorkDays = scheduled.length
        ? Math.ceil(Math.max(...scheduled.map(t => t.endDay)))
        : 0;

    return { tasks: scheduled, machineLoad: avail, totalWorkDays };
}

/* ═══════════════════════════════════════════════════════════════
   8b · BUILD SEQUENCE
   Lets users define an explicit production order:
   [{partId, vehicle, qty}, …] stored in building1_settings.
   When defined, the scheduler processes entries in this exact order
   instead of auto-expanding parts.
═══════════════════════════════════════════════════════════════ */
function showSeqModal() {
    // Populate part dropdown — set background/color inline so browser dropdown respects dark theme
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const selBg = isDark ? '#1c2230' : '#fdfbf7';
    const selFg = isDark ? '#edf2f7' : '#1c1810';

    const partSel = $('seq-add-part');
    partSel.style.background = selBg;
    partSel.style.color = selFg;
    partSel.innerHTML = '<option value="">— select part —</option>';
    (currentParts || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = String(p.id || '');
        opt.textContent = `${p.part_number || ''} — ${p.part_name || ''}`;
        partSel.appendChild(opt);
    });

    const vehSel = $('seq-add-vehicle');
    vehSel.style.background = selBg;
    vehSel.style.color = selFg;
    $('seq-modal')?.classList.remove('hidden');
}

function hideSeqModal() {
    $('seq-modal')?.classList.add('hidden');
}

function renderSeqTable() {
    const tbody = $('seq-tbody');
    const emptyMsg = $('seq-empty-msg');
    const summary = $('seq-summary');
    if (!tbody) return;

    tbody.innerHTML = '';
    const seq = prodSequence;

    if (!seq.length) {
        emptyMsg?.classList.remove('hidden');
        if (summary) summary.textContent = '';
        return;
    }
    emptyMsg?.classList.add('hidden');

    let totalHrs = 0;
    seq.forEach((entry, i) => {
        const opHrs = flt(entry.opHrs || 0);
        totalHrs += opHrs * entry.qty;
        const tr = document.createElement('tr');

        // Part lookup for display
        const part = (currentParts || []).find(p => String(p.id) === String(entry.partId));
        const partLabel = part
            ? `${part.part_number || ''} — ${part.part_name || ''}`
            : (entry.partNumber || entry.partId || '?');

        tr.innerHTML = `
            <td class="seq-num">${i + 1}</td>
            <td>${esc(partLabel)}</td>
            <td><span class="vt ${(entry.vehicle || '').toLowerCase()}">${entry.vehicle || 'Auto'}</span></td>
            <td style="text-align:right">${entry.qty}</td>
            <td style="text-align:right">${opHrs.toFixed(2)}</td>
            <td class="seq-move-cell">
                <button class="seq-move-btn" data-idx="${i}" data-dir="up" title="Move up" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button class="seq-move-btn" data-idx="${i}" data-dir="dn" title="Move down" ${i === seq.length - 1 ? 'disabled' : ''}>▼</button>
            </td>
            <td>
                <button class="seq-del-btn" data-idx="${i}" title="Remove row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (summary) {
        summary.textContent = `${seq.length} rows · ${totalHrs.toFixed(1)} total op. hours`;
    }
}

function addSeqRow() {
    const partSel = $('seq-add-part');
    const vehSel = $('seq-add-vehicle');
    const qtyInput = $('seq-add-qty');
    if (!partSel || !vehSel || !qtyInput) return;

    const partId = partSel.value;
    const vehicle = vehSel.value || null;
    const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

    if (!partId) {
        showToast('Please select a part first', 'error');
        return;
    }

    const part = (currentParts || []).find(p => String(p.id) === String(partId));
    if (!part) return;

    prodSequence.push({
        partId,
        partNumber: part.part_number || '',
        partName: part.part_name || '',
        vehicle,
        qty,
        opHrs: flt(part.op_hrs),
    });

    qtyInput.value = '';
    vehSel.value = '';
    partSel.value = '';
    renderSeqTable();
}

function removeSeqRow(idx) {
    prodSequence.splice(idx, 1);
    renderSeqTable();
}

function moveSeqRow(idx, dir) {
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= prodSequence.length) return;
    // Swap the two entries
    const tmp = prodSequence[idx];
    prodSequence[idx] = prodSequence[swapIdx];
    prodSequence[swapIdx] = tmp;
    renderSeqTable();
}

function clearSeq() {
    if (!confirm('Clear the entire build sequence?')) return;
    prodSequence = [];
    renderSeqTable();
}

async function applySeqAndClose() {
    try {
        const { error } = await db.from('building1_settings').upsert({
            id: activeBuildingId,
            building_id: activeBuildingId,
            production_sequence: prodSequence,
        }, { onConflict: 'id' });
        if (error) throw error;
        showToast('Build sequence saved ✓', 'success');
    } catch (e) {
        // Column may not exist yet — remind user to run migration
        console.error('[seq save]', e);
        showToast('DB save failed — run Migration 8 in Supabase. Sequence applied locally only.', 'error');
        appSettings.production_sequence = prodSequence;
    }
    hideSeqModal();
    rebuildPlan();
}

async function loadProdSequence() {
    try {
        const { data } = await db.from('building1_settings')
            .select('production_sequence')
            .eq('id', activeBuildingId)
            .single();
        prodSequence = Array.isArray(data?.production_sequence) ? data.production_sequence : [];
    } catch {
        prodSequence = [];
    }
}

/* ═══════════════════════════════════════════════════════════════
   9 · SETTINGS
═══════════════════════════════════════════════════════════════ */
async function loadSettings() {
    try {
        const { data, error } = await db.from('building1_settings').select('*').eq('id', activeBuildingId).single();
        if (error) throw error;
        if (data) appSettings = { ...DEFAULT_SETTINGS, ...data };
    } catch (e) { appSettings = { ...DEFAULT_SETTINGS }; }
    appSettings.system_layout = normalizeSystemLayout(appSettings.system_layout || loadStoredSystemLayout(activeBuildingId));
    populateSettingsForm();
}

async function saveSettings(fd) {
    const systemLayout = normalizeSystemLayout(fd.get('system_layout'));
    const s = {
        id: activeBuildingId,
        building_id: activeBuildingId,
        start_date: fd.get('start_date'),
        saturday_working: fd.get('saturday_working') === 'on',
        day_start_time: fd.get('day_start_time') || '08:00',
        day_end_time: fd.get('day_end_time') || '17:00',
        time_unit: fd.get('time_unit') || 'h',
        system_layout: systemLayout,
        updated_at: new Date().toISOString(),
    };
    try {
        const { error } = await db.from('building1_settings').upsert(s, { onConflict: 'id' });
        if (error) throw error;
        appSettings = { ...s };
        showToast('Settings saved ✓', 'success');
    } catch (e) {
        appSettings = { ...s };
        showToast('Applied locally', 'info');
    }
    applySystemLayout(systemLayout);
    rebuildPlan();
}

function populateSettingsForm() {
    if ($('start-date')) $('start-date').value = appSettings.start_date || new Date().toISOString().slice(0, 10);
    if ($('sat-working')) $('sat-working').checked = !!appSettings.saturday_working;
    if ($('day-start-time')) $('day-start-time').value = appSettings.day_start_time || '08:00';
    if ($('day-end-time')) $('day-end-time').value = appSettings.day_end_time || '17:00';
    if ($('time-unit')) $('time-unit').value = appSettings.time_unit || 'h';
    if ($('system-layout')) $('system-layout').value = normalizeSystemLayout(appSettings.system_layout);
    if ($('header-layout-select')) $('header-layout-select').value = normalizeSystemLayout(appSettings.system_layout);
    applySystemLayout(appSettings.system_layout, { persist: false });
}

/* ═══════════════════════════════════════════════════════════════
   10 · SHIFTS
═══════════════════════════════════════════════════════════════ */
async function loadShifts() {
    try {
        const { data, error } = await db.from('building1_shifts').select('*').eq('building_id', activeBuildingId).order('shift_number');
        if (error) throw error;
        if (data && data.length) {
            allShifts = data.map(s => ({ ...s, active_days: Array.isArray(s.active_days) ? s.active_days : (JSON.parse(s.active_days || '[]')) }));
        } else {
            allShifts = [...FALLBACK_SHIFTS];
        }
    } catch (e) { allShifts = [...FALLBACK_SHIFTS]; }
    renderShiftsConfig();
}

function renderShiftsConfig() {
    const wrap = $('shifts-config-wrap'); if (!wrap) return;
    if (!allShifts.length) { wrap.innerHTML = '<em class="dd-hint">No shifts. Click Add to configure.</em>'; return; }
    wrap.innerHTML = allShifts.map(s => {
        const hrs = shiftDuration(s).toFixed(1);
        const days = (Array.isArray(s.active_days) ? s.active_days : []).map(d => DAYNAMES[d] || '?').join(', ');
        return `<div class="shift-row ${s.is_active ? '' : 'shift-off'}">
      <div class="sr-head">
        <span class="sr-num">S${s.shift_number}</span>
        <span class="sr-name">${esc(s.shift_name)}</span>
        <span class="sr-time">${esc(s.start_time)}–${esc(s.end_time)}</span>
        <span class="sr-hrs">${hrs}h</span>
        <span class="sr-badge ${s.is_active ? 'on' : 'off'}">${s.is_active ? 'Active' : 'Off'}</span>
        <button class="btn-tbl btn-tbl-e" data-act="editshift" data-sid="${s.id}">Edit</button>
      </div>
      <div class="sr-days">${days || 'No active days'}</div>
    </div>`;
    }).join('');
    wrap.querySelectorAll('[data-act="editshift"]').forEach(b => {
        b.addEventListener('click', () => openShiftModal(allShifts.find(s => String(s.id) === b.dataset.sid)));
    });
}

function openShiftModal(shift) {
    const s = shift || null;
    $('shift-edit-id').value = s ? s.id : '';
    $('shift-num').value = s ? s.shift_number : 1;
    $('shift-name').value = s ? s.shift_name : '';
    $('shift-start').value = s ? s.start_time : '08:00';
    $('shift-end').value = s ? s.end_time : '16:00';
    // Populate day checkboxes
    const activeDays = s && Array.isArray(s.active_days) ? s.active_days : [];
    const shiftDaysCont = $('shift-days');
    shiftDaysCont.querySelectorAll('input[name="sd"]').forEach(cb => {
        cb.checked = activeDays.includes(parseInt(cb.value, 10));
    });
    updateShiftDuration();
    $('shift-modal-title').textContent = s ? 'Edit Shift' : 'Add Shift';
    const delBtn = $('shift-modal-delete');
    if (delBtn) delBtn.style.display = s ? '' : 'none';
    $('shift-modal').classList.remove('hidden');
}

function closeShiftModal() { $('shift-modal').classList.add('hidden'); }

function updateShiftDuration() {
    const s = parseTime($('shift-start')?.value || '08:00');
    const e = parseTime($('shift-end')?.value || '16:00');
    let h = (e - s) / 60; if (h <= 0) h += 24;
    const el = $('shift-duration-display');
    if (el) el.textContent = `Duration: ${h.toFixed(1)}h per active day`;
}

async function saveShiftFromModal() {
    const rawId = $('shift-edit-id').value;
    const id = rawId ? parseInt(rawId, 10) : null;
    const shiftNum = parseInt($('shift-num').value, 10);
    const name = $('shift-name').value.trim();
    const start = $('shift-start').value || '08:00';
    const end = $('shift-end').value || '16:00';
    const activeDays = Array.from($('shift-days').querySelectorAll('input[name="sd"]:checked'))
        .map(cb => parseInt(cb.value, 10))
        .filter(d => d !== 5); // never Friday

    if (!name) { showToast('Shift name required', 'error'); return; }

    const rec = {
        shift_number: shiftNum, building_id: activeBuildingId, shift_name: name, start_time: start, end_time: end,
        active_days: activeDays, is_active: activeDays.length > 0, updated_at: new Date().toISOString()
    };
    showLoading('Saving shift…');
    try {
        if (id) {
            const { error } = await db.from('building1_shifts').update(rec).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('building1_shifts').upsert({ ...rec }, { onConflict: 'building_id,shift_number' });
            if (error) throw error;
        }
        closeShiftModal();
        await loadShifts();
        rebuildPlan();
        showToast('Shift saved ✓', 'success');
    } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
    finally { hideLoading(); }
}

async function deleteShiftFromModal() {
    const rawId = $('shift-edit-id').value; if (!rawId) return;
    if (!confirm('Delete this shift? Machines using it will fall back to defaults.')) return;
    showLoading('Deleting…');
    try {
        const { error } = await db.from('building1_shifts').delete().eq('id', parseInt(rawId, 10));
        if (error) throw error;
        closeShiftModal();
        await loadShifts();
        rebuildPlan();
        showToast('Shift deleted', 'success');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { hideLoading(); }
}

/* ═══════════════════════════════════════════════════════════════
   11 · MACHINE CRUD
═══════════════════════════════════════════════════════════════ */
async function loadMachines() {
    try {
        const { data, error } = await db.from('building1_machines').select('*').eq('building_id', activeBuildingId).order('sort_order').order('name');
        if (error) throw error;
        currentMachines = data || [];
    } catch (e) { currentMachines = []; }
    renderMachinesTable();
    populateGanttMachFilter();
}

async function saveMachine(m) {
    if (m.id) {
        const upd = { ...m }; delete upd.id; delete upd.created_at;
        upd.updated_at = new Date().toISOString();
        const { data, error } = await db.from('building1_machines').update(upd).eq('id', m.id).select().single();
        if (error) throw error; return data;
    } else {
        const ins = { ...m }; delete ins.id; ins.sort_order = currentMachines.length + 1; ins.building_id = activeBuildingId;
        const { data, error } = await db.from('building1_machines').insert(ins).select().single();
        if (error) throw error; return data;
    }
}

async function deleteMachine(id) {
    const { error } = await db.from('building1_machines').delete().eq('id', id);
    if (error) throw error;
}

async function toggleMachine(m) {
    const { error } = await db.from('building1_machines')
        .update({ is_active: !m.is_active, updated_at: new Date().toISOString() }).eq('id', m.id);
    if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════════
   12 · MACHINES TABLE + MODAL
═══════════════════════════════════════════════════════════════ */
function renderMachinesTable() {
    const wrap = $('machines-table-wrap'); if (!wrap) return;
    if (!currentMachines.length) {
        wrap.innerHTML = '<div class="empty-state"><p>No machines configured. Click <strong>+ Add Machine</strong> to get started.</p></div>';
        return;
    }
    const rows = currentMachines.map(m => {
        const d = mDailyForMachine(m).toFixed(2), a = m.is_active;
        const shifts = (m.active_shifts && Array.isArray(m.active_shifts) && m.active_shifts.length)
            ? m.active_shifts.map(n => 'S' + n).join('+')
            : ('S1–S' + (m.num_shifts || 1));
        return `<tr class="${a ? '' : 'm-off'}">
      <td><span class="mt-name">${esc(m.name)}</span></td>
      <td><span class="mt-type">${esc(m.machine_type)}</span></td>
      <td>${shifts}</td>
      <td>${m.capacity_percent}%</td>
      <td><span class="mt-daily">${d} hrs/day</span></td>
      <td><span class="mt-badge ${a ? 'on' : 'off'}">${a ? 'Active' : 'Inactive'}</span></td>
      <td><div class="mt-acts">
        <button class="btn-tbl btn-tbl-e" data-act="edit"   data-mid="${m.id}">Edit</button>
        <button class="btn-tbl"            data-act="toggle" data-mid="${m.id}">${a ? 'Deactivate' : 'Activate'}</button>
        <button class="btn-tbl btn-tbl-d"  data-act="del"    data-mid="${m.id}">Delete</button>
      </div></td>
    </tr>`;
    }).join('');
    wrap.innerHTML = `<table class="machines-table"><thead><tr>
    <th>Name</th><th>Type</th><th>Shifts</th><th>Capacity</th><th>Daily Hrs</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
    wrap.querySelectorAll('.btn-tbl').forEach(b => b.addEventListener('click', onMachAct));
}

async function onMachAct(e) {
    const act = e.currentTarget.dataset.act, mid = e.currentTarget.dataset.mid;
    const m = currentMachines.find(x => String(x.id) === String(mid)); if (!m) return;
    if (act === 'edit') {
        openMachModal(m);
    } else if (act === 'toggle') {
        showLoading(m.is_active ? 'Deactivating…' : 'Activating…');
        try { await toggleMachine(m); await loadMachines(); rebuildPlan(); showToast(m.name + ' ' + (m.is_active ? 'deactivated' : 'activated'), 'success'); }
        catch (err) { showToast('Error: ' + err.message, 'error'); } finally { hideLoading(); }
    } else if (act === 'del') {
        if (!confirm(`Delete "${m.name}"?`)) return;
        showLoading('Deleting…');
        try { await deleteMachine(m.id); await loadMachines(); rebuildPlan(); showToast(m.name + ' deleted', 'success'); }
        catch (err) { showToast('Error: ' + err.message, 'error'); } finally { hideLoading(); }
    }
}

function openMachModal(m) {
    $('modal-title').textContent = m ? 'Edit Machine' : 'Add Machine';
    $('machine-id').value = m ? m.id || '' : '';
    $('m-name').value = m ? m.name || '' : '';
    $('m-type').value = m ? m.machine_type || '' : '';
    $('m-capacity').value = m ? m.capacity_percent || 100 : 100;
    // Render active shifts checkboxes
    renderMachineShiftChecks(m?.active_shifts || null, m?.num_shifts || 1);
    updateMachModalDaily(m);
    $('machine-modal').classList.remove('hidden');
    $('m-name').focus();
}

function renderMachineShiftChecks(activeShifts, numShiftsLegacy) {
    const wrap = $('m-active-shifts'); if (!wrap) return;
    if (!allShifts.length) { wrap.innerHTML = '<span class="mf-hint">No shifts configured yet.</span>'; return; }
    // Determine which shifts are active
    let activeNums = [];
    if (activeShifts && Array.isArray(activeShifts) && activeShifts.length > 0) {
        activeNums = activeShifts;
    } else {
        // Legacy: first numShiftsLegacy shifts
        activeNums = allShifts.slice(0, numShiftsLegacy || 1).map(s => s.shift_number);
    }
    wrap.innerHTML = allShifts.map(s => {
        const hrs = shiftDuration(s).toFixed(1);
        const checked = activeNums.includes(s.shift_number);
        return `<label class="shift-check-item ${s.is_active ? '' : 'shift-check-off'}">
      <input type="checkbox" name="mshift" value="${s.shift_number}" ${checked ? 'checked' : ''}/>
      <span class="sc-label">Shift ${s.shift_number}</span>
      <span class="sc-name">${esc(s.shift_name)}</span>
      <span class="sc-time">${esc(s.start_time)}–${esc(s.end_time)}</span>
      <span class="sc-hrs">${hrs}h</span>
    </label>`;
    }).join('');
    wrap.querySelectorAll('input[name="mshift"]').forEach(cb => cb.addEventListener('change', () => updateMachModalDaily(null)));
}

function updateMachModalDaily(m) {
    const cap = (parseFloat($('m-capacity')?.value) || 100) / 100;
    const selected = Array.from(document.querySelectorAll('#m-active-shifts input[name="mshift"]:checked'))
        .map(cb => parseInt(cb.value, 10));
    let hrs = 0;
    if (selected.length) {
        selected.forEach(sn => { const s = allShifts.find(x => x.shift_number === sn); if (s) hrs += shiftDuration(s); });
    } else if (m) {
        hrs = (m.num_shifts || 1) * (m.shift_hours || 8);
    } else {
        hrs = 8;
    }
    const el = $('modal-daily-hrs');
    if (el) el.textContent = (hrs * cap).toFixed(2) + ' hrs/day';
}

async function saveMachFromModal() {
    const name = $('m-name').value.trim();
    const type = $('m-type').value.trim();
    const cap = parseInt($('m-capacity').value, 10);
    const rawId = $('machine-id').value;
    const id = rawId ? parseInt(rawId, 10) : null;
    const activeShifts = Array.from(document.querySelectorAll('#m-active-shifts input[name="mshift"]:checked'))
        .map(cb => parseInt(cb.value, 10));

    if (!name) { showToast('Machine Name required', 'error'); return; }
    if (!type) { showToast('Machine Type required', 'error'); return; }
    if (isNaN(cap) || cap < 1 || cap > 100) { showToast('Capacity must be 1–100', 'error'); return; }
    const dupe = currentMachines.find(m => m.name.toLowerCase() === name.toLowerCase() && m.id !== id);
    if (dupe) { showToast('"' + name + '" already exists', 'error'); return; }

    showLoading('Saving…');
    try {
        await saveMachine({
            id, name, machine_type: type, capacity_percent: cap, is_active: true,
            active_shifts: activeShifts.length ? activeShifts : null,
            num_shifts: activeShifts.length || 1, shift_hours: 8
        });
        closeMachModal();
        await loadMachines(); rebuildPlan();
        showToast('"' + name + '" saved ✓', 'success');
    } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
    finally { hideLoading(); }
}

function closeMachModal() { $('machine-modal').classList.add('hidden'); }

/* ═══════════════════════════════════════════════════════════════
   13 · XLSX TEMPLATE DOWNLOAD
═══════════════════════════════════════════════════════════════ */
function downloadTemplate() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    const hdr = ['part_number', 'part_name', 'setup_hrs', 'mach_hrs', 'op_hrs', 'k9', 'k10', 'k11', 'battalion_qty', 'remaining_qty', 'started_qty', 'location'];
    const ws1 = XLSX.utils.aoa_to_sheet([hdr]);
    ws1['!cols'] = [{ wch: 20 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
    const ws2 = XLSX.utils.aoa_to_sheet([
        ['Building #1 Parts Template', '', ''], ['', '', ''],
        ['Column', 'Required?', 'Notes'],
        ['part_number', 'YES', 'Unique part identifier.'],
        ['part_name', 'YES', 'Part description.'],
        ['op_hrs', 'YES', 'Operation hours per single unit. TOTAL = op_hrs × remaining_qty.'],
        ['k9', 'No', 'Write O (capital letter) if this part is needed for K9 vehicles (18 total).'],
        ['k10', 'No', 'Write O if K10 (3 total). Leave blank otherwise.'],
        ['k11', 'No', 'Write O if K11 (4 total). Leave blank otherwise.'],
        ['remaining_qty', 'YES', 'Units still left to machine. Decimal values allowed (e.g. 7.5).'],
        ['started_qty', 'No', 'Units already started. Leave blank or 0 for not started.'],
        ['location', 'YES', 'Machine TYPE. Must exactly match a Machine Type configured in the app.'],
        ['', '', ''], ['RULES', '', ''],
        ['1', '', 'remaining_qty = 0 or blank → row skipped.'],
        ['2', '', 'Upload replaces ALL existing parts.'],
        ['3', '', 'location must exactly match a machine type.'],
    ]);
    ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Parts Data');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, 'building1_parts_template.xlsx');
    showToast('Template downloaded ✓', 'success');
}

/* ═══════════════════════════════════════════════════════════════
   14 · FILE UPLOAD
═══════════════════════════════════════════════════════════════ */
async function uploadFile(file) {
    showLoading('Reading file…');
    try {
        const XLSX = window.XLSX; if (!XLSX) throw new Error('SheetJS not ready');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        const nonEmpty = aoa.filter(r => r.some(c => c !== null && c !== '' && c !== undefined));
        if (nonEmpty.length < 2) throw new Error('Sheet 1 has no data rows.');

        const hdr = nonEmpty[0].map(h => String(h ?? '').toLowerCase().trim().replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, ''));
        const rawRows = nonEmpty.slice(1).map(row => {
            const obj = {}; hdr.forEach((k, i) => { obj[k] = row[i] ?? ''; }); return obj;
        });

        const normalized = rawRows.map(normalizeRow);
        const filtered = normalized.filter(r => r.part_number && r.remaining_qty > 0);
        const skipped = normalized.length - filtered.length;
        if (!filtered.length) throw new Error(`No valid rows. ${skipped} rows skipped. Check that remaining_qty and part_number are present.`);

        showLoading(`Uploading ${filtered.length} parts… (${skipped} skipped)`);
        const { error: de } = await db.from('building1_parts').delete().eq('building_id', activeBuildingId);
        if (de) throw new Error('Delete failed: ' + de.message);

        const withOrder = filtered.map((r, i) => ({ ...r, sort_order: i + 1 }));
        for (let i = 0; i < withOrder.length; i += 200) {
            const { error: ie } = await db.from('building1_parts').insert(withOrder.slice(i, i + 200));
            if (ie) throw new Error('Insert failed: ' + ie.message);
        }
        showToast(`✓ ${filtered.length} parts uploaded` + (skipped ? ` · ${skipped} skipped` : ''), 'success');
        await loadAllPartsAndRebuild();
    } catch (err) {
        console.error('[upload]', err);
        showToast('Upload failed: ' + String(err.message).slice(0, 120), 'error');
    } finally { hideLoading(); }
}

function normalizeRow(raw) {
    function get(...keys) {
        for (const k of keys) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
    }
    const remRaw = get('remaining_qty', 'remaining qty', 'remainingqty', 'remaining', 'qty_remaining', 'left', 'balance');
    const startedRaw = get('started_qty', 'started qty', 'startedqty', 'qty_started', 'started');
    return {
        part_number: get('part_number', 'part number', 'partnumber', 'part_no', 'partno', 'p_n', 'pn'),
        part_name: get('part_name', 'part name', 'partname', 'description', 'name', 'desc'),
        setup_hrs: flt(get('setup_hrs', 'setup hrs', 'set_up_hrs')),
        mach_hrs: flt(get('mach_hrs', 'mach hrs', 'machine_hrs')),
        op_hrs: flt(get('op_hrs', 'op hrs', 'op_hours', 'operation_hrs', 'total_hrs')),
        k9: get('k9', 'k 9') || null,
        k10: get('k10', 'k 10') || null,
        k11: get('k11', 'k 11') || null,
        battalion_qty: flt(get('battalion_qty', 'battalion qty', 'battalion')),
        remaining_qty: parseFloat(remRaw || 0) || 0,
        started_qty: parseFloat(startedRaw || 0) || 0,
        location: get('location', 'machine_type', 'machine type', 'machine', 'loc'),
        building_id: activeBuildingId,
        status: 'not_started', shift_preference: null, k9_qty: null, k10_qty: null, k11_qty: null,
        unit_overrides: null, target_date: null,
    };
}

/* ═══════════════════════════════════════════════════════════════
   15 · LOAD & REBUILD
═══════════════════════════════════════════════════════════════ */
async function loadAllPartsAndRebuild() {
    try {
        const { data, error } = await db.from('building1_parts').select('*').eq('building_id', activeBuildingId).order('sort_order').order('id');
        if (error) throw error;
        allParts = (data || []).map(syncDerivedPartStatus);
        currentParts = allParts.filter(p => flt(p.remaining_qty) > 0);
    } catch (err) {
        allParts = []; currentParts = [];
        showToast('Could not load parts', 'error');
    }
    rebuildPlan();
    // Clear stale gantt filters
    if (gMach && !scheduledTasks.some(t => t.machineName === gMach)) { gMach = ''; const s = $('gantt-filter-machine'); if (s) s.value = ''; }
    if (gVeh && !scheduledTasks.some(t => t.vehicle === gVeh)) { gVeh = ''; const s = $('gantt-filter-vehicle'); if (s) s.value = ''; }
    renderPartsTable(); updateDBStats(); populateLocFilter();
}

function rebuildPlan() {
    const active = currentMachines.filter(m => m.is_active);
    if (!currentParts.length || !active.length) {
        scheduledTasks = []; renderDashboard(null); renderGanttFiltered(); return;
    }
    const res = scheduleParts(currentParts, currentMachines);
    scheduledTasks = res.tasks;
    renderDashboard(res); renderGanttFiltered(); updateLastUpdated(); updateDBStats();
}

/* ═══════════════════════════════════════════════════════════════
   16 · DASHBOARD
═══════════════════════════════════════════════════════════════ */
function renderDashboard(res) {
    function set(id, v) { const el = $(id); if (el) el.textContent = v; }
    const uParts = currentParts.length;
    const tTasks = currentParts.reduce((s, p) => s + flt(p.remaining_qty), 0);
    const unitMult = (appSettings.time_unit === 'min') ? 1 / 60 : 1;
    const tHrs = currentParts.reduce((s, p) => s + (flt(p.op_hrs) * unitMult) * flt(p.remaining_qty), 0);

    if (!res || !res.tasks.length) {
        set('kpi-parts', uParts || '—'); set('kpi-tasks', tTasks.toFixed(1) || '—');
        set('kpi-hours', tHrs > 0 ? tHrs.toFixed(1) + ' h' : '—');
        set('kpi-days', '—'); set('kpi-end-date', '—');
        set('kpi-parts-sub', 'Part rows with remaining qty > 0');
        set('kpi-tasks-sub', 'Sum of remaining quantities');
        set('kpi-hours-sub', 'Σ (op_hrs × remaining qty)');
        const noM = !currentMachines.filter(m => m.is_active).length;
        set('kpi-days-sub', noM ? 'No active machines' : 'Waiting for data');
        set('kpi-end-sub', 'Configure machines to get projection');
        renderVBD(null); return;
    }

    const { tasks, totalWorkDays } = res;
    const vc = { K9: 0, K10: 0, K11: 0 }, vh = { K9: 0, K10: 0, K11: 0 };
    tasks.forEach(t => { vc[t.vehicle] = (vc[t.vehicle] || 0) + 1; vh[t.vehicle] = (vh[t.vehicle] || 0) + t.opHrs; });
    const activeCnt = currentMachines.filter(m => m.is_active).length;
    const endDate = addWD(appSettings.start_date, totalWorkDays, appSettings);

    set('kpi-parts', uParts.toLocaleString()); set('kpi-parts-sub', 'Part rows with remaining qty > 0');
    set('kpi-tasks', tTasks.toFixed(1)); set('kpi-tasks-sub', `K9: ${vc.K9 || 0} · K10: ${vc.K10 || 0} · K11: ${vc.K11 || 0}`);
    set('kpi-hours', tHrs.toFixed(1) + ' h'); set('kpi-hours-sub', `Total hours (${unitLabel()} converted) · ${activeCnt} machines`);
    set('kpi-days', totalWorkDays.toLocaleString()); set('kpi-days-sub', `${appSettings.saturday_working ? 6 : 5} days/week`);
    set('kpi-end-date', fmtDate(endDate)); set('kpi-end-sub', 'Start: ' + fmtDate(new Date(appSettings.start_date + 'T00:00:00')));
    renderVBD({ vc, vh, tTasks });
}

function renderVBD(data) {
    const el = $('vehicle-breakdown'); if (!el) return;
    if (!data) { el.innerHTML = '<div class="vbd-empty">Upload data to see vehicle breakdown</div>'; return; }
    const { vc, vh, tTasks } = data;
    const pct = v => tTasks > 0 ? ((vc[v] / tTasks) * 100).toFixed(1) : 0;
    el.innerHTML = '<div class="vbd-grid">' + ['K9', 'K10', 'K11'].map(v => `
    <div class="vbd-item ${v.toLowerCase()}">
      <div class="vbd-hdr"><span class="vbd-lbl">${v}</span><span class="vbd-info">${vc[v] || 0} units · ${(vh[v] || 0).toFixed(1)} hrs · ${pct(v)}%</span></div>
      <div class="vbd-track"><div class="vbd-fill" style="width:${pct(v)}%"></div></div>
    </div>`).join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   17 · PARTS TABLE
═══════════════════════════════════════════════════════════════ */
function getFilteredParts() {
    return allParts.filter(p => {
        const q = ptSearch.toLowerCase();
        if (q && !String(p.part_number).toLowerCase().includes(q) && !String(p.part_name).toLowerCase().includes(q)) return false;
        if (ptLoc && String(p.location).toLowerCase() !== ptLoc.toLowerCase()) return false;
        if (ptStatus && getPartStatus(p) !== ptStatus) return false;
        if (ptVeh && !(p[ptVeh.toLowerCase()] && String(p[ptVeh.toLowerCase()]).trim().toUpperCase() === 'O')) return false;
        return true;
    });
}

function renderPartsTable() {
    const wrap = $('parts-table-wrap'); if (!wrap) return;
    if (!allParts.length) {
        wrap.innerHTML = '<div class="empty-state"><em>Upload data or click "+ Add Part" to get started.</em></div>';
        const cnt = $('parts-count'); if (cnt) cnt.textContent = ''; return;
    }
    const rows = getFilteredParts();
    const cnt = $('parts-count'); if (cnt) cnt.textContent = `${rows.length} of ${allParts.length} parts`;
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state"><em>No parts match the current filters.</em></div>'; return; }

    const isMin = (appSettings.time_unit || 'h') === 'min';
    const trs = rows.map((p, idx) => {
        const partStatus = getPartStatus(p);
        const rawOp = flt(p.op_hrs);
        const rawTot = rawOp * flt(p.remaining_qty);
        const dispOp = isMin ? `${rawOp.toFixed(0)} min` : `${rawOp.toFixed(2)} h`;
        const dispTot = isMin ? `${rawTot.toFixed(0)} min` : `${rawTot.toFixed(2)} h`;
        const startedQty = flt(p.started_qty);
        const sp = p.shift_preference ? `<span class="shift-badge">S${p.shift_preference}</span>` : '';
        const hasUnitOvs = Array.isArray(p.unit_overrides) && p.unit_overrides.length > 0;
        const hasManual = p.k9_qty != null || p.k10_qty != null || p.k11_qty != null;
        let distCell;
        if (hasUnitOvs) distCell = `<span class="dist-split" style="color:var(--amb)">Per-unit (${p.unit_overrides.length})</span>`;
        else if (hasManual) distCell = `<span class="dist-split">K9:${flt(p.k9_qty) || 0} K10:${flt(p.k10_qty) || 0} K11:${flt(p.k11_qty) || 0}</span>`;
        else distCell = '<span class="dist-auto">Auto</span>';
        const td = p.target_date ? `<span class="target-date-badge">${p.target_date}</span>` : '';
        return `<tr class="${partStatus === 'complete' ? 'row-done' : ''}" data-pid="${p.id}">
      <td><div class="order-btns">
        <button class="btn-order" data-act="up" data-pid="${p.id}">▲</button>
        <button class="btn-order" data-act="dn" data-pid="${p.id}">▼</button>
      </div></td>
      <td class="num-r" style="font-family:var(--ff-m);font-size:.58rem;color:var(--tx3)">${p.sort_order || idx + 1}</td>
      <td><span class="loc-tag">${esc(p.location || '—')}</span></td>
      <td class="pn-mono">${esc(p.part_number)}</td>
      <td class="part-name-cell" title="${esc(p.part_name)}">${esc(p.part_name)}</td>
      <td>${vehTags(p)}</td>
      <td>${distCell}${td}</td>
      <td class="num-r">${flt(p.remaining_qty)}</td>
      <td class="num-r">${startedQty}</td>
      <td class="num-r">${dispOp}</td>
      <td class="num-acc">${dispTot}</td>
      <td>${sp}<span class="sb sb-${partStatus}">${getPartStatusLabel(partStatus)}</span></td>
      <td><button class="btn-tbl btn-tbl-e" data-act="editpart" data-pid="${p.id}">Edit</button></td>
    </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="parts-table"><thead><tr>
    <th>Order</th><th>#</th><th>Location</th><th>Part Number</th><th>Part Name</th><th>Vehicles</th>
    <th>Distribution</th><th class="num-r">Remaining</th><th class="num-r">Started</th>
    <th class="num-r">Op ${isMin ? 'Min' : 'Hrs'}/Unit</th>
    <th class="num-acc">Total ${isMin ? 'Min' : 'Hrs'}</th>
    <th>Status</th><th>Actions</th>
  </tr></thead><tbody>${trs}</tbody></table>`;

    wrap.querySelectorAll('[data-act="editpart"]').forEach(b => {
        b.addEventListener('click', () => openPartModal(parseInt(b.dataset.pid, 10)));
    });
    wrap.querySelectorAll('.btn-order').forEach(b => b.addEventListener('click', onReorder));
}

async function onReorder(e) {
    const act = e.currentTarget.dataset.act, pid = e.currentTarget.dataset.pid;
    const idx = allParts.findIndex(p => String(p.id) === String(pid)); if (idx < 0) return;
    const swapIdx = act === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= allParts.length) return;
    const a = allParts[idx], b = allParts[swapIdx];
    const soA = a.sort_order, soB = b.sort_order;
    allParts[idx] = { ...a, sort_order: soB };
    allParts[swapIdx] = { ...b, sort_order: soA };
    allParts.sort((x, y) => x.sort_order - y.sort_order);
    currentParts = allParts.filter(p => flt(p.remaining_qty) > 0);
    renderPartsTable();
    try {
        await Promise.all([
            db.from('building1_parts').update({ sort_order: soB }).eq('id', a.id),
            db.from('building1_parts').update({ sort_order: soA }).eq('id', b.id),
        ]);
        rebuildPlan();
    } catch (err) { showToast('Reorder failed: ' + err.message, 'error'); }
}

function populateLocFilter() {
    const sel = $('filter-location'); if (!sel) return;
    const locs = [], seen = {};
    allParts.forEach(p => { if (p.location && !seen[p.location]) { seen[p.location] = true; locs.push(p.location); } });
    locs.sort();
    sel.innerHTML = '<option value="">All Locations</option>' + locs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════════
   18 · PART ADD / EDIT / DELETE MODAL
═══════════════════════════════════════════════════════════════ */
function openPartModal(partId) {
    const isAdd = !partId;
    currentEditPart = isAdd ? null : allParts.find(p => p.id === partId) || null;
    const p = currentEditPart;

    const pmTag = $('part-modal-tag'); if (pmTag) pmTag.textContent = isAdd ? 'ADD PART' : 'EDIT PART';
    const pmTitle = $('part-modal-title'); if (pmTitle) pmTitle.textContent = isAdd ? 'Add New Part' : 'Edit Part';
    if ($('part-edit-id')) $('part-edit-id').value = isAdd ? '' : p.id;
    const pmDel = $('part-modal-delete'); if (pmDel) pmDel.style.display = isAdd ? 'none' : '';
    populatePreferredMachineSelect(
    p?.location || '',
    p?.preferred_machine_id ?? null
);
    // Add-mode fields
    const addFields = $('pm-add-fields');
    if (addFields) addFields.classList.toggle('hidden', !isAdd);
    if (isAdd) {
        if ($('part-add-number')) $('part-add-number').value = '';
        if ($('part-add-name')) $('part-add-name').value = '';
        if ($('part-add-k9')) $('part-add-k9').value = '';
        if ($('part-add-k10')) $('part-add-k10').value = '';
        if ($('part-add-k11')) $('part-add-k11').value = '';
        if ($('part-add-batqty')) $('part-add-batqty').value = '';
    }

    // Info bar (edit mode)
    const infoBar = $('part-edit-info');
    if (infoBar) {
        infoBar.style.display = isAdd ? 'none' : '';
        if (!isAdd && p) infoBar.innerHTML =
            `<strong>${esc(p.part_number)}</strong> — ${esc(p.part_name)}<br>
       Vehicles: ${vehTags(p)} &nbsp;·&nbsp; Bat. QTY: ${p.battalion_qty || '—'} &nbsp;·&nbsp; Location: <span class="loc-tag">${esc(p.location || '—')}</span>`;
    }

    // Core fields
    $('part-edit-location').value = isAdd ? '' : p.location || '';
    $('part-edit-started').value = isAdd ? '0' : flt(p.started_qty);
    $('part-edit-shift').value = isAdd ? '' : p.shift_preference || '';
    $('part-edit-remaining').value = isAdd ? '' : flt(p.remaining_qty);
    $('part-edit-op-hrs').value = isAdd ? '' : flt(p.op_hrs);
    if ($('part-edit-target-date'))
        $('part-edit-target-date').value = isAdd ? '' : p.target_date || '';
    // Update op-hrs label to reflect building's time unit
    const opLbl = document.querySelector('label[for="part-edit-op-hrs"], #part-modal .mf-field:has(#part-edit-op-hrs) label');
    if (opLbl) opLbl.firstChild.textContent = `Op. ${(appSettings.time_unit || 'h') === 'min' ? 'Min' : 'Hrs'} / Unit `;

    // Distribution
    const toVal = v => v != null ? flt(v) : '';
    $('part-edit-k9qty').value = isAdd ? '' : toVal(p.k9_qty);
    $('part-edit-k10qty').value = isAdd ? '' : toVal(p.k10_qty);
    $('part-edit-k11qty').value = isAdd ? '' : toVal(p.k11_qty);

    updateDistSum();
    updatePartStatusPreview();
    refreshUnitSchedule(p);
    $('part-modal').classList.remove('hidden');
}

function closePartModal() { $('part-modal').classList.add('hidden'); currentEditPart = null; }

function updateDistSum() {
    const rem = parseFloat($('part-edit-remaining')?.value || '0') || 0;
    const k9v = $('part-edit-k9qty')?.value || '', k10v = $('part-edit-k10qty')?.value || '', k11v = $('part-edit-k11qty')?.value || '';
    const bar = $('dist-sum-bar'); if (!bar) return;
    const anySet = k9v !== '' || k10v !== '' || k11v !== '';
    if (!anySet) { bar.className = 'dist-sum-bar empty'; bar.textContent = 'Leave blank for auto-assignment, or configure per-unit below.'; return; }
    const sum = (parseFloat(k9v || 0) || 0) + (parseFloat(k10v || 0) || 0) + (parseFloat(k11v || 0) || 0);
    const ok = Math.abs(sum - rem) < 0.01;
    bar.className = 'dist-sum-bar ' + (ok ? 'ok' : 'warn');
    bar.textContent = `Distribution sum: ${sum.toFixed(2)} / ${rem.toFixed(2)} ${ok ? '✓' : '⚠ Mismatch'}`;
}

function autoFillDist() {
    const rem = parseFloat($('part-edit-remaining')?.value || '0') || 0;
    if (rem <= 0) { showToast('Set Remaining QTY first', 'info'); return; }
    const p = currentEditPart;
    const hasK9 = !p || (p.k9 && String(p.k9).trim().toUpperCase() === 'O');
    const hasK10 = !p || (p.k10 && String(p.k10).trim().toUpperCase() === 'O');
    const hasK11 = !p || (p.k11 && String(p.k11).trim().toUpperCase() === 'O');
    // For new parts with no flags, use whatever is set in add-mode flags
    const k9Flag = $('part-add-k9')?.value.trim().toUpperCase() === 'O';
    const k10Flag = $('part-add-k10')?.value.trim().toUpperCase() === 'O';
    const k11Flag = $('part-add-k11')?.value.trim().toUpperCase() === 'O';
    const useK9 = hasK9 || k9Flag;
    const useK10 = hasK10 || k10Flag;
    const useK11 = hasK11 || k11Flag;
    if (!useK9 && !useK10 && !useK11) { showToast('No vehicle flags set', 'info'); return; }
    let left = rem;
    const k9q = useK9 ? Math.min(left, BATTALION.K9) : 0; left = Math.max(0, left - k9q);
    const k10q = useK10 ? Math.min(left, BATTALION.K10) : 0; left = Math.max(0, left - k10q);
    const k11q = useK11 ? Math.min(left, BATTALION.K11) : 0;
    if ($('part-edit-k9qty')) $('part-edit-k9qty').value = useK9 ? k9q : '';
    if ($('part-edit-k10qty')) $('part-edit-k10qty').value = useK10 ? k10q : '';
    if ($('part-edit-k11qty')) $('part-edit-k11qty').value = useK11 ? k11q : '';
    updateDistSum();
}

async function savePartFromModal() {
    const id = $('part-edit-id').value;
    const isAdd = !id;

    // Collect identity (add mode only)
    const partNumber = isAdd ? $('part-add-number')?.value.trim() : null;
    const partName = isAdd ? $('part-add-name')?.value.trim() : null;
    const k9Flag = isAdd ? ($('part-add-k9')?.value.trim() || null) : null;
    const k10Flag = isAdd ? ($('part-add-k10')?.value.trim() || null) : null;
    const k11Flag = isAdd ? ($('part-add-k11')?.value.trim() || null) : null;
    const batQty = isAdd ? (parseFloat($('part-add-batqty')?.value) || 0) : null;

    if (isAdd && !partNumber) { showToast('Part Number required', 'error'); return; }
    if (isAdd && !partName) { showToast('Part Name required', 'error'); return; }

    const location = $('part-edit-location').value.trim();
    const preferredMachineRaw = $('part-edit-machine')?.value || '';
    const preferredMachineId = preferredMachineRaw ? parseInt(preferredMachineRaw, 10) : null;
    const started = parseFloat($('part-edit-started')?.value) || 0;
    const shiftRaw = $('part-edit-shift').value;
    const shift = shiftRaw ? parseInt(shiftRaw, 10) : null;
    const remaining = parseFloat($('part-edit-remaining').value) || 0;
    const opHrs = parseFloat($('part-edit-op-hrs').value) || 0;
    const targetDate = $('part-edit-target-date')?.value || null;

    const k9v = $('part-edit-k9qty').value;
    const k10v = $('part-edit-k10qty').value;
    const k11v = $('part-edit-k11qty').value;
    const k9q = k9v !== '' ? parseFloat(k9v) : null;
    const k10q = k10v !== '' ? parseFloat(k10v) : null;
    const k11q = k11v !== '' ? parseFloat(k11v) : null;

    if (!location) { showToast('Location / Machine Type required', 'error'); return; }
    if (started < 0) { showToast('Started Qty cannot be negative', 'error'); return; }

    const status = getPartStatus({ remaining_qty: remaining, started_qty: started });

    if (k9v !== '' || k10v !== '' || k11v !== '') {
        const sum = (k9q || 0) + (k10q || 0) + (k11q || 0);
        if (Math.abs(sum - remaining) > 0.05) { showToast(`Distribution sum (${sum.toFixed(2)}) ≠ Remaining QTY (${remaining.toFixed(2)})`, 'error'); return; }
    }

    const unitOverrides = collectUnitOverrides();

    showLoading('Saving part…');
    try {
        if (isAdd) {
            const nextOrder = (allParts.length ? Math.max(...allParts.map(p => p.sort_order || 0)) : 0) + 1;
            const { error } = await db.from('building1_parts').insert({
                part_number: partNumber, part_name: partName,
                k9: k9Flag, k10: k10Flag, k11: k11Flag, battalion_qty: batQty || 0,
                location, status, remaining_qty: remaining, started_qty: started, op_hrs: opHrs,
                preferred_machine_id: preferredMachineId,
                shift_preference: shift, k9_qty: k9q, k10_qty: k10q, k11_qty: k11q,
                unit_overrides: unitOverrides, target_date: targetDate,
                sort_order: nextOrder, building_id: activeBuildingId,
            });
            if (error) throw error;
            showToast('Part added ✓', 'success');
        } else {
            const { error } = await db.from('building1_parts').update({
                location, status, remaining_qty: remaining, started_qty: started, op_hrs: opHrs,
                preferred_machine_id: preferredMachineId,
                shift_preference: shift, k9_qty: k9q, k10_qty: k10q, k11_qty: k11q,
                unit_overrides: unitOverrides, target_date: targetDate,
            }).eq('id', parseInt(id, 10));
            if (error) throw error;
            showToast('Part updated ✓', 'success');
        }
        closePartModal();
        await loadAllPartsAndRebuild();
    } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
    finally { hideLoading(); }
}

async function deleteCurrentPart() {
    const id = $('part-edit-id').value; if (!id) return;
    const p = currentEditPart;
    const name = p ? `${p.part_number} – ${p.part_name}` : 'this part';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    showLoading('Deleting…');
    try {
        const { error } = await db.from('building1_parts').delete().eq('id', parseInt(id, 10));
        if (error) throw error;
        closePartModal();
        await loadAllPartsAndRebuild();
        showToast('Part deleted', 'success');
    } catch (err) { showToast('Delete failed: ' + err.message, 'error'); }
    finally { hideLoading(); }
}

function populatePreferredMachineSelect(machineType, selectedId = null) {
    const sel = $('part-edit-machine');
    if (!sel) return;

    const type = String(machineType || '').trim().toLowerCase();
    const activeMachines = (currentMachines || [])
        .filter(m => m.is_active)
        .sort((a, b) => {
            const typeCmp = String(a.machine_type || '').localeCompare(String(b.machine_type || ''));
            if (typeCmp !== 0) return typeCmp;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    const matching = type
        ? activeMachines.filter(m => String(m.machine_type || '').trim().toLowerCase() === type)
        : activeMachines;
    const optionsSource = matching.length ? matching : activeMachines;

    sel.innerHTML = '<option value="">Auto-assign by machine type</option>' +
        optionsSource.map(m => {
            const machineTypeLabel = String(m.machine_type || '').trim();
            const label = machineTypeLabel ? `${m.name} (${machineTypeLabel})` : String(m.name || '');
            return `<option value="${m.id}">${esc(label)}</option>`;
        }).join('');

    const selectedValue = selectedId != null ? String(selectedId) : '';
    sel.value = optionsSource.some(m => String(m.id) === selectedValue) ? selectedValue : '';
    sel.disabled = !activeMachines.length;
}

/* ═══════════════════════════════════════════════════════════════
   19 · UNIT SCHEDULE (per-unit vehicle, shift, date)
═══════════════════════════════════════════════════════════════ */
function refreshUnitSchedule(part) {
    const container = $('unit-schedule-container'); if (!container) return;
    const rem = parseFloat($('part-edit-remaining')?.value || '0') || 0;
    if (rem <= 0) { container.innerHTML = '<p class="us-empty">Set Remaining QTY above to configure per-unit scheduling.</p>'; return; }

    const numUnits = Math.ceil(rem);
    const ovs = (part && Array.isArray(part.unit_overrides)) ? part.unit_overrides : [];
    const oMap = {}; ovs.forEach(o => { oMap[o.u] = o; });

    const today = localDateStr(new Date());
    let rows = '';
    for (let i = 1; i <= numUnits; i++) {
        const ov = oMap[i] || {};
        const autoVeh = part ? (autoVehicleForUnit(part, i, numUnits) || 'Auto') : 'Auto';
        const hasOv = ov.v || ov.s || ov.d;
        rows += `<tr class="${hasOv ? 'us-changed' : ''}">
      <td class="us-num">${i}</td>
      <td><select class="us-sel us-vehicle fsel" data-unit="${i}" style="width:90px">
        <option value="">${esc(autoVeh)} (auto)</option>
        <option value="K9"  ${ov.v === 'K9' ? 'selected' : ''}>K9</option>
        <option value="K10" ${ov.v === 'K10' ? 'selected' : ''}>K10</option>
        <option value="K11" ${ov.v === 'K11' ? 'selected' : ''}>K11</option>
      </select></td>
      <td><select class="us-sel us-shift fsel" data-unit="${i}" style="width:96px">
        <option value="">Any</option>
        <option value="1" ${ov.s === 1 ? 'selected' : ''}>Shift 1</option>
        <option value="2" ${ov.s === 2 ? 'selected' : ''}>Shift 2</option>
        <option value="3" ${ov.s === 3 ? 'selected' : ''}>Shift 3</option>
      </select></td>
      <td><input type="date" class="us-date-inp us-date" data-unit="${i}" value="${ov.d || ''}" min="${today}"/></td>
    </tr>`;
    }

    container.innerHTML = `<div class="us-scroll"><table class="us-table">
    <thead><tr><th>Unit #</th><th>Vehicle</th><th>Shift</th><th>Target Date</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;

    container.querySelectorAll('.us-sel,.us-date').forEach(inp => {
        inp.addEventListener('change', () => {
            const unit = inp.dataset.unit;
            const row = inp.closest('tr'); if (!row) return;
            const vSel = container.querySelector('.us-vehicle[data-unit="' + unit + '"]');
            const sSel = container.querySelector('.us-shift[data-unit="' + unit + '"]');
            const dInp = container.querySelector('.us-date[data-unit="' + unit + '"]');
            row.classList.toggle('us-changed', (vSel && vSel.value !== '') || (sSel && sSel.value !== '') || (dInp && dInp.value !== ''));
        });
    });
}

function collectUnitOverrides() {
    const container = $('unit-schedule-container'); if (!container) return null;
    const ovs = [];
    container.querySelectorAll('.us-vehicle').forEach(vSel => {
        const unit = parseInt(vSel.dataset.unit, 10);
        const v = vSel.value || null;
        const sSel = container.querySelector('.us-shift[data-unit="' + unit + '"]');
        const dInp = container.querySelector('.us-date[data-unit="' + unit + '"]');
        const s = sSel && sSel.value ? parseInt(sSel.value, 10) : null;
        const d = dInp && dInp.value ? dInp.value : null;
        if (v || s || d) ovs.push({ u: unit, v, s, d });
    });
    return ovs.length ? ovs : null;
}

function resetUnitSchedule() {
    const container = $('unit-schedule-container'); if (!container) return;
    container.querySelectorAll('.us-sel').forEach(s => s.value = '');
    container.querySelectorAll('.us-date').forEach(d => d.value = '');
    container.querySelectorAll('tr.us-changed').forEach(tr => tr.classList.remove('us-changed'));
}

/* ═══════════════════════════════════════════════════════════════
   20 · GANTT — THREE VIEWS
═══════════════════════════════════════════════════════════════ */

let ganttView = 'part'; // 'machine' | 'part' | 'weekly'

function populateGanttMachFilter() {
    const sel = $('gantt-filter-machine'); if (!sel) return;
    const names = [], seen = {};
    currentMachines.filter(m => m.is_active).forEach(m => { if (!seen[m.name]) { seen[m.name] = true; names.push(m.name); } });
    names.sort();
    sel.innerHTML = '<option value="">All Machines</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (gMach && names.includes(gMach)) sel.value = gMach; else { gMach = ''; sel.value = ''; }
}

function getFilteredTasks() {
    return scheduledTasks.filter(t => {
        const q = gSearch.toLowerCase();
        if (q && !t.partNumber.toLowerCase().includes(q) && !t.partName.toLowerCase().includes(q)) return false;
        if (gMach && t.machineName !== gMach) return false;
        if (gVeh && t.vehicle !== gVeh) return false;
        return true;
    });
}

function renderGanttFiltered() { renderGanttWith(getFilteredTasks()); }

/* ─── Jump to today in Gantt ─────────────────────────────── */
function jumpToTodayGantt() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gantt = $('gantt-container');
    if (!gantt) return;
    // Find the today column by looking for .is-today
    const todayCell = gantt.querySelector('.g-day.is-today, .g-week.has-today');
    if (todayCell) {
        todayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
        // Fallback: scroll to center of gantt
        gantt.scrollLeft = gantt.scrollWidth / 2;
    }
}

/* ─── Shared helpers ─────────────────────────────────────── */

function ganttMaxDays(tasks) {
    if (!tasks.length) return 10;
    return Math.max(10, Math.ceil(Math.max(...tasks.map(t => t.endDay))) + 5);
}

function buildDateList(numD) {
    return genDates(appSettings.start_date, numD, appSettings);
}

// Build month band segments from date list
function buildMonthSegs(dates, colW) {
    const segs = [];
    dates.forEach((d, i) => {
        const m = d.getMonth(), y = d.getFullYear();
        const key = `${y}-${m}`;
        if (!segs.length || segs[segs.length - 1].key !== key) {
            segs.push({ key, label: MONTHS[m].toUpperCase() + ' ' + y, start: i, count: 1 });
        } else {
            segs[segs.length - 1].count++;
        }
    });
    return segs.map(s => `<div class="gh-month-seg" style="width:${s.count * colW}px;min-width:${s.count * colW}px;">${s.label}</div>`).join('');
}

// Build day header cells
function buildDayCells(dates, colW) {
    const todS = localDateStr(new Date());
    return dates.map((d, i) => {
        const dow = d.getDay();
        const isT = localDateStr(d) === todS;
        const cls = `g-day${isT ? ' is-today' : ''}${dow === 6 ? ' is-sat' : ''}`;
        return `<div class="${cls}" style="width:${colW}px;">` +
            `<span class="gd-dow">${DOWS[dow]}</span>` +
            `<span class="gd-num">${d.getDate()}</span>` +
            `</div>`;
    }).join('');
}

// Today line HTML at the right pixel position
function todayLine(dates, colW) {
    const todS = localDateStr(new Date());
    const idx = dates.findIndex(d => localDateStr(d) === todS);
    if (idx < 0) return '';
    return `<div class="today-line" style="left:${idx * colW}px;"></div>`;
}

// ─── Unit display helpers ─────────────────────────────────────
// Returns the unit label for the active building ('h' or 'min')
function unitLabel() { return (appSettings.time_unit || 'h') === 'min' ? 'min' : 'h'; }
// Convert raw DB value to display hours (no-op for 'h', ÷60 for 'min')
function toHours(v) { return (appSettings.time_unit || 'h') === 'min' ? v / 60 : v; }
// Format as "3.50 h" or "210 min"
function fmtOp(v) {
    if ((appSettings.time_unit || 'h') === 'min') return `${flt(v).toFixed(0)} min`;
    return `${flt(v).toFixed(2)} h`;
}

// Build rich tooltip HTML for a task
// Optional opts: { unitTotal (total units of this part on this machine), seqNum, taskIdx/totalTasks }
function tooltipHTML(t, opts = {}) {
    const sd = addWD(appSettings.start_date, Math.floor(t.startDay), appSettings);
    // endDay is fractional — use ceiling to get the calendar day the task finishes on
    const endDayCeil = Math.ceil(t.endDay);
    const ed = addWD(appSettings.start_date, endDayCeil > Math.floor(t.startDay) ? endDayCeil - 1 : endDayCeil, appSettings);
    const vm = VMETA[t.vehicle] || { cls: 'k9' };

    // Calculate duration info
    const calendarDays = Math.ceil(t.endDay) - Math.floor(t.startDay);
    const durationLabel = calendarDays === 1 ? '1 day' : `${calendarDays} days`;

    // Unit info
    const unitText = t.unitIndex && opts.unitTotal
        ? `U${t.unitIndex}/${opts.unitTotal}`
        : (t.unitIndex ? `U${t.unitIndex}` : '');

    // Sequence badge
    const seqBadge = t.seqNum
        ? `<span class="gt-seq">#${t.seqNum}</span>`
        : '';

    // Machine utilization for this task (what % of the day(s) it occupies)
    const utilization = t.dailyHours > 0
        ? Math.min(100, Math.round((t.opHrs / (t.dailyHours * Math.max(1, t.barDays))) * 100))
        : 0;
    const utilColor = utilization > 85 ? 'var(--err)' : utilization > 50 ? 'var(--warn)' : 'var(--ok)';

    // Build compact single-line HTML for data-tip attribute
    const head = `<div class="gt-head"><span class="gt-veh-pill ${vm.cls}">${t.vehicle}${unitText ? ` · ${unitText}` : ''}</span><span class="gt-pn">${esc(t.partNumber)}</span>${seqBadge}</div>`;
    const rows = [
        `<div class="gt-row"><span class="gt-row-label">Machine</span><span class="gt-row-value">${esc(t.machineName)}</span></div>`,
        `<div class="gt-row"><span class="gt-row-label">Schedule</span><span class="gt-row-value">${fmtDate(sd)} → ${fmtDate(ed)}</span></div>`,
        `<div class="gt-row"><span class="gt-row-label">Duration</span><span class="gt-row-value">${durationLabel} · ${fmtOp(t.opHrs * (unitLabel() === 'min' ? 60 : 1))}</span></div>`,
        `<div class="gt-row"><span class="gt-row-label">Load</span><span class="gt-row-value" style="color:${utilColor}">${utilization}%</span></div>`,
        t.shiftPref ? `<div class="gt-row"><span class="gt-row-label">Shift</span><span class="gt-row-value">Shift ${t.shiftPref}</span></div>` : '',
        t.pinnedDate ? `<div class="gt-row"><span class="gt-row-label">📌 Pinned</span><span class="gt-row-value">${t.pinnedDate}</span></div>` : ''
    ].filter(Boolean).join('');
    const body = `<div class="gt-body"><div class="gt-name">${esc(t.partName)}</div><div class="gt-rows">${rows}</div></div>`;
    return head + body;
}

// Attach tooltip listeners to all .tb, .unit-tick, .wk-cell-wrap, and .part-span-bar elements in a container
function attachTooltips(container) {
    const tt = $('gantt-tooltip'); if (!tt) return;
    const bars = container.querySelectorAll('.tb[data-tip], .unit-tick[data-tip], .wk-cell-wrap[data-tip], .part-span-bar[data-tip]');
    bars.forEach(bar => {
        bar.addEventListener('mouseenter', e => {
            tt.innerHTML = bar.dataset.tip || '';
            if (!tt.innerHTML.trim()) return; // skip if empty tooltip
            tt.classList.remove('hidden');
            // Re-measure after layout so offsetHeight is real, not 0
            const cx = e.clientX, cy = e.clientY;
            requestAnimationFrame(() => positionTooltip(cx, cy, tt));
        });
        bar.addEventListener('mousemove', e => {
            if (!tt.classList.contains('hidden'))
                positionTooltip(e.clientX, e.clientY, tt);
        });
        bar.addEventListener('mouseleave', () => tt.classList.add('hidden'));
    });
}

function positionTooltip(cx, cy, tt) {
    const margin = 16, pad = 8;
    // Use actual measured dimensions — called after rAF so they are reliable
    const W = tt.offsetWidth || 280;
    const H = tt.offsetHeight || 180;
    let x = cx + margin;
    let y = cy + margin;
    // Flip horizontally if would go off right edge
    if (x + W > window.innerWidth - pad) x = cx - W - margin;
    // Flip vertically if would go off bottom edge
    if (y + H > window.innerHeight - pad) y = cy - H - margin;
    // Clamp to viewport
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
}

/* ─── View switch buttons ─────────────────────────────────── */
function initGanttViewSwitcher() {
    document.querySelectorAll('.gv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.gv-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ganttView = btn.dataset.view;
            renderGanttFiltered();
        });
    });
}

/* ─── Main dispatcher ─────────────────────────────────────── */
function renderGanttWith(tasks) {
    const c = $('gantt-container'); if (!c) return;
    if (!tasks || !tasks.length) {
        const hasFilters = gSearch || gMach || gVeh;
        c.innerHTML = `<div class="gantt-empty"><div class="ge-ico">▥</div>
      <p class="ge-title">${hasFilters ? 'No tasks match filters' : 'No Production Schedule'}</p>
      <p class="ge-sub">${hasFilters ? 'Try clearing filters or adjusting search criteria.' : 'Add machines, configure shifts, and upload parts data.'}</p>
      ${hasFilters ? '' : `<div class="ge-actions">
        <button class="btn btn-outline btn-sm" onclick="openMachModal(null)">+ Add Machine</button>
        <button class="btn btn-outline btn-sm" id="ge-upload-gantt-btn">↑ Upload Parts</button>
      </div>`}
    </div>`;
        $('ge-upload-gantt-btn')?.addEventListener('click', () => { const btn = $('nav-dd-data-btn'); if (btn) btn.click(); });
        return;
    }
    if (ganttView === 'machine') renderMachineView(tasks, c);
    else if (ganttView === 'part') renderPartView(tasks, c);
    else renderWeeklyView(tasks, c);
}

/* ═══════════════════════════════════════════════════════════
   VIEW 1 · MACHINE VIEW
   One row per machine. Sequential colored task blocks L→R.
   Best for: machine load, bottlenecks, utilization.
═══════════════════════════════════════════════════════════ */
function renderMachineView(tasks, c) {
    const DW = 60, LW = 260, ROW = 56;
    const numD = ganttMaxDays(tasks);
    const dates = buildDateList(numD);
    const totW = dates.length * DW;
    const tl = todayLine(dates, DW);

    // Group by machine then by type
    const machMap = {};
    tasks.forEach(t => {
        if (!machMap[t.machineName]) machMap[t.machineName] = { id: t.machineId, type: t.machineType, tasks: [] };
        machMap[t.machineName].tasks.push(t);
    });
    const typeMap = {};
    Object.keys(machMap).forEach(n => {
        const tp = machMap[n].type;
        if (!typeMap[tp]) typeMap[tp] = [];
        typeMap[tp].push(n);
    });
    const typeOrder = Object.keys(typeMap).sort();

    const rowsHTML = typeOrder.map(type => {
        const typeTasks = tasks.filter(t => t.machineType === type);
        const typeHrs = typeTasks.reduce((s, t) => s + t.opHrs, 0);
        const groupRow = `<div class="gr-row gr-group">
      <div class="gr-label" style="width:${LW}px;min-width:${LW}px;">
        <span class="gl-main">
          <span class="gl-group-name">⚙ ${esc(type)}</span>
        </span>
        <span class="gl-badge">${typeTasks.length} tasks · ${typeHrs.toFixed(0)} h</span>
      </div>
      <div class="gr-timeline" style="width:${totW}px;">${tl}</div>
    </div>`;
        const machRows = typeMap[type].map(mName => {
            const { tasks: mTasks, id } = machMap[mName];
            const mDef = currentMachines.find(m => m.id === id);
            const daily = mDef ? mDailyForMachine(mDef) : 8;
            const totalHrs = mTasks.reduce((s, t) => s + t.opHrs, 0);
            const maxEnd = mTasks.reduce((s, t) => Math.max(s, t.endDay), 0);
            const util = maxEnd > 0 ? Math.min(100, Math.round((totalHrs / (maxEnd * daily)) * 100)) : 0;
            const utilColor = util > 85 ? 'var(--err)' : util > 65 ? 'var(--warn)' : 'var(--ok)';

            // Count units per part for this machine (for tooltip "U3/12" display)
            const partUnitCounts = {};
            mTasks.forEach(t => {
                const key = t.partNumber;
                if (!partUnitCounts[key]) partUnitCounts[key] = 0;
                partUnitCounts[key]++;
            });

            const bars = mTasks.map(t => {
                const barL = t.startDay * DW;
                // Use fractional barDays for pixel-accurate width — shows real proportion of the day
                const barW = Math.max(8, t.barDays * DW - 2);
                const vm = VMETA[t.vehicle] || { cls: 'k9' };
                // Show part number when bar is wide enough; never show vehicle type as fallback
                const label = barW > 32 ? t.partNumber : '';
                const unitTotal = partUnitCounts[t.partNumber] || 0;
                return `<div class="tb tb-${vm.cls}${t.pinnedDate ? ' tb-pinned' : ''}"
          style="left:${barL.toFixed(1)}px;width:${barW.toFixed(1)}px;top:8px;bottom:8px;"
          data-tip="${escAttr(tooltipHTML(t, { unitTotal }))}">
          <span class="tb-lbl">${label}</span>
        </div>`;
            }).join('');

            return `<div class="gr-row" style="min-height:${ROW}px;">
        <div class="gr-label" style="width:${LW}px;min-width:${LW}px;">
          <span class="gl-main">
            <span class="gl-name">${esc(mName)}</span>
            <span class="gl-sub">${mTasks.length} tasks · ${totalHrs.toFixed(1)} h</span>
          </span>
          <div class="util-pill" style="--uc:${utilColor}">
            <div class="util-bar" style="width:${util}%;background:${utilColor};"></div>
            <span class="util-pct">${util}%</span>
          </div>
        </div>
        <div class="gr-timeline" style="width:${totW}px;">
          ${tl}${bars}
        </div>
      </div>`;
        }).join('');
        return groupRow + machRows;
    }).join('');

    const totalTasks = Object.values(machMap).reduce((sum, m) => sum + m.tasks.length, 0);
    c.innerHTML = _ganttWrap(LW, totW, dates, DW, 'Machine View', `${Object.keys(machMap).length} machines`, rowsHTML);
    console.log('[MachineView] Rendering', totalTasks, 'tasks across', Object.keys(machMap).length, 'machines');
    attachTooltips(c);
}

/* ═══════════════════════════════════════════════════════════
   VIEW 2 · PART VIEW  (default — "which parts are scheduled when")
   One row per unique part. One composite bar showing full span,
   internally segmented by vehicle type (K9 | K10 | K11).
   Hover tooltip shows full detail.
═══════════════════════════════════════════════════════════ */
function renderPartView(tasks, c) {
    const DW = 60, LW = 310, ROW = 60;
    const numD = ganttMaxDays(tasks);
    const dates = buildDateList(numD);
    const totW = dates.length * DW;
    const tl = todayLine(dates, DW);

    // Group tasks by part, preserving sort_order from tasks
    const partMap = {};
    tasks.forEach(t => {
        if (!partMap[t.partNumber]) partMap[t.partNumber] = {
            partName: t.partName, tasks: [], sortOrder: t.sortOrder,
            machs: new Set(), vehicles: {}
        };
        const pm = partMap[t.partNumber];
        pm.tasks.push(t);
        pm.machs.add(t.machineName);
        if (!pm.vehicles[t.vehicle]) pm.vehicles[t.vehicle] = 0;
        pm.vehicles[t.vehicle]++;
        if (t.sortOrder < pm.sortOrder) pm.sortOrder = t.sortOrder; // keep earliest
    });

    // Sort by the part's sort_order (table position)
    const partKeys = Object.keys(partMap).sort((a, b) => {
        if (partMap[a].sortOrder !== partMap[b].sortOrder)
            return partMap[a].sortOrder - partMap[b].sortOrder;
        const aS = Math.min(...partMap[a].tasks.map(t => t.startDay));
        const bS = Math.min(...partMap[b].tasks.map(t => t.startDay));
        return aS - bS;
    });

    const rowsHTML = partKeys.map(pn => {
        const { partName, tasks: pTasks, machs, vehicles } = partMap[pn];

        // Full span of this part — startDay is already the correct working-day index
        const spanStart = Math.min(...pTasks.map(t => t.startDay));
        // Use startDay + barDays for accurate end (not rounded-up opDays)
        const spanEnd = Math.max(...pTasks.map(t => t.startDay + (t.barDays || t.opDays)));
        const spanL = spanStart * DW, spanW = Math.max(DW, (spanEnd - spanStart) * DW);

        // Per-vehicle sub-segments inside the span bar
        const vOrder = ['K9', 'K10', 'K11'];
        const vCounts = vOrder.filter(v => vehicles[v]);
        const totalUnits = vCounts.reduce((s, v) => s + (vehicles[v] || 0), 0);
        let segX = 0;
        const segs = vCounts.map(v => {
            const frac = (vehicles[v] || 0) / totalUnits;
            const segW = frac * spanW;
            const vm = VMETA[v] || { cls: 'k9' };
            const seg = `<div class="part-seg part-seg-${vm.cls}" style="left:${segX.toFixed(1)}px;width:${segW.toFixed(1)}px;" title="${v}: ${vehicles[v]} unit${vehicles[v] > 1 ? 's' : ''}"></div>`;
            segX += segW;
            return seg;
        }).join('');

        // Tooltip: aggregate over all units for this part
        const totalHrs = pTasks.reduce((s, t) => s + t.opHrs, 0);
        const sd = addWD(appSettings.start_date, Math.floor(spanStart), appSettings);
        const spanEndCeil = Math.ceil(spanEnd);
        const ed = addWD(appSettings.start_date, spanEndCeil > Math.floor(spanStart) ? spanEndCeil - 1 : spanEndCeil, appSettings);
        const machStr = Array.from(machs).join(', ');
        const vehStr = vCounts.map(v => `${v}×${vehicles[v]}`).join(' · ');
        const tipHTML = `<div class="gt-head">
      <span class="gt-pn">${esc(pn)}</span>
      ${vCounts.map(v => `<span class="gt-veh-pill ${VMETA[v]?.cls || 'k9'}">${v} ×${vehicles[v]}</span>`).join('')}
    </div>
    <div class="gt-body">
      <div class="gt-name">${esc(partName)}</div>
      <div class="gt-rows">
        <div class="gt-row"><span class="gt-row-label">Machine</span><span class="gt-row-value">${esc(machStr)}</span></div>
        <div class="gt-row"><span class="gt-row-label">Start</span><span class="gt-row-value">${fmtDate(sd)}</span></div>
        <div class="gt-row"><span class="gt-row-label">End</span><span class="gt-row-value">${fmtDate(ed)}</span></div>
        <div class="gt-row"><span class="gt-row-label">Total Hrs</span><span class="gt-row-value">${totalHrs.toFixed(1)} h across ${pTasks.length} units</span></div>
      </div>
    </div>`;

        // Left label
        const machStr2 = Array.from(machs).join(' · ');
        const vehChips = vCounts.map(v => `<span class="vt ${VMETA[v]?.cls || 'k9'}">${v} ×${vehicles[v]}</span>`).join('');

        return `<div class="gr-row" style="min-height:${ROW}px;">
      <div class="gr-label" style="width:${LW}px;min-width:${LW}px;">
        <span class="gl-main" style="min-width:0;flex:1;">
          <span class="gl-name">${esc(pn)}</span>
          <span class="gl-sub" title="${esc(partName)}">${esc(partName)}</span>
          <span class="gl-mach">${esc(machStr2)}</span>
        </span>
        <div class="gl-veh-chips">${vehChips}</div>
      </div>
      <div class="gr-timeline" style="width:${totW}px;">
        ${tl}
        <!-- Span bar with vehicle segments -->
        <div class="part-span-bar" style="left:${spanL.toFixed(1)}px;width:${spanW.toFixed(1)}px;"
          data-tip="${escAttr(tipHTML)}">
          ${segs}
          <span class="part-span-label">${spanW > 80 ? esc(pn) : ''}</span>
        </div>
        <!-- Individual unit tick marks for detail -->
        ${pTasks.map(t => {
            const tL = t.startDay * DW;
            const vm = VMETA[t.vehicle] || { cls: 'k9' };
            return `<div class="unit-tick unit-tick-${vm.cls}" style="left:${tL.toFixed(1)}px;"
            data-tip="${escAttr(tooltipHTML(t))}"></div>`;
        }).join('')}
      </div>
    </div>`;
    }).join('');

    c.innerHTML = _ganttWrap(LW, totW, dates, DW, 'Part Schedule', `${partKeys.length} parts — hover for details`, rowsHTML);
    attachTooltips(c);
}

/* ═══════════════════════════════════════════════════════════
   VIEW 3 · WEEKLY VIEW
   Zoomed-out calendar. Week columns, parts as rows.
   Each cell shows vehicle breakdown for that week.
   Best for: high-level planning overview.
═══════════════════════════════════════════════════════════ */
function renderWeeklyView(tasks, c) {
    const LW = 310, ROW = 56;

    const numD = ganttMaxDays(tasks);
    const allDates = buildDateList(numD);

    // Build week buckets (Sun-based)
    const weekMap = new Map();
    allDates.forEach((d, i) => {
        const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
        const wKey = localDateStr(ws);
        if (!weekMap.has(wKey)) weekMap.set(wKey, { start: ws, days: [], dayIndices: [] });
        weekMap.get(wKey).days.push(d);
        weekMap.get(wKey).dayIndices.push(i);
    });
    const weeks = Array.from(weekMap.values());
    const WW = Math.max(100, Math.max(...weeks.map(w => w.days.length)) * 44);
    const totW = weeks.length * WW;
    const todS = localDateStr(new Date());

    const dayToWeek = new Map();
    weeks.forEach((w, wi) => w.dayIndices.forEach(di => dayToWeek.set(di, wi)));

    // Week header cells
    const weekHeader = weeks.map((w, wi) => {
        const isNow = w.days.some(d => localDateStr(d) === todS);
        const d0 = w.days[0], dL = w.days[w.days.length - 1];
        return `<div class="g-week${isNow ? ' has-today' : ''}" style="width:${WW}px;min-width:${WW}px;">
      <span class="gw-label">${d0.getDate()} ${MONTHS[d0.getMonth()]}</span>
      <span class="gw-dates">${w.days.length} days · ${MONTHS[dL.getMonth()]} ${dL.getDate()}</span>
    </div>`;
    }).join('');

    // Group tasks by part
    const partMap = {};
    tasks.forEach(t => {
        if (!partMap[t.partNumber]) partMap[t.partNumber] = { partName: t.partName, tasks: [], sortOrder: t.sortOrder };
        partMap[t.partNumber].tasks.push(t);
        if (t.sortOrder < partMap[t.partNumber].sortOrder) partMap[t.partNumber].sortOrder = t.sortOrder;
    });
    const partKeys = Object.keys(partMap).sort((a, b) => partMap[a].sortOrder - partMap[b].sortOrder);

    const rowsHTML = partKeys.map(pn => {
        const { partName, tasks: pTasks } = partMap[pn];
        // Aggregate by week
        const wkBuckets = new Array(weeks.length).fill(null).map(() => ({ hrs: { K9: 0, K10: 0, K11: 0 }, count: 0 }));
        pTasks.forEach(t => {
            const midDay = Math.floor((t.startDay + t.endDay) / 2);
            const wIdx = dayToWeek.get(midDay) ?? dayToWeek.get(Math.floor(t.startDay)) ?? 0;
            if (wkBuckets[wIdx]) {
                wkBuckets[wIdx].hrs[t.vehicle] = (wkBuckets[wIdx].hrs[t.vehicle] || 0) + t.opHrs;
                wkBuckets[wIdx].count++;
            }
        });

        const cells = wkBuckets.map((bk, wi) => {
            if (!bk.count) return `<div class="wk-empty-cell" style="left:${wi * WW}px;width:${WW}px;"></div>`;
            const totalH = bk.hrs.K9 + bk.hrs.K10 + bk.hrs.K11;
            const k9pct = totalH > 0 ? (bk.hrs.K9 / totalH * 100) : 0;
            const k10pct = totalH > 0 ? (bk.hrs.K10 / totalH * 100) : 0;
            const k11pct = totalH > 0 ? (bk.hrs.K11 / totalH * 100) : 0;
            const tipHTML = `<div class="gt-head"><span class="gt-pn">${esc(pn)}</span><span style="color:var(--tx3);font-family:var(--ff-m);font-size:.6rem">Week of ${weeks[wi].days[0].getDate()} ${MONTHS[weeks[wi].days[0].getMonth()]}</span></div>
        <div class="gt-body"><div class="gt-name">${esc(partName)}</div>
        <div class="gt-rows">
          ${bk.hrs.K9 > 0 ? `<div class="gt-row"><span class="gt-row-label" style="color:var(--k9c)">K9</span><span class="gt-row-value">${bk.hrs.K9.toFixed(1)} h</span></div>` : ''}
          ${bk.hrs.K10 > 0 ? `<div class="gt-row"><span class="gt-row-label" style="color:var(--k10c)">K10</span><span class="gt-row-value">${bk.hrs.K10.toFixed(1)} h</span></div>` : ''}
          ${bk.hrs.K11 > 0 ? `<div class="gt-row"><span class="gt-row-label" style="color:var(--k11c)">K11</span><span class="gt-row-value">${bk.hrs.K11.toFixed(1)} h</span></div>` : ''}
          <div class="gt-row"><span class="gt-row-label">Total</span><span class="gt-row-value">${totalH.toFixed(1)} h · ${bk.count} units</span></div>
        </div></div>`;
            return `<div class="wk-cell-wrap" style="left:${wi * WW + 3}px;width:${WW - 6}px;" data-tip="${escAttr(tipHTML)}">
        <div class="wk-veh-bar">
          ${k9pct > 0 ? `<div class="wk-seg wk-k9"  style="width:${k9pct.toFixed(1)}%"></div>` : ''}
          ${k10pct > 0 ? `<div class="wk-seg wk-k10" style="width:${k10pct.toFixed(1)}%"></div>` : ''}
          ${k11pct > 0 ? `<div class="wk-seg wk-k11" style="width:${k11pct.toFixed(1)}%"></div>` : ''}
        </div>
        <span class="wk-hrs">${totalH.toFixed(0)}h</span>
      </div>`;
        }).join('');

        const machs = new Set(pTasks.map(t => t.machineName));
        const vehs = [...new Set(pTasks.map(t => t.vehicle))].map(v => `<span class="vt ${VMETA[v]?.cls || 'k9'}">${v}</span>`).join('');
        return `<div class="gr-row" style="min-height:${ROW}px;">
      <div class="gr-label" style="width:${LW}px;min-width:${LW}px;">
        <span class="gl-main">
          <span class="gl-name">${esc(pn)}</span>
          <span class="gl-sub" title="${esc(partName)}">${esc(partName)}</span>
          <span class="gl-mach">${esc([...machs].join(' · '))}</span>
        </span>
        <div class="gl-veh-chips">${vehs}</div>
      </div>
      <div class="gr-timeline wk-timeline" style="width:${totW}px;background-image:repeating-linear-gradient(90deg,transparent 0,transparent ${WW - 1}px,var(--bd) ${WW - 1}px,var(--bd) ${WW}px);">
        ${cells}
      </div>
    </div>`;
    }).join('');

    const corner = `<div class="gh-corner" style="width:${LW}px;min-width:${LW}px;">
    <div class="gh-corner-inner"><span class="gh-corner-title">Weekly Overview</span><span class="gh-corner-sub">${weeks.length} weeks · ${partKeys.length} parts</span></div>
  </div>`;
    c.innerHTML = `<div class="gantt-wrap">
    <div class="gh-row">
      ${corner}
      <div class="gh-timeline">
        <div class="gh-months" style="width:${totW}px;">${buildMonthSegs(weeks.map(w => w.days[0]), WW)}</div>
        <div style="display:flex;height:40px;">${weekHeader}</div>
      </div>
    </div>
    ${rowsHTML}
  </div>`;
    attachTooltips(c);
}

/* ─── Shared gantt wrapper HTML ─────────────────────────── */
function _ganttWrap(LW, totW, dates, DW, title, sub, rowsHTML) {
    return `<div class="gantt-wrap">
    <div class="gh-row">
      <div class="gh-corner" style="width:${LW}px;min-width:${LW}px;">
        <div class="gh-corner-inner">
          <span class="gh-corner-title">${title}</span>
          <span class="gh-corner-sub">${sub}</span>
        </div>
      </div>
      <div class="gh-timeline">
        <div class="gh-months" style="width:${totW}px;">${buildMonthSegs(dates, DW)}</div>
        <div class="gh-days"   style="width:${totW}px;">${buildDayCells(dates, DW)}</div>
      </div>
    </div>
    ${rowsHTML}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   21 · EXPORT REPORTS
   Uses SheetJS (XLSX) for Excel and jsPDF for PDF reports.
   All exports use a light theme optimized for printing.
═══════════════════════════════════════════════════════════════ */

function showReportsModal() {
    $('reports-modal')?.classList.remove('hidden');
}

// Light theme color palette for exports (print-friendly)
const RPT = {
    BG: 'FFFFFFFF',  // page bg (white)
    HEADER: 'FFD0D7DA',  // header row bg (light gray)
    HEADER_FG: 'FF242424',  // header text (dark)
    ACCENT: 'FF1A3A5C',  // dark navy accent
    ACCENT2: 'FF1A5C4A',  // dark teal accent
    BORDER: 'FF9CA3AF',  // cell borders (medium gray)
    ROW_A: 'FFF9FAFB',  // alternating row A (near white)
    ROW_B: 'FFFFFFFF',  // alternating row B (white)
    K9_BG: 'FFDCFCE7', K9_FG: 'FF166534', K9_HEX: '#166534',
    K10_BG: 'FFFEF3C7', K10_FG: 'FF92400E', K10_HEX: '#92400E',
    K11_BG: 'FFEDE9FE', K11_FG: 'FF6B21A8', K11_HEX: '#6B21A8',
    TEXT: 'FF242424',  // primary text (dark)
    TEXT2: 'FF6B7280',  // secondary text (medium gray)
    WARN: 'FFB45309',  // warning orange
    ERR: 'FFDC2626',  // error red
    OK: 'FF16A34A',  // ok green
    AMBER: 'FFD97706',  // amber
    TEAL: 'FF0D9488',  // teal
};

// Helper: styled header row
function _rh(cols) {
    return cols.map(c => ({
        v: c.title || '', t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 11, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.HEADER } },
            alignment: { horizontal: c.align || 'left', vertical: 'center' },
            border: {
                top: { style: 'thin', color: { rgb: RPT.ACCENT } },
                bottom: { style: 'thin', color: { rgb: RPT.ACCENT } },
                left: { style: 'thin', color: { rgb: RPT.BORDER } },
                right: { style: 'thin', color: { rgb: RPT.BORDER } },
            }
        }
    }));
}

// Helper: data row with optional vehicle color + alternating bg
function _dr(cells, opts) {
    opts = opts || {};
    const v = opts.vehicle;
    let bg, fg;
    if (v === 'K9') { bg = RPT.K9_BG; fg = RPT.K9_FG; }
    else if (v === 'K10') { bg = RPT.K10_BG; fg = RPT.K10_FG; }
    else if (v === 'K11') { bg = RPT.K11_BG; fg = RPT.K11_FG; }
    else { bg = opts.bg || (opts.alt ? RPT.ROW_B : RPT.ROW_A); fg = RPT.TEXT; }

    return cells.map((val, i) => ({
        v: val != null ? val : '', t: typeof val === 'number' ? 'n' : 's', s: {
            font: { color: { rgb: fg }, bold: opts.bold || false, sz: 10, name: 'Calibri' },
            fill: { fgColor: { rgb: bg } },
            alignment: { vertical: 'center' },
            border: {
                top: { style: 'thin', color: { rgb: RPT.BORDER } },
                bottom: { style: 'thin', color: { rgb: RPT.BORDER } },
                left: { style: 'thin', color: { rgb: RPT.BORDER } },
                right: { style: 'thin', color: { rgb: RPT.BORDER } },
            }
        }
    }));
}

// Helper: group header row spanning all cols
function _grh(label, numCols) {
    const EMPTY_CELL = {
        v: '', t: 's', s: {
            fill: { fgColor: { rgb: RPT.BG } },
            border: {
                top: { style: 'medium', color: { rgb: RPT.ACCENT } },
                bottom: { style: 'medium', color: { rgb: RPT.ACCENT } },
                left: { style: 'thin', color: { rgb: RPT.BORDER } },
                right: { style: 'thin', color: { rgb: RPT.BORDER } },
            }
        }
    };
    return [{
        v: label, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.ACCENT }, sz: 11, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
                top: { style: 'medium', color: { rgb: RPT.ACCENT } },
                bottom: { style: 'medium', color: { rgb: RPT.ACCENT } },
                left: { style: 'medium', color: { rgb: RPT.ACCENT } },
                right: { style: 'medium', color: { rgb: RPT.ACCENT } },
            }
        }
    }].concat(new Array((numCols || 16) - 1).fill(EMPTY_CELL));
}

// Helper: build a worksheet with column widths and row heights, auto-filter
function _buildWs(sheetData, colWidths, rowHeights) {
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    if (rowHeights) ws['!rows'] = rowHeights;
    return ws;
}

/* ═══════════════════════════════════════════════════════════════
   21 · EXPORTS (XLSX + PDF)
═══════════════════════════════════════════════════════════════ */

// ── PARTS LIST PDF ───────────────────────────────────────
function exportPartsPDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    const isMin = (appSettings.time_unit || 'h') === 'min';
    const unitCol = isMin ? 'Op Min/Unit' : 'Op Hrs/Unit';
    const totCol = isMin ? 'Total Op Min' : 'Total Op Hrs';

    const doc = _makePdfDoc(`Building #${activeBuildingId} — Parts List`);

    const cols = ['Part Number', 'Part Name', 'Location', 'K9', 'K10', 'K11', 'Rem. QTY', 'Started QTY', unitCol, totCol, 'Status', 'Target Date'];
    const rows = [];
    (currentParts || allParts || []).forEach(p => {
        rows.push([
            p.part_number || '', p.part_name || '', p.location || '',
            p.k9 ? '●' : '', p.k10 ? '●' : '', p.k11 ? '●' : '',
            String(flt(p.remaining_qty)),
            String(flt(p.started_qty)),
            String(flt(p.op_hrs)),
            String(+(flt(p.op_hrs) * flt(p.remaining_qty)).toFixed(2)),
            getPartStatusLabel(getPartStatus(p)), p.target_date || '',
        ]);
    });

    doc.autoTable({
        head: [cols],
        body: rows,
        startY: 38,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 45 }, 2: { cellWidth: 22 }, 3: { cellWidth: 8 }, 4: { cellWidth: 8 }, 5: { cellWidth: 8 }, 6: { cellWidth: 14, halign: 'right' }, 7: { cellWidth: 16, halign: 'right' }, 8: { cellWidth: 16, halign: 'right' }, 9: { cellWidth: 18 }, 10: { cellWidth: 22 } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
    });

    doc.save(`building${activeBuildingId}_parts_${stamp()}.pdf`);
    showToast('Parts list PDF exported ✓', 'success');
}

// ── PRODUCTION SCHEDULE XLSX ──────────────────────────────
function exportScheduleXLSX() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }
    const isMin = (appSettings.time_unit || 'h') === 'min';
    const opHrsCol = isMin ? 'Op Minutes' : 'Op Hours';
    const opMult = isMin ? 60 : 1;

    const cols = [
        { title: 'Seq', width: 5, align: 'center' },
        { title: 'Part Number', width: 22 },
        { title: 'Part Name', width: 30 },
        { title: 'Vehicle', width: 8, align: 'center' },
        { title: 'Unit', width: 5, align: 'center' },
        { title: 'Machine', width: 16 },
        { title: 'Machine Type', width: 14 },
        { title: 'Shift', width: 6, align: 'center' },
        { title: opHrsCol, width: 12, align: 'right' },
        { title: 'Start Day', width: 10, align: 'right' },
        { title: 'Est. Start Date', width: 16 },
        { title: 'Est. End Date', width: 16 },
        { title: 'Pinned', width: 14 },
    ];

    const titleBanner = [{
        v: `BUILDING #${activeBuildingId} — PRODUCTION SCHEDULE  ·  Generated ${fmtDate(new Date())}`, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 13, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(cols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.BG } } } }));

    const sheetData = [titleBanner, _rh(cols)];

    scheduledTasks.forEach((t, i) => {
        const sd = addWD(appSettings.start_date, Math.floor(t.startDay), appSettings);
        const endCeil = Math.ceil(t.endDay);
        const ed = addWD(appSettings.start_date, endCeil > Math.floor(t.startDay) ? endCeil - 1 : endCeil, appSettings);
        sheetData.push(_dr([
            t.seqNum || i + 1, t.partNumber, t.partName, t.vehicle,
            t.unitIndex || '', t.machineName, t.machineType,
            t.shiftPref ? 'S' + t.shiftPref : '',
            +(t.opHrs * opMult).toFixed(isMin ? 0 : 2),
            t.startDay.toFixed(2),
            fmtDate(sd), fmtDate(ed),
            t.pinnedDate ? '📌 ' + t.pinnedDate : '',
        ], { vehicle: t.vehicle, alt: i % 2 === 1 }));
    });

    const ws = _buildWs(sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production Schedule');
    XLSX.writeFile(wb, `building${activeBuildingId}_schedule_${stamp()}.xlsx`);
    showToast('Schedule exported ✓', 'success');
}

// ── PRODUCTION SCHEDULE PDF ───────────────────────────────
function exportSchedulePDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }

    const doc = _makePdfDoc(`Building #${activeBuildingId} — Production Schedule`);

    const cols = ['Seq', 'Part Number', 'Part Name', 'Vehicle', 'Machine', 'Op Hrs', 'Start Date', 'End Date', 'Pinned'];
    const rows = scheduledTasks.map((t, i) => {
        const sd = addWD(appSettings.start_date, Math.floor(t.startDay), appSettings);
        const ed = addWD(appSettings.start_date, Math.ceil(t.endDay) - 1, appSettings);
        return [
            String(t.seqNum || i + 1),
            t.partNumber, t.partName, t.vehicle || '',
            t.machineName || '', String(+t.opHrs.toFixed(2)),
            fmtDate(sd), fmtDate(ed),
            t.pinnedDate ? '📌 ' + t.pinnedDate : '',
        ];
    });

    doc.autoTable({
        head: [cols],
        body: rows,
        startY: 38,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 28 }, 2: { cellWidth: 40 }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 24 }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 22 }, 7: { cellWidth: 22 }, 8: { cellWidth: 22 } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
    });

    doc.save(`building${activeBuildingId}_schedule_${stamp()}.pdf`);
    showToast('Schedule PDF exported ✓', 'success');
}

// ── MACHINE UTILIZATION XLSX ─────────────────────────────
function exportMachineUtilXLSX() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    const active = (currentMachines || []).filter(m => m.is_active);
    if (!active.length) { showToast('No active machines', 'info'); return; }

    const cols = [
        { title: 'Machine', width: 20 },
        { title: 'Type', width: 16 },
        { title: 'Tasks', width: 8, align: 'right' },
        { title: 'Total Hours', width: 16, align: 'right' },
        { title: 'Daily Cap (hrs)', width: 18, align: 'right' },
        { title: 'Utilization %', width: 16, align: 'right' },
        { title: 'Status', width: 14 },
    ];

    const titleBanner = [{
        v: `BUILDING #${activeBuildingId} — MACHINE UTILIZATION  ·  Generated ${fmtDate(new Date())}`, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 13, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(cols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.BG } } } }));

    const sheetData = [titleBanner, _rh(cols)];

    active.forEach((m, i) => {
        const mTasks = (scheduledTasks || []).filter(t => t.machineId === m.id);
        const totalHrs = mTasks.reduce((s, t) => s + t.opHrs, 0);
        const dailyHrs = mDailyForMachine(m);
        const maxEnd = mTasks.reduce((s, t) => Math.max(s, t.endDay), 0);
        const totalCap = maxEnd > 0 ? maxEnd * dailyHrs : 0;
        const utilPct = totalCap > 0 ? Math.min(100, Math.round((totalHrs / totalCap) * 100)) : 0;
        const statusStr = utilPct > 85 ? 'HIGH LOAD' : utilPct > 65 ? 'MODERATE' : 'OK';
        const statusFg = utilPct > 85 ? RPT.ERR : utilPct > 65 ? RPT.WARN : RPT.OK;

        const row = _dr([m.name, m.machine_type, mTasks.length, totalHrs.toFixed(1), dailyHrs.toFixed(2), utilPct + '%', statusStr], { alt: i % 2 === 1 });
        // Override utilization cell color
        row[5] = {
            v: utilPct + '%', t: 's', s: {
                font: { bold: true, color: { rgb: statusFg }, sz: 10, name: 'Calibri' },
                fill: { fgColor: { rgb: i % 2 === 1 ? RPT.ROW_B : RPT.ROW_A } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: { top: { style: 'thin', color: { rgb: RPT.BORDER } }, bottom: { style: 'thin', color: { rgb: RPT.BORDER } }, left: { style: 'thin', color: { rgb: RPT.BORDER } }, right: { style: 'thin', color: { rgb: RPT.BORDER } } }
            }
        };
        // Override status cell color
        row[6] = {
            v: statusStr, t: 's', s: {
                font: { bold: true, color: { rgb: statusFg }, sz: 10, name: 'Calibri' },
                fill: { fgColor: { rgb: i % 2 === 1 ? RPT.ROW_B : RPT.ROW_A } },
                alignment: { vertical: 'center' },
                border: { top: { style: 'thin', color: { rgb: RPT.BORDER } }, bottom: { style: 'thin', color: { rgb: RPT.BORDER } }, left: { style: 'thin', color: { rgb: RPT.BORDER } }, right: { style: 'thin', color: { rgb: RPT.BORDER } } }
            }
        };
        sheetData.push(row);
    });

    const ws = _buildWs(sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 20 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine Utilization');
    XLSX.writeFile(wb, `building${activeBuildingId}_machines_${stamp()}.xlsx`);
    showToast('Machine utilization exported ✓', 'success');
}

// ── MACHINE UTILIZATION PDF ───────────────────────────────
function exportMachineUtilPDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    const active = (currentMachines || []).filter(m => m.is_active);
    if (!active.length) { showToast('No active machines', 'info'); return; }

    const doc = _makePdfDoc(`Building #${activeBuildingId} — Machine Utilization`);

    const cols = ['Machine', 'Type', 'Tasks', 'Total Hrs', 'Daily Cap (hrs)', 'Utilization %', 'Status'];
    const rows = active.map(m => {
        const mTasks = (scheduledTasks || []).filter(t => t.machineId === m.id);
        const totalHrs = mTasks.reduce((s, t) => s + t.opHrs, 0);
        const dailyHrs = mDailyForMachine(m);
        const maxEnd = mTasks.reduce((s, t) => Math.max(s, t.endDay), 0);
        const totalCap = maxEnd > 0 ? maxEnd * dailyHrs : 0;
        const utilPct = totalCap > 0 ? Math.min(100, Math.round((totalHrs / totalCap) * 100)) : 0;
        const statusStr = utilPct > 85 ? 'HIGH LOAD' : utilPct > 65 ? 'MODERATE' : 'OK';
        return [m.name, m.machine_type, String(mTasks.length), String(totalHrs.toFixed(1)), String(dailyHrs.toFixed(2)), utilPct + '%', statusStr];
    });

    doc.autoTable({
        head: [cols],
        body: rows,
        startY: 38,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 25 }, 2: { cellWidth: 12, halign: 'right' }, 3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 22 } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
    });

    doc.save(`building${activeBuildingId}_machines_${stamp()}.pdf`);
    showToast('Machine utilization PDF exported ✓', 'success');
}

// ── WEEKLY PLAN XLSX ──────────────────────────────────────
function exportWeeklyPlanXLSX() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }

    const allDates = genDates(appSettings.start_date, ganttMaxDays(scheduledTasks), appSettings);
    const weekMap = new Map();
    allDates.forEach(d => {
        const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
        const wKey = localDateStr(ws);
        if (!weekMap.has(wKey)) weekMap.set(wKey, { start: ws, days: [], tasks: [] });
        weekMap.get(wKey).days.push(d);
    });

    const dayToWeek = new Map();
    const weeks = Array.from(weekMap.values());
    weeks.forEach((w, wi) => w.dayIndices = w.days.map((d, i) => {
        const idx = allDates.findIndex(ad => localDateStr(ad) === localDateStr(d));
        if (idx >= 0) dayToWeek.set(idx, wi);
        return idx;
    }));

    scheduledTasks.forEach(t => {
        const midDay = Math.floor((t.startDay + t.endDay) / 2);
        const wIdx = dayToWeek.get(midDay) ?? dayToWeek.get(Math.floor(t.startDay)) ?? 0;
        if (weeks[wIdx]) weeks[wIdx].tasks.push(t);
    });

    const cols = [
        { title: 'Week of', width: 16 },
        { title: 'Days', width: 8, align: 'center' },
        { title: 'Part Number', width: 22 },
        { title: 'Part Name', width: 28 },
        { title: 'Vehicle', width: 8, align: 'center' },
        { title: 'Units', width: 6, align: 'right' },
        { title: 'Machine', width: 16 },
        { title: 'Hours', width: 10, align: 'right' },
        { title: 'Vehicles (K9/K10/K11)', width: 20 },
    ];

    const titleBanner = [{
        v: `BUILDING #${activeBuildingId} — WEEKLY PLAN  ·  Generated ${fmtDate(new Date())}`, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 13, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(cols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.BG } } } }));

    const sheetData = [titleBanner, _rh(cols)];

    weeks.forEach((w, wi) => {
        if (!w.tasks.length) {
            sheetData.push(_grh(`Week of ${fmtDate(w.start)} — No activity`).slice(0, cols.length));
            return;
        }
        const byPart = {};
        w.tasks.forEach(t => {
            const k = t.partNumber;
            if (!byPart[k]) byPart[k] = { partName: t.partName, machine: t.machineName, vehicles: {}, hours: 0, units: 0 };
            byPart[k].vehicles[t.vehicle] = (byPart[k].vehicles[t.vehicle] || 0) + 1;
            byPart[k].hours += t.opHrs;
            byPart[k].units++;
        });
        Object.keys(byPart).forEach((pn, pi) => {
            const { partName, machine, vehicles, hours, units } = byPart[pn];
            const vehStr = Object.entries(vehicles).map(([v, c]) => `${v}×${c}`).join(' ');
            const firstVeh = Object.keys(vehicles)[0];
            sheetData.push(_dr([
                pi === 0 ? fmtDate(w.start) : '',
                pi === 0 ? String(w.days.length) : '',
                pn, partName, firstVeh, units, machine,
                hours.toFixed(1), vehStr,
            ], { vehicle: firstVeh, alt: wi % 2 === 1 }));
        });
    });

    const ws = _buildWs(sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Plan');
    XLSX.writeFile(wb, `building${activeBuildingId}_weekly_${stamp()}.xlsx`);
    showToast('Weekly plan exported ✓', 'success');
}

// ── WEEKLY PLAN PDF ───────────────────────────────────────
function exportWeeklyPlanPDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }

    const doc = _makePdfDoc(`Building #${activeBuildingId} — Weekly Plan`);

    // Build week data
    const allDates = genDates(appSettings.start_date, ganttMaxDays(scheduledTasks), appSettings);
    const weekMap = new Map();
    allDates.forEach(d => {
        const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
        const wKey = localDateStr(ws);
        if (!weekMap.has(wKey)) weekMap.set(wKey, { start: ws, days: [], tasks: [] });
        weekMap.get(wKey).days.push(d);
    });
    const dayToWeek = new Map();
    const weeks = Array.from(weekMap.values());
    weeks.forEach((w, wi) => w.dayIndices = w.days.map((d, i) => {
        const idx = allDates.findIndex(ad => localDateStr(ad) === localDateStr(d));
        if (idx >= 0) dayToWeek.set(idx, wi);
        return idx;
    }));
    scheduledTasks.forEach(t => {
        const midDay = Math.floor((t.startDay + t.endDay) / 2);
        const wIdx = dayToWeek.get(midDay) ?? dayToWeek.get(Math.floor(t.startDay)) ?? 0;
        if (weeks[wIdx]) weeks[wIdx].tasks.push(t);
    });

    const cols = ['Week of', 'Part Number', 'Part Name', 'Vehicle', 'Units', 'Machine', 'Hours', 'Vehicles'];
    const rows = [];
    weeks.forEach((w, wi) => {
        if (!w.tasks.length) return;
        const byPart = {};
        w.tasks.forEach(t => {
            const k = t.partNumber;
            if (!byPart[k]) byPart[k] = { partName: t.partName, machine: t.machineName, vehicles: {}, hours: 0, units: 0 };
            byPart[k].vehicles[t.vehicle] = (byPart[k].vehicles[t.vehicle] || 0) + 1;
            byPart[k].hours += t.opHrs;
            byPart[k].units++;
        });
        Object.keys(byPart).forEach((pn, pi) => {
            const { partName, machine, vehicles, hours, units } = byPart[pn];
            const vehStr = Object.entries(vehicles).map(([v, c]) => `${v}×${c}`).join(' ');
            const firstVeh = Object.keys(vehicles)[0];
            rows.push([pi === 0 ? fmtDate(w.start) : '', pn, partName, firstVeh, String(units), machine || '', String(hours.toFixed(1)), vehStr]);
        });
    });

    doc.autoTable({
        head: [cols],
        body: rows,
        startY: 38,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 28 }, 2: { cellWidth: 42 }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 12, halign: 'right' }, 5: { cellWidth: 24 }, 6: { cellWidth: 14, halign: 'right' }, 7: { cellWidth: 28 } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
    });

    doc.save(`building${activeBuildingId}_weekly_${stamp()}.pdf`);
    showToast('Weekly plan PDF exported ✓', 'success');
}

// ── EXECUTIVE SUMMARY XLSX ───────────────────────────────
function exportExecutiveSummaryXLSX() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }

    const uParts = (currentParts || []).length;
    const tTasks = (currentParts || []).reduce((s, p) => s + flt(p.remaining_qty), 0);
    const unitMult = (appSettings.time_unit || 'h') === 'min' ? 1 / 60 : 1;
    const tHrs = (currentParts || []).reduce((s, p) => s + (flt(p.op_hrs) * unitMult) * flt(p.remaining_qty), 0);
    const vc = { K9: 0, K10: 0, K11: 0 };
    (scheduledTasks || []).forEach(t => { vc[t.vehicle] = (vc[t.vehicle] || 0) + 1; });
    const activeCnt = (currentMachines || []).filter(m => m.is_active).length;
    const totalWorkDays = scheduledTasks.length ? Math.ceil(Math.max(...scheduledTasks.map(t => t.endDay))) : 0;
    const endDate = addWD(appSettings.start_date, totalWorkDays, appSettings);

    const summaryCols = [
        { title: 'METRIC', width: 30 },
        { title: 'VALUE', width: 20 },
    ];

    const titleBanner = [{
        v: `BUILDING #${activeBuildingId} — EXECUTIVE SUMMARY  ·  Generated ${fmtDate(new Date())}`, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 13, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(summaryCols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.BG } } } }));

    const mkRow = (label, value, isAlt) => _dr([label, value], { alt: isAlt, bold: false });

    const sheetData = [
        titleBanner,
        _rh(summaryCols),
        mkRow('Plan Start Date', fmtDate(new Date(appSettings.start_date + 'T00:00:00')), false),
        mkRow('Active Machines', String(activeCnt), true),
        mkRow('Total Part Rows', String(uParts), false),
        mkRow('Total Unit Tasks', tTasks.toFixed(1), true),
        mkRow('Total Operation Hours', tHrs.toFixed(1) + ' hrs', false),
        mkRow('Working Days Required', String(totalWorkDays), true),
        mkRow('Projected Completion', fmtDate(endDate), false),
        mkRow('Week Type', appSettings.saturday_working ? '6-day (Sat working)' : '5-day (Sun–Thu)', true),
    ];

    // Battalion breakdown section header
    const batHdr = [{
        v: 'BATTALION BREAKDOWN', t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 11, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.HEADER } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(summaryCols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.HEADER } } } }));

    const batColHdr = _rh([{ title: 'BATTALION', width: 16 }, { title: 'UNITS', width: 12 }, { title: 'HOURS', width: 14 }, { title: 'SHARE', width: 12 }]);

    const mkBatRow = (veh, bg, fg, count, hrs, pct) => _dr([veh, String(count) + ' units', String(hrs.toFixed(1)) + ' hrs', pct + '%'], { vehicle: veh });

    const k9Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K9').reduce((s, t) => s + t.opHrs, 0);
    const k10Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K10').reduce((s, t) => s + t.opHrs, 0);
    const k11Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K11').reduce((s, t) => s + t.opHrs, 0);

    sheetData.push(batHdr, batColHdr);
    sheetData.push(mkBatRow('K9', RPT.K9_BG, RPT.K9_FG, vc.K9, k9Hrs, tTasks > 0 ? ((vc.K9 / tTasks * 100)).toFixed(1) : '0'));
    sheetData.push(mkBatRow('K10', RPT.K10_BG, RPT.K10_FG, vc.K10, k10Hrs, tTasks > 0 ? ((vc.K10 / tTasks * 100)).toFixed(1) : '0'));
    sheetData.push(mkBatRow('K11', RPT.K11_BG, RPT.K11_FG, vc.K11, k11Hrs, tTasks > 0 ? ((vc.K11 / tTasks * 100)).toFixed(1) : '0'));

    const ws = _buildWs(sheetData, summaryCols.map(c => c.width).concat([16, 14, 12]));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : i <= 10 ? { hpt: 20 } : { hpt: 22 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Executive Summary');
    XLSX.writeFile(wb, `building${activeBuildingId}_summary_${stamp()}.xlsx`);
    showToast('Executive summary exported ✓', 'success');
}

// ── EXECUTIVE SUMMARY PDF ────────────────────────────────
function exportExecutiveSummaryPDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }

    const uParts = (currentParts || []).length;
    const tTasks = (currentParts || []).reduce((s, p) => s + flt(p.remaining_qty), 0);
    const unitMult = (appSettings.time_unit || 'h') === 'min' ? 1 / 60 : 1;
    const tHrs = (currentParts || []).reduce((s, p) => s + (flt(p.op_hrs) * unitMult) * flt(p.remaining_qty), 0);
    const vc = { K9: 0, K10: 0, K11: 0 };
    (scheduledTasks || []).forEach(t => { vc[t.vehicle] = (vc[t.vehicle] || 0) + 1; });
    const activeCnt = (currentMachines || []).filter(m => m.is_active).length;
    const totalWorkDays = scheduledTasks.length ? Math.ceil(Math.max(...scheduledTasks.map(t => t.endDay))) : 0;
    const endDate = addWD(appSettings.start_date, totalWorkDays, appSettings);
    const k9Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K9').reduce((s, t) => s + t.opHrs, 0);
    const k10Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K10').reduce((s, t) => s + t.opHrs, 0);
    const k11Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K11').reduce((s, t) => s + t.opHrs, 0);

    const doc = _makePdfDoc(`Building #${activeBuildingId} — Executive Summary`);

    // KPI Section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 58, 92);
    doc.text('KEYWORD PERFORMANCE INDICATORS', 14, 38);

    const kpiRows = [
        ['Plan Start Date', fmtDate(new Date(appSettings.start_date + 'T00:00:00'))],
        ['Active Machines', String(activeCnt)],
        ['Total Part Rows', String(uParts)],
        ['Total Unit Tasks', tTasks.toFixed(1)],
        ['Total Operation Hours', tHrs.toFixed(1) + ' hrs'],
        ['Working Days Required', String(totalWorkDays)],
        ['Projected Completion', fmtDate(endDate)],
        ['Week Type', appSettings.saturday_working ? '6-day (Sat working)' : '5-day (Sun–Thu)'],
    ];

    doc.autoTable({
        head: [['METRIC', 'VALUE']],
        body: kpiRows,
        startY: 42,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 9 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 80, halign: 'right' } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
    });

    // Battalion Breakdown Section
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 58, 92);
    doc.text('BATTALION BREAKDOWN', 14, finalY);

    const batRows = [
        ['K9', String(vc.K9) + ' units', String(k9Hrs.toFixed(1)) + ' hrs', tTasks > 0 ? ((vc.K9 / tTasks * 100)).toFixed(1) + '%' : '0%'],
        ['K10', String(vc.K10) + ' units', String(k10Hrs.toFixed(1)) + ' hrs', tTasks > 0 ? ((vc.K10 / tTasks * 100)).toFixed(1) + '%' : '0%'],
        ['K11', String(vc.K11) + ' units', String(k11Hrs.toFixed(1)) + ' hrs', tTasks > 0 ? ((vc.K11 / tTasks * 100)).toFixed(1) + '%' : '0%'],
    ];

    doc.autoTable({
        head: [['BATTALION', 'UNITS', 'HOURS', 'SHARE']],
        body: batRows,
        startY: finalY + 4,
        headStyles: { fillColor: [26, 58, 92], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fillColor: [255, 255, 255], textColor: [36, 36, 36], fontSize: 9 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 40, halign: 'right' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' } },
        margin: { left: 14, right: 14 },
        styles: { lineColor: [156, 163, 175], lineWidth: 0.1 },
        headBorder: { bottom: { color: [26, 58, 92], width: 1 } },
        didParseCell: function (data) {
            // Color battalion rows individually (light theme)
            if (data.section === 'body' && data.row.index >= 0) {
                if (data.row.index === 0) { // K9
                    data.cell.styles.fillColor = [220, 252, 231];
                    data.cell.styles.textColor = [22, 101, 52];
                } else if (data.row.index === 1) { // K10
                    data.cell.styles.fillColor = [254, 243, 199];
                    data.cell.styles.textColor = [146, 64, 14];
                } else if (data.row.index === 2) { // K11
                    data.cell.styles.fillColor = [237, 233, 254];
                    data.cell.styles.textColor = [107, 33, 168];
                }
            }
        },
    });

    doc.save(`building${activeBuildingId}_summary_${stamp()}.pdf`);
    showToast('Executive summary PDF exported ✓', 'success');
}

// ── SHARED PDF HELPERS ─────────────────────────────────────
function _makePdfDoc(title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header bar (light theme)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 297, 14, 'F');

    // Navy accent line
    doc.setFillColor(26, 58, 92);
    doc.rect(0, 14, 297, 1.5, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(26, 58, 92);
    doc.text(title, 14, 9);

    // Timestamp right-aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated: ${fmtDate(new Date())}`, 283, 9, { align: 'right' });

    // Footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageH - 8, 297, 8, 'F');
    doc.setFillColor(26, 58, 92);
    doc.rect(0, pageH - 8, 297, 0.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text('Building #1 Machining Production Planning', 14, pageH - 3);
    doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, 283, pageH - 3, { align: 'right' });

    // Set text color default for body (dark for light theme)
    doc.setTextColor(36, 36, 36);
    doc.setFontSize(9);

    return doc;
}

function stamp() {
    return new Date().toISOString().slice(0, 10);
}

// ── PARTS LIST XLSX ───────────────────────────────────────
function exportPartsXLSX() {
    const XLSX = window.XLSX; if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    const isMin = (appSettings.time_unit || 'h') === 'min';
    const unitCol = isMin ? 'Op Min/Unit' : 'Op Hrs/Unit';
    const totCol = isMin ? 'Total Op Min' : 'Total Op Hrs';

    const cols = [
        { title: 'Part Number', width: 22 },
        { title: 'Part Name', width: 34 },
        { title: 'Location / Machine', width: 20 },
        { title: 'K9', width: 6 }, { title: 'K10', width: 6 }, { title: 'K11', width: 6 },
        { title: 'Rem. QTY', width: 12, align: 'right' },
        { title: 'Started QTY', width: 12, align: 'right' },
        { title: unitCol, width: 14, align: 'right' },
        { title: totCol, width: 14, align: 'right' },
        { title: 'Batt. QTY', width: 12, align: 'right' },
        { title: 'Status', width: 14 },
        { title: 'Shift', width: 8 },
        { title: 'K9 QTY', width: 8, align: 'right' },
        { title: 'K10 QTY', width: 8, align: 'right' },
        { title: 'K11 QTY', width: 8, align: 'right' },
        { title: 'Target Date', width: 14 },
    ];

    const titleBanner = [{
        v: `BUILDING #${activeBuildingId} — PARTS LIST  ·  Generated ${fmtDate(new Date())}`, t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 13, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.BG } },
            alignment: { horizontal: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(cols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.BG } } } }));

    const sheetData = [titleBanner, _rh(cols)];

    // Group parts by location
    const grouped = {};
    (currentParts || allParts || []).forEach(p => {
        const loc = p.location || 'Unknown';
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(p);
    });
    const locs = Object.keys(grouped).sort();

    locs.forEach((loc, li) => {
        sheetData.push(_grh(`  ▸ ${loc}`));
        grouped[loc].forEach((p) => {
            sheetData.push(_dr([
                p.part_number || '', p.part_name || '', p.location || '',
                p.k9 ? '●' : '', p.k10 ? '●' : '', p.k11 ? '●' : '',
                flt(p.remaining_qty),
                flt(p.started_qty),
                flt(p.op_hrs),
                +(flt(p.op_hrs) * flt(p.remaining_qty)).toFixed(2),
                p.battalion_qty || 0,
                getPartStatusLabel(getPartStatus(p)),
                p.shift_preference ? 'S' + p.shift_preference : '',
                p.k9_qty != null ? flt(p.k9_qty) : '',
                p.k10_qty != null ? flt(p.k10_qty) : '',
                p.k11_qty != null ? flt(p.k11_qty) : '',
                p.target_date || '',
            ], { alt: li % 2 === 1 }));
        });
    });

    const ws = _buildWs(sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parts List');
    XLSX.writeFile(wb, `building${activeBuildingId}_parts_${stamp()}.xlsx`);
    showToast('Parts list exported ✓', 'success');
}

/* ═══════════════════════════════════════════════════════════════
   22 · NAVBAR DROPDOWNS
═══════════════════════════════════════════════════════════════ */
function initDropdowns() {
    const IDS = ['nav-dd-settings', 'nav-dd-shifts', 'nav-dd-data'];

    function closeAll() {
        IDS.forEach(id => {
            const btn = $(id + '-btn'), panel = $(id + '-panel');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            if (panel) panel.classList.remove('open');
        });
        const bd = $('dd-backdrop'); if (bd) bd.classList.add('hidden');
    }

    IDS.forEach(id => {
        const btn = $(id + '-btn'), panel = $(id + '-panel');
        if (!btn || !panel) return;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const wasOpen = panel.classList.contains('open');
            closeAll();
            if (!wasOpen) {
                panel.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                const bd = $('dd-backdrop'); if (bd) bd.classList.remove('hidden');
            }
        });
    });

    document.querySelectorAll('.dd-close').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation(); closeAll();
    }));

    // Close when clicking outside any dropdown (document-level, no backdrop needed)
    document.addEventListener('click', e => {
        if (!e.target.closest('.nav-dd') && !e.target.closest('.dd-panel')) closeAll();
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
}

/* ═══════════════════════════════════════════════════════════════
   23 · UI HELPERS
═══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type) {
    const el = $('toast'); if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = msg; el.className = 'toast toast-' + (type || 'info');
    toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}
function showLoading(msg = 'Loading…') {
    const o = $('loading-overlay'), m = $('loading-message');
    if (o) o.classList.remove('hidden'); if (m) m.textContent = msg;
}
function hideLoading() { const o = $('loading-overlay'); if (o) o.classList.add('hidden'); }
function setConn(ok) {
    isOK = ok;
    ['status-dot', 'status-dot-inline'].forEach(id => {
        const dot = $(id);
        if (dot) dot.className = 'conn-dot ' + (ok ? 'connected' : 'disconnected');
    });
    ['status-text', 'status-text-inline'].forEach(id => {
        const txt = $(id);
        if (txt) txt.textContent = ok ? 'Connected' : 'Not Connected';
    });
}
function updateLastUpdated() {
    const el = $('last-updated');
    if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
async function updateDBStats() {
    try {
        const { count } = await db.from('building1_parts').select('*', { count: 'exact', head: true }).eq('building_id', activeBuildingId);
        const el = $('parts-db-count'); if (el) el.textContent = count ?? '—';
    } catch (e) { }
    const e2 = $('parts-active-count'); if (e2) e2.textContent = currentParts.length;
    const e3 = $('tasks-total-count'); if (e3) e3.textContent = scheduledTasks.length;
    // Panel counts
    const mc = $('machines-count');
    if (mc) mc.textContent = currentMachines.length ? `${currentMachines.length} machine${currentMachines.length !== 1 ? 's' : ''}` : '';
    const pc = $('parts-table-count');
    if (pc) pc.textContent = currentParts.length ? `${currentParts.length} part${currentParts.length !== 1 ? 's' : ''}` : '';
    const gc = $('gantt-task-count');
    if (gc) gc.textContent = scheduledTasks.length ? `${scheduledTasks.length} task${scheduledTasks.length !== 1 ? 's' : ''}` : '';
}

/* ═══════════════════════════════════════════════════════════════
   24 · THEME
═══════════════════════════════════════════════════════════════ */
const THEME_KEY = 'b1_theme';
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const b = $('theme-toggle-btn');
    if (b) {
        b.innerHTML = t === 'light'
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
}
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function loadTheme() { let t = 'dark'; try { t = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { } applyTheme(t); }

function setActiveWorkspaceNav(targetId) {
    document.querySelectorAll('.workspace-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });
}

function initWorkspaceNav() {
    const navButtons = Array.from(document.querySelectorAll('.workspace-nav-btn'));
    if (!navButtons.length) return;

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (!target) return;
            setActiveWorkspaceNav(btn.dataset.target);
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
        const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveWorkspaceNav(visible.target.id);
    }, {
        rootMargin: '-18% 0px -55% 0px',
        threshold: [0.2, 0.35, 0.5]
    });

    ['panel-overview', 'panel-machines', 'panel-parts', 'panel-gantt'].forEach(id => {
        const panel = $(id);
        if (panel) observer.observe(panel);
    });
}

/* ═══════════════════════════════════════════════════════════════
   25 · EVENT LISTENERS
═══════════════════════════════════════════════════════════════ */
function attachListeners() {
    initGanttViewSwitcher();
    initWorkspaceNav();
    // Building switcher
    document.querySelectorAll('.bld-tab').forEach(btn => {
        btn.addEventListener('click', () => switchBuilding(parseInt(btn.dataset.bid, 10)));
    });
    $('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    $('header-layout-select')?.addEventListener('change', e => {
        applySystemLayout(e.target.value);
    });

    // Settings form
    $('settings-form')?.addEventListener('submit', async e => {
        e.preventDefault(); showLoading('Saving…');
        await saveSettings(new FormData(e.target)); hideLoading();
    });
    $('system-layout')?.addEventListener('change', e => {
        applySystemLayout(e.target.value);
    });

    // Machine modal
    $('add-machine-btn')?.addEventListener('click', () => openMachModal(null));
    $('modal-close')?.addEventListener('click', closeMachModal);
    $('modal-cancel-btn')?.addEventListener('click', closeMachModal);
    $('machine-modal')?.addEventListener('click', e => { if (e.target === $('machine-modal')) closeMachModal(); });
    $('modal-save-btn')?.addEventListener('click', saveMachFromModal);
    $('m-capacity')?.addEventListener('input', () => updateMachModalDaily(null));

    // Shift modal
    $('add-shift-btn')?.addEventListener('click', () => openShiftModal(null));
    $('shift-modal-close')?.addEventListener('click', closeShiftModal);
    $('shift-modal-cancel')?.addEventListener('click', closeShiftModal);
    $('shift-modal')?.addEventListener('click', e => { if (e.target === $('shift-modal')) closeShiftModal(); });
    $('shift-modal-save')?.addEventListener('click', saveShiftFromModal);
    $('shift-modal-delete')?.addEventListener('click', deleteShiftFromModal);
    $('shift-start')?.addEventListener('change', updateShiftDuration);
    $('shift-end')?.addEventListener('change', updateShiftDuration);

    // Part modal
    $('part-modal-close')?.addEventListener('click', closePartModal);
    $('part-modal-cancel')?.addEventListener('click', closePartModal);
    $('part-modal')?.addEventListener('click', e => { if (e.target === $('part-modal')) closePartModal(); });
    $('part-modal-save')?.addEventListener('click', savePartFromModal);
    $('part-modal-delete')?.addEventListener('click', deleteCurrentPart);
    $('dist-auto-btn')?.addEventListener('click', autoFillDist);
    $('unit-reset-btn')?.addEventListener('click', resetUnitSchedule);
    $('add-part-btn')?.addEventListener('click', () => openPartModal(null));

    $('part-edit-remaining')?.addEventListener('input', () => {
        updateDistSum(); updatePartStatusPreview(); refreshUnitSchedule(currentEditPart);
    });
    $('part-edit-started')?.addEventListener('input', () => {
        updatePartStatusPreview();
    });
    $('part-edit-location')?.addEventListener('input', e => {
        populatePreferredMachineSelect(e.target.value, null);
    });
    ['part-edit-k9qty', 'part-edit-k10qty', 'part-edit-k11qty'].forEach(id => {
        $(id)?.addEventListener('input', updateDistSum);
    });

    // File upload
    const fi = $('xlsx-upload'), ub = $('upload-btn'), fl = $('file-name-display');
    fi?.addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        selectedFile = f; if (fl) fl.textContent = f.name; if (ub) ub.disabled = false;
    });
    const dz = $('file-drop-zone');
    if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
        dz.addEventListener('drop', e => {
            e.preventDefault(); dz.classList.remove('dragover');
            const f = e.dataTransfer.files[0]; if (!f) return;
            if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { showToast('Drop .xlsx or .csv', 'error'); return; }
            selectedFile = f; if (fl) fl.textContent = f.name; if (ub) ub.disabled = false;
        });
    }
    $('download-template-btn')?.addEventListener('click', downloadTemplate);
    ub?.addEventListener('click', async () => {
        if (!selectedFile) return;
        if (!isOK) { showToast('Not connected to Supabase', 'error'); return; }
        await uploadFile(selectedFile);
        selectedFile = null; if (fi) fi.value = '';
        if (fl) fl.textContent = 'Drop .xlsx or .csv here, or click to browse';
        if (ub) ub.disabled = true;
    });

    // Parts filters
    const ps = $('parts-search');
    ps?.addEventListener('input', e => {
        ptSearch = e.target.value; $('parts-search-clear')?.classList.toggle('hidden', !ptSearch); renderPartsTable();
    });
    $('parts-search-clear')?.addEventListener('click', () => {
        ptSearch = ''; if (ps) ps.value = ''; $('parts-search-clear')?.classList.add('hidden'); renderPartsTable();
    });
    $('filter-location')?.addEventListener('change', e => { ptLoc = e.target.value; renderPartsTable(); });
    $('filter-status')?.addEventListener('change', e => { ptStatus = e.target.value; renderPartsTable(); });
    $('filter-vehicle')?.addEventListener('change', e => { ptVeh = e.target.value; renderPartsTable(); });

    // Gantt filters
    const gs = $('gantt-search');
    gs?.addEventListener('input', e => {
        gSearch = e.target.value; $('gantt-search-clear')?.classList.toggle('hidden', !gSearch); renderGanttFiltered();
    });
    $('gantt-search-clear')?.addEventListener('click', () => {
        gSearch = ''; if (gs) gs.value = ''; $('gantt-search-clear')?.classList.add('hidden'); renderGanttFiltered();
    });
    $('gantt-filter-machine')?.addEventListener('change', e => { gMach = e.target.value; renderGanttFiltered(); });
    $('gantt-filter-vehicle')?.addEventListener('change', e => { gVeh = e.target.value; renderGanttFiltered(); });
    $('export-report-btn')?.addEventListener('click', showReportsModal);
    $('reports-close')?.addEventListener('click', () => $('reports-modal')?.classList.add('hidden'));
    $('reports-cancel')?.addEventListener('click', () => $('reports-modal')?.classList.add('hidden'));
    $('reports-modal')?.addEventListener('click', e => { if (e.target === $('reports-modal')) $('reports-modal').classList.add('hidden'); });

    // Build Sequence
    $('build-seq-btn')?.addEventListener('click', () => { renderSeqTable(); showSeqModal(); });
    $('seq-modal-close')?.addEventListener('click', hideSeqModal);
    $('seq-cancel-btn')?.addEventListener('click', hideSeqModal);
    $('seq-modal')?.addEventListener('click', e => { if (e.target === $('seq-modal')) hideSeqModal(); });
    $('seq-add-btn')?.addEventListener('click', addSeqRow);
    $('seq-clear-btn')?.addEventListener('click', clearSeq);
    $('seq-apply-btn')?.addEventListener('click', applySeqAndClose);
    $('seq-tbody')?.addEventListener('click', e => {
        const delBtn = e.target.closest('.seq-del-btn');
        if (delBtn) { removeSeqRow(parseInt(delBtn.dataset.idx, 10)); return; }
        const moveBtn = e.target.closest('.seq-move-btn');
        if (moveBtn) { moveSeqRow(parseInt(moveBtn.dataset.idx, 10), moveBtn.dataset.dir); }
    });

    // Parts List
    $('rpt-parts-xlsx')?.addEventListener('click', () => { exportPartsXLSX(); $('reports-modal')?.classList.add('hidden'); });
    $('rpt-parts-pdf')?.addEventListener('click', () => { exportPartsPDF(); $('reports-modal')?.classList.add('hidden'); });

    // Production Schedule
    $('rpt-sched-xlsx')?.addEventListener('click', () => { exportScheduleXLSX(); $('reports-modal')?.classList.add('hidden'); });
    $('rpt-sched-pdf')?.addEventListener('click', () => { exportSchedulePDF(); $('reports-modal')?.classList.add('hidden'); });

    // Machine Utilization
    $('rpt-machine-xlsx')?.addEventListener('click', () => { exportMachineUtilXLSX(); $('reports-modal')?.classList.add('hidden'); });
    $('rpt-machine-pdf')?.addEventListener('click', () => { exportMachineUtilPDF(); $('reports-modal')?.classList.add('hidden'); });

    // Weekly Plan
    $('rpt-weekly-xlsx')?.addEventListener('click', () => { exportWeeklyPlanXLSX(); $('reports-modal')?.classList.add('hidden'); });
    $('rpt-weekly-pdf')?.addEventListener('click', () => { exportWeeklyPlanPDF(); $('reports-modal')?.classList.add('hidden'); });

    // Executive Summary
    $('rpt-summary-xlsx')?.addEventListener('click', () => { exportExecutiveSummaryXLSX(); $('reports-modal')?.classList.add('hidden'); });
    $('rpt-summary-pdf')?.addEventListener('click', () => { exportExecutiveSummaryPDF(); $('reports-modal')?.classList.add('hidden'); });

    // ── NEW: Panel collapse ──────────────────────────────────
    document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.closest('.panel-collapsible');
            if (!panel) return;
            const isCollapsed = panel.classList.toggle('is-collapsed');
            btn.setAttribute('aria-expanded', !isCollapsed);
            // Rotate chevron
            const icon = btn.querySelector('.collapse-icon');
            if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : '';
        });
    });

    // ── NEW: Keyboard shortcuts modal ───────────────────────
    $('shortcuts-close')?.addEventListener('click', () => $('shortcuts-modal')?.classList.add('hidden'));
    $('shortcuts-modal')?.addEventListener('click', e => {
        if (e.target === $('shortcuts-modal')) $('shortcuts-modal')?.classList.add('hidden');
    });

    // ── NEW: Global keyboard shortcuts ───────────────────────
    document.addEventListener('keydown', e => {
        // Don't fire when typing in inputs
        const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
        if (inInput && !e.ctrlKey && !e.metaKey) return;

        // ? → shortcuts modal
        if (e.key === '?' && !inInput) {
            $('shortcuts-modal')?.classList.toggle('hidden');
            return;
        }
        // N → new part
        if (e.key === 'n' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            openPartModal(null);
        }
        // M → new machine (when not in gantt or parts table)
        if (e.key === 'm' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const active = document.activeElement;
            if (!active || (!active.closest('#panel-parts') && !active.closest('#part-modal'))) {
                e.preventDefault();
                openMachModal(null);
            }
        }
        // Ctrl+U → upload
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            const panel = $('nav-dd-data-panel');
            if (panel) {
                const btn = $('nav-dd-data-btn');
                if (btn) { btn.click(); }
            }
        }
        // T → jump to today in Gantt
        if (e.key === 't' && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            jumpToTodayGantt();
        }
        // 1, 2, 3 → Gantt view switcher
        if (['1', '2', '3'].includes(e.key) && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const views = { '1': 'machine', '2': 'part', '3': 'weekly' };
            const view = views[e.key];
            const btn = document.querySelector(`.gv-btn[data-view="${view}"]`);
            if (btn) btn.click();
        }
    });

    // ── NEW: Refresh button ─────────────────────────────────
    $('refresh-btn')?.addEventListener('click', async () => {
        const btn = $('refresh-btn');
        const icon = $('refresh-icon');
        if (!btn || !icon) return;
        btn.classList.add('spinning');
        icon.style.animation = 'spin .8s linear infinite';
        try {
            await loadShifts();
            await loadMachines();
            await loadAllPartsAndRebuild();
        } finally {
            btn.classList.remove('spinning');
            icon.style.animation = '';
        }
    });

    // ── NEW: Empty-state CTAs ───────────────────────────────
    $('es-add-machine-btn')?.addEventListener('click', () => openMachModal(null));
    $('es-upload-parts-btn')?.addEventListener('click', () => {
        // Open data panel and focus upload
        const btn = $('nav-dd-data-btn');
        if (btn) btn.click();
    });
    $('es-add-part-btn')?.addEventListener('click', () => openPartModal(null));
    $('ge-add-machine-btn')?.addEventListener('click', () => openMachModal(null));
    $('ge-upload-btn')?.addEventListener('click', () => {
        const btn = $('nav-dd-data-btn');
        if (btn) btn.click();
    });

    // ── NEW: Gantt today button ───────────────────────────────
    $('gantt-today-btn')?.addEventListener('click', jumpToTodayGantt);
}

/* ═══════════════════════════════════════════════════════════════
   BUILDING SWITCHER
═══════════════════════════════════════════════════════════════ */
const BUILDING_NAMES = { 1: 'BUILDING #1', 2: 'BUILDING #2' };
const BUILDING_SHORT = { 1: '#1', 2: '#2' };

async function switchBuilding(id) {
    if (id === activeBuildingId) return;
    activeBuildingId = id;
    applySystemLayout(loadStoredSystemLayout(id), { persist: false });

    // Update UI
    document.querySelectorAll('.bld-tab').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.bid, 10) === id);
    });
    const titleEl = document.querySelector('.hdr-title em');
    if (titleEl) titleEl.textContent = BUILDING_SHORT[id] || ('#' + id);

    // Reset all state
    allParts = []; currentParts = []; scheduledTasks = [];
    allShifts = [...FALLBACK_SHIFTS]; currentMachines = [];
    appSettings = { ...DEFAULT_SETTINGS };
    ptSearch = ''; ptLoc = ''; ptStatus = ''; ptVeh = '';
    gSearch = ''; gMach = ''; gVeh = '';
    prodSequence = [];

    // Clear filter UI
    const ps = $('parts-search'); if (ps) ps.value = '';
    const gs = $('gantt-search'); if (gs) gs.value = '';
    const fl = $('gantt-filter-machine'); if (fl) fl.value = '';
    const fv = $('gantt-filter-vehicle'); if (fv) fv.value = '';

    showLoading(`Loading ${BUILDING_NAMES[id] || 'Building #' + id}…`);
    await loadSettings();
    await loadShifts();
    await loadProdSequence();
    await loadMachines();
    await loadAllPartsAndRebuild();
    hideLoading();
    showToast(`Switched to ${BUILDING_NAMES[id] || 'Building #' + id}`, 'info');
}


async function init() {
    loadTheme();
    applySystemLayout(loadStoredSystemLayout(activeBuildingId), { persist: false });
    initDropdowns();
    showLoading('Connecting to database…');
    try {
        db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { error } = await db.from('building1_settings').select('id').limit(1);
        if (error) throw error;
        setConn(true);
    } catch (err) {
        setConn(false);
        showToast('Not connected. Set SUPABASE_URL + SUPABASE_ANON_KEY in app.js', 'error');
        populateSettingsForm(); attachListeners(); hideLoading(); return;
    }
    showLoading('Loading settings…'); await loadSettings();
    showLoading('Loading shifts…'); await loadShifts();
    showLoading('Loading production sequence…'); await loadProdSequence();
    showLoading('Loading machines…'); await loadMachines();
    showLoading('Loading parts…'); await loadAllPartsAndRebuild();
    attachListeners();
    hideLoading();
    if (!currentMachines.length) showToast('No machines yet — click "+ Add Machine" to start.', 'info');
    else if (!allParts.length) showToast('No parts data — upload a file or add parts manually.', 'info');
}

document.addEventListener('DOMContentLoaded', init);

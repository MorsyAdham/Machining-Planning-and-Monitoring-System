/*
   Pure scheduling and business logic.
   These helpers are extracted from the old single-file app and accept
   explicit dependencies where they previously relied on globals.
*/

export function flt(v) {
    return parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
}

export function pad(n, w) {
    return String(n).padStart(w || 3, '0');
}

export function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}

export function getPartStatus(part) {
    const remaining = flt(part?.remaining_qty);
    const started = flt(part?.started_qty);
    if (remaining <= 0) return 'complete';
    if (started > 0) return 'in_progress';
    return 'not_started';
}

export function getPartStatusLabel(status) {
    return ({ not_started: 'Not Started', in_progress: 'In Progress', complete: 'Complete' })[status] || status || 'Not Started';
}

export function syncDerivedPartStatus(part) {
    return { ...part, status: getPartStatus(part) };
}

export function parseTime(t) {
    const p = (t || '08:00').split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10);
}

export function shiftDuration(shift) {
    const s = parseTime(shift.start_time || '08:00');
    const e = parseTime(shift.end_time || '16:00');
    let h = (e - s) / 60;
    if (h <= 0) h += 24;
    return h;
}

export function fmtTime(mins) {
    const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
    const m = ((mins % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function isWorkingDay(d, settings) {
    const dow = d.getDay();
    if (dow === 5) return false;
    if (dow === 6) return !!settings.saturday_working;
    return true;
}

export function genDates(startStr, count, settings) {
    const out = [];
    const c = new Date(startStr + 'T00:00:00');
    let safety = 0;
    while (out.length < count && safety < count * 10) {
        if (isWorkingDay(c, settings)) out.push(new Date(c));
        c.setDate(c.getDate() + 1);
        safety++;
    }
    return out;
}

export function addWD(startStr, days, settings) {
    if (days <= 0) return new Date(startStr + 'T00:00:00');
    const d = new Date(startStr + 'T00:00:00');
    let added = 0;
    while (added < Math.floor(days)) {
        d.setDate(d.getDate() + 1);
        if (isWorkingDay(d, settings)) added++;
    }
    return d;
}

export function wdBetween(fromStr, toStr, settings) {
    const from = new Date(fromStr + 'T00:00:00');
    const to = new Date(toStr + 'T00:00:00');
    if (to <= from) return 0;
    let count = 0;
    const cur = new Date(from);
    cur.setDate(cur.getDate() + 1);
    while (cur <= to) {
        if (isWorkingDay(cur, settings)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

export function fmtDate(d, months) {
    if (!d || isNaN(d)) return '—';
    return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

export function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function mDailyForMachine(machine, allShifts) {
    const active = machine.active_shifts;
    let totalH = 0;
    if (active && Array.isArray(active) && active.length > 0) {
        active.forEach(sn => {
            const shift = allShifts.find(s => s.shift_number === sn);
            if (shift) totalH += shiftDuration(shift);
        });
    } else {
        totalH = (machine.num_shifts || 1) * (machine.shift_hours || 8);
    }
    return totalH * ((machine.capacity_percent || 100) / 100);
}

export function autoVehicleForUnit(part, ui, total, battalion) {
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
        if (part.k9 && String(part.k9).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K9; i++) slots.push('K9');
        if (part.k10 && String(part.k10).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K10; i++) slots.push('K10');
        if (part.k11 && String(part.k11).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K11; i++) slots.push('K11');
        const r = clamp(total, 0, slots.length);
        slots = slots.slice(-r);
    }
    return slots[ui - 1] || null;
}

export function expandPart(part, deps) {
    const { appSettings, battalion } = deps;
    let opHrs = flt(part.op_hrs);
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

    const unitOvs = Array.isArray(part.unit_overrides) ? part.unit_overrides : [];
    if (unitOvs.length > 0) {
        const oMap = {};
        unitOvs.forEach(o => { oMap[o.u] = o; });
        const tasks = [];
        for (let i = 1; i <= numUnits; i++) {
            const ov = oMap[i] || {};
            const vehicle = ov.v || autoVehicleForUnit(part, i, numUnits, battalion);
            if (!vehicle) continue;
            const shiftPref = ov.s || partShift;
            const pinnedDate = ov.d || null;
            tasks.push({ ...base, vehicle, unitIndex: i, shiftPref, pinnedDate });
        }
        return tasks;
    }

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

    const slots = [];
    if (part.k9 && String(part.k9).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K9; i++) slots.push('K9');
    if (part.k10 && String(part.k10).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K10; i++) slots.push('K10');
    if (part.k11 && String(part.k11).trim().toUpperCase() === 'O') for (let i = 0; i < battalion.K11; i++) slots.push('K11');
    if (!slots.length) return [];
    const r = clamp(numUnits, 0, slots.length);
    return slots.slice(-r).map((vehicle, idx) => ({ ...base, vehicle, unitIndex: idx + 1, shiftPref: partShift, pinnedDate: null }));
}

export function scheduleParts(parts, machines, deps) {
    const { appSettings, allShifts, battalion, prodSequence, vehicleMeta } = deps;
    const active = machines.filter(m => m.is_active);
    if (!active.length) return { tasks: [], machineLoad: {}, totalWorkDays: 0 };

    const byType = {};
    active.forEach(m => {
        if (!byType[m.machine_type]) byType[m.machine_type] = [];
        byType[m.machine_type].push(m);
    });

    let raw = [];

    if (prodSequence && prodSequence.length > 0) {
        const partCounts = {};
        parts.forEach(p => {
            const tasks = expandPart(p, { appSettings, battalion });
            partCounts[p.id] = tasks.length;
        });

        const seqPartIds = new Set(prodSequence.map(e => String(e.partId)));
        const nonPatternParts = parts.filter(p => !seqPartIds.has(String(p.id)));
        const unitCounters = { ...partCounts };

        while (Object.values(unitCounters).some(v => v > 0)) {
            let madeProgress = false;

            for (let i = 0; i < prodSequence.length; i++) {
                const entry = prodSequence[i];
                const part = parts.find(p => String(p.id) === String(entry.partId));
                if (!part) continue;
                if ((unitCounters[part.id] || 0) <= 0) continue;

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

            if (!madeProgress) break;
        }

        nonPatternParts.forEach(p => {
            const tasks = expandPart(p, { appSettings, battalion });
            raw = raw.concat(tasks);
        });
    } else {
        parts.forEach(p => { raw = raw.concat(expandPart(p, { appSettings, battalion })); });
        raw.sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            const sa = a.shiftPref != null ? a.shiftPref : 99;
            const sb = b.shiftPref != null ? b.shiftPref : 99;
            if (sa !== sb) return sa - sb;
            return (vehicleMeta[a.vehicle]?.priority ?? 99) - (vehicleMeta[b.vehicle]?.priority ?? 99);
        });
    }

    const avail = {};
    active.forEach(m => { avail[m.id] = 0; });

    const scheduled = [];
    let seq = 1;

    raw.forEach(task => {
        const pool = byType[task.machineType];
        if (!pool || !pool.length) return;

        let candidatePool = pool;

        if (task.preferredMachineId != null) {
            candidatePool = pool.filter(m => String(m.id) === String(task.preferredMachineId));
            if (!candidatePool.length) {
                return;
            }
        }

        const chosen = candidatePool.reduce(
            (best, m) => avail[m.id] < avail[best.id] ? m : best,
            candidatePool[0]
        );
        const daily = mDailyForMachine(chosen, allShifts);
        const barDays = (daily > 0) ? task.opHrs / daily : 1;

        let pinnedDay = null;
        if (task.pinnedDate) {
            pinnedDay = wdBetween(appSettings.start_date, task.pinnedDate, appSettings);
            if (pinnedDay < 0) pinnedDay = 0;
        }

        let startDay = (pinnedDay !== null)
            ? Math.max(pinnedDay, avail[chosen.id])
            : avail[chosen.id];

        const dayEnd = Math.ceil(startDay);
        const remHrs = (dayEnd - startDay) * daily;
        if (task.opHrs > remHrs && remHrs >= 0) {
            startDay = dayEnd;
        }

        const endDay = startDay + barDays;
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

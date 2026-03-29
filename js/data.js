const tableResolutionCache = new Map();

async function resolveTable(db, activeBuildingId, entity) {
    const key = `${activeBuildingId}:${entity}`;
    if (tableResolutionCache.has(key)) return tableResolutionCache.get(key);

    const probe = (async () => {
        const sharedTable = `building1_${entity}`;
        const splitTable = `building${activeBuildingId}_${entity}`;

        try {
            const { error } = await db.from(sharedTable).select('id', { head: true, count: 'exact' }).limit(1);
            if (!error) return { table: sharedTable, shared: true };
        } catch {
            // Fall through to split-table fallback.
        }

        if (activeBuildingId !== 1) {
            try {
                const { error } = await db.from(splitTable).select('id', { head: true, count: 'exact' }).limit(1);
                if (!error) return { table: splitTable, shared: false };
            } catch {
                // Fall back to the shared table so callers still get a usable default.
            }
        }

        return { table: sharedTable, shared: true };
    })();

    tableResolutionCache.set(key, probe);
    return probe;
}

function withBuildingScope(query, sharedTables, activeBuildingId) {
    return sharedTables ? query.eq('building_id', activeBuildingId) : query;
}

function normalizeSettingsRow(settings, sharedTables, activeBuildingId) {
    const row = { ...settings };
    if (sharedTables) {
        row.id = activeBuildingId;
        row.building_id = activeBuildingId;
    } else {
        row.id = 1;
        delete row.building_id;
    }
    return row;
}

function normalizeShiftRow(rec, sharedTables, activeBuildingId) {
    const row = { ...rec };
    if (sharedTables) row.building_id = activeBuildingId;
    else delete row.building_id;
    return row;
}

function normalizeMachineRow(rec, sharedTables, activeBuildingId) {
    const row = { ...rec };
    if (sharedTables) row.building_id = activeBuildingId;
    else delete row.building_id;
    return row;
}

function extractMissingColumnName(error) {
    const message = String(error?.message || '');
    const match = message.match(/Could not find the '([^']+)' column/i);
    return match ? match[1] : null;
}

async function saveMachineRecord(db, table, payload, machineId = null) {
    const optionalColumns = new Set(['active_shifts', 'shift_day_overrides']);
    let row = { ...payload };

    while (true) {
        const query = machineId == null
            ? db.from(table).insert(row).select().single()
            : db.from(table).update(row).eq('id', machineId).select().single();
        const result = await query;
        const missingColumn = extractMissingColumnName(result?.error);

        if (missingColumn && optionalColumns.has(missingColumn) && Object.prototype.hasOwnProperty.call(row, missingColumn)) {
            delete row[missingColumn];
            continue;
        }

        return result;
    }
}

function normalizePartRow(rec, sharedTables, activeBuildingId) {
    const row = { ...rec };
    if (sharedTables) row.building_id = activeBuildingId;
    else delete row.building_id;
    return row;
}

export async function loadProdSequenceData(db, activeBuildingId) {
    try {
        const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'settings');
        let query = db.from(table).select('production_sequence');
        query = sharedTables ? query.eq('id', activeBuildingId) : query.eq('id', 1);
        const { data, error } = await query.single();
        if (error) throw error;
        return Array.isArray(data?.production_sequence) ? data.production_sequence : [];
    } catch {
        return [];
    }
}

export async function saveProdSequenceData(db, activeBuildingId, prodSequence) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'settings');
    return db.from(table).upsert(normalizeSettingsRow({
        production_sequence: prodSequence,
    }, sharedTables, activeBuildingId), { onConflict: 'id' });
}

export async function loadSettingsData(db, activeBuildingId, defaults) {
    try {
        const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'settings');
        let query = db.from(table).select('*');
        query = sharedTables ? query.eq('id', activeBuildingId) : query.eq('id', 1);
        const { data, error } = await query.single();
        if (error) throw error;
        return data ? { ...defaults, ...data } : { ...defaults };
    } catch {
        return { ...defaults };
    }
}

export async function saveSettingsData(db, activeBuildingId, settings) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'settings');
    return db.from(table).upsert(normalizeSettingsRow(settings, sharedTables, activeBuildingId), { onConflict: 'id' });
}

export async function loadShiftsData(db, activeBuildingId, fallbackShifts) {
    try {
        const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'shifts');
        let query = db.from(table).select('*');
        query = withBuildingScope(query, sharedTables, activeBuildingId).order('shift_number');
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length) {
            return data.map(s => ({ ...s, active_days: Array.isArray(s.active_days) ? s.active_days : (JSON.parse(s.active_days || '[]')) }));
        }
        return [...fallbackShifts];
    } catch {
        return [...fallbackShifts];
    }
}

export async function upsertShiftData(db, activeBuildingId, id, rec) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'shifts');
    const row = normalizeShiftRow(rec, sharedTables, activeBuildingId);
    if (id) {
        return db.from(table).update(row).eq('id', id);
    }
    return db.from(table).upsert({ ...row }, { onConflict: sharedTables ? 'building_id,shift_number' : 'shift_number' });
}

export async function deleteShiftData(db, activeBuildingId, id) {
    const { table } = await resolveTable(db, activeBuildingId, 'shifts');
    return db.from(table).delete().eq('id', id);
}

export async function loadMachinesData(db, activeBuildingId) {
    try {
        const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'machines');
        let query = db.from(table).select('*');
        query = withBuildingScope(query, sharedTables, activeBuildingId).order('sort_order').order('name');
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(m => ({
            ...m,
            active_shifts: Array.isArray(m.active_shifts) ? m.active_shifts : (m.active_shifts ? JSON.parse(m.active_shifts) : null),
            shift_day_overrides: (m.shift_day_overrides && typeof m.shift_day_overrides === 'string')
                ? JSON.parse(m.shift_day_overrides)
                : (m.shift_day_overrides || {}),
        }));
    } catch {
        return [];
    }
}

export async function saveMachineData(db, machine, activeBuildingId, currentMachinesLength) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'machines');
    if (machine.id) {
        const upd = normalizeMachineRow({ ...machine }, sharedTables, activeBuildingId);
        delete upd.id;
        delete upd.created_at;
        upd.updated_at = new Date().toISOString();
        return saveMachineRecord(db, table, upd, machine.id);
    }
    const ins = normalizeMachineRow({ ...machine }, sharedTables, activeBuildingId);
    delete ins.id;
    ins.sort_order = currentMachinesLength + 1;
    return saveMachineRecord(db, table, ins);
}

export async function deleteMachineData(db, activeBuildingId, id) {
    const { table } = await resolveTable(db, activeBuildingId, 'machines');
    return db.from(table).delete().eq('id', id);
}

export async function toggleMachineData(db, activeBuildingId, machine) {
    const { table } = await resolveTable(db, activeBuildingId, 'machines');
    return db.from(table)
        .update({ is_active: !machine.is_active, updated_at: new Date().toISOString() })
        .eq('id', machine.id);
}

export async function replacePartsData(db, activeBuildingId, parts) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'parts');
    const rows = parts.map(part => normalizePartRow(part, sharedTables, activeBuildingId));

    let deleteQuery = db.from(table).delete();
    deleteQuery = withBuildingScope(deleteQuery, sharedTables, activeBuildingId);
    const { error: de } = await deleteQuery;
    if (de) throw new Error('Delete failed: ' + de.message);

    for (let i = 0; i < rows.length; i += 200) {
        const { error: ie } = await db.from(table).insert(rows.slice(i, i + 200));
        if (ie) throw new Error('Insert failed: ' + ie.message);
    }
}

export async function loadPartsData(db, activeBuildingId) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'parts');
    let query = db.from(table).select('*');
    query = withBuildingScope(query, sharedTables, activeBuildingId).order('sort_order').order('id');
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function insertPartData(db, activeBuildingId, part) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'parts');
    return db.from(table).insert(normalizePartRow(part, sharedTables, activeBuildingId));
}

export async function updatePartData(db, activeBuildingId, id, part) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'parts');
    return db.from(table).update(normalizePartRow(part, sharedTables, activeBuildingId)).eq('id', id);
}

export async function deletePartData(db, activeBuildingId, id) {
    const { table } = await resolveTable(db, activeBuildingId, 'parts');
    return db.from(table).delete().eq('id', id);
}

export async function updatePartSortOrders(db, activeBuildingId, updates) {
    const { table } = await resolveTable(db, activeBuildingId, 'parts');
    await Promise.all(updates.map(({ id, sort_order }) => db.from(table).update({ sort_order }).eq('id', id)));
}

export async function countPartsData(db, activeBuildingId) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'parts');
    let query = db.from(table).select('*', { count: 'exact', head: true });
    query = withBuildingScope(query, sharedTables, activeBuildingId);
    const { count } = await query;
    return count;
}

export async function canConnectToBuilding(db, activeBuildingId) {
    const { table, shared: sharedTables } = await resolveTable(db, activeBuildingId, 'settings');
    let query = db.from(table).select('id');
    query = sharedTables ? query.limit(1) : query.eq('id', 1).limit(1);
    const { error } = await query;
    return { error };
}

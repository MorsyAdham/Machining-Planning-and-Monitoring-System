export async function loadProdSequenceData(db, activeBuildingId) {
    try {
        const { data } = await db.from('building1_settings')
            .select('production_sequence')
            .eq('id', activeBuildingId)
            .single();
        return Array.isArray(data?.production_sequence) ? data.production_sequence : [];
    } catch {
        return [];
    }
}

export async function saveProdSequenceData(db, activeBuildingId, prodSequence) {
    return db.from('building1_settings').upsert({
        id: activeBuildingId,
        building_id: activeBuildingId,
        production_sequence: prodSequence,
    }, { onConflict: 'id' });
}

export async function loadSettingsData(db, activeBuildingId, defaults) {
    try {
        const { data, error } = await db.from('building1_settings').select('*').eq('id', activeBuildingId).single();
        if (error) throw error;
        return data ? { ...defaults, ...data } : { ...defaults };
    } catch {
        return { ...defaults };
    }
}

export async function saveSettingsData(db, settings) {
    return db.from('building1_settings').upsert(settings, { onConflict: 'id' });
}

export async function loadShiftsData(db, activeBuildingId, fallbackShifts) {
    try {
        const { data, error } = await db.from('building1_shifts').select('*').eq('building_id', activeBuildingId).order('shift_number');
        if (error) throw error;
        if (data && data.length) {
            return data.map(s => ({ ...s, active_days: Array.isArray(s.active_days) ? s.active_days : (JSON.parse(s.active_days || '[]')) }));
        }
        return [...fallbackShifts];
    } catch {
        return [...fallbackShifts];
    }
}

export async function upsertShiftData(db, id, rec) {
    if (id) {
        return db.from('building1_shifts').update(rec).eq('id', id);
    }
    return db.from('building1_shifts').upsert({ ...rec }, { onConflict: 'building_id,shift_number' });
}

export async function deleteShiftData(db, id) {
    return db.from('building1_shifts').delete().eq('id', id);
}

export async function loadMachinesData(db, activeBuildingId) {
    try {
        const { data, error } = await db.from('building1_machines').select('*').eq('building_id', activeBuildingId).order('sort_order').order('name');
        if (error) throw error;
        return data || [];
    } catch {
        return [];
    }
}

export async function saveMachineData(db, machine, activeBuildingId, currentMachinesLength) {
    if (machine.id) {
        const upd = { ...machine };
        delete upd.id;
        delete upd.created_at;
        upd.updated_at = new Date().toISOString();
        return db.from('building1_machines').update(upd).eq('id', machine.id).select().single();
    }
    const ins = { ...machine };
    delete ins.id;
    ins.sort_order = currentMachinesLength + 1;
    ins.building_id = activeBuildingId;
    return db.from('building1_machines').insert(ins).select().single();
}

export async function deleteMachineData(db, id) {
    return db.from('building1_machines').delete().eq('id', id);
}

export async function toggleMachineData(db, machine) {
    return db.from('building1_machines')
        .update({ is_active: !machine.is_active, updated_at: new Date().toISOString() })
        .eq('id', machine.id);
}

export async function replacePartsData(db, activeBuildingId, parts) {
    const { error: de } = await db.from('building1_parts').delete().eq('building_id', activeBuildingId);
    if (de) throw new Error('Delete failed: ' + de.message);
    for (let i = 0; i < parts.length; i += 200) {
        const { error: ie } = await db.from('building1_parts').insert(parts.slice(i, i + 200));
        if (ie) throw new Error('Insert failed: ' + ie.message);
    }
}

export async function loadPartsData(db, activeBuildingId) {
    const { data, error } = await db.from('building1_parts').select('*').eq('building_id', activeBuildingId).order('sort_order').order('id');
    if (error) throw error;
    return data || [];
}

export async function insertPartData(db, part) {
    return db.from('building1_parts').insert(part);
}

export async function updatePartData(db, id, part) {
    return db.from('building1_parts').update(part).eq('id', id);
}

export async function deletePartData(db, id) {
    return db.from('building1_parts').delete().eq('id', id);
}

export async function countPartsData(db, activeBuildingId) {
    const { count } = await db.from('building1_parts').select('*', { count: 'exact', head: true }).eq('building_id', activeBuildingId);
    return count;
}

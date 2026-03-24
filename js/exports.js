export const RPT = {
    BG: 'FFFFFFFF',
    HEADER: 'FFD0D7DA',
    HEADER_FG: 'FF242424',
    ACCENT: 'FF1A3A5C',
    ACCENT2: 'FF1A5C4A',
    BORDER: 'FF9CA3AF',
    ROW_A: 'FFF9FAFB',
    ROW_B: 'FFFFFFFF',
    K9_BG: 'FFDCFCE7', K9_FG: 'FF166534', K9_HEX: '#166534',
    K10_BG: 'FFFEF3C7', K10_FG: 'FF92400E', K10_HEX: '#92400E',
    K11_BG: 'FFEDE9FE', K11_FG: 'FF6B21A8', K11_HEX: '#6B21A8',
    TEXT: 'FF242424',
    TEXT2: 'FF6B7280',
    WARN: 'FFB45309',
    ERR: 'FFDC2626',
    OK: 'FF16A34A',
    AMBER: 'FFD97706',
    TEAL: 'FF0D9488',
};

export function reportHeaderRow(cols) {
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

export function reportDataRow(cells, opts) {
    opts = opts || {};
    const v = opts.vehicle;
    let bg, fg;
    if (v === 'K9') { bg = RPT.K9_BG; fg = RPT.K9_FG; }
    else if (v === 'K10') { bg = RPT.K10_BG; fg = RPT.K10_FG; }
    else if (v === 'K11') { bg = RPT.K11_BG; fg = RPT.K11_FG; }
    else { bg = opts.bg || (opts.alt ? RPT.ROW_B : RPT.ROW_A); fg = RPT.TEXT; }

    return cells.map(val => ({
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

export function reportGroupHeader(label, numCols) {
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

export function buildWorksheet(XLSX, sheetData, colWidths, rowHeights) {
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    if (rowHeights) ws['!rows'] = rowHeights;
    return ws;
}

export function exportStamp() {
    return new Date().toISOString().slice(0, 10);
}

export function makePdfDoc(title, fmtDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 297, 14, 'F');
    doc.setFillColor(26, 58, 92);
    doc.rect(0, 14, 297, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(26, 58, 92);
    doc.text(title, 14, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated: ${fmtDate(new Date())}`, 283, 9, { align: 'right' });

    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageH - 8, 297, 8, 'F');
    doc.setFillColor(26, 58, 92);
    doc.rect(0, pageH - 8, 297, 0.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text('Building #1 Machining Production Planning', 14, pageH - 3);
    doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, 283, pageH - 3, { align: 'right' });
    doc.setTextColor(36, 36, 36);
    doc.setFontSize(9);

    return doc;
}

export function downloadTemplate(showToast) {
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }

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

export function exportPartsPDF(deps) {
    const { activeBuildingId, appSettings, currentParts, allParts, showToast, flt, getPartStatus, getPartStatusLabel, makePdfDoc } = deps;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    const isMin = (appSettings.time_unit || 'h') === 'min';
    const unitCol = isMin ? 'Op Min/Unit' : 'Op Hrs/Unit';
    const totCol = isMin ? 'Total Op Min' : 'Total Op Hrs';
    const doc = makePdfDoc(`Building #${activeBuildingId} — Parts List`);
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
    doc.save(`building${activeBuildingId}_parts_${exportStamp()}.pdf`);
    showToast('Parts list PDF exported ✓', 'success');
}

export function exportScheduleXLSX(deps) {
    const { activeBuildingId, appSettings, scheduledTasks, showToast, fmtDate, addWD, reportHeaderRow, reportDataRow, buildWorksheet } = deps;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
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

    const sheetData = [titleBanner, reportHeaderRow(cols)];

    scheduledTasks.forEach((t, i) => {
        const sd = addWD(appSettings.start_date, Math.floor(t.startDay), appSettings);
        const endCeil = Math.ceil(t.endDay);
        const ed = addWD(appSettings.start_date, endCeil > Math.floor(t.startDay) ? endCeil - 1 : endCeil, appSettings);
        sheetData.push(reportDataRow([
            t.seqNum || i + 1, t.partNumber, t.partName, t.vehicle,
            t.unitIndex || '', t.machineName, t.machineType,
            t.shiftPref ? 'S' + t.shiftPref : '',
            +(t.opHrs * opMult).toFixed(isMin ? 0 : 2),
            t.startDay.toFixed(2),
            fmtDate(sd), fmtDate(ed),
            t.pinnedDate ? '📌 ' + t.pinnedDate : '',
        ], { vehicle: t.vehicle, alt: i % 2 === 1 }));
    });

    const ws = buildWorksheet(XLSX, sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production Schedule');
    XLSX.writeFile(wb, `building${activeBuildingId}_schedule_${exportStamp()}.xlsx`);
    showToast('Schedule exported ✓', 'success');
}

export function exportSchedulePDF(deps) {
    const { activeBuildingId, appSettings, scheduledTasks, showToast, fmtDate, addWD, makePdfDoc } = deps;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }
    const doc = makePdfDoc(`Building #${activeBuildingId} — Production Schedule`);
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
    doc.save(`building${activeBuildingId}_schedule_${exportStamp()}.pdf`);
    showToast('Schedule PDF exported ✓', 'success');
}

export function exportPartsXLSX(deps) {
    const { activeBuildingId, appSettings, currentParts, allParts, showToast, flt, getPartStatus, getPartStatusLabel, fmtDate, reportHeaderRow, reportDataRow, reportGroupHeader, buildWorksheet } = deps;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
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

    const sheetData = [titleBanner, reportHeaderRow(cols)];
    const grouped = {};
    (currentParts || allParts || []).forEach(p => {
        const loc = p.location || 'Unknown';
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(p);
    });
    const locs = Object.keys(grouped).sort();

    locs.forEach((loc, li) => {
        sheetData.push(reportGroupHeader(`  ▸ ${loc}`));
        grouped[loc].forEach((p) => {
            sheetData.push(reportDataRow([
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

    const ws = buildWorksheet(XLSX, sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parts List');
    XLSX.writeFile(wb, `building${activeBuildingId}_parts_${exportStamp()}.xlsx`);
    showToast('Parts list exported ✓', 'success');
}

function getWeeklyBuckets(deps) {
    const { appSettings, scheduledTasks, genDates, ganttMaxDays, localDateStr } = deps;
    const allDates = genDates(appSettings.start_date, ganttMaxDays(scheduledTasks), appSettings);
    const weekMap = new Map();
    allDates.forEach(d => {
        const ws = new Date(d);
        ws.setDate(d.getDate() - d.getDay());
        const wKey = localDateStr(ws);
        if (!weekMap.has(wKey)) weekMap.set(wKey, { start: ws, days: [], tasks: [] });
        weekMap.get(wKey).days.push(d);
    });
    const dayToWeek = new Map();
    const weeks = Array.from(weekMap.values());
    weeks.forEach((w, wi) => w.dayIndices = w.days.map(d => {
        const idx = allDates.findIndex(ad => localDateStr(ad) === localDateStr(d));
        if (idx >= 0) dayToWeek.set(idx, wi);
        return idx;
    }));
    scheduledTasks.forEach(t => {
        const midDay = Math.floor((t.startDay + t.endDay) / 2);
        const wIdx = dayToWeek.get(midDay) ?? dayToWeek.get(Math.floor(t.startDay)) ?? 0;
        if (weeks[wIdx]) weeks[wIdx].tasks.push(t);
    });
    return weeks;
}

export function exportMachineUtilXLSX(deps) {
    const { activeBuildingId, currentMachines, scheduledTasks, showToast, fmtDate, mDailyForMachine, buildWorksheet, reportHeaderRow, reportDataRow } = deps;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
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

    const sheetData = [titleBanner, reportHeaderRow(cols)];

    active.forEach((m, i) => {
        const mTasks = (scheduledTasks || []).filter(t => t.machineId === m.id);
        const totalHrs = mTasks.reduce((s, t) => s + t.opHrs, 0);
        const dailyHrs = mDailyForMachine(m);
        const maxEnd = mTasks.reduce((s, t) => Math.max(s, t.endDay), 0);
        const totalCap = maxEnd > 0 ? maxEnd * dailyHrs : 0;
        const utilPct = totalCap > 0 ? Math.min(100, Math.round((totalHrs / totalCap) * 100)) : 0;
        const statusStr = utilPct > 85 ? 'HIGH LOAD' : utilPct > 65 ? 'MODERATE' : 'OK';
        const statusFg = utilPct > 85 ? RPT.ERR : utilPct > 65 ? RPT.WARN : RPT.OK;

        const row = reportDataRow([m.name, m.machine_type, mTasks.length, totalHrs.toFixed(1), dailyHrs.toFixed(2), utilPct + '%', statusStr], { alt: i % 2 === 1 });
        row[5] = {
            v: utilPct + '%', t: 's', s: {
                font: { bold: true, color: { rgb: statusFg }, sz: 10, name: 'Calibri' },
                fill: { fgColor: { rgb: i % 2 === 1 ? RPT.ROW_B : RPT.ROW_A } },
                alignment: { horizontal: 'right', vertical: 'center' },
                border: { top: { style: 'thin', color: { rgb: RPT.BORDER } }, bottom: { style: 'thin', color: { rgb: RPT.BORDER } }, left: { style: 'thin', color: { rgb: RPT.BORDER } }, right: { style: 'thin', color: { rgb: RPT.BORDER } } }
            }
        };
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

    const ws = buildWorksheet(XLSX, sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 20 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine Utilization');
    XLSX.writeFile(wb, `building${activeBuildingId}_machines_${exportStamp()}.xlsx`);
    showToast('Machine utilization exported ✓', 'success');
}

export function exportMachineUtilPDF(deps) {
    const { activeBuildingId, currentMachines, scheduledTasks, showToast, mDailyForMachine, makePdfDoc } = deps;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    const active = (currentMachines || []).filter(m => m.is_active);
    if (!active.length) { showToast('No active machines', 'info'); return; }

    const doc = makePdfDoc(`Building #${activeBuildingId} — Machine Utilization`);
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

    doc.save(`building${activeBuildingId}_machines_${exportStamp()}.pdf`);
    showToast('Machine utilization PDF exported ✓', 'success');
}

export function exportWeeklyPlanXLSX(deps) {
    const { activeBuildingId, scheduledTasks, showToast, fmtDate, reportHeaderRow, reportDataRow, reportGroupHeader, buildWorksheet } = deps;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }

    const weeks = getWeeklyBuckets(deps);
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

    const sheetData = [titleBanner, reportHeaderRow(cols)];
    weeks.forEach((w, wi) => {
        if (!w.tasks.length) {
            sheetData.push(reportGroupHeader(`Week of ${fmtDate(w.start)} — No activity`).slice(0, cols.length));
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
            sheetData.push(reportDataRow([
                pi === 0 ? fmtDate(w.start) : '',
                pi === 0 ? String(w.days.length) : '',
                pn, partName, firstVeh, units, machine,
                hours.toFixed(1), vehStr,
            ], { vehicle: firstVeh, alt: wi % 2 === 1 }));
        });
    });

    const ws = buildWorksheet(XLSX, sheetData, cols.map(c => c.width));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : { hpt: 18 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Plan');
    XLSX.writeFile(wb, `building${activeBuildingId}_weekly_${exportStamp()}.xlsx`);
    showToast('Weekly plan exported ✓', 'success');
}

export function exportWeeklyPlanPDF(deps) {
    const { activeBuildingId, scheduledTasks, showToast, fmtDate, makePdfDoc } = deps;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }
    if (!scheduledTasks.length) { showToast('No scheduled tasks to export', 'info'); return; }

    const doc = makePdfDoc(`Building #${activeBuildingId} — Weekly Plan`);
    const weeks = getWeeklyBuckets(deps);
    const cols = ['Week of', 'Part Number', 'Part Name', 'Vehicle', 'Units', 'Machine', 'Hours', 'Vehicles'];
    const rows = [];
    weeks.forEach((w) => {
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

    doc.save(`building${activeBuildingId}_weekly_${exportStamp()}.pdf`);
    showToast('Weekly plan PDF exported ✓', 'success');
}

export function exportExecutiveSummaryXLSX(deps) {
    const { activeBuildingId, appSettings, currentParts, scheduledTasks, currentMachines, showToast, flt, fmtDate, addWD, reportHeaderRow, reportDataRow, buildWorksheet } = deps;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('SheetJS not ready', 'error'); return; }

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

    const mkRow = (label, value, isAlt) => reportDataRow([label, value], { alt: isAlt, bold: false });

    const sheetData = [
        titleBanner,
        reportHeaderRow(summaryCols),
        mkRow('Plan Start Date', fmtDate(new Date(appSettings.start_date + 'T00:00:00')), false),
        mkRow('Active Machines', String(activeCnt), true),
        mkRow('Total Part Rows', String(uParts), false),
        mkRow('Total Unit Tasks', tTasks.toFixed(1), true),
        mkRow('Total Operation Hours', tHrs.toFixed(1) + ' hrs', false),
        mkRow('Working Days Required', String(totalWorkDays), true),
        mkRow('Projected Completion', fmtDate(endDate), false),
        mkRow('Week Type', appSettings.saturday_working ? '6-day (Sat working)' : '5-day (Sun–Thu)', true),
    ];

    const batHdr = [{
        v: 'BATTALION BREAKDOWN', t: 's', s: {
            font: { bold: true, color: { rgb: RPT.HEADER_FG }, sz: 11, name: 'Calibri' },
            fill: { fgColor: { rgb: RPT.HEADER } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { top: { style: 'medium', color: { rgb: RPT.ACCENT } }, bottom: { style: 'medium', color: { rgb: RPT.ACCENT } }, left: { style: 'medium', color: { rgb: RPT.ACCENT } }, right: { style: 'medium', color: { rgb: RPT.ACCENT } } }
        }
    }].concat(new Array(summaryCols.length - 1).fill({ v: '', t: 's', s: { fill: { fgColor: { rgb: RPT.HEADER } } } }));

    const batColHdr = reportHeaderRow([{ title: 'BATTALION', width: 16 }, { title: 'UNITS', width: 12 }, { title: 'HOURS', width: 14 }, { title: 'SHARE', width: 12 }]);
    const mkBatRow = (veh, count, hrs, pct) => reportDataRow([veh, String(count) + ' units', String(hrs.toFixed(1)) + ' hrs', pct + '%'], { vehicle: veh });
    const k9Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K9').reduce((s, t) => s + t.opHrs, 0);
    const k10Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K10').reduce((s, t) => s + t.opHrs, 0);
    const k11Hrs = (scheduledTasks || []).filter(t => t.vehicle === 'K11').reduce((s, t) => s + t.opHrs, 0);

    sheetData.push(batHdr, batColHdr);
    sheetData.push(mkBatRow('K9', vc.K9, k9Hrs, tTasks > 0 ? ((vc.K9 / tTasks * 100)).toFixed(1) : '0'));
    sheetData.push(mkBatRow('K10', vc.K10, k10Hrs, tTasks > 0 ? ((vc.K10 / tTasks * 100)).toFixed(1) : '0'));
    sheetData.push(mkBatRow('K11', vc.K11, k11Hrs, tTasks > 0 ? ((vc.K11 / tTasks * 100)).toFixed(1) : '0'));

    const ws = buildWorksheet(XLSX, sheetData, summaryCols.map(c => c.width).concat([16, 14, 12]));
    ws['!rows'] = sheetData.map((_, i) => i <= 1 ? { hpt: 24 } : i <= 10 ? { hpt: 20 } : { hpt: 22 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Executive Summary');
    XLSX.writeFile(wb, `building${activeBuildingId}_summary_${exportStamp()}.xlsx`);
    showToast('Executive summary exported ✓', 'success');
}

export function exportExecutiveSummaryPDF(deps) {
    const { activeBuildingId, appSettings, currentParts, scheduledTasks, currentMachines, showToast, flt, fmtDate, addWD, makePdfDoc } = deps;
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('jsPDF not ready', 'error'); return; }

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

    const doc = makePdfDoc(`Building #${activeBuildingId} — Executive Summary`);
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
            if (data.section === 'body' && data.row.index >= 0) {
                if (data.row.index === 0) {
                    data.cell.styles.fillColor = [220, 252, 231];
                    data.cell.styles.textColor = [22, 101, 52];
                } else if (data.row.index === 1) {
                    data.cell.styles.fillColor = [254, 243, 199];
                    data.cell.styles.textColor = [146, 64, 14];
                } else if (data.row.index === 2) {
                    data.cell.styles.fillColor = [237, 233, 254];
                    data.cell.styles.textColor = [107, 33, 168];
                }
            }
        },
    });

    doc.save(`building${activeBuildingId}_summary_${exportStamp()}.pdf`);
    showToast('Executive summary PDF exported ✓', 'success');
}

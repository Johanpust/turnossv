// -----------------------------------------------------------------
// getLocalDateStr: Devuelve la fecha local como 'YYYY-MM-DD'
// Usa la hora del dispositivo (Colombia UTC-5), NO UTC.
// -----------------------------------------------------------------
function getLocalDateStr(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// -----------------------------------------------------------------
// logAttendance: Guarda un registro de atención en Supabase.
// Se llama cada vez que un operador presiona "Siguiente".
// -----------------------------------------------------------------
function logAttendance(record) {
    // record = { moduleId, ticket, ticketType, docId, assignedAt, attendingAt, finishedAt }
    const attendingSecs = record.attendingAt
        ? Math.floor((record.finishedAt - record.attendingAt) / 1000)
        : (record.assignedAt ? Math.floor((record.finishedAt - record.assignedAt) / 1000) : null);

    const row = {
        date:              getLocalDateStr(record.finishedAt),   // Fecha LOCAL, no UTC
        module_id:         record.moduleId,
        ticket:            record.ticket,
        ticket_type:       record.ticketType,
        doc_id:            record.docId || '',
        assigned_at:       record.assignedAt   ? new Date(record.assignedAt).toISOString()   : null,
        attending_at:      record.attendingAt  ? new Date(record.attendingAt).toISOString()  : null,
        finished_at:       record.finishedAt   ? new Date(record.finishedAt).toISOString()   : null,
        attention_seconds: attendingSecs
    };

    return supabaseClient
        .from('attendance_log')
        .insert(row)
        .then(response => {
            if (response.error) {
                console.error('Error guardando atención en attendance_log:', response.error);
            }
        })
        .catch(e => console.error('Error en logAttendance:', e));
}

// -----------------------------------------------------------------
// fetchAttendanceByDateRange: Obtiene todos los registros de atención
// en un rango de fechas (formato 'YYYY-MM-DD').
// Retorna array de filas ordenadas por fecha, módulo y hora.
// -----------------------------------------------------------------
function fetchAttendanceByDateRange(startDateStr, endDateStr) {
    return supabaseClient
        .from('attendance_log')
        .select('*')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: true })
        .order('module_id', { ascending: true })
        .order('finished_at', { ascending: true })
        .then(response => {
            if (response.error) {
                console.error('Error obteniendo registros de attendance_log:', response.error);
                return [];
            }
            return response.data || [];
        })
        .catch(e => {
            console.error('Error en fetchAttendanceByDateRange:', e);
            return [];
        });
}

// -----------------------------------------------------------------
// fetchAttendanceSummaryByDateRange: Devuelve resumen agrupado por módulo
// -----------------------------------------------------------------
function fetchAttendanceSummaryByDateRange(startDateStr, endDateStr) {
    return fetchAttendanceByDateRange(startDateStr, endDateStr).then(rows => {
        const summary = {};
        rows.forEach(row => {
            const key = row.module_id;
            if (!summary[key]) {
                summary[key] = { moduleId: key, total: 0, byType: { E: 0, A: 0, V: 0, B: 0 }, avgSeconds: 0, totalSeconds: 0 };
            }
            summary[key].total++;
            if (summary[key].byType[row.ticket_type] !== undefined) {
                summary[key].byType[row.ticket_type]++;
            }
            if (row.attention_seconds && row.attention_seconds > 0) {
                summary[key].totalSeconds += row.attention_seconds;
            }
        });

        // Calcular promedio de tiempo de atención por módulo
        Object.values(summary).forEach(mod => {
            if (mod.total > 0 && mod.totalSeconds > 0) {
                mod.avgSeconds = Math.round(mod.totalSeconds / mod.total);
            }
        });

        return { rows, summary };
    });
}

// -----------------------------------------------------------------
// formatSecondsToMinutes: Convierte segundos a "Xm Ys"
// -----------------------------------------------------------------
function formatSecondsToMinutes(secs) {
    if (!secs || secs <= 0) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// -----------------------------------------------------------------
// TYPE_LABELS: Descripciones de tipos de turno para el Excel
// -----------------------------------------------------------------
const REPORT_TYPE_LABELS = {
    E: 'Entrega de órdenes',
    A: 'Activación de citas',
    V: 'Varios',
    B: 'Entrega de biopsias'
};

// -----------------------------------------------------------------
// downloadExcel: Genera y descarga el archivo Excel para el rango.
// Usa la librería SheetJS (xlsx) cargada via CDN en admin.html.
// -----------------------------------------------------------------
async function downloadExcel(startDateStr, endDateStr) {
    const rows = await fetchAttendanceByDateRange(startDateStr, endDateStr);

    if (!rows || rows.length === 0) {
        alert(`No hay registros de atención para este rango de fechas.`);
        return;
    }

    // Preparar los datos en formato de filas para el Excel
    const excelData = rows.map((row, idx) => {
        const horaInicio   = row.attending_at || row.assigned_at;
        const horaFin      = row.finished_at;
        const tiempoMin    = row.attention_seconds && row.attention_seconds > 0
            ? parseFloat((row.attention_seconds / 60).toFixed(2))
            : null;

        return {
            '#':                    idx + 1,
            'Fecha':                row.date,
            'Módulo':               `Módulo ${row.module_id}`,
            'Tipo de Turno':        row.ticket_type,
            'Descripción Tipo':     REPORT_TYPE_LABELS[row.ticket_type] || row.ticket_type,
            'Código Turno':         row.ticket,
            'Documento Paciente':   row.doc_id || '—',
            'Hora Inicio Atención': horaInicio ? formatTime(horaInicio) : '—',
            'Hora Fin Atención':    horaFin    ? formatTime(horaFin)    : '—',
            'Tiempo Atención (min)': tiempoMin !== null ? tiempoMin : '—'
        };
    });

    // Crear workbook y worksheet principal
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.json_to_sheet(excelData);

    // Ajustar anchos de columna
    ws['!cols'] = [
        { wch: 4  },  // #
        { wch: 12 },  // Fecha
        { wch: 12 },  // Módulo
        { wch: 12 },  // Tipo
        { wch: 22 },  // Descripción
        { wch: 14 },  // Código
        { wch: 20 },  // Documento
        { wch: 20 },  // Hora Inicio
        { wch: 20 },  // Hora Fin
        { wch: 22 }   // Tiempo (min)
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Atenciones`);

    // Segunda hoja: Resumen por módulo
    const resumenData = [];
    const modIds = [...new Set(rows.map(r => r.module_id))].sort((a, b) => a - b);
    modIds.forEach(modId => {
        const modRows = rows.filter(r => r.module_id === modId);
        const byType  = { E: 0, A: 0, V: 0, B: 0 };
        let totalSecs = 0;
        modRows.forEach(r => {
            if (byType[r.ticket_type] !== undefined) byType[r.ticket_type]++;
            if (r.attention_seconds > 0) totalSecs += r.attention_seconds;
        });
        const avgMin = modRows.length > 0 && totalSecs > 0
            ? parseFloat((totalSecs / 60 / modRows.length).toFixed(2)) : '—';

        resumenData.push({
            'Módulo':                      `Módulo ${modId}`,
            'Total Turnos Atendidos':      modRows.length,
            'E - Entrega órdenes':         byType.E,
            'A - Activación citas':        byType.A,
            'V - Varios':                  byType.V,
            'B - Entrega biopsias':        byType.B,
            'Tiempo Promedio Atención (min)': avgMin
        });
    });

    const wsResumen = XLSX.utils.json_to_sheet(resumenData);
    wsResumen['!cols'] = [
        { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 32 }
    ];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por Módulo');

    // Descargar
    const dateLabel = (startDateStr === endDateStr) ? startDateStr : `${startDateStr}_a_${endDateStr}`;
    const fileName = `Atenciones_${dateLabel}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// -----------------------------------------------------------------
// deleteOldRecords: Borra registros anteriores a 'dateStr' en Supabase
// -----------------------------------------------------------------
function deleteOldRecords(dateStr) {
    return supabaseClient
        .from('attendance_log')
        .delete()
        .lt('date', dateStr)
        .then(response => {
            if (response.error) {
                console.error('Error eliminando registros:', response.error);
                return { success: false, error: response.error };
            }
            return { success: true };
        })
        .catch(e => {
            console.error('Error en deleteOldRecords:', e);
            return { success: false, error: e };
        });
}

// -----------------------------------------------------------------
// formatTime: Formatea un timestamp ISO a HH:MM:SS (hora local).
// -----------------------------------------------------------------
function formatTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

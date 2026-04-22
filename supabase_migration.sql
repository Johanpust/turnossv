-- ============================================================
-- MIGRACIÓN: Crear tabla attendance_log en Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Tabla para persistir las atenciones diarias de cada módulo
-- Los datos se conservan aunque se reinicie el sistema de turnos.
CREATE TABLE IF NOT EXISTS public.attendance_log (
    id              BIGSERIAL PRIMARY KEY,
    date            DATE        NOT NULL DEFAULT CURRENT_DATE,
    module_id       INT         NOT NULL,
    ticket          TEXT        NOT NULL,
    ticket_type     TEXT        NOT NULL CHECK (ticket_type IN ('E', 'A', 'V', 'B')),
    doc_id          TEXT        DEFAULT '',
    assigned_at     TIMESTAMPTZ,
    attending_at    TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    attention_seconds INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas rápidas por fecha (filtro principal del reporte)
CREATE INDEX IF NOT EXISTS idx_attendance_log_date
    ON public.attendance_log (date);

-- Índice compuesto para filtrar por fecha y módulo
CREATE INDEX IF NOT EXISTS idx_attendance_log_date_module
    ON public.attendance_log (date, module_id);

-- ============================================================
-- POLÍTICA DE SEGURIDAD ROW LEVEL SECURITY (RLS)
-- Permite que el anon key (frontend) pueda insertar y leer.
-- ============================================================

-- Habilitar RLS en la tabla
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;

-- Política: permitir inserción desde el frontend (anon key)
CREATE POLICY "allow_insert_attendance"
    ON public.attendance_log
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Política: permitir lectura desde el frontend (anon key)
CREATE POLICY "allow_read_attendance"
    ON public.attendance_log
    FOR SELECT
    TO anon
    USING (true);

-- ============================================================
-- VERIFICACIÓN: Ejecuta esta línea para confirmar que la tabla
-- se creó correctamente:
-- SELECT COUNT(*) FROM public.attendance_log;
-- ============================================================

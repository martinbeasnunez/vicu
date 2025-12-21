-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Mejora la tabla experiment_checkins para el flujo "Mover proyecto"
-- ============================================

-- Agregar campos adicionales a experiment_checkins si no existen
-- (la tabla ya fue creada en add_checkins_and_pause.sql)

-- Agregar campo para el estado del usuario al hacer check-in
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS user_state TEXT;
-- 'not_started' | 'stuck' | 'going_well'

-- Agregar campo para el título del paso sugerido
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS step_title TEXT;

-- Agregar campo para la descripción del paso sugerido
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS step_description TEXT;

-- Agregar campo para el esfuerzo estimado
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS effort TEXT;
-- 'muy_pequeno' | 'pequeno' | 'medio'

-- Agregar campo para la fecha (solo día, para agrupar por día)
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS day_date DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE;

-- Índice para consultas por día
CREATE INDEX IF NOT EXISTS idx_checkins_day_date ON experiment_checkins(day_date DESC);

-- Comentarios
COMMENT ON COLUMN experiment_checkins.user_state IS 'Estado del usuario al iniciar: not_started, stuck, going_well';
COMMENT ON COLUMN experiment_checkins.step_title IS 'Título del paso sugerido por Vicu';
COMMENT ON COLUMN experiment_checkins.step_description IS 'Descripción del paso sugerido';
COMMENT ON COLUMN experiment_checkins.effort IS 'Esfuerzo estimado: muy_pequeno (~5min), pequeno (~20min), medio (~1h)';
COMMENT ON COLUMN experiment_checkins.day_date IS 'Fecha del check-in (solo día, para agrupar)';

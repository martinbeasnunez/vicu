-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campo completed_at a experiment_checkins
-- ============================================

-- Agregar campo completed_at para registrar cuándo se completó el paso
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Índice para consultas por fecha de completado
CREATE INDEX IF NOT EXISTS idx_checkins_completed_at ON experiment_checkins(completed_at DESC);

-- Comentario
COMMENT ON COLUMN experiment_checkins.completed_at IS 'Fecha y hora cuando se completó el paso (null si status != done)';

-- Actualizar registros existentes: si status='done', usar created_at como completed_at
UPDATE experiment_checkins
SET completed_at = created_at
WHERE status = 'done' AND completed_at IS NULL;

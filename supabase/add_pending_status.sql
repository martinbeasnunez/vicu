-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Permite el status 'pending' en experiment_checkins
-- ============================================

-- Primero eliminamos el constraint existente
ALTER TABLE experiment_checkins
DROP CONSTRAINT IF EXISTS experiment_checkins_status_check;

-- Luego creamos el nuevo constraint que incluye 'pending'
ALTER TABLE experiment_checkins
ADD CONSTRAINT experiment_checkins_status_check
CHECK (status IN ('done', 'skipped', 'pending'));

-- Comentario actualizado
COMMENT ON COLUMN experiment_checkins.status IS 'done = completado, skipped = omitido, pending = pendiente de hacer';

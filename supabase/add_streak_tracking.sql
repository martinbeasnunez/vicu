-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campos para tracking de check-ins y rachas
-- ============================================

-- Campos de tracking en experiments
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS checkins_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;

-- Índice para ordenar por último check-in
CREATE INDEX IF NOT EXISTS idx_experiments_last_checkin ON experiments(last_checkin_at DESC NULLS LAST);

-- Comentarios
COMMENT ON COLUMN experiments.last_checkin_at IS 'Fecha del último check-in/avance del usuario';
COMMENT ON COLUMN experiments.checkins_count IS 'Contador total de check-ins marcados';
COMMENT ON COLUMN experiments.streak_days IS 'Días consecutivos con al menos un check-in';

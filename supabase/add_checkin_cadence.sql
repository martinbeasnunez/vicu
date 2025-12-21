-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campo checkin_cadence a experiments
-- ============================================

-- Agregar campo checkin_cadence a experiments
-- Valores posibles: 'daily', 'twice_weekly', 'weekly'
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS checkin_cadence TEXT DEFAULT 'twice_weekly';

-- Agregar índice para consultas por cadencia
CREATE INDEX IF NOT EXISTS idx_experiments_checkin_cadence ON experiments(checkin_cadence);

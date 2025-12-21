-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campos de rhythm/cadence a experiments
-- ============================================

-- Agregar campos de rhythm a experiments
-- action_cadence: con qué frecuencia debe actuar el usuario
-- metrics_cadence: con qué frecuencia revisar métricas
-- decision_cadence_days: cada cuántos días tomar decisión de continuar/pivotar

ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS action_cadence TEXT DEFAULT '2-3/week',
ADD COLUMN IF NOT EXISTS metrics_cadence TEXT DEFAULT 'weekly',
ADD COLUMN IF NOT EXISTS decision_cadence_days INTEGER DEFAULT 14;

-- Agregar índice para consultas por cadencia de acción
CREATE INDEX IF NOT EXISTS idx_experiments_action_cadence ON experiments(action_cadence);

-- Comentarios para documentación
COMMENT ON COLUMN experiments.action_cadence IS 'Frecuencia de acciones: daily, 2-3/week, weekly';
COMMENT ON COLUMN experiments.metrics_cadence IS 'Frecuencia de revisión de métricas: daily, 2-3/week, weekly, none';
COMMENT ON COLUMN experiments.decision_cadence_days IS 'Días entre decisiones de continuar/pivotar';

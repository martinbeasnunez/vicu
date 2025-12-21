-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Crea tabla experiment_checkins y campos para pausar/notificaciones
-- ============================================

-- Tabla para registrar check-ins diarios
CREATE TABLE IF NOT EXISTS experiment_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('done', 'skipped')),
  notes TEXT,
  source TEXT DEFAULT 'hoy_screen'
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_checkins_experiment_id ON experiment_checkins(experiment_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON experiment_checkins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON experiment_checkins(status);

-- Campos nuevos en experiments para pausar y próximo check-in
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_checkin_at TIMESTAMP WITH TIME ZONE;

-- Índice para filtrar experimentos pausados
CREATE INDEX IF NOT EXISTS idx_experiments_paused_until ON experiments(paused_until);

-- Comentarios
COMMENT ON TABLE experiment_checkins IS 'Registro de check-ins diarios de avance en experimentos';
COMMENT ON COLUMN experiment_checkins.status IS 'done = avanzó, skipped = no avanzó';
COMMENT ON COLUMN experiment_checkins.source IS 'Origen del check-in: hoy_screen, notification, etc.';
COMMENT ON COLUMN experiments.paused_until IS 'Fecha hasta la cual el experimento está pausado (no aparece en /hoy)';
COMMENT ON COLUMN experiments.next_checkin_at IS 'Próxima fecha sugerida para check-in según action_cadence';

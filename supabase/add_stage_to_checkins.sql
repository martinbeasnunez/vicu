-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campo for_stage a experiment_checkins para trackear en qué etapa se creó cada paso
-- ============================================

-- Agregar campo para la etapa en la que se creó el paso
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS for_stage TEXT;
-- 'testing' | 'scale' | 'iterate' | 'kill' | 'paused'

-- Índice para consultas por etapa
CREATE INDEX IF NOT EXISTS idx_checkins_for_stage ON experiment_checkins(for_stage);

-- Comentario
COMMENT ON COLUMN experiment_checkins.for_stage IS 'Etapa del objetivo cuando se creó este paso: testing, scale, iterate, kill, paused';

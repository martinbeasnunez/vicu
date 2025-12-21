-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campo user_content a experiment_checkins para guardar contenido del usuario
-- ============================================

-- Agregar campo para contenido escrito por el usuario
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS user_content TEXT;

-- Comentario
COMMENT ON COLUMN experiment_checkins.user_content IS 'Contenido escrito por el usuario para este paso (ej: borrador de mensaje, notas)';

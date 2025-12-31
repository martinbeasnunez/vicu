-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campo user_notes (array de notas) a experiment_checkins
-- ============================================

-- Agregar campo JSONB para múltiples notas del usuario
-- Estructura: [{ id: string, content: string, created_at: string }]
ALTER TABLE experiment_checkins
ADD COLUMN IF NOT EXISTS user_notes JSONB DEFAULT '[]'::jsonb;

-- Comentario
COMMENT ON COLUMN experiment_checkins.user_notes IS 'Array de notas del usuario: [{id, content, created_at}]';

-- Migrar user_content existente a user_notes si hay contenido
UPDATE experiment_checkins
SET user_notes = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'content', user_content,
    'created_at', created_at::text
  )
)
WHERE user_content IS NOT NULL
  AND user_content != ''
  AND (user_notes IS NULL OR user_notes = '[]'::jsonb);

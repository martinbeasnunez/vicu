-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega slot_type a whatsapp_reminders para el sistema intensivo
-- ============================================

-- Agregar campo slot_type para identificar el tipo de recordatorio
-- MORNING_FOCUS, LATE_MORNING_PUSH, AFTERNOON_MICRO, NIGHT_REVIEW
ALTER TABLE whatsapp_reminders
ADD COLUMN IF NOT EXISTS slot_type TEXT;

-- Índice para buscar por slot_type y fecha
CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_slot_type ON whatsapp_reminders(slot_type);

-- Comentario
COMMENT ON COLUMN whatsapp_reminders.slot_type IS 'Tipo de slot: MORNING_FOCUS, LATE_MORNING_PUSH, AFTERNOON_MICRO, NIGHT_REVIEW';

-- También agregar campos para las opciones de respuesta contextuales
-- Esto permite que el webhook sepa qué significan las respuestas 1, 2, 3
ALTER TABLE whatsapp_reminders
ADD COLUMN IF NOT EXISTS response_options JSONB;

COMMENT ON COLUMN whatsapp_reminders.response_options IS 'Opciones de respuesta enviadas al usuario (ej: {"1": "done", "2": "later", "3": "stuck"})';

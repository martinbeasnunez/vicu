-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Tablas para integración Kapso WhatsApp (recordatorios)
-- ============================================

-- Tabla para configuración de WhatsApp del usuario demo
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'demo-user',
  phone_number TEXT NOT NULL, -- Número del usuario (ej: +51999999999)
  kapso_phone_number_id TEXT NOT NULL, -- ID del número en Kapso (ej: 12083619224)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Solo un config activo por usuario
  UNIQUE(user_id)
);

-- Tabla para registro de recordatorios enviados
CREATE TABLE IF NOT EXISTS whatsapp_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'demo-user',
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  checkin_id UUID REFERENCES experiment_checkins(id) ON DELETE SET NULL,

  -- Contenido del mensaje enviado
  message_content TEXT NOT NULL,
  step_title TEXT,
  step_description TEXT,

  -- Estado del recordatorio
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'responded', 'expired'

  -- Respuesta del usuario (1=done, 2=later, 3=stuck)
  user_response TEXT, -- '1', '2', '3' o texto libre
  response_action TEXT, -- 'done', 'later', 'stuck'

  -- IDs de Kapso para tracking
  kapso_message_id TEXT,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_user_id ON whatsapp_config(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_user_id ON whatsapp_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_experiment_id ON whatsapp_reminders(experiment_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_status ON whatsapp_reminders(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_reminders_sent_at ON whatsapp_reminders(sent_at DESC);

-- Comentarios
COMMENT ON TABLE whatsapp_config IS 'Configuración de WhatsApp para recordatorios vía Kapso';
COMMENT ON TABLE whatsapp_reminders IS 'Registro de recordatorios enviados por WhatsApp';
COMMENT ON COLUMN whatsapp_config.kapso_phone_number_id IS 'ID del número de WhatsApp en Kapso (phone_number_id)';
COMMENT ON COLUMN whatsapp_reminders.response_action IS 'Acción interpretada: done (ya lo hice), later (más tarde), stuck (me trabé)';

-- ============================================
-- INSERTAR CONFIGURACIÓN INICIAL DEL DEMO USER
-- ============================================
INSERT INTO whatsapp_config (user_id, phone_number, kapso_phone_number_id)
VALUES ('demo-user', '+51965450086', '12083619224')
ON CONFLICT (user_id) DO UPDATE SET
  phone_number = EXCLUDED.phone_number,
  kapso_phone_number_id = EXCLUDED.kapso_phone_number_id,
  updated_at = now();

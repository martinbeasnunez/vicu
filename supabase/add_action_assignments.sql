-- ============================================
-- TABLA: action_assignments
-- Permite asignar acciones a externos para pedir ayuda
-- ============================================

CREATE TABLE action_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES experiment_actions(id) ON DELETE CASCADE,

  -- Quién asigna (owner del experimento)
  assigned_by TEXT NOT NULL,

  -- Datos del helper externo
  helper_name TEXT NOT NULL,
  helper_contact TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('whatsapp', 'email')),

  -- Mensaje personalizado del owner
  custom_message TEXT,

  -- Estado de la asignación
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Enviado, esperando respuesta
    'completed',  -- El helper confirmó que lo hizo
    'declined',   -- El helper no puede ayudar
    'expired'     -- Expiró sin respuesta
  )),

  -- Token para acceso público (sin login)
  access_token TEXT UNIQUE NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Respuesta del helper
  response_message TEXT,
  responded_at TIMESTAMPTZ,

  -- Tracking de notificación
  notification_sent_at TIMESTAMPTZ,
  notification_message_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX idx_assignments_action ON action_assignments(action_id);
CREATE INDEX idx_assignments_token ON action_assignments(access_token);
CREATE INDEX idx_assignments_status ON action_assignments(status);
CREATE INDEX idx_assignments_assigned_by ON action_assignments(assigned_by);

-- Comentarios
COMMENT ON TABLE action_assignments IS 'Asignaciones de acciones a externos para pedir ayuda (Modo A - Ayuda puntual)';
COMMENT ON COLUMN action_assignments.access_token IS 'UUID para acceso público sin login';
COMMENT ON COLUMN action_assignments.token_expires_at IS 'El token expira 7 días después de crearse';

-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Sistema de gamificación: XP, niveles, rachas y badges
-- ============================================

-- Tabla principal de estadísticas del usuario
CREATE TABLE IF NOT EXISTS user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'demo-user', -- por ahora un solo usuario demo
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_checkin_date DATE,
  daily_checkins INTEGER NOT NULL DEFAULT 0,
  daily_goal INTEGER NOT NULL DEFAULT 2, -- meta: avanzar en X proyectos por día
  total_checkins INTEGER NOT NULL DEFAULT 0,
  total_projects_completed INTEGER NOT NULL DEFAULT 0,
  badges JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único para el usuario (por ahora solo demo-user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

-- Tabla para historial de XP ganado (para mostrar +XP en la UI)
CREATE TABLE IF NOT EXISTS xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'demo-user',
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL, -- 'checkin', 'streak_bonus', 'badge_unlocked', 'project_completed', etc.
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_id ON xp_events(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_created_at ON xp_events(created_at DESC);

-- Insertar registro inicial para demo-user si no existe
INSERT INTO user_stats (user_id)
VALUES ('demo-user')
ON CONFLICT (user_id) DO NOTHING;

-- Comentarios
COMMENT ON TABLE user_stats IS 'Estadísticas globales de gamificación del usuario';
COMMENT ON COLUMN user_stats.xp IS 'Puntos de experiencia acumulados';
COMMENT ON COLUMN user_stats.level IS 'Nivel actual calculado a partir del XP';
COMMENT ON COLUMN user_stats.streak_days IS 'Días consecutivos cumpliendo la meta diaria';
COMMENT ON COLUMN user_stats.longest_streak IS 'Racha más larga lograda';
COMMENT ON COLUMN user_stats.last_checkin_date IS 'Fecha del último día con check-in';
COMMENT ON COLUMN user_stats.daily_checkins IS 'Check-ins hechos hoy';
COMMENT ON COLUMN user_stats.daily_goal IS 'Meta de proyectos a avanzar por día';
COMMENT ON COLUMN user_stats.badges IS 'Array JSON de badges desbloqueados';
COMMENT ON TABLE xp_events IS 'Historial de XP ganado para mostrar animaciones';

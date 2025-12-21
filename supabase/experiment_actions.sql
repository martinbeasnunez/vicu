-- ============================================
-- PEGA ESTE SQL EN EL EDITOR DE SQL DE SUPABASE
-- PARA CREAR LA TABLA `experiment_actions`
-- ============================================

CREATE TABLE experiment_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  suggested_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  done_at TIMESTAMPTZ
);

-- Índice para consultas rápidas por experimento
CREATE INDEX idx_experiment_actions_experiment_id ON experiment_actions(experiment_id);

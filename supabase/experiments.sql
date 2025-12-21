-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- ============================================

-- 1) Crear tabla experiments
CREATE TABLE experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_type TEXT NOT NULL,
  target_audience TEXT,
  main_pain TEXT,
  main_promise TEXT,
  main_cta TEXT,
  success_goal_number INTEGER,
  success_goal_unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Añadir experiment_id a leads
ALTER TABLE leads
ADD COLUMN experiment_id UUID REFERENCES experiments(id);

-- 3) Añadir experiment_id a events
ALTER TABLE events
ADD COLUMN experiment_id UUID REFERENCES experiments(id);

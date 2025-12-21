-- ============================================
-- COPIA Y PEGA ESTE SQL EN EL SQL EDITOR DE SUPABASE
-- Agrega campos de deadline, fechas sugeridas y estado extendido
-- ============================================

-- 1) Agregar campos a experiments
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS raw_idea TEXT,
ADD COLUMN IF NOT EXISTS deadline DATE,
ADD COLUMN IF NOT EXISTS deadline_source TEXT DEFAULT 'ai_suggested',
ADD COLUMN IF NOT EXISTS self_result TEXT; -- Valores: 'alto', 'medio', 'bajo', o NULL

-- 2) Agregar campo suggested_due_date a experiment_actions
ALTER TABLE experiment_actions
ADD COLUMN IF NOT EXISTS suggested_due_date DATE;

-- 3) Actualizar el campo status de experiment_actions para soportar más estados
-- (El campo ya existe como TEXT, solo documentamos los valores válidos)
-- Valores válidos: 'pending', 'in_progress', 'done', 'blocked'

-- 4) Índice para consultas por fecha
CREATE INDEX IF NOT EXISTS idx_experiment_actions_due_date ON experiment_actions(suggested_due_date);
CREATE INDEX IF NOT EXISTS idx_experiments_deadline ON experiments(deadline);

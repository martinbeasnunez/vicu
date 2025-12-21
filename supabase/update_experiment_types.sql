-- Update experiment types
-- Run this in the Supabase SQL Editor

-- Add experiment_type column if it doesn't exist (new column for the 3 types)
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS experiment_type TEXT DEFAULT 'clientes';

-- Add a comment for documentation
COMMENT ON COLUMN experiments.experiment_type IS 'Type of experiment: clientes (get customers), validacion (validate idea), equipo (move team/community)';

-- Note: The old project_type column (external/internal) can remain for backwards compatibility
-- New experiments will use experiment_type

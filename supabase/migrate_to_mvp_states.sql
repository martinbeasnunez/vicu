-- Migration: Convert old status values to new MVP cycle states
-- Run this in the Supabase SQL Editor
--
-- OLD STATES: testing, scale, iterate, kill, paused
-- NEW STATES: queued, building, testing, adjusting, achieved, paused, discarded
--
-- MAPPING:
-- testing (Arrancando) → building (Construyendo)
-- scale (En marcha) → testing (Probando)
-- iterate (Ajustando) → adjusting (Ajustando)
-- kill (Cerrado) → achieved (Logrado) - assuming most were completed, not abandoned
-- paused → paused (no change)

-- Step 1: Update experiments table status values
UPDATE experiments
SET status = CASE
    WHEN status = 'testing' THEN 'building'
    WHEN status = 'scale' THEN 'testing'
    WHEN status = 'iterate' THEN 'adjusting'
    WHEN status = 'kill' THEN 'achieved'
    WHEN status = 'paused' THEN 'paused'
    ELSE 'building' -- default for any unexpected values
END
WHERE status IN ('testing', 'scale', 'iterate', 'kill', 'paused');

-- Step 2: Update experiment_checkins for_stage values
UPDATE experiment_checkins
SET for_stage = CASE
    WHEN for_stage = 'testing' THEN 'building'
    WHEN for_stage = 'scale' THEN 'testing'
    WHEN for_stage = 'iterate' THEN 'adjusting'
    WHEN for_stage = 'kill' THEN 'achieved'
    WHEN for_stage = 'paused' THEN 'paused'
    ELSE 'building' -- default for any unexpected values
END
WHERE for_stage IN ('testing', 'scale', 'iterate', 'kill', 'paused');

-- Step 3: Update the default value for new experiments
ALTER TABLE experiments
ALTER COLUMN status SET DEFAULT 'building';

-- Step 4: Update comments for documentation
COMMENT ON COLUMN experiments.status IS 'MVP cycle status: queued, building, testing, adjusting, achieved, paused, discarded';
COMMENT ON COLUMN experiment_checkins.for_stage IS 'MVP cycle stage: queued, building, testing, adjusting, achieved, paused, discarded';

-- Verify the migration worked
SELECT status, COUNT(*) as count FROM experiments GROUP BY status ORDER BY count DESC;
SELECT for_stage, COUNT(*) as count FROM experiment_checkins WHERE for_stage IS NOT NULL GROUP BY for_stage ORDER BY count DESC;

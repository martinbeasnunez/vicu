-- ============================================
-- Add vicu_recommendation field to experiments table
-- This stores AI-generated recommendations when plan is completed
-- ============================================

-- Add the column (JSONB to store structured recommendation data)
ALTER TABLE experiments
ADD COLUMN IF NOT EXISTS vicu_recommendation JSONB;

-- Example structure:
-- {
--   "action": "escalar" | "iterar" | "pausar" | "cerrar",
--   "title": "Recommendation title",
--   "summary": "Short explanation text",
--   "reasons": ["reason 1", "reason 2"],
--   "suggested_next_focus": "What to do next",
--   "generated_at": "2025-01-15T12:00:00Z"
-- }

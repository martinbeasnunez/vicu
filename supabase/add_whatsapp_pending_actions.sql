-- Table to store pending WhatsApp actions
-- This allows us to track what action was sent to the user
-- and process their response (1=done, 2=later, 3=alternative)

CREATE TABLE IF NOT EXISTS whatsapp_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  checkin_id UUID REFERENCES experiment_checkins(id) ON DELETE SET NULL,
  action_text TEXT NOT NULL,
  is_ai_generated BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped', 'alternative_requested')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Indexes for quick lookups
  CONSTRAINT idx_user_status UNIQUE (user_id, status, created_at)
);

-- Index for finding pending actions by user
CREATE INDEX IF NOT EXISTS idx_whatsapp_pending_actions_user
ON whatsapp_pending_actions(user_id, status, expires_at);

-- RLS policies
ALTER TABLE whatsapp_pending_actions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own pending actions
CREATE POLICY "Users can view own pending actions"
ON whatsapp_pending_actions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role full access"
ON whatsapp_pending_actions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

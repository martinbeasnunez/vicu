-- ============================================
-- Add web_push_subscriptions table for browser push notifications
-- ============================================

-- Create table to store web push subscriptions
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'demo-user', -- Single demo user for now
  endpoint TEXT NOT NULL UNIQUE, -- Unique constraint to prevent duplicates
  keys JSONB NOT NULL, -- Contains p256dh and auth keys
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient lookups by user
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id
ON web_push_subscriptions (user_id);

-- Create index for endpoint lookups (for upsert operations)
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_endpoint
ON web_push_subscriptions (endpoint);

-- ============================================
-- CHECK STUCK GENERATIONS - SUPABASE SQL SCRIPTS
-- ============================================

-- QUERY 1: Quick Check - Find all stuck generations (> 2 minutes)
-- This matches the frontend detection threshold
SELECT 
  id,
  status,
  LEFT(prompt, 50) AS prompt_preview,
  model_id,
  created_at,
  NOW() - created_at AS age,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes,
  parameters->>'error' AS error_message,
  parameters->>'lastStep' AS last_step,
  parameters->>'lastHeartbeatAt' AS last_heartbeat,
  (SELECT COUNT(*) FROM outputs WHERE generation_id = generations.id) AS output_count
FROM generations
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC;

-- ============================================
-- QUERY 2: Check specific generation by ID
-- Replace 'YOUR_GENERATION_ID_HERE' with actual ID
-- ============================================
SELECT 
  id,
  status,
  prompt,
  model_id,
  created_at,
  NOW() - created_at AS age,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes,
  parameters,
  parameters->>'error' AS error_message,
  parameters->>'lastStep' AS last_step,
  parameters->>'lastHeartbeatAt' AS last_heartbeat,
  parameters->'debugLogs' AS debug_logs,
  (SELECT COUNT(*) FROM outputs WHERE generation_id = generations.id) AS output_count
FROM generations
WHERE id = 'YOUR_GENERATION_ID_HERE';

-- ============================================
-- QUERY 3: Count stuck generations by model
-- Useful for identifying which models are timing out
-- ============================================
SELECT 
  model_id,
  COUNT(*) AS stuck_count,
  MIN(created_at) AS oldest_stuck,
  MAX(created_at) AS newest_stuck,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) AS avg_age_minutes
FROM generations
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '2 minutes'
GROUP BY model_id
ORDER BY stuck_count DESC;

-- ============================================
-- QUERY 4: Recent activity - All generations from last hour
-- Shows completed, failed, and stuck generations
-- ============================================
SELECT 
  id,
  status,
  LEFT(prompt, 30) AS prompt_preview,
  model_id,
  created_at,
  NOW() - created_at AS age,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes,
  parameters->>'error' AS error_message,
  (SELECT COUNT(*) FROM outputs WHERE generation_id = generations.id) AS output_count
FROM generations
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================
-- QUERY 5: Stuck generations with debug logs
-- Shows the last steps before getting stuck
-- ============================================
SELECT 
  id,
  status,
  LEFT(prompt, 40) AS prompt_preview,
  model_id,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS age_minutes,
  parameters->>'lastStep' AS last_step,
  parameters->>'lastHeartbeatAt' AS last_heartbeat,
  jsonb_array_length(COALESCE(parameters->'debugLogs', '[]'::jsonb)) AS log_count,
  parameters->'debugLogs'->-1 AS last_log_entry
FROM generations
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC;

-- ============================================
-- QUERY 6: Clean up stuck generations (RUN WITH CAUTION!)
-- Marks all stuck generations (> 2 minutes) as failed
-- ============================================
UPDATE generations
SET status = 'failed',
    parameters = jsonb_set(
      COALESCE(parameters, '{}'::jsonb),
      '{error}',
      '"Processing timed out - exceeded Vercel function execution limit"'
    )
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '2 minutes'
RETURNING id, status, LEFT(prompt, 30) AS prompt_preview;

-- ============================================
-- QUERY 7: Clean up specific stuck generation
-- Replace 'YOUR_GENERATION_ID_HERE' with actual ID
-- ============================================
UPDATE generations
SET status = 'failed',
    parameters = jsonb_set(
      COALESCE(parameters, '{}'::jsonb),
      '{error}',
      '"Processing timed out - manually marked as failed"'
    )
WHERE id = 'YOUR_GENERATION_ID_HERE'
  AND status = 'processing'
RETURNING id, status, prompt;

-- ============================================
-- QUERY 8: Summary statistics
-- Overview of all generation statuses
-- ============================================
SELECT 
  status,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) AS avg_age_minutes
FROM generations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;


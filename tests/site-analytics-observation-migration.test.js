import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('觀察統計 migration 與端點 RPC 名稱、參數和 service role 權限一致', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261022000100_site_analytics_observation_counts.sql', import.meta.url), 'utf8');
  assert.match(sql, /create or replace function public\.get_site_analytics_observation_counts\s*\(/i);
  assert.match(sql, /private\.site_analytics_session_rows\s*\(/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.get_site_analytics_observation_counts\(timestamptz, timestamptz, text, text, text, text, text, text\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.get_site_analytics_observation_counts\(timestamptz, timestamptz, text, text, text, text, text, text\) to service_role/i);
  assert.match(sql, /'portfolio_no_form_start'[\s\S]*'cta_no_form_start'[\s\S]*'submit_error'[\s\S]*'error_then_success'/i);
});

import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security, so every route that
// uses this MUST do its own authorization check (see middleware/auth.js
// and each route file). Never send this client's key to the browser.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

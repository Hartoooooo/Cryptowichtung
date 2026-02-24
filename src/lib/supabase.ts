/**
 * Supabase Server-Client (nur für API-Routes, nie im Browser verwenden)
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.warn("Supabase: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env");
}

export const supabaseAdmin = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  : null;

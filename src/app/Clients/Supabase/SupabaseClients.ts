import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function createServerClient() {
  const key = supabaseServiceKey || supabaseAnonKey;
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Test function to check connection
export async function testSupabaseConnection() {
  const { data, error } = await supabase.from('test_table').select('*').limit(1);
  if (error) {
    console.error("Supabase connection error:", error.message);
  } else {
    console.log("Supabase connection successful! Sample data:", data);
  }
}
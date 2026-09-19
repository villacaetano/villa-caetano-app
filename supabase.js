// Supabase client
// Replace these two values with the Project URL and Publishable key from:
// Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
const SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE';

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.supabaseClient = supabase;

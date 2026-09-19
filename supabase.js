// Villa Caetano Supabase client
// This browser app uses the public Publishable key only.
const SUPABASE_URL = 'https://xrbzihjymjahzucnkgcb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bVUGU3ov93IehLv4bMWfMA_OX_3a3Jq';

if (!window.supabase || typeof window.supabase.createClient !== 'function') { throw new Error('Supabase library did not load.'); }
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.supabaseClient = supabase;

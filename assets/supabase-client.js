import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.0/+esm';

const supabaseUrl = 'https://rbxebagnwgmhrepnftwp.supabase.co';
const supabasePublishableKey = 'sb_publishable_lQGlK7JNfYrkDoaOoHSj8w_dUq_QuDa';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

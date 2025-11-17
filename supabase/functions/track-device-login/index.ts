import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, device_id, user_agent } = await req.json();

    if (!user_id || !device_id) {
      throw new Error('user_id and device_id are required.');
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase URL or Service Role Key not found.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Upsert the device record
    const { error: upsertError } = await supabaseAdmin
      .from('user_devices')
      .upsert(
        { user_id, device_id, user_agent, last_login_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id' }
      );

    if (upsertError) {
      console.error("Error upserting user device:", upsertError);
      throw upsertError;
    }

    // Count distinct devices for this user
    const { count, error: countError } = await supabaseAdmin
      .from('user_devices')
      .select('device_id', { count: 'exact' })
      .eq('user_id', user_id);

    if (countError) {
      console.error("Error counting user devices:", countError);
      throw countError;
    }

    const multipleDevicesDetected = (count || 0) > 1;

    return new Response(
      JSON.stringify({ multipleDevicesDetected }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in track-device-login function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
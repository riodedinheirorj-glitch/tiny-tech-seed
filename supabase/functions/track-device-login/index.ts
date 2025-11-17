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

    console.log(`track-device-login: Received request for user_id: ${user_id}, device_id: ${device_id}, user_agent: ${user_agent}`);

    if (!user_id || !device_id) {
      console.error('track-device-login: Missing user_id or device_id');
      throw new Error('user_id and device_id are required.');
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("track-device-login: Supabase URL or Service Role Key not found.");
      throw new Error("Supabase URL or Service Role Key not found.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // First, upsert the current device record. This will either insert a new device
    // or update the last_login_at for an existing device_id for this user.
    console.log(`track-device-login: Upserting device record for user_id: ${user_id}, device_id: ${device_id}`);
    const { error: upsertError } = await supabaseAdmin
      .from('user_devices')
      .upsert(
        { user_id, device_id, user_agent, last_login_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id' } // This requires a UNIQUE constraint on (user_id, device_id)
      );

    if (upsertError) {
      console.error("track-device-login: Error upserting user device:", upsertError);
      throw upsertError;
    }
    console.log(`track-device-login: Device record upserted successfully.`);

    // Now, count distinct devices for this user *after* the upsert
    const { count, error: countError } = await supabaseAdmin
      .from('user_devices')
      .select('device_id', { count: 'exact' })
      .eq('user_id', user_id);

    if (countError) {
      console.error("track-device-login: Error counting user devices:", countError);
      throw countError;
    }

    const multipleDevicesDetected = (count || 0) > 1;
    console.log(`track-device-login: Total distinct devices for user ${user_id}: ${count}. Multiple devices detected: ${multipleDevicesDetected}`);

    return new Response(
      JSON.stringify({ multipleDevicesDetected }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('track-device-login: Error in track-device-login function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
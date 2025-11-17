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
    const { user_id, current_device_id } = await req.json();

    console.log(`logout-other-devices: Received request for user_id: ${user_id}, current_device_id: ${current_device_id}`);

    if (!user_id || !current_device_id) {
      console.error('logout-other-devices: Missing user_id or current_device_id');
      throw new Error('user_id and current_device_id are required.');
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("logout-other-devices: Supabase URL or Service Role Key not found.");
      throw new Error("Supabase URL or Service Role Key not found.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Log current devices before deletion
    const { data: devicesBefore, error: fetchError } = await supabaseAdmin
      .from('user_devices')
      .select('*')
      .eq('user_id', user_id);
    
    if (fetchError) {
      console.error("logout-other-devices: Error fetching devices before deletion:", fetchError);
    } else {
      console.log("logout-other-devices: Devices before deletion:", devicesBefore);
    }

    // Delete all device records for this user, except the current one
    const { error: deleteError, count } = await supabaseAdmin
      .from('user_devices')
      .delete({ count: 'exact' }) // Request exact count of deleted rows
      .eq('user_id', user_id)
      .neq('device_id', current_device_id); // Keep the current device

    if (deleteError) {
      console.error("logout-other-devices: Error deleting other user devices:", deleteError);
      throw deleteError;
    }

    console.log(`logout-other-devices: Successfully deleted ${count} other device records for user ${user_id}.`);

    // Log current devices after deletion
    const { data: devicesAfter, error: fetchAfterError } = await supabaseAdmin
      .from('user_devices')
      .select('*')
      .eq('user_id', user_id);
    
    if (fetchAfterError) {
      console.error("logout-other-devices: Error fetching devices after deletion:", fetchAfterError);
    } else {
      console.log("logout-other-devices: Devices after deletion:", devicesAfter);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Other devices logged out from tracking." }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in logout-other-devices function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
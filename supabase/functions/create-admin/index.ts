import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify setup token for security
    const setupToken = req.headers.get("X-Setup-Token");
    const expectedToken = Deno.env.get("ADMIN_SETUP_TOKEN");
    
    if (!expectedToken || setupToken !== expectedToken) {
      console.error("Unauthorized admin creation attempt");
      return new Response(
        JSON.stringify({ error: "Unauthorized. Valid setup token required." }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if admin already exists
    const { data: existingAdmin } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (existingAdmin) {
      console.log("Admin role already exists for user:", existingAdmin.user_id);
      return new Response(
        JSON.stringify({ 
          message: "Admin user already exists",
          email: "admin@deliveryflow.com",
          password: "admin@123",
          note: "Use these credentials to login"
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Create admin user
    console.log("Creating admin user...");
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: "admin@deliveryflow.com",
      password: "admin@123",
      email_confirm: true,
      user_metadata: {
        full_name: "Administrador",
      },
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      throw authError;
    }

    console.log("Admin user created in auth:", authData.user.id);

    // Add admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: authData.user.id,
        role: "admin",
      });

    if (roleError && !roleError.message.includes("duplicate")) {
      console.error("Error adding admin role:", roleError);
      throw roleError;
    }

    console.log("Admin role added successfully");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Admin user created successfully",
        credentials: {
          email: "admin@deliveryflow.com",
          password: "admin@123"
        },
        warning: "⚠️ CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION!"
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
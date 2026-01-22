// @ts-nocheck
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[admin-user-actions] Missing Authorization header');
      return new Response('Unauthorized: Missing Authorization header', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userAuth, error: userAuthError } = await supabaseAdmin.auth.getUser(token);
    if (userAuthError || !userAuth.user) {
      console.error('[admin-user-actions] Auth error:', userAuthError);
      return new Response('Unauthorized: Invalid token', { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, church_id')
      .eq('id', userAuth.user.id)
      .single();

    if (profileError || !profile) {
      console.error('[admin-user-actions] Profile error:', profileError);
      return new Response('Forbidden: User profile not found or accessible', { status: 403, headers: corsHeaders });
    }

    const callerRole = profile.role;
    const callerChurchId = profile.church_id;
    const isAdminOrGeneral = callerRole === 'admin' || callerRole === 'general';

    const body = await req.json();
    const action = body.action;
    const churchId = body.churchId;
    const userId = body.userId;
    const role = body.role;

    console.log('[admin-user-actions] Edge Function received action:', action);

    switch (action) {
      case 'listChurchUsers': {
        if (!churchId) {
          console.error('[admin-user-actions] Church ID is required for listChurchUsers');
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          console.error('[admin-user-actions] Forbidden: Caller can only view users from their assigned church.');
          return new Response('Forbidden: You can only view users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select(`
            id,
            email,
            first_name,
            last_name,
            role,
            updated_at,
            church_id
          `)
          .eq('church_id', churchId);

        if (error) {
          console.error('[admin-user-actions] Error listing church users:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const formattedData = (data || []).map((p: any) => ({
          ...p,
          status: 'confirmed',
          invited_at: p.updated_at,
          confirmed_at: p.updated_at,
        }));

        return new Response(JSON.stringify(formattedData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listAvailableChurchCandidates': {
        if (!churchId) {
          console.error('[admin-user-actions] Church ID is required for listAvailableChurchCandidates');
          return new Response(JSON.stringify({ error: 'Church ID is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Admin/General: pueden ver candidatos de cualquier iglesia o sin iglesia
        // Otros: solo pueden ver usuarios sin iglesia (church_id IS NULL)
        let query = supabaseAdmin
          .from('profiles')
          .select('id, email, first_name, last_name, church_id');

        if (isAdminOrGeneral) {
          query = query.or(`church_id.is.null,church_id.neq.${churchId}`);
        } else {
          query = query.is('church_id', null);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[admin-user-actions] Error listing candidates:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(data || []), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'addUserToChurch': {
        if (!churchId || !userId) {
          console.error('[admin-user-actions] churchId and userId required for addUserToChurch');
          return new Response(JSON.stringify({ error: 'churchId and userId are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          console.error('[admin-user-actions] Forbidden: Non-admin trying to add user to different church', { callerChurchId, churchId });
          return new Response('Forbidden: You can only add users to your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ church_id: churchId })
          .eq('id', userId);

        if (error) {
          console.error('[admin-user-actions] Error adding user to church:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'removeUserFromChurch': {
        if (!churchId || !userId) {
          console.error('[admin-user-actions] churchId and userId required for removeUserFromChurch');
          return new Response(JSON.stringify({ error: 'churchId and userId are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Validar que el caller actúe sobre su propia iglesia o sea admin/general
        if (!isAdminOrGeneral && callerChurchId !== churchId) {
          console.error('[admin-user-actions] Forbidden: Non-admin trying to remove user from different church', { callerChurchId, churchId });
          return new Response('Forbidden: You can only remove users from your assigned church.', { status: 403, headers: corsHeaders });
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ church_id: null })
          .eq('id', userId);

        if (error) {
          console.error('[admin-user-actions] Error removing user from church:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'updateUserChurchRole': {
        if (!userId || !role) {
          console.error('[admin-user-actions] userId and role required for updateUserChurchRole');
          return new Response(JSON.stringify({ error: 'userId and role are required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Solo admin/general pueden asignar roles admin/general
        const elevatedRoles = ['admin', 'general'];
        if (elevatedRoles.includes(role) && !isAdminOrGeneral) {
          console.error('[admin-user-actions] Forbidden: Non-admin assigning elevated role', { role });
          return new Response('Forbidden: Only administrators can assign admin/general roles.', { status: 403, headers: corsHeaders });
        }

        // Si no es admin/general, asegurar que el usuario objetivo esté en su iglesia
        if (!isAdminOrGeneral) {
          const { data: target, error: targetErr } = await supabaseAdmin
            .from('profiles')
            .select('church_id')
            .eq('id', userId)
            .single();
          if (targetErr || !target || target.church_id !== callerChurchId) {
            console.error('[admin-user-actions] Forbidden: Non-admin changing role outside their church');
            return new Response('Forbidden: You can only change roles for users in your church.', { status: 403, headers: corsHeaders });
          }
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ role })
          .eq('id', userId);

        if (error) {
          console.error('[admin-user-actions] Error updating user role:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        console.warn('[admin-user-actions] Invalid action received:', action);
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('[admin-user-actions] Edge Function unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
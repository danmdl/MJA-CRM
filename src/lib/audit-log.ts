// Audit logging for sensitive admin actions.
//
// Writes to the activity_logs table (separate from client_logs, which is
// for auth/debug events). Every row has user_id, action, entity_type,
// entity_id, plus optional before/after JSONB snapshots so we can answer
// "who changed what" after the fact — useful for incident response if a
// permission or role gets flipped to something wrong.
//
// Fire-and-forget: failures here MUST NOT block the caller. If the
// insert fails (RLS, network, whatever) we swallow the error rather
// than rolling back the user's actual action. Audit gaps are recoverable;
// failing to delete a contact the user just clicked is not.

import { supabase } from '@/integrations/supabase/client';

export type AdminAction =
  | 'role_change'
  | 'permissions_change'
  | 'bulk_delete_contacts'
  | 'bulk_restore_contacts'
  | 'csv_import_contacts'
  | 'csv_import_cells'
  | 'impersonation_started'
  | 'church_create'
  | 'church_delete'
  | 'cuerda_delete'
  | 'cell_close'
  | 'cell_reopen';

interface LogAdminActionInput {
  action: AdminAction;
  entityType: string;
  /** UUID of the entity acted upon (or a synthetic UUID for bulk actions). */
  entityId: string;
  churchId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

/**
 * Resolve the current user id once and cache it for the session — every
 * audit insert needs it and re-fetching from getSession() each time is
 * wasteful. Cleared on auth state change in SessionProvider, but for
 * audit purposes a slightly-stale cache is fine: we always have either
 * "the logged-in user" or null (nobody to attribute the action to).
 */
let cachedUserId: string | null | undefined = undefined;
export const resetAuditUserCache = () => { cachedUserId = undefined; };

const getCurrentUserId = async (): Promise<string | null> => {
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    cachedUserId = data.session?.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
};

export const logAdminAction = async (input: LogAdminActionInput): Promise<void> => {
  try {
    const userId = await getCurrentUserId();
    await supabase.from('activity_logs').insert({
      user_id: userId,
      church_id: input.churchId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      before_data: input.beforeData ?? null,
      after_data: input.afterData ?? null,
    });
  } catch {
    // Audit insert MUST NOT throw into the caller. Caller already
    // succeeded at the real action; missing one audit row is acceptable.
  }
};

-- This migration creates the 'permissions' table if it doesn't exist
-- and adds a 'change_user_role' column.

CREATE TABLE IF NOT EXISTS public.permissions (
    role text PRIMARY KEY,
    see_all_churches boolean DEFAULT FALSE,
    access_all_churches boolean DEFAULT FALSE,
    add_users boolean DEFAULT FALSE,
    edit_delete_users boolean DEFAULT FALSE,
    see_all_analytics boolean DEFAULT FALSE,
    see_own_church_analytics boolean DEFAULT FALSE,
    change_user_role boolean DEFAULT FALSE -- New column
);

-- Insert default permissions if the table is empty
INSERT INTO public.permissions (role, see_all_churches, access_all_churches, add_users, edit_delete_users, see_all_analytics, see_own_church_analytics, change_user_role)
VALUES
    ('admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('general', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('pastor', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('referente', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('encargado_de_celula', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('user', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO UPDATE SET
    see_all_churches = EXCLUDED.see_all_churches,
    access_all_churches = EXCLUDED.access_all_churches,
    add_users = EXCLUDED.add_users,
    edit_delete_users = EXCLUDED.edit_delete_users,
    see_all_analytics = EXCLUDED.see_all_analytics,
    see_own_church_analytics = EXCLUDED.see_own_church_analytics,
    change_user_role = EXCLUDED.change_user_role; -- Update new column on conflict

-- Add the new column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'change_user_role') THEN
        ALTER TABLE public.permissions ADD COLUMN change_user_role boolean DEFAULT FALSE;
        -- Update existing rows for 'admin' and 'general' to TRUE for the new column
        UPDATE public.permissions SET change_user_role = TRUE WHERE role IN ('admin', 'general');
    END IF;
END
$$;
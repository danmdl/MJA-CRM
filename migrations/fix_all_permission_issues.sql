-- Fix 1: Update permissions table to allow pastors to change user roles
UPDATE public.permissions 
SET change_user_role = TRUE 
WHERE role IN ('pastor', 'referente');

-- Fix 2: Verify the permissions are updated
SELECT role, change_user_role, see_all_churches, access_all_churches, add_users, edit_delete_users, see_all_analytics, see_own_church_analytics 
FROM public.permissions 
WHERE role IN ('admin', 'general', 'pastor', 'referente', 'encargado_de_celula', 'user');

-- Fix 3: Update any existing user profiles that might have null roles
UPDATE public.profiles 
SET role = 'user' 
WHERE role IS NULL;

-- Fix 4: Ensure admin users have proper permissions (should already be true but let's be explicit)
UPDATE public.permissions 
SET see_all_churches = TRUE, access_all_churches = TRUE, add_users = TRUE, edit_delete_users = TRUE, see_all_analytics = TRUE, see_own_church_analytics = TRUE 
WHERE role = 'admin';

-- Fix 5: Ensure general users have proper permissions (should already be true but let's be explicit)
UPDATE public.permissions 
SET see_all_churches = TRUE, access_all_churches = TRUE, add_users = TRUE, edit_delete_users = TRUE, see_all_analytics = TRUE, see_own_church_analytics = TRUE 
WHERE role = 'general';

-- Fix 6: Clean up any duplicate permission entries
DELETE FROM public.permissions 
WHERE ctid NOT IN (
    SELECT ctid FROM public.permissions WHERE role IN ('admin', 'general', 'pastor', 'referente', 'encargado_de_celula', 'user')
);

-- Fix 7: Recreate the permissions table cleanly
INSERT INTO public.permissions (role, see_all_churches, access_all_churches, add_users, edit_delete_users, see_all_analytics, see_own_church_analytics, change_user_role)
VALUES
    ('admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('general', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('pastor', FALSE, FALSE, FALSE, FALSE, TRUE, TRUE),
    ('referente', FALSE, FALSE, FALSE, FALSE, TRUE, TRUE),
    ('encargado_de_celula', FALSE, FALSE, FALSE, FALSE, TRUE, TRUE),
    ('user', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO NOTHING;
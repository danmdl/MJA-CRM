-- Update permissions to allow pastors and referentes to manage user roles within their church
UPDATE public.permissions 
SET change_user_role = TRUE 
WHERE role IN ('pastor', 'referente');

-- This will allow pastors and referentes to change user roles for users in their assigned church
-- but they still cannot assign admin or general roles (that restriction remains in the Edge Function)
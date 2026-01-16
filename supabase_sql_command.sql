-- Update permissions to allow pastors and referentes to manage user roles within their church
UPDATE public.permissions 
SET change_user_role = TRUE 
WHERE role IN ('pastor', 'referente');
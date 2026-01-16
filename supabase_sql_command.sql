ALTER TABLE public.permissions ADD COLUMN change_user_role boolean DEFAULT FALSE;
UPDATE public.permissions SET change_user_role = TRUE WHERE role IN ('admin', 'general');
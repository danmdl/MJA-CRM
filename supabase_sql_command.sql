ALTER TABLE public.permissions ADD COLUMN temp_refresh_col BOOLEAN DEFAULT FALSE;
ALTER TABLE public.permissions DROP COLUMN temp_refresh_col;
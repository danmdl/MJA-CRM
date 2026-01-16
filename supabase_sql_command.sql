-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated users to read permissions" ON public.permissions;
DROP POLICY IF EXISTS "Allow admin and general to manage permissions" ON public.permissions;

-- Policy for SELECT: Allow all authenticated users to read permissions
CREATE POLICY "Allow authenticated users to read permissions"
ON public.permissions FOR SELECT
USING (TRUE);

-- Policy for INSERT: Allow admin and general roles to insert new permission rows
CREATE POLICY "Allow admin and general to insert permissions"
ON public.permissions FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'general')));

-- Policy for UPDATE: Allow admin and general roles to update existing permission rows
CREATE POLICY "Allow admin and general to update permissions"
ON public.permissions FOR UPDATE
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'general')))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'general')));

-- Policy for DELETE: Allow admin and general roles to delete permission rows
CREATE POLICY "Allow admin and general to delete permissions"
ON public.permissions FOR DELETE
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'general')));
-- Policy for SELECT: Allow all authenticated users to read permissions
CREATE POLICY "Allow authenticated users to read permissions"
ON public.permissions FOR SELECT
TO authenticated USING (TRUE);

-- Policy for INSERT, UPDATE, DELETE: Allow admin and general roles to manage permissions
CREATE POLICY "Allow admin and general to manage permissions"
ON public.permissions FOR ALL
TO authenticated
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'general')));
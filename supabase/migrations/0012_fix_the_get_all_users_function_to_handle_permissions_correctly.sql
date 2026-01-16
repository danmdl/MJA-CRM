CREATE OR REPLACE FUNCTION public.get_all_users()
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, role user_role, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  -- Check if caller is admin or general
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE public.profiles.id = auth.uid() 
    AND public.profiles.role IN ('admin', 'general')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Return user data
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    p.first_name,
    p.last_name,
    p.role,
    COALESCE(p.updated_at, p.created_at, NOW()) as updated_at
  FROM
    auth.users u
  JOIN
    public.profiles p ON u.id = p.id
  ORDER BY
    COALESCE(p.updated_at, p.created_at) DESC;
END;
$function$;
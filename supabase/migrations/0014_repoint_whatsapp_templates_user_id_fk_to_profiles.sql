-- Repoint whatsapp_templates.user_id FK from auth.users to public.profiles.
-- This is required for PostgREST to resolve the embedded relationship
-- `profiles(first_name, last_name)` used in the frontend SELECT.
-- Referential integrity is preserved transitively: profiles.id -> auth.users.id.

ALTER TABLE whatsapp_templates
DROP CONSTRAINT whatsapp_templates_user_id_fkey;

ALTER TABLE whatsapp_templates
ADD CONSTRAINT whatsapp_templates_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

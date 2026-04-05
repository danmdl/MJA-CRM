-- Add can_use_templates permission to control access to WhatsApp templates.
-- Defaults to true so existing roles retain template access.
ALTER TABLE permissions
ADD COLUMN IF NOT EXISTS can_use_templates boolean NOT NULL DEFAULT true;

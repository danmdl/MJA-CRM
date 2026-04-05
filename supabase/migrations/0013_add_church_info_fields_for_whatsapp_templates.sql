-- Add church information fields for WhatsApp templates
ALTER TABLE churches 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS hours TEXT;

-- Add helpful comment
COMMENT ON COLUMN churches.address IS 'Physical address of the church for WhatsApp templates';
COMMENT ON COLUMN churches.website IS 'Church website URL for WhatsApp templates';
COMMENT ON COLUMN churches.hours IS 'Service hours/schedule for WhatsApp templates';

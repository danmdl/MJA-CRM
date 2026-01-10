-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  role TEXT PRIMARY KEY,
  see_all_churches BOOLEAN DEFAULT FALSE NOT NULL,
  access_all_churches BOOLEAN DEFAULT FALSE NOT NULL,
  add_users BOOLEAN DEFAULT FALSE NOT NULL,
  edit_delete_users BOOLEAN DEFAULT FALSE NOT NULL,
  see_all_analytics BOOLEAN DEFAULT FALSE NOT NULL,
  see_own_church_analytics BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Create policy for all authenticated users to read permissions
CREATE POLICY "Permissions are viewable by all authenticated users" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy only for admins to update permissions
CREATE POLICY "Only admins can update permissions" ON permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_permissions_updated_at 
  BEFORE UPDATE ON permissions 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default permissions
INSERT INTO permissions (role, see_all_churches, access_all_churches, add_users, edit_delete_users, see_all_analytics, see_own_church_analytics) VALUES
  ('admin', true, true, true, true, true, true),
  ('general', true, true, true, true, true, true),
  ('pastor', false, false, false, false, false, true),
  ('reference', false, false, false, false, false, true),
  ('encargado_de_celula', false, false, false, false, false, true),
  ('user', false, false, false, false, false, false)
ON CONFLICT (role) DO NOTHING;

-- MIGRATION: Update existing users with 'piloto' role to 'reference'
UPDATE profiles SET role = 'reference' WHERE role = 'piloto';
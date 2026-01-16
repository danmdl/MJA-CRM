CREATE TABLE public.permissions (
    role text NOT NULL,
    see_all_churches boolean DEFAULT FALSE NOT NULL,
    access_all_churches boolean DEFAULT FALSE NOT NULL,
    add_users boolean DEFAULT FALSE NOT NULL,
    edit_delete_users boolean DEFAULT FALSE NOT NULL,
    see_all_analytics boolean DEFAULT FALSE NOT NULL,
    see_own_church_analytics boolean DEFAULT FALSE NOT NULL,
    change_user_role boolean DEFAULT FALSE NOT NULL,
    CONSTRAINT permissions_pkey PRIMARY KEY (role)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Insert default permissions for all roles
INSERT INTO public.permissions (role, see_all_churches, access_all_churches, add_users, edit_delete_users, see_all_analytics, see_own_church_analytics, change_user_role)
VALUES
    ('admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('general', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('pastor', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('referente', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('encargado_de_celula', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('user', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO NOTHING;
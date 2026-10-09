-- The CSV importer's 'estado' alias for estado_seguimiento substring-
-- matched the "Estado civil" column, so marital status ('No brindó
-- información', 'Soltero', 'Casado', ...) was imported into
-- estado_seguimiento and estado_civil stayed null (8,453 rows incl.
-- trashed). Move the value to estado_civil where it's empty and reset
-- seguimiento to the default stage. Applied 2026-10-09; original values
-- kept in backup.contacts_estado_fix_20261009 (schema not exposed to the
-- API). Re-running is a no-op once no invalid stages remain.

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.contacts_estado_fix_20261009 as
  select id, estado_seguimiento, estado_civil, conector, responsable_id, numero_cuerda, now() as backed_up_at
  from public.contacts
  where estado_seguimiento is not null
    and estado_seguimiento not in ('nuevo','nuevas_personas_domingos','nuevas_personas_celulas','liberacion',
                                   'pre_encuentro','encuentro','post_encuentro','abc','nivel_1','nivel_2');

update public.contacts c
  set estado_civil = coalesce(c.estado_civil, c.estado_seguimiento),
      estado_seguimiento = 'nuevo'
  where c.estado_seguimiento is not null
    and c.estado_seguimiento not in ('nuevo','nuevas_personas_domingos','nuevas_personas_celulas','liberacion',
                                     'pre_encuentro','encuentro','post_encuentro','abc','nivel_1','nivel_2');

-- Revert:
-- update public.contacts c set estado_seguimiento = b.estado_seguimiento, estado_civil = b.estado_civil
--   from backup.contacts_estado_fix_20261009 b where b.id = c.id;

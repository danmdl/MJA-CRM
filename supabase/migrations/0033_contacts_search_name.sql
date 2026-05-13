-- Accent-insensitive search across the app.
--
-- Dan reported (correctly) that searching "maría" and "maria" was
-- returning different contacts in Rutas / MapPicker / etc — accents
-- were leaking into the comparison. The client-side fix is to
-- normalize() both sides before .includes(); the server-side fix is
-- this column.
--
-- search_name holds the unaccent(lower(first_name + ' ' + last_name))
-- form of each contact, kept in sync via trigger so the contacts table
-- can be searched with a plain ilike against the normalized query.
-- Existing rows are backfilled in this migration.
--
-- Wrapper is needed because Postgres's unaccent() is marked STABLE
-- (depends on the dictionary file), not IMMUTABLE — that's fine for
-- function calls but blocks expression indexes and generated columns.
-- The wrapper is IMMUTABLE which is enough for our usage and is the
-- standard "I promise the dictionary doesn't change at runtime"
-- pattern Postgres tutorials recommend.

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text AS $$
    SELECT public.unaccent('public.unaccent', $1);
  $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS search_name text;

CREATE OR REPLACE FUNCTION public.refresh_contact_search_name()
  RETURNS trigger AS $$
  BEGIN
    NEW.search_name := public.immutable_unaccent(
      lower(
        coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')
      )
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_refresh_search_name ON contacts;
CREATE TRIGGER contacts_refresh_search_name
  BEFORE INSERT OR UPDATE OF first_name, last_name
  ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_contact_search_name();

-- Backfill existing rows.
UPDATE contacts
SET search_name = public.immutable_unaccent(
  lower(
    coalesce(first_name, '') || ' ' || coalesce(last_name, '')
  )
)
WHERE search_name IS NULL;

-- Trigram index for fast substring search. pg_trgm isn't installed
-- yet so we create the extension first; if it's already there the
-- IF NOT EXISTS no-ops. Without trigram support `ilike '%x%'` does a
-- sequential scan, which on a 30k-row table is fine but at 200k+ it
-- bites — the index buys us headroom for free.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS contacts_search_name_trgm_idx
  ON contacts USING gin (search_name gin_trgm_ops);

-- Location-aware MFA trust.
--
-- Adds the last known IP geolocation to each trusted device so the
-- MFA gate can skip the challenge when the user logs in from a
-- region they've already verified MFA from — not just from a device
-- they've already trusted. Dan was getting prompted constantly even
-- on devices he uses every day; pairing device-trust with
-- location-trust drops the prompts to "only when something actually
-- looks suspicious".
--
-- Trust rule (implemented in MfaGate):
--   1. Same device (device_id_hash matches) → skip MFA.
--   2. Different device but current IP is in the same country AND
--      same region/city as ANY of the user's trusted devices → skip
--      MFA. The user has previously proved both factors from this
--      region, so a new browser in the same neighborhood is treated
--      as a soft-trusted device.
--   3. Otherwise → challenge.
--
-- IP geolocation happens client-side via ipapi.co (free, no key
-- required, ~1000 req/day). If the lookup fails, the trust check
-- falls back to device-trust only — fail-closed.

ALTER TABLE trusted_devices
  ADD COLUMN IF NOT EXISTS last_country text,
  ADD COLUMN IF NOT EXISTS last_region  text,
  ADD COLUMN IF NOT EXISTS last_city    text;

-- Quick lookups for the location-trust check: we'll query rows by
-- (user_id, last_country, last_region) when comparing the current IP's
-- region to the user's trusted regions. Partial index keeps it slim
-- — rows without location data don't participate.
CREATE INDEX IF NOT EXISTS trusted_devices_user_location_idx
  ON trusted_devices (user_id, last_country, last_region)
  WHERE last_country IS NOT NULL;

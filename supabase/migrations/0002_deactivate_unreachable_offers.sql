-- Korido 0002 — deactivate providers we cannot price with integrity.
--
-- 0001 seeded seven send providers as a target list. Four can be priced from
-- their own public calculators (wise, lemfi, sendwave, taptap). Three cannot,
-- and the board must not carry rows we can never fill: a permanently dead row
-- reads either as our site being broken or as the provider being down, and
-- neither is true.
--
-- Investigated 2026-08-09. Each fails for a different reason, and none can be
-- solved without misrepresenting who we are:
--
--   remitly    — api.remitly.io/v3/calculator/estimate is real and public, but
--                returns 429 NOT_ALLOWED to unrecognised clients after a few
--                requests. That is their server explicitly refusing us. Getting
--                past it means impersonating their app.
--
--   worldremit — the pricing calculator on worldremit.com is behind a
--                PerimeterX bot check ("Click and hold to help us verify you").
--                That is an access control, not a public price list.
--
--   xe         — no public transfer-pricing surface found. The open
--                xe.com/currencyconverter endpoint is the MID-MARKET rate, not
--                Xe's offer, which carries their margin — publishing it as
--                Xe's price would be inventing a number. Their robots.txt also
--                disallows /currencytransfers/.
--
-- Deactivated rather than deleted: `active` is exactly the reversible switch
-- this needs. Spec §8 week 3 includes direct outreach to provider partner
-- contacts — if any of the three grants API access, flip the flag back and
-- write the adapter. The providers stay in the catalog so that history is not
-- lost.

update offers
set active = false
where vertical_id = 'send'
  and provider_id in ('remitly', 'worldremit', 'xe');

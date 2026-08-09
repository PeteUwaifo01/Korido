-- Korido 0004 — add Rebtel to the top-up vertical.
--
-- Top-up is an added service for traffic and referral, NOT a comparison. That
-- distinction is why this looks different from the send vertical.
--
-- Investigated 2026-08-09. Of the airtime providers serving US→NG/GH/KE, only
-- Rebtel's pages are open to us at all — Ding returns 403 on everything,
-- Recharge.com's robots.txt disallows the whole site, WorldRemit Airtime sits
-- behind PerimeterX, MobileRecharge behind a Cloudflare challenge, and Reloadly
-- is a seller API, which is the funds perimeter rather than a price source.
-- LemFi, Taptap and Sendwave do not sell airtime at all.
--
-- And even Rebtel's prices cannot be collected honestly: they are only revealed
-- after submitting a recipient's phone number, and there are no per-operator
-- pages. Any number we chose to probe with belongs to a real person, and we
-- would be sending it to a third party on a schedule. So this offer carries NO
-- quotes, and the airtime page publishes no prices — it names the operators
-- each country supports and refers onward. Nothing is invented.
--
-- If Rebtel (or anyone) later grants price access, add an adapter and the
-- collector picks it up: the offer row is already here.

insert into providers (id, name, homepage)
values ('rebtel', 'Rebtel', 'https://www.rebtel.com')
on conflict (id) do nothing;

insert into offers (provider_id, vertical_id, corridor_id)
select 'rebtel', 'topup', c.id from corridors c
on conflict (provider_id, vertical_id, corridor_id) do nothing;

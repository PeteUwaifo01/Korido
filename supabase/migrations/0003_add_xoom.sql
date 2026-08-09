-- Korido 0003 — add Xoom (PayPal) to the send vertical.
--
-- Xoom was not in the 0001 seed. It earns a place because its public corridor
-- pages expose a guest calculator we can read openly: the page hands every
-- anonymous visitor a CSRF token, and POST /wapi/guest-app/remittance returns
-- real pricing for a given amount. No login, no account, no bot challenge.
-- Verified live 2026-08-09 on all three corridors (NG/GH/KE) via ACH at $0 fee.
--
-- Ria was investigated in the same pass and is NOT added: its marketing site
-- loads, but public.riamoneytransfer.com resets the connection on every
-- request from a non-browser client (three attempts, curl and Node alike).
-- That is a refusal, so it joins Remitly, WorldRemit and Xe as providers we
-- will not misrepresent ourselves to reach.
--
-- speed_label is left null: it is no longer displayed anywhere. Delivery times
-- now come only from providers that state them per quote.

insert into providers (id, name, homepage)
values ('xoom', 'Xoom', 'https://www.xoom.com')
on conflict (id) do nothing;

insert into offers (provider_id, vertical_id, corridor_id)
select 'xoom', 'send', c.id from corridors c
on conflict (provider_id, vertical_id, corridor_id) do nothing;

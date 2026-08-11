-- ============================================================
--  Marketing dashboard - seeddata
--  De vier vaste vestigingen met vaste slugs (technische ID's).
--  Idempotent: opnieuw uitvoeren werkt namen/kleuren bij, maakt geen
--  duplicaten (slug is uniek).
--
--  Voer dit uit NA schema.sql en policies.sql.
-- ============================================================

insert into public.companies (slug, name, accent_color) values
  ('hans-grietje',         'Hans & Grietje',            '#2f5233'),
  ('de-betovering',        'De Betovering',             '#7a4fa0'),
  ('heksenblotevoetenpad', 'Het Heksenblotevoetenpad',  '#b57e14'),
  ('grote-kabouterbos',    'Het Grote Kabouterbos',     '#9c2d21')
on conflict (slug) do update
  set name = excluded.name,
      accent_color = excluded.accent_color;

-- ============================================================
--  EERSTE ADMIN AANMAKEN (handmatige stap - zie README)
--  Nadat je je eigen account hebt aangemaakt via de app (of via
--  Authentication > Users in het dashboard), promoveer je jezelf:
--
--    update public.profiles
--    set role = 'admin', is_active = true
--    where email = 'jouw@email.nl';
--
--  Koppel jezelf daarna aan alle vier de vestigingen (optioneel voor
--  een admin, want admins zien altijd alles; handig voor consistentie):
--
--    insert into public.company_members (user_id, company_id)
--    select p.id, c.id
--    from public.profiles p cross join public.companies c
--    where p.email = 'jouw@email.nl'
--    on conflict do nothing;
-- ============================================================

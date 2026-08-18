-- ============================================================
--  OPTIONELE migratie: Facebook-posts zonder tijd opschonen
--  ------------------------------------------------------------
--  Aanleiding
--  ----------
--  Vóór de parser-fix werd de TIJD van Facebook-posts niet ingelezen
--  (published_time bleef leeg). De dedup-sleutel bevat de tijd, dus
--  na de fix krijgen dezelfde posts een ANDERE sleutel wanneer je het
--  bestand opnieuw importeert. Zonder opschoning zou je dan naast de
--  oude (tijdloze) post een nieuwe (mét tijd) post krijgen.
--
--  Dit script VERWIJDERT NIETS automatisch. Het helpt je eerst kijken
--  wat er speelt; de verwijderstap staat bewust in commentaar.
--
--  Draai dit in de Supabase SQL Editor. Vervang eventueel de
--  vestigingsfilter als je maar één locatie wil opschonen.
-- ============================================================

-- 1) INZICHT: hoeveel Facebook-posts hebben nog GEEN tijd?
--    (Dit zijn de kandidaten die na een her-import dubbel kunnen komen.)
select
  c.name                              as vestiging,
  count(*)                            as facebook_posts_zonder_tijd,
  min(p.published_date)               as vroegste,
  max(p.published_date)               as laatste
from public.posts p
join public.companies c on c.id = p.company_id
where p.platform = 'Facebook'
  and (p.published_time is null or p.published_time = '')
group by c.name
order by c.name;

-- 2) DETAIL: bekijk de betreffende posts vóór je iets verwijdert.
--    Zo kun je met eigen ogen controleren of dit inderdaad de oude
--    imports zijn die je opnieuw gaat inladen (mét tijd).
-- select p.id, c.name, p.published_date, p.published_time, p.caption,
--        p.likes, p.reach, p.views, p.source_file_name, p.created_at
-- from public.posts p
-- join public.companies c on c.id = p.company_id
-- where p.platform = 'Facebook'
--   and (p.published_time is null or p.published_time = '')
-- order by c.name, p.published_date;

-- 3) OPSCHONEN (pas toe NA controle van stap 1 en 2).
--    Aanpak A — aanbevolen: verwijder de oude tijdloze Facebook-posts
--    en importeer daarna de bijbehorende Excel-bestanden opnieuw. De
--    nieuwe import zet de tijd én (indien aanwezig) de saves goed.
--
--    Verwijder ALLE tijdloze Facebook-posts:
-- delete from public.posts
-- where platform = 'Facebook'
--   and (published_time is null or published_time = '');
--
--    ...of alleen voor één vestiging (vul de slug in):
-- delete from public.posts p
-- using public.companies c
-- where p.company_id = c.id
--   and c.slug = 'de-betovering'
--   and p.platform = 'Facebook'
--   and (p.published_time is null or p.published_time = '');

-- Opmerking: door de koppeltabel import_posts (on delete set null /
-- cascade in het schema) blijft de importgeschiedenis intact; alleen de
-- postrijen verdwijnen. Daarna kun je veilig opnieuw importeren.

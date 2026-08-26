\set ON_ERROR_STOP on
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

create or replace function assert(ok boolean, what text) returns void
language plpgsql as $$ begin
  if not ok then raise exception 'FALLO: %', what; end if;
  raise notice 'ok  %', what;
end $$;

-- ---- A crea su grupo, B crea el suyo -------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select create_group('grp_A', 'Los de Ana', 'AAAA');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select create_group('grp_B', 'Los de Bea', 'BBBB');

-- ---- A mete una partida con puntuaciones ---------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into matches (id, group_id, template_id, game_name, join_code, status, started_at)
  values ('mtc_1', 'grp_A', 'catan', 'Catan', 'WXYZ', 'live', now());
insert into seats (id, group_id, match_id, player_id, player_name, seat_order)
  values ('sea_1', 'grp_A', 'mtc_1', 'ply_1', 'Ana', 0);
insert into score_entries (id, group_id, match_id, seat_id, category_key, value, recorded_at, device_id)
  values ('scr_1', 'grp_A', 'mtc_1', 'sea_1', 'cities', 3, 1700000000000, 'dev_1');

select assert((select count(*) from matches) = 1, 'A ve su propia partida');

-- ---- AISLAMIENTO: B no debe ver nada de A --------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select assert((select count(*) from matches)      = 0, 'B NO ve las partidas de A');
select assert((select count(*) from seats)        = 0, 'B NO ve los asientos de A');
select assert((select count(*) from score_entries)= 0, 'B NO ve las puntuaciones de A');
select assert((select count(*) from groups where id = 'grp_A') = 0, 'B NO ve el grupo de A');

-- ---- B no puede escribir en el grupo de A --------------------------------
do $$ begin
  insert into matches (id, group_id, template_id, game_name, join_code, status, started_at)
    values ('mtc_hack', 'grp_A', 'catan', 'Colada', 'HACK', 'live', now());
  raise exception 'FALLO: B pudo escribir en el grupo de A';
exception when insufficient_privilege then
  raise notice 'ok  B NO puede escribir en el grupo de A';
end $$;

-- ---- Ni siquiera colandose por su propio grupo ---------------------------
do $$ begin
  insert into group_members (group_id, user_id)
    values ('grp_A', '22222222-2222-2222-2222-222222222222');
  raise exception 'FALLO: B se auto-agrego al grupo de A';
exception when insufficient_privilege then
  raise notice 'ok  B NO puede auto-agregarse a un grupo';
end $$;

-- ---- APPEND-ONLY: nadie puede modificar una puntuacion -------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  update score_entries set value = 999 where id = 'scr_1';
  raise exception 'FALLO: se pudo MODIFICAR una puntuacion';
exception when insufficient_privilege then
  raise notice 'ok  nadie puede MODIFICAR una puntuacion (append-only)';
end $$;

select assert((select value from score_entries where id = 'scr_1') = 3, 'la puntuacion sigue intacta');

-- ---- Deshacer si funciona (delete) ---------------------------------------
insert into score_entries (id, group_id, match_id, seat_id, category_key, value, recorded_at, device_id)
  values ('scr_2', 'grp_A', 'mtc_1', 'sea_1', 'cities', 5, 1700000000001, 'dev_1');
delete from score_entries where id = 'scr_2';
select assert((select count(*) from score_entries) = 1, 'deshacer (delete) si funciona');

-- ---- B se une con el codigo y ahora si ve ---------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select join_group('aaaa');   -- en minuscula a proposito
select assert((select count(*) from matches)       = 1, 'tras unirse, B SI ve la partida');
select assert((select count(*) from score_entries) = 1, 'tras unirse, B SI ve las puntuaciones');

-- ---- Codigo inventado ------------------------------------------------------
do $$ begin
  perform join_group('ZZZZ');
  raise exception 'FALLO: se acepto un codigo inexistente';
exception when raise_exception then
  raise notice 'ok  un codigo inexistente se rechaza';
end $$;

-- ---- Sin sesion no se ve nada ---------------------------------------------
reset role;
set role anon;
do $$ begin
  perform count(*) from matches;
  raise exception 'FALLO: sin sesion se pudo leer';
exception when insufficient_privilege then
  raise notice 'ok  sin sesion NO se lee nada';
end $$;

reset role;

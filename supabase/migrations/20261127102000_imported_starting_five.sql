-- Keep the optional imported starters with the match.
create or replace function public.import_historical_boxscore(
  p_team uuid, p_date date, p_opponent text, p_home boolean, p_category text,
  p_us integer, p_them integer, p_rows jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_match uuid;
  v_row jsonb;
  v_player uuid;
  v_extra jsonb;
  v_starters jsonb;
begin
  if v_user is null or not exists(select 1 from public.teams where id=p_team and user_id=v_user) then
    raise exception 'Équipe inaccessible';
  end if;
  if p_date is null or nullif(trim(p_opponent),'') is null or p_us is null or p_them is null or p_us<0 or p_them<0
    or p_home is null or p_category is null or p_category not in ('championship','cup','friendly') or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Feuille invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team::text || p_date::text, 0));
  if exists(select 1 from public.match_stats where team_id=p_team::text and match_date=p_date
    and lower(trim(opponent))=lower(trim(p_opponent)) and home is not distinct from p_home) then
    raise exception 'Ce match existe déjà dans l’historique';
  end if;
  if (select count(distinct value->>'player_id') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then
    raise exception 'Un joueur apparaît plusieurs fois ou manque';
  end if;
  select coalesce(jsonb_agg(value->>'player_id'), '[]'::jsonb)
    into v_starters
    from jsonb_array_elements(p_rows)
    where value->'starter' = 'true'::jsonb and value->'present' is distinct from 'false'::jsonb;
  if jsonb_array_length(v_starters) > 5 then raise exception 'Cinq majeur invalide'; end if;
  insert into public.match_stats(user_id,team_id,match_date,opponent,home,match_category,us,them,us_score,them_score,result,source,project_status,finalized_at,project_state)
    values(v_user,p_team::text,p_date,trim(p_opponent),p_home,p_category,p_us,p_them,p_us,p_them,
      case when p_us>p_them then 'V' when p_us<p_them then 'D' else 'N' end,'external','completed',now(),jsonb_build_object('importedStartingFive',v_starters))
    returning id into v_match;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_player := (v_row->>'player_id')::uuid;
    if not exists(select 1 from public.players where id=v_player and user_id=v_user
      and (team_id=p_team or coalesce(metadata->'additionalTeamIds','[]'::jsonb) ? p_team::text)) then
      raise exception 'Joueur non rattaché à cette équipe';
    end if;
    if exists(select 1 from jsonb_each_text(v_row) as s(key,value) where s.key in ('pts','p2m','p2a','p3m','p3a','ftm','fta','off_reb','def_reb','reb','ast','stl','blk','turnovers','pf','minutes_seconds') and s.value is not null and s.value !~ '^\d{1,4}$') then
      raise exception 'Statistique invalide';
    end if;
    if exists(select 1 from unnest(array['pts','p2m','p2a','p3m','p3a','ftm','fta','off_reb','def_reb','reb','ast','stl','blk','turnovers','pf']) as keys(field) where (v_row->>field) is null)
      or (v_row->>'p2m')::int>(v_row->>'p2a')::int
      or (v_row->>'p3m')::int>(v_row->>'p3a')::int
      or (v_row->>'ftm')::int>(v_row->>'fta')::int
      or coalesce((v_row->>'minutes_seconds')::int,0)>5999 or ((v_row->>'plus_minus') is not null and (v_row->>'plus_minus') !~ '^[+-]?\d{1,4}$') then
      raise exception 'Statistiques absentes ou incohérentes';
    end if;
    if exists(select 1 from jsonb_each_text(v_row) as s(key,value)
      where s.key in ('fgm','fga','fouls_drawn','eff') and s.value is not null
        and (case when s.key='eff' then s.value !~ '^[+-]?\d{1,4}$' else s.value !~ '^\d{1,4}$' end)) then
      raise exception 'Statistique externe invalide';
    end if;
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_extra
      from jsonb_each(v_row) where key in ('fgm','fga','fouls_drawn','eff') and value <> 'null'::jsonb;
    insert into public.match_player_stats(user_id,match_id,team_id,player_id,present,minutes,minutes_seconds,pts,p2m,p2a,p3m,p3a,ftm,fta,off_reb,def_reb,reb,ast,stl,blk,turnovers,tov,pf,plus_minus,external_boxscore)
    values(v_user,v_match,p_team::text,v_player::text,coalesce((v_row->>'present')::boolean,true),coalesce((v_row->>'minutes_seconds')::int/60,0),(v_row->>'minutes_seconds')::int,
      (v_row->>'pts')::int,(v_row->>'p2m')::int,(v_row->>'p2a')::int,(v_row->>'p3m')::int,(v_row->>'p3a')::int,(v_row->>'ftm')::int,(v_row->>'fta')::int,
      (v_row->>'off_reb')::int,(v_row->>'def_reb')::int,(v_row->>'reb')::int,(v_row->>'ast')::int,(v_row->>'stl')::int,(v_row->>'blk')::int,(v_row->>'turnovers')::int,(v_row->>'turnovers')::int,(v_row->>'pf')::int,(v_row->>'plus_minus')::int,v_extra);
  end loop;
  return v_match;
end; $$;
revoke all on function public.import_historical_boxscore(uuid,date,text,boolean,text,integer,integer,jsonb) from public, anon;
grant execute on function public.import_historical_boxscore(uuid,date,text,boolean,text,integer,integer,jsonb) to authenticated;

-- Montage only; no write to match_actions, match_stats or statistics.
-- Validate these existing columns against the deployed schema before applying.
begin;

create or replace function public.save_montage_timeline_atomic(
  p_montage_id uuid,
  p_montage jsonb,
  p_rows jsonb,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_team uuid := (p_montage->>'team_id')::uuid;
  v_player uuid := nullif(p_montage->>'player_id', '')::uuid;
  v_existing public.livestat_montages%rowtype;
  v_row jsonb;
  v_action uuid;
  v_updated timestamptz := clock_timestamp();
  v_index integer := 0;
begin
  if v_user is null or p_montage_id is null then raise exception 'Session ou identifiant Montage invalide'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Timeline invalide'; end if;
  if not exists(select 1 from public.teams where id = v_team and user_id = v_user) then
    raise exception 'Équipe inaccessible';
  end if;
  if v_player is not null and not exists(select 1 from public.players where id = v_player and team_id = v_team) then
    raise exception 'Joueur incompatible avec cette équipe';
  end if;

  -- Also serialize concurrent creation using the same client-generated UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_montage_id::text, 0));
  select * into v_existing from public.livestat_montages where id = p_montage_id for update;
  if found then
    if v_existing.user_id is distinct from v_user or v_existing.team_id is distinct from v_team then
      raise exception 'Montage inaccessible';
    end if;
    if p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception 'Le montage a changé depuis son ouverture. Recharge-le avant de sauvegarder.';
    end if;
    update public.livestat_montages set title = coalesce(nullif(p_montage->>'title', ''), 'Nouveau montage'),
      player_id = v_player, type = case when v_player is null then 'team' else 'player' end,
      coach_note = p_montage->>'coach_note', updated_at = v_updated
    where id = p_montage_id;
  else
    if p_expected_updated_at is not null then raise exception 'Le montage a été supprimé ou est inaccessible'; end if;
    insert into public.livestat_montages(id,user_id,team_id,player_id,title,type,coach_note,created_at,updated_at)
    values(p_montage_id,v_user,v_team,v_player,coalesce(nullif(p_montage->>'title', ''),'Nouveau montage'),
      case when v_player is null then 'team' else 'player' end,p_montage->>'coach_note',v_updated,v_updated);
  end if;

  -- Header + DELETE + all INSERTs are one PostgreSQL transaction.
  delete from public.livestat_montage_items where montage_id = p_montage_id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) is distinct from 'object' or v_row->>'item_type' is null
      or v_row->>'item_type' not in ('clip','title','text','image','freeze','audio') then
      raise exception 'Type d’élément Montage invalide';
    end if;
    if v_row->>'track' is null or v_row->>'track' not in ('video','overlay','audio') then
      raise exception 'Piste Montage invalide';
    end if;
    v_action := nullif(v_row->>'action_id', '')::uuid;
    if v_action is not null and not exists(select 1 from public.match_actions where id = v_action and team_id = v_team) then
      raise exception 'Action source inaccessible ou incompatible';
    end if;
    if v_row->>'item_type' in ('clip','freeze') and v_action is null then raise exception 'Action source manquante'; end if;
    if v_row->>'item_type' = 'clip' and (
      v_row->>'clip_start' is null or v_row->>'clip_end' is null or
      (v_row->>'clip_start')::numeric < 0 or (v_row->>'clip_end')::numeric <= (v_row->>'clip_start')::numeric
    ) then raise exception 'Bornes du clip invalides'; end if;
    if v_row->>'duration' is null or (v_row->>'duration')::numeric <= 0
      or v_row->>'timeline_start' is null or (v_row->>'timeline_start')::numeric < 0 then
      raise exception 'Durée ou position Montage invalide';
    end if;

    insert into public.livestat_montage_items(
      montage_id,user_id,item_type,action_id,sort_order,title,text,image_url,
      clip_start,clip_end,duration,track,timeline_start,volume,
      freeze_time,freeze_duration,annotations,editor_state,created_at
    ) values (
      p_montage_id,v_user,v_row->>'item_type',v_action,v_index,
      v_row->>'title',v_row->>'text',v_row->>'image_url',
      (v_row->>'clip_start')::numeric,(v_row->>'clip_end')::numeric,(v_row->>'duration')::numeric,
      v_row->>'track',(v_row->>'timeline_start')::numeric,coalesce((v_row->>'volume')::numeric,1),
      (v_row->>'freeze_time')::numeric,(v_row->>'freeze_duration')::numeric,
      coalesce(v_row->'annotations','[]'::jsonb),coalesce(v_row->'editor_state','{}'::jsonb),v_updated
    );
    v_index := v_index + 1;
  end loop;
  return jsonb_build_object('id',p_montage_id,'updated_at',v_updated);
end;
$$;

revoke all on function public.save_montage_timeline_atomic(uuid,jsonb,jsonb,timestamptz) from public;
grant execute on function public.save_montage_timeline_atomic(uuid,jsonb,jsonb,timestamptz) to authenticated;
commit;

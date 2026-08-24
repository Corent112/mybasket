-- MyBasket — correction ciblée suppression RPE / wellness
-- 2026-08-24
--
-- Restaure la RPC déjà appelée par l'interface existante.
-- Elle supprime UNE réponse joueur et uniquement la charge explicitement
-- reliée à cette réponse via wellness_response_id.
-- SECURITY INVOKER conserve les RLS et droits existants.

create or replace function public.delete_player_wellness_response(
  p_response_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_response_id text;
  v_deleted_response integer := 0;
  v_deleted_loads integer := 0;
begin
  select id::text
    into v_response_id
  from public.player_wellness_responses
  where id::text = p_response_id
  limit 1;

  if v_response_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Réponse introuvable ou inaccessible.'
    );
  end if;

  delete from public.training_load_entries
  where wellness_response_id::text = p_response_id;

  get diagnostics v_deleted_loads = row_count;

  delete from public.player_wellness_responses
  where id::text = p_response_id;

  get diagnostics v_deleted_response = row_count;

  if v_deleted_response <> 1 then
    raise exception 'Suppression de la réponse impossible';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted_response', v_deleted_response,
    'deleted_loads', v_deleted_loads
  );
end;
$$;

grant execute on function public.delete_player_wellness_response(text)
to authenticated;

notify pgrst, 'reload schema';

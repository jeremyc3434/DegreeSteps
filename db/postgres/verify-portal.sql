-- Run only with an authorized database operator. Every synthetic write rolls back.
-- Requires one real Auth user who has no saved plans in the new portal store.
begin;
set local statement_timeout='20s';
select set_config('request.jwt.claim.sub',(select id::text from auth.users order by created_at limit 1),true);
set local role authenticated;
do $verification$
declare
  actor uuid := auth.uid(); other uuid := '00000000-0000-4000-8000-000000000099';
  first_id text := 'scale-check-'||gen_random_uuid()::text;
  later_id text := 'scale-check-'||gen_random_uuid()::text;
  value jsonb; answer jsonb; n integer;
begin
  if actor is null then raise exception 'A pilot Auth user is required for the transactional verification'; end if;
  if actor=other then other:='00000000-0000-4000-8000-000000000098'; end if;
  if jsonb_array_length(public.degreesteps_plan_list(actor))<>0 then raise exception 'Use a pilot user with an empty new portal store'; end if;
  answer:=public.degreesteps_profile_get(actor);
  if answer->>'id'<>'sb-'||actor::text then raise exception 'Profile identity changed'; end if;
  value:='{"version":3,"profile":{"school":"Synthetic College","degree":"Synthetic test"},"learning":[{"id":"synthetic-source","provider":"Synthetic College","code":"QA101","title":"Synthetic record","credits":4,"creditSystem":"quarter","status":"earned","evaluations":[{"status":"confirmed","programId":"synthetic-degree"}]}],"sheet":{"notes":{"private":"Synthetic rollback-only note"}}}'::jsonb;
  answer:=public.degreesteps_plan_save(actor,first_id,'Synthetic rollback check',value,null,true);
  if answer->'state'<>value or (answer->>'revision')::int<>1 then raise exception 'Snapshot or original units did not round trip'; end if;
  answer:=public.degreesteps_plan_save(actor,first_id,'Synthetic revision check',value,1,false);
  if (answer->>'revision')::int<>2 then raise exception 'Revision did not advance'; end if;
  begin
    perform public.degreesteps_plan_save(actor,first_id,'Stale overwrite must fail',value,1,false);
    raise exception 'Stale save was accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.degreesteps_migrate_legacy(actor,repeat('a',64),'Student',jsonb_build_array(
      jsonb_build_object('id',later_id,'title','Must roll back','state',value,'revision',1,'createdAt',1,'updatedAt',1),
      jsonb_build_object('id',first_id,'title','Conflicting migration','state',value,'revision',1,'createdAt',1,'updatedAt',1)),true);
    raise exception 'Conflicting migration was accepted';
  exception when sqlstate 'PT409' then null; end;
  if exists(select 1 from public.degreesteps_plans where id=later_id and user_id=actor) then raise exception 'Migration partially committed'; end if;
  for n in 2..10 loop
    perform public.degreesteps_plan_save(actor,'scale-check-'||gen_random_uuid()::text,'Synthetic cap check',value,null,true);
  end loop;
  begin
    perform public.degreesteps_plan_save(actor,later_id,'Eleventh plan must fail',value,null,true);
    raise exception 'Plan cap was bypassed';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub',other::text,true);
  if exists(select 1 from public.degreesteps_plans where user_id=actor) then raise exception 'RLS exposed another owner'; end if;
  begin
    perform public.degreesteps_plan_get(actor,first_id);
    raise exception 'Forged actor was accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    perform public.degreesteps_plan_get(other,first_id);
    raise exception 'Cross-owner plan was exposed';
  exception when sqlstate 'PT404' then null; end;
  begin
    insert into public.degreesteps_profiles(user_id,alias) values(actor,'Other user write');
    raise exception 'Cross-owner write was accepted';
  exception when insufficient_privilege or sqlstate 'PT403' then null; end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if jsonb_array_length(public.degreesteps_plan_list(actor))<>10 then raise exception 'Expected ten intact owned plans'; end if;
end $verification$;
reset role;
rollback;
select jsonb_build_object('passed',true,'scope','Actual Postgres ownership, RLS, CAS, snapshot preservation, plan cap and atomic migration; all synthetic writes rolled back') as verification;

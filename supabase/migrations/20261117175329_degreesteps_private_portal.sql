-- Reviewable schema draft, not a Supabase migration filename. Root applies through its reviewed workflow.
-- Public RPCs run as the caller. A non-exposed trigger enforces quotas against direct REST writes too.
create schema if not exists degreesteps_private;
revoke all on schema degreesteps_private from public, anon, authenticated;

create table public.degreesteps_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null default 'Student' check (char_length(btrim(alias)) between 2 and 60 and alias !~ '[[:cntrl:]]'),
  created_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint) check (created_at >= 0),
  updated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint) check (updated_at >= 0)
);
create table public.degreesteps_plans (
  user_id uuid not null references public.degreesteps_profiles(user_id) on delete cascade,
  id text not null default gen_random_uuid()::text check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120 and title !~ '[[:cntrl:]]'),
  school text not null default '' check (char_length(school) <= 120 and school !~ '[[:cntrl:]]'),
  degree text not null default '' check (char_length(degree) <= 200 and degree !~ '[[:cntrl:]]'),
  state jsonb not null check (coalesce(jsonb_typeof(state)='object' and state->'version'='3'::jsonb and jsonb_typeof(state->'profile')='object' and jsonb_typeof(state->'learning')='array' and jsonb_array_length(state->'learning')<=2000 and octet_length(state::text)<=524288,false)),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint) check (created_at >= 0),
  updated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint) check (updated_at >= 0),
  primary key (user_id,id)
);
create index degreesteps_plans_owner_page on public.degreesteps_plans(user_id,updated_at desc,id desc);
create table public.degreesteps_migrationmarkers (
  user_id uuid not null references public.degreesteps_profiles(user_id) on delete cascade,
  source text not null check (source='legacy-d1'),
  source_manifest text not null check (source_manifest ~ '^[a-f0-9]{64}$'),
  source_profile_alias text not null check (char_length(source_profile_alias) between 2 and 60),
  source_revisions jsonb not null check (jsonb_typeof(source_revisions)='array' and jsonb_array_length(source_revisions)<=10),
  migrated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  primary key(user_id,source)
);
-- Operational counters contain no plan snapshots or aliases. Retain through private-data deletion
-- so repeated delete/recreate calls cannot reset the hourly write guard. Auth deletion cascades them.
create table degreesteps_private.portal_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('save','profile','delete','migrate')),
  window_start bigint not null,
  count integer not null check (count>0),
  primary key(user_id,action)
);
alter table public.degreesteps_profiles enable row level security;
alter table public.degreesteps_plans enable row level security;
alter table public.degreesteps_migrationmarkers enable row level security;
alter table degreesteps_private.portal_rate_limits enable row level security;
revoke all on public.degreesteps_profiles,public.degreesteps_plans,public.degreesteps_migrationmarkers from public,anon;
revoke all on degreesteps_private.portal_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.degreesteps_profiles,public.degreesteps_plans,public.degreesteps_migrationmarkers to authenticated;
create policy degreesteps_profiles_select on public.degreesteps_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy degreesteps_profiles_insert on public.degreesteps_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy degreesteps_profiles_update on public.degreesteps_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy degreesteps_profiles_delete on public.degreesteps_profiles for delete to authenticated using ((select auth.uid())=user_id);
create policy degreesteps_plans_select on public.degreesteps_plans for select to authenticated using ((select auth.uid())=user_id);
create policy degreesteps_plans_insert on public.degreesteps_plans for insert to authenticated with check ((select auth.uid())=user_id);
create policy degreesteps_plans_update on public.degreesteps_plans for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy degreesteps_plans_delete on public.degreesteps_plans for delete to authenticated using ((select auth.uid())=user_id);
create policy degreesteps_markers_select on public.degreesteps_migrationmarkers for select to authenticated using ((select auth.uid())=user_id);
create policy degreesteps_markers_insert on public.degreesteps_migrationmarkers for insert to authenticated with check ((select auth.uid())=user_id);
create policy degreesteps_markers_update on public.degreesteps_migrationmarkers for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy degreesteps_markers_delete on public.degreesteps_migrationmarkers for delete to authenticated using ((select auth.uid())=user_id);

create function degreesteps_private.guard_portal_write() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid := auth.uid(); row_owner uuid; action_name text; hourly_limit integer; bucket bigint; next_count integer;
begin
  row_owner := case when tg_op='DELETE' then old.user_id else new.user_id end;
  -- Permit the provider's privileged auth-user deletion to cascade app data without a user JWT.
  if tg_op='DELETE' and actor is null and pg_catalog.pg_trigger_depth()>1 then return old; end if;
  if actor is null or actor is distinct from row_owner then raise sqlstate 'PT403' using message='owner_mismatch'; end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id) then raise sqlstate 'PT403' using message='owner_immutable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  if tg_table_name='degreesteps_plans' then
    if tg_op='INSERT' and (select count(*) from public.degreesteps_plans where user_id=actor)>=10 then raise sqlstate 'PT409' using message='plan_limit'; end if;
    if tg_op='UPDATE' then
      if new.id<>old.id or new.created_at<>old.created_at then raise sqlstate 'PT403' using message='plan_identity_immutable'; end if;
      if new.revision<>old.revision+1 then raise sqlstate 'PT409' using message='revision_conflict'; end if;
      new.updated_at := (extract(epoch from clock_timestamp())*1000)::bigint;
    end if;
    action_name := case when tg_op='DELETE' then 'delete' else 'save' end;
  elsif tg_table_name='degreesteps_profiles' then
    if tg_op='INSERT' then return new; end if;
    if tg_op='UPDATE' then
      if new.created_at<>old.created_at then raise sqlstate 'PT403' using message='profile_identity_immutable'; end if;
      new.updated_at := (extract(epoch from clock_timestamp())*1000)::bigint;
    end if;
    action_name := case when tg_op='DELETE' then 'delete' else 'profile' end;
  else
    if tg_op='UPDATE' then raise sqlstate 'PT409' using message='migration_marker_immutable'; end if;
    action_name := case when tg_op='DELETE' then 'delete' else 'migrate' end;
  end if;
  -- Cascaded children do not spend an additional delete allowance. Ownership was checked above.
  if tg_op='DELETE' and pg_catalog.pg_trigger_depth()>1 then return old; end if;
  hourly_limit := case action_name when 'save' then 60 when 'profile' then 20 when 'migrate' then 5 else 40 end;
  bucket := floor(extract(epoch from clock_timestamp())/3600)::bigint*3600000;
  insert into degreesteps_private.portal_rate_limits(user_id,action,window_start,count) values(actor,action_name,bucket,1)
  on conflict(user_id,action) do update set count=case when portal_rate_limits.window_start=excluded.window_start then portal_rate_limits.count+1 else 1 end,
  window_start=excluded.window_start where portal_rate_limits.window_start<>excluded.window_start or portal_rate_limits.count<hourly_limit returning count into next_count;
  if not found then raise sqlstate 'PT429' using message='write_limit'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function degreesteps_private.guard_portal_write() from public,anon,authenticated,service_role;
create trigger degreesteps_profile_guard before insert or update or delete on public.degreesteps_profiles for each row execute function degreesteps_private.guard_portal_write();
create trigger degreesteps_plan_guard before insert or update or delete on public.degreesteps_plans for each row execute function degreesteps_private.guard_portal_write();
create trigger degreesteps_marker_guard before insert or update or delete on public.degreesteps_migrationmarkers for each row execute function degreesteps_private.guard_portal_write();

create function public.degreesteps_assert_actor(p_actor_id uuid) returns uuid language plpgsql stable security invoker set search_path=pg_catalog as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise sqlstate 'PT401' using message='sign_in_required'; end if;
  if actor is distinct from p_actor_id then raise sqlstate 'PT403' using message='owner_mismatch'; end if;
  return actor;
end $$;
create function public.degreesteps_profile_get(p_actor_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); record_value public.degreesteps_profiles;
begin
  select * into record_value from public.degreesteps_profiles where user_id=actor;
  if not found then
    insert into public.degreesteps_profiles(user_id) values(actor) on conflict(user_id) do nothing;
    select * into record_value from public.degreesteps_profiles where user_id=actor;
  end if;
  return jsonb_build_object('id','sb-'||actor::text,'alias',record_value.alias,'createdAt',record_value.created_at,'updatedAt',record_value.updated_at);
end $$;
create function public.degreesteps_profile_update(p_actor_id uuid,p_alias text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  perform public.degreesteps_profile_get(actor);
  update public.degreesteps_profiles set alias=btrim(p_alias) where user_id=actor;
  return public.degreesteps_profile_get(actor);
end $$;
create function public.degreesteps_plan_list(p_actor_id uuid,p_limit integer default 10,p_before_updated_at bigint default null,p_before_id text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>11 or (p_before_updated_at is null)<>(p_before_id is null) then raise sqlstate 'PT400' using message='invalid_page'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'school',school,'degree',degree,'revision',revision,'createdAt',created_at,'updatedAt',updated_at) order by updated_at desc,id desc),'[]'::jsonb)
  into result from (select id,title,school,degree,revision,created_at,updated_at from public.degreesteps_plans where user_id=actor and (p_before_updated_at is null or (updated_at,id)<(p_before_updated_at,p_before_id)) order by updated_at desc,id desc limit p_limit) page;
  return result;
end $$;
create function public.degreesteps_plan_get(p_actor_id uuid,p_id text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); record_value public.degreesteps_plans;
begin
  select * into record_value from public.degreesteps_plans where user_id=actor and id=p_id;
  if not found then raise sqlstate 'PT404' using message='plan_not_found'; end if;
  return jsonb_build_object('id',record_value.id,'title',record_value.title,'school',record_value.school,'degree',record_value.degree,'revision',record_value.revision,'createdAt',record_value.created_at,'updatedAt',record_value.updated_at,'state',record_value.state);
end $$;
create function public.degreesteps_plan_save(p_actor_id uuid,p_id text,p_title text,p_state jsonb,p_revision bigint default null,p_consent boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); prior bigint;
begin
  perform public.degreesteps_profile_get(actor);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  if p_revision is null then
    if p_consent is distinct from true then raise sqlstate 'PT400' using message='consent_required'; end if;
    insert into public.degreesteps_plans(user_id,id,title,school,degree,state) values(actor,p_id,btrim(p_title),coalesce(p_state->'profile'->>'school',p_state->'profile'->>'schoolChoice',''),coalesce(p_state->'profile'->>'degree',''),p_state);
  else
    select revision into prior from public.degreesteps_plans where user_id=actor and id=p_id for update;
    if not found then raise sqlstate 'PT404' using message='plan_not_found'; end if;
    if prior<>p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
    update public.degreesteps_plans set title=btrim(p_title),school=coalesce(p_state->'profile'->>'school',p_state->'profile'->>'schoolChoice',''),degree=coalesce(p_state->'profile'->>'degree',''),state=p_state,revision=revision+1 where user_id=actor and id=p_id and revision=p_revision;
  end if;
  return public.degreesteps_plan_get(actor,p_id);
end $$;
create function public.degreesteps_plan_delete(p_actor_id uuid,p_id text,p_revision bigint) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); prior bigint;
begin
  if p_revision is null or p_revision<1 then raise sqlstate 'PT400' using message='invalid_revision'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  select revision into prior from public.degreesteps_plans where user_id=actor and id=p_id for update;
  if not found then raise sqlstate 'PT404' using message='plan_not_found'; end if;
  if prior<>p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
  delete from public.degreesteps_plans where user_id=actor and id=p_id and revision=p_revision;
  return jsonb_build_object('deleted',true,'id',p_id);
end $$;
create function public.degreesteps_portal_delete(p_actor_id uuid,p_confirmation text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id);
begin
  if p_confirmation is distinct from 'DELETE MY PORTAL DATA' then raise sqlstate 'PT400' using message='confirmation_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  delete from public.degreesteps_profiles where user_id=actor;
  return jsonb_build_object('deleted',true,'scope','portal');
end $$;
create function public.degreesteps_migration_status(p_actor_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); result jsonb;
begin
  select jsonb_build_object('manifest',source_manifest,'alias',source_profile_alias,'revisions',source_revisions,'migratedAt',migrated_at) into result from public.degreesteps_migrationmarkers where user_id=actor and source='legacy-d1';
  return result;
end $$;
create function public.degreesteps_migrate_legacy(p_actor_id uuid,p_manifest text,p_alias text,p_items jsonb,p_consent boolean) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid := public.degreesteps_assert_actor(p_actor_id); item jsonb; existing public.degreesteps_plans; marker public.degreesteps_migrationmarkers; added integer:=0; source_revs jsonb; current_alias text;
begin
  if p_consent is distinct from true then raise sqlstate 'PT400' using message='consent_required'; end if;
  if p_manifest is null or p_items is null or p_manifest !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>10 then raise sqlstate 'PT400' using message='invalid_migration'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  select * into marker from public.degreesteps_migrationmarkers where user_id=actor and source='legacy-d1';
  if found then
    if marker.source_manifest<>p_manifest then raise sqlstate 'PT409' using message='migration_source_changed'; end if;
    return jsonb_build_object('alreadyMigrated',true,'imported',0,'manifest',p_manifest,'items',public.degreesteps_plan_list(actor));
  end if;
  perform public.degreesteps_profile_get(actor);
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or (item->>'revision')::bigint<1 then raise sqlstate 'PT400' using message='invalid_migration'; end if;
    select * into existing from public.degreesteps_plans where user_id=actor and id=item->>'id' for update;
    if found then
      if existing.revision<>(item->>'revision')::bigint or existing.title<>item->>'title' or existing.state<>item->'state' then raise sqlstate 'PT409' using message='revision_conflict'; end if;
    else
      insert into public.degreesteps_plans(user_id,id,title,school,degree,state,revision,created_at,updated_at)
      values(actor,item->>'id',item->>'title',coalesce(item->>'school',''),coalesce(item->>'degree',''),item->'state',(item->>'revision')::bigint,(item->>'createdAt')::bigint,(item->>'updatedAt')::bigint);
      added:=added+1;
    end if;
  end loop;
  select alias into current_alias from public.degreesteps_profiles where user_id=actor;
  if current_alias='Student' and p_alias<>'Student' then update public.degreesteps_profiles set alias=p_alias where user_id=actor; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','revision',(value->>'revision')::bigint) order by value->>'id'),'[]'::jsonb) into source_revs from jsonb_array_elements(p_items);
  insert into public.degreesteps_migrationmarkers(user_id,source,source_manifest,source_profile_alias,source_revisions) values(actor,'legacy-d1',p_manifest,p_alias,source_revs);
  return jsonb_build_object('alreadyMigrated',false,'imported',added,'manifest',p_manifest,'items',public.degreesteps_plan_list(actor));
end $$;

revoke all on function public.degreesteps_assert_actor(uuid),public.degreesteps_profile_get(uuid),public.degreesteps_profile_update(uuid,text),public.degreesteps_plan_list(uuid,integer,bigint,text),public.degreesteps_plan_get(uuid,text),public.degreesteps_plan_save(uuid,text,text,jsonb,bigint,boolean),public.degreesteps_plan_delete(uuid,text,bigint),public.degreesteps_portal_delete(uuid,text),public.degreesteps_migration_status(uuid),public.degreesteps_migrate_legacy(uuid,text,text,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.degreesteps_assert_actor(uuid),public.degreesteps_profile_get(uuid),public.degreesteps_profile_update(uuid,text),public.degreesteps_plan_list(uuid,integer,bigint,text),public.degreesteps_plan_get(uuid,text),public.degreesteps_plan_save(uuid,text,text,jsonb,bigint,boolean),public.degreesteps_plan_delete(uuid,text,bigint),public.degreesteps_portal_delete(uuid,text),public.degreesteps_migration_status(uuid),public.degreesteps_migrate_legacy(uuid,text,text,jsonb,boolean) to authenticated;

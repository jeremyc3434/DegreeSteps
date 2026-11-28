-- Private course workspace. All normal RPCs retain the caller's RLS identity.
-- Apply only after reviewing verify-learning.sql. No existing portal tables change.
create schema if not exists degreesteps_private;
revoke all on schema degreesteps_private from public, anon, authenticated;

create table public.degreesteps_learning_courses (
  user_id uuid not null references public.degreesteps_profiles(user_id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  provider text not null default '' check (char_length(provider)<=120),
  syllabus text not null default '' check (char_length(syllabus)<=24000),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  primary key(user_id,id)
);
create index degreesteps_learning_courses_page on public.degreesteps_learning_courses(user_id,updated_at desc,id);

create table public.degreesteps_learning_projects (
  user_id uuid not null references public.degreesteps_profiles(user_id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  kind text not null check (kind in ('writing','study','quiz','flashcards','presentation','discussion')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 12000),
  rubric text not null default '' check (char_length(rubric)<=8000),
  student_notes text not null default '' check (char_length(student_notes)<=12000),
  sources jsonb not null default '[]' check (jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=8 and octet_length(sources::text)<=80000),
  artifact jsonb check (artifact is null or (jsonb_typeof(artifact)='object' and octet_length(artifact::text)<=300000)),
  status text not null default 'draft' check (status in ('draft','working','ready')),
  active_run_id uuid,
  active_until bigint,
  last_run_id uuid,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  primary key(user_id,id),
  foreign key(user_id,course_id) references public.degreesteps_learning_courses(user_id,id) on delete cascade,
  check ((active_run_id is null and active_until is null and status<>'working') or (active_run_id is not null and active_until is not null and status='working'))
);
create index degreesteps_learning_projects_page on public.degreesteps_learning_projects(user_id,course_id,updated_at desc,id);

create table public.degreesteps_learning_runs (
  user_id uuid not null references public.degreesteps_profiles(user_id) on delete cascade,
  id uuid not null,
  project_id uuid not null,
  action text not null check (action in ('plan','draft','review','study','quiz','flashcards','presentation','discussion')),
  message text not null default '' check (char_length(message)<=4000),
  status text not null check (status in ('working','completed','failed')),
  artifact jsonb check (artifact is null or (jsonb_typeof(artifact)='object' and octet_length(artifact::text)<=300000)),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{1,60}$'),
  created_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  updated_at bigint not null default ((extract(epoch from clock_timestamp())*1000)::bigint),
  primary key(user_id,id),
  foreign key(user_id,project_id) references public.degreesteps_learning_projects(user_id,id) on delete cascade
);
create index degreesteps_learning_runs_project on public.degreesteps_learning_runs(user_id,project_id,created_at desc);

create table degreesteps_private.learning_write_limits (
  user_id uuid primary key references public.degreesteps_profiles(user_id) on delete cascade,
  hour_bucket bigint not null,
  count integer not null check (count between 1 and 500)
);
alter table degreesteps_private.learning_write_limits enable row level security;
revoke all on degreesteps_private.learning_write_limits from public,anon,authenticated;
create table degreesteps_private.learning_workspace_sizes (
  user_id uuid primary key references public.degreesteps_profiles(user_id) on delete cascade,
  total_bytes bigint not null default 0 check (total_bytes between 0 and 26214400)
);
alter table degreesteps_private.learning_workspace_sizes enable row level security;
revoke all on degreesteps_private.learning_workspace_sizes from public,anon,authenticated;

alter table public.degreesteps_learning_courses enable row level security;
alter table public.degreesteps_learning_projects enable row level security;
alter table public.degreesteps_learning_runs enable row level security;
revoke all on public.degreesteps_learning_courses,public.degreesteps_learning_projects,public.degreesteps_learning_runs from public,anon;
grant select,insert,update,delete on public.degreesteps_learning_courses,public.degreesteps_learning_projects,public.degreesteps_learning_runs to authenticated;
create policy learning_courses_owner_select on public.degreesteps_learning_courses for select to authenticated using ((select auth.uid())=user_id);
create policy learning_courses_owner_insert on public.degreesteps_learning_courses for insert to authenticated with check ((select auth.uid())=user_id);
create policy learning_courses_owner_update on public.degreesteps_learning_courses for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy learning_courses_owner_delete on public.degreesteps_learning_courses for delete to authenticated using ((select auth.uid())=user_id);
create policy learning_projects_owner_select on public.degreesteps_learning_projects for select to authenticated using ((select auth.uid())=user_id);
create policy learning_projects_owner_insert on public.degreesteps_learning_projects for insert to authenticated with check ((select auth.uid())=user_id);
create policy learning_projects_owner_update on public.degreesteps_learning_projects for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy learning_projects_owner_delete on public.degreesteps_learning_projects for delete to authenticated using ((select auth.uid())=user_id);
create policy learning_runs_owner_select on public.degreesteps_learning_runs for select to authenticated using ((select auth.uid())=user_id);
create policy learning_runs_owner_insert on public.degreesteps_learning_runs for insert to authenticated with check ((select auth.uid())=user_id);
create policy learning_runs_owner_update on public.degreesteps_learning_runs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy learning_runs_owner_delete on public.degreesteps_learning_runs for delete to authenticated using ((select auth.uid())=user_id);

-- Quotas apply to direct REST writes as well as RPC calls. The definer trigger
-- is in a non-exposed schema and can never read another actor's workspace.
create function degreesteps_private.guard_learning_write() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid := auth.uid(); row_owner uuid; row_count integer; row_limit integer; bucket bigint; next_count integer; before_bytes bigint:=0; after_bytes bigint:=0; next_bytes bigint;
begin
  row_owner := case when tg_op='DELETE' then old.user_id else new.user_id end;
  if tg_op='DELETE' and actor is null and pg_catalog.pg_trigger_depth()>1 then return old; end if;
  if actor is null or actor is distinct from row_owner then raise sqlstate 'PT403' using message='owner_mismatch'; end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.id<>old.id) then raise sqlstate 'PT403' using message='owner_immutable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  if tg_op<>'DELETE' then
    bucket := floor(extract(epoch from clock_timestamp())/3600)::bigint;
    insert into degreesteps_private.learning_write_limits(user_id,hour_bucket,count) values(actor,bucket,1)
    on conflict(user_id) do update set hour_bucket=excluded.hour_bucket,count=case when learning_write_limits.hour_bucket=excluded.hour_bucket then learning_write_limits.count+1 else 1 end
    where learning_write_limits.hour_bucket<>excluded.hour_bucket or learning_write_limits.count<500 returning count into next_count;
    if next_count is null then raise sqlstate 'PT429' using message='write_limit'; end if;
  end if;
  if tg_op='INSERT' then
    if tg_table_name='degreesteps_learning_courses' then
      select count(*) into row_count from public.degreesteps_learning_courses where user_id=actor; row_limit:=50;
    elsif tg_table_name='degreesteps_learning_projects' then
      select count(*) into row_count from public.degreesteps_learning_projects where user_id=actor; row_limit:=100;
    else
      select count(*) into row_count from public.degreesteps_learning_runs where user_id=actor; row_limit:=1200;
    end if;
    if row_count>=row_limit then raise sqlstate 'PT409' using message='workspace_limit'; end if;
  end if;
  if tg_op<>'DELETE' then
    new.updated_at := (extract(epoch from clock_timestamp())*1000)::bigint;
    if tg_op='INSERT' then new.created_at:=new.updated_at;
    else new.created_at:=old.created_at;
      if tg_table_name<>'degreesteps_learning_runs' then
        if new.revision<>old.revision+1 then raise sqlstate 'PT409' using message='revision_conflict'; end if;
      end if;
    end if;
    after_bytes:=octet_length(to_jsonb(new)::text);
  end if;
  if tg_op<>'INSERT' then before_bytes:=octet_length(to_jsonb(old)::text); end if;
  -- The counter is updated transactionally under the same owner lock. Cascading
  -- course deletions reclaim all child bytes; deleting the portal profile itself
  -- cascades the counter too and must never recreate it during child deletion.
  if exists(select 1 from public.degreesteps_profiles where user_id=row_owner) then
    insert into degreesteps_private.learning_workspace_sizes(user_id,total_bytes) values(row_owner,greatest(0,after_bytes-before_bytes))
    on conflict(user_id) do update set total_bytes=greatest(0,learning_workspace_sizes.total_bytes+after_bytes-before_bytes)
    where greatest(0,learning_workspace_sizes.total_bytes+after_bytes-before_bytes)<=26214400 returning total_bytes into next_bytes;
    if next_bytes is null then raise sqlstate 'PT409' using message='workspace_limit'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function degreesteps_private.guard_learning_write() from public,anon,authenticated;
create trigger learning_courses_guard before insert or update or delete on public.degreesteps_learning_courses for each row execute function degreesteps_private.guard_learning_write();
create trigger learning_projects_guard before insert or update or delete on public.degreesteps_learning_projects for each row execute function degreesteps_private.guard_learning_write();
create trigger learning_runs_guard before insert or update or delete on public.degreesteps_learning_runs for each row execute function degreesteps_private.guard_learning_write();

create function public.degreesteps_learning_mutate(p_actor_id uuid,p_operation text,p_id uuid default null,p_revision bigint default null,p_data jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); c public.degreesteps_learning_courses; p public.degreesteps_learning_projects; r public.degreesteps_learning_runs; stamp bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; request_id uuid;
begin
  if actor is null then raise sqlstate 'PT401' using message='sign_in_required'; end if;
  if actor is distinct from p_actor_id then raise sqlstate 'PT403' using message='owner_mismatch'; end if;
  if jsonb_typeof(p_data)<>'object' then raise sqlstate 'PT400' using message='invalid_workspace'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817231));
  if p_operation='course_create' then
    perform public.degreesteps_profile_get(actor);
    insert into public.degreesteps_learning_courses(user_id,title,provider,syllabus) values(actor,p_data->>'title',coalesce(p_data->>'provider',''),coalesce(p_data->>'syllabus','')) returning * into c; return to_jsonb(c);
  end if;
  if p_operation='delete_all' then
    if p_data->>'confirmation' is distinct from 'DELETE MY COURSE WORKSPACE' then raise sqlstate 'PT400' using message='confirmation_required'; end if;
    delete from public.degreesteps_learning_courses where user_id=actor; return jsonb_build_object('deleted',true);
  end if;
  if p_operation in ('course_update','course_delete') then
    select * into c from public.degreesteps_learning_courses where user_id=actor and id=p_id for update;
    if not found then raise sqlstate 'PT404' using message='course_not_found'; end if;
    if c.revision is distinct from p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
    if exists(select 1 from public.degreesteps_learning_projects where user_id=actor and course_id=p_id and active_until>stamp) then raise sqlstate 'PT409' using message='run_in_progress'; end if;
    if p_operation='course_delete' then delete from public.degreesteps_learning_courses where user_id=actor and id=p_id; return jsonb_build_object('deleted',true); end if;
    update public.degreesteps_learning_courses set title=coalesce(p_data->>'title',title),provider=coalesce(p_data->>'provider',provider),syllabus=coalesce(p_data->>'syllabus',syllabus),revision=revision+1 where user_id=actor and id=p_id returning * into c;
    update public.degreesteps_learning_projects set status='draft',active_run_id=null,active_until=null,revision=revision+1 where user_id=actor and course_id=p_id;
    return to_jsonb(c);
  end if;
  if p_operation='project_create' then
    insert into public.degreesteps_learning_projects(user_id,course_id,kind,title,prompt,rubric,student_notes,sources) values(actor,(p_data->>'courseId')::uuid,p_data->>'kind',p_data->>'title',p_data->>'prompt',coalesce(p_data->>'rubric',''),coalesce(p_data->>'studentNotes',''),coalesce(p_data->'sources','[]'::jsonb)) returning * into p; return to_jsonb(p);
  end if;
  select * into p from public.degreesteps_learning_projects where user_id=actor and id=p_id for update;
  if not found then raise sqlstate 'PT404' using message='project_not_found'; end if;
  if p_operation='run_claim' then
    request_id := (p_data->>'requestId')::uuid;
    select * into r from public.degreesteps_learning_runs where user_id=actor and id=request_id;
    if found then
      if r.project_id<>p_id or r.action<>p_data->>'action' then raise sqlstate 'PT409' using message='request_conflict'; end if;
      if r.status='completed' then return jsonb_build_object('project',to_jsonb(p),'run',to_jsonb(r),'replayed',true); end if;
      if r.status='working' and p.active_run_id=request_id and p.active_until>stamp then raise sqlstate 'PT409' using message='run_in_progress'; end if;
    end if;
    if p.revision is distinct from p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
    if p.active_until>stamp then raise sqlstate 'PT409' using message='run_in_progress'; end if;
    if p.active_run_id is not null then update public.degreesteps_learning_runs set status='failed',error_code='run_expired' where user_id=actor and id=p.active_run_id and status='working'; end if;
    insert into public.degreesteps_learning_runs(user_id,id,project_id,action,message,status) values(actor,request_id,p_id,p_data->>'action',coalesce(p_data->>'message',''),'working') on conflict(user_id,id) do update set status='working',error_code=null,artifact=null,message=excluded.message;
    update public.degreesteps_learning_projects set status='working',active_run_id=request_id,active_until=stamp+360000,revision=revision+1 where user_id=actor and id=p_id returning * into p;
    return jsonb_build_object('project',to_jsonb(p),'replayed',false);
  end if;
  if p_operation in ('run_finish','run_fail') then
    request_id := (p_data->>'requestId')::uuid;
    if p.active_run_id is distinct from request_id or p.revision is distinct from p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
    if p_operation='run_finish' then
      update public.degreesteps_learning_runs set status='completed',artifact=p_data->'artifact',error_code=null where user_id=actor and id=request_id and project_id=p_id and status='working';
      if not found then raise sqlstate 'PT409' using message='request_conflict'; end if;
      update public.degreesteps_learning_projects set artifact=p_data->'artifact',status='ready',active_run_id=null,active_until=null,last_run_id=request_id,revision=revision+1 where user_id=actor and id=p_id returning * into p;
    else
      update public.degreesteps_learning_runs set status='failed',error_code=coalesce(p_data->>'errorCode','generation_failed') where user_id=actor and id=request_id and project_id=p_id;
      update public.degreesteps_learning_projects set status=case when artifact is null then 'draft' else 'ready' end,active_run_id=null,active_until=null,revision=revision+1 where user_id=actor and id=p_id returning * into p;
    end if;
    return to_jsonb(p);
  end if;
  if p.revision is distinct from p_revision then raise sqlstate 'PT409' using message='revision_conflict'; end if;
  if p.active_until>stamp then raise sqlstate 'PT409' using message='run_in_progress'; end if;
  if p_operation='project_delete' then delete from public.degreesteps_learning_projects where user_id=actor and id=p_id; return jsonb_build_object('deleted',true); end if;
  if p_operation='project_update' then
    update public.degreesteps_learning_projects set title=coalesce(p_data->>'title',title),prompt=coalesce(p_data->>'prompt',prompt),rubric=coalesce(p_data->>'rubric',rubric),student_notes=coalesce(p_data->>'studentNotes',student_notes),sources=coalesce(p_data->'sources',sources),status='draft',active_run_id=null,active_until=null,revision=revision+1 where user_id=actor and id=p_id returning * into p; return to_jsonb(p);
  end if;
  raise sqlstate 'PT400' using message='invalid_operation';
end;
$$;
revoke all on function public.degreesteps_learning_mutate(uuid,text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.degreesteps_learning_mutate(uuid,text,uuid,bigint,jsonb) to authenticated;

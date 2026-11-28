-- Authorized operator verification. Synthetic identities and every write roll back.
begin;
set local statement_timeout='30s';
create temporary table learning_verify_actors(actor uuid,other_actor uuid) on commit drop;
insert into learning_verify_actors values(gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'learning-qa-'||actor::text||'@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now() from learning_verify_actors
union all select other_actor,'learning-qa-'||other_actor::text||'@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now() from learning_verify_actors;
grant select on learning_verify_actors to authenticated;
set local role authenticated;
do $verification$
<<verify_learning>>
declare actor uuid; other_actor uuid; course_id uuid; project_id uuid; request_id uuid:=gen_random_uuid(); answer jsonb; n integer; bytes_limited boolean:=false;
begin
  select v.actor,v.other_actor into actor,other_actor from learning_verify_actors v;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  answer:=public.degreesteps_learning_mutate(actor,'course_create',null,null,'{"title":"Synthetic business course","provider":"Synthetic provider","syllabus":"Private syllabus text"}');
  course_id:=(answer->>'id')::uuid;
  if answer->>'syllabus'<>'Private syllabus text' then raise exception 'Private syllabus failed roundtrip'; end if;
  answer:=public.degreesteps_learning_mutate(actor,'project_create',null,null,jsonb_build_object('courseId',course_id,'kind','writing','title','Synthetic paper','prompt','Explain the business recommendation','studentNotes','My own recommendation and supporting reasoning','sources','[]'::jsonb));
  project_id:=(answer->>'id')::uuid;
  begin
    perform public.degreesteps_learning_mutate(actor,'project_update',project_id,99,'{"title":"Stale overwrite"}'); raise exception 'Stale project was accepted';
  exception when sqlstate 'PT409' then null; end;
  answer:=public.degreesteps_learning_mutate(actor,'run_claim',project_id,1,jsonb_build_object('requestId',request_id,'action','plan','message','Use my example'));
  if answer->'project'->>'status'<>'working' or (answer->'project'->>'revision')::int<>2 then raise exception 'Run claim did not fence revision'; end if;
  begin
    perform public.degreesteps_learning_mutate(actor,'run_claim',project_id,2,jsonb_build_object('requestId',gen_random_uuid(),'action','plan')); raise exception 'Concurrent run was accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.degreesteps_learning_mutate(actor,'project_update',project_id,2,'{"title":"Edit during generation"}'); raise exception 'Active project was overwritten';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.degreesteps_learning_mutate(actor,'run_finish',project_id,2,jsonb_build_object('requestId',gen_random_uuid(),'artifact','{}'::jsonb)); raise exception 'Wrong run fence was accepted';
  exception when sqlstate 'PT409' then null; end;
  answer:=public.degreesteps_learning_mutate(actor,'run_finish',project_id,2,jsonb_build_object('requestId',request_id,'artifact',jsonb_build_object('content','Synthetic artifact','action','plan')));
  if answer->>'status'<>'ready' or (answer->>'revision')::int<>3 then raise exception 'Run finish did not commit artifact'; end if;
  if not exists(select 1 from public.degreesteps_learning_runs where user_id=actor and id=request_id and status='completed' and message='Use my example') then raise exception 'Private run history was lost'; end if;
  answer:=public.degreesteps_learning_mutate(actor,'run_claim',project_id,1,jsonb_build_object('requestId',request_id,'action','plan'));
  if answer->>'replayed'<>'true' then raise exception 'Completed private request did not replay'; end if;
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  if exists(select 1 from public.degreesteps_learning_courses where user_id=actor) or exists(select 1 from public.degreesteps_learning_projects where user_id=actor) or exists(select 1 from public.degreesteps_learning_runs where user_id=actor) then raise exception 'RLS exposed another student'; end if;
  begin
    perform public.degreesteps_learning_mutate(actor,'course_create',null,null,'{"title":"Forged actor"}'); raise exception 'Forged actor was accepted';
  exception when sqlstate 'PT403' then null; end;
  begin
    insert into public.degreesteps_learning_courses(user_id,title) values(actor,'Cross-owner direct REST'); raise exception 'Cross-owner direct insert was accepted';
  exception when insufficient_privilege or sqlstate 'PT403' then null; end;
  begin
    perform public.degreesteps_learning_mutate(other_actor,'project_update',project_id,3,'{"title":"Cross-owner edit"}'); raise exception 'Cross-owner project was changed';
  exception when sqlstate 'PT404' then null; end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  -- Direct REST-equivalent writes cannot bypass the aggregate 25 MiB cap.
  for n in 1..110 loop
    begin
      insert into public.degreesteps_learning_runs(user_id,id,project_id,action,status,artifact) values(actor,gen_random_uuid(),project_id,'plan','completed',jsonb_build_object('content',repeat('x',280000)));
    exception when sqlstate 'PT409' then bytes_limited:=true; exit; end;
  end loop;
  if not bytes_limited then raise exception 'Aggregate private workspace byte cap was bypassed'; end if;
  delete from public.degreesteps_learning_runs as saved where saved.user_id=actor and saved.project_id=verify_learning.project_id and saved.id<>request_id;
  for n in 2..50 loop
    perform public.degreesteps_learning_mutate(actor,'course_create',null,null,jsonb_build_object('title','Synthetic quota course '||n));
  end loop;
  begin
    perform public.degreesteps_learning_mutate(actor,'course_create',null,null,'{"title":"Course 51"}'); raise exception 'Course quota was bypassed';
  exception when sqlstate 'PT409' then null; end;
  -- Normal portal deletion must remove this new workspace too.
  perform public.degreesteps_portal_delete(actor,'DELETE MY PORTAL DATA');
  if exists(select 1 from public.degreesteps_learning_courses where user_id=actor) or exists(select 1 from public.degreesteps_learning_projects where user_id=actor) or exists(select 1 from public.degreesteps_learning_runs where user_id=actor) then raise exception 'Portal deletion left private course work behind'; end if;
end $verification$;
reset role;
rollback;
select jsonb_build_object('passed',true,'scope','Actual Postgres course/project/history ownership, RLS, forged actor, CAS, run lease, replay, course quota, direct-write byte cap, reclaimed storage and portal deletion cascade; synthetic identities and all writes rolled back') as verification;

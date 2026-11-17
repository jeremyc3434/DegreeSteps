/** Repeatable correctness and query bounds, not an external throughput claim. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHarness,exercisePrivateReads,exerciseSaveRaces,exerciseCommunity,exerciseBoundaries,ownerId,planId} from './scripts/benchmark-scale.mjs';

let harness;
before(async()=>{harness=await createHarness({students:1000,posts:1000,reactionsPerPost:8,samples:12,warmup:3,saveRaces:8,reactionCycles:4});});
after(()=>harness?.close());

test('the actual built Worker lists and opens only the owner’s bounded plans among ten thousand private plans',async()=>{
  assert.equal(harness.seeded.students,1000);assert.equal(harness.seeded.privatePlans,10000);
  const result=await exercisePrivateReads(harness);assert.equal(result.requestCount,24);assert(result.checks.ownerResultsIsolated);assert(result.checks.listLimitedToTen);assert(result.checks.listOmitsStatePayload);
  assert.equal(result.sql.writeStatements,0,'An existing student opening a saved plan must not INSERT/UPDATE their profile');
  assert(result.queriesPerRequest.max<=3,'Opening ten plan summaries must not fetch each plan separately');assert(result.sql.maxRowsReturnedByOneStatement<=10);
  const list=result.sql.queries.find(query=>/FROM portal_plans WHERE user_id\s*=\s*\?\s+ORDER BY/.test(query.sql));assert(list,'Inspect the actual owner-list query, not a synthetic equivalent');assert(list.queryPlan.some(detail=>/SEARCH portal_plans USING (?:COVERING )?INDEX portal_plans_owner/.test(detail)),'Use the owner index instead of scanning every student’s saved plans');assert(!list.queryPlan.some(detail=>/TEMP B-TREE|SCAN portal_plans/.test(detail)));
  assert.equal(result.mockIdentityCalls,result.requestCount);assert(result.latencyMs.p95>=result.latencyMs.median);
});

test('two interleaved callers using the same revision cannot both save or lose the winning state',async()=>{
  const result=await exerciseSaveRaces(harness);assert.equal(result.checks.sameRevisionWinners,8);assert.equal(result.checks.sameRevisionConflicts,8);assert(result.checks.noLostWinningPayload);assert(result.checks.revisionAdvancedExactlyOnce);assert.equal(result.requestCount,16);assert.equal(result.mockIdentityCalls,16,'Per-request accounting must not double-count concurrent callers');assert(result.queriesPerRequest.max<=8);
});

test('community cursor reads remain bounded and reactions stay idempotent with thousands of posts and reactions',async()=>{
  assert.equal(harness.seeded.communityPosts,1001);assert.equal(harness.seeded.communityReactions,8000);
  const result=await exerciseCommunity(harness);assert(result.checks.cursorPagesDoNotOverlap);assert(result.checks.reactionAndCommentCountsAccurate);assert(result.checks.repeatedReactionIsIdempotent);
  assert.equal(result.reads.sql.writeStatements,0,'Browsing as an existing community member must not INSERT/UPDATE their profile');assert(result.reads.queriesPerRequest.max<=8,'Feed SQL count should be bounded by a page, not grow per returned post');assert(result.reads.sql.maxRowsReturnedByOneStatement<=21);assert.equal(result.reads.requestCount,27);assert.equal(result.reactions.requestCount,12);assert(result.checks.ownerFeedOnlyIncludesOwnPosts);assert(result.checks.ownerFeedUsesUserIndex,'Finding a student’s few public plans must seek by author rather than scan every live community post');
  const page=result.reads.sql.queries.find(query=>/FROM community_posts p/.test(query.sql)&&/LIMIT \?/.test(query.sql));assert(page);assert(page.queryPlan.some(detail=>/SEARCH p USING (?:COVERING )?INDEX/.test(detail)),'The actual context feed must use an indexed search');
});

test('auth isolation and bounded clear failures preserve private data under the legacy D1 API',async()=>{
  const report=await exerciseBoundaries(harness);for(const[key,value]of Object.entries(report))if(key!=='externalHttpRequests')assert.equal(value,true,key);assert.equal(report.externalHttpRequests,0);
  const userRows=harness.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM portal_plans WHERE user_id=?').get(ownerId(0));assert.equal(userRows.n,10);
  const profileBefore=harness.DB.events.length,first=await harness.call('/api/portal/plans/'+planId(0));assert.equal(first.status,200);assert.equal(harness.DB.events.slice(profileBefore).filter(event=>event.write).length,0);
});

test('a newly verified student is initialized once while later portal and community reads remain read-only',async()=>{
  const student=harness.config.students;
  for(const path of ['/api/portal/session','/api/community/session']){
    const first=await harness.call(path,{student});assert.equal(first.status,200);assert.equal(first.body.user.id,ownerId(student));assert.equal(first.queries.filter(event=>/^INSERT\b/i.test(event.sql)).length,1,'The first visit may create the missing synthetic profile');
    const next=await harness.call(path,{student});assert.equal(next.status,200);assert.equal(next.queries.filter(event=>event.write).length,0,'Reopening an existing account should not reserve another write');
  }
});

test('explicit D1 selection preserves the legacy API and an unknown backend fails closed before querying private data',async()=>{
  try{
    const legacy=await harness.call('/api/portal/plans');assert.equal(legacy.status,200);harness.env.PORTAL_STORAGE_BACKEND='d1';const explicit=await harness.call('/api/portal/plans');assert.equal(explicit.status,200);assert.deepEqual(explicit.body,legacy.body);
    harness.env.PORTAL_STORAGE_BACKEND='unsupported-synthetic-backend';const invalid=await harness.call('/api/portal/plans');assert.equal(invalid.status,503);assert.equal(invalid.body.code,'storage_not_configured');assert.equal(invalid.queries.length,0);assert(!JSON.stringify(invalid.body).includes('SYNTHETIC-PRIVATE'));
  }finally{delete harness.env.PORTAL_STORAGE_BACKEND;}
});

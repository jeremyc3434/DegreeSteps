const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Planner=require('./dist/planner.js');
const doc=require('./content/curricula/wgu.json'),pack=require('./dist/data/curricula/wgu.json');
const id='curriculum-wgu-catalog-ecceaa488637ac83',business=pack.models.find(model=>model.id===id);
test('the ten original Study.com choices retain their university-issued evidence and independent source quantities',()=>{
 const options=business.requirements.flatMap(row=>row.options.filter(option=>option.provider==='Study.com'&&option.mappingReviewId==='wgu-bsmgt-240-approved-20261117').map(option=>({row,option})));
 assert.equal(options.length,10);assert.equal(new Set(options.map(({option})=>option.code)).size,10);
 assert.equal(options.reduce((sum,{row})=>sum+row.credits,0),28);
 for(const {row,option}of options){assert.equal(option.evidence,'published');assert.equal(option.creditSystem,'competency-unit');assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceCredits,3);assert.equal(option.credits,row.credits);assert.match(row.code,/^[CD]\d{3}$/);assert(option.conditions.some(note=>/202605/.test(note)));assert.equal(option.universityMapRecord.programId,240);assert.equal(option.universityMapRecord.agreementId,4429);}
 const finance=business.requirements.find(row=>row.title==='Introduction to Business Finance');assert(finance);assert(!finance.options.some(option=>option.provider==='Study.com'));
 // Computer Science never borrows Business Management awards: its outside options are only its own program-scoped WGU agreement maps.
 const cs=[...pack.models,...require('./dist/data/curricula/wgu-pathway-kit.json').models].find(model=>/Computer Science/.test(model.title));assert(cs.requirements.every(row=>row.options.every(option=>option.provider==='University'||option.universityMapRecord?.programId===cs.curriculumReview.programId&&option.mappingReviewId!=='wgu-bsmgt-240-approved-20261117')));
});
test('the four additional Study.com placements are program-scoped and original Math104 credits remain separate from WGU awards',()=>{
 const batch=require('./content/reuse/wgu-business-awards.json'),review=batch.existingPrograms.find(model=>model.modelId===id),refs=new Map(doc.sources.map(source=>[source.id,source]));
 const options=business.requirements.flatMap(row=>row.options.filter(option=>option.provider==='Study.com'&&option.mappingReviewId===batch.id).map(option=>({row,option})));
 assert.equal(options.length,4);
 for(const {row,option}of options){const claim=review.receivingClaims.find(claim=>claim.provider==='Study.com'&&claim.receivingCode===row.code);assert(claim?.sourceExpression.executableAsSingleCourse);assert(claim.approvedSourceCodes.includes(option.code));assert.equal(option.credits,row.credits);assert.equal(option.sourceCredits,option.sourceCreditVerification.credits);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.creditSystem,'competency-unit');assert.equal(option.universityMapRecord.programId,240);assert.equal(option.universityMapRecord.mappingId,claim.mappingId);assert.equal(option.mappingEvidence.catalogYear,'202605');for(const sourceId of option.sourceIds){const source=refs.get(sourceId);assert.equal(source.checked,'2026-11-20');assert.equal(source.programId,240);}}
 const math=pack.models.flatMap(model=>model.requirements.flatMap(row=>row.options.filter(option=>option.provider==='Study.com'&&option.code==='SDCM-0016').map(option=>({model,row,option}))));
 assert.equal(math.length,4);
 for(const {model,row,option}of math){assert.equal(option.providerCourseCode,'Math 104');assert.equal(option.sourceCredits,4);assert.equal(option.sourceCreditVerification.credits,4);assert.equal(option.credits,row.credits);assert.equal(option.credits,3);assert.equal(option.creditSystem,'competency-unit');assert.equal(option.mappingEvidence.catalogYear,model.catalog);assert.equal(option.mappingChecked,'2026-11-20');}
});
test('published choices supply the complete 69-CU outside route without claiming completed student awards',()=>{
 const settings={allowConditional:false,priority:'transfer'};
 const sophia=Planner.generate(business,{...settings,providers:['Sophia']}),mixed=Planner.generate(business,{...settings,providers:['Sophia','Study.com']});
 assert.equal(sophia.totals.external,60);assert.equal(mixed.totals.external,69);assert.equal(mixed.totals.institutional,41);assert.equal(mixed.validation.academicCountsValid,true);assert.equal(mixed.totals.confirmed,0);assert(!mixed.blockers.some(error=>error.code==='conditional_mapping'));assert.equal(mixed.costs.universityTuition,null);
 assert(sophia.rows.every(row=>['Sophia','University'].includes(row.option.provider)));assert(mixed.rows.every(row=>['Sophia','Study.com','University'].includes(row.option.provider)));
 const law=business.requirements.find(row=>row.code==='D078');
 for(const provider of ['Sophia','Study.com']){const choice=law.options.find(option=>option.provider===provider),pinned=Planner.generate(business,{...settings,providers:[provider],optionSelections:{[law.id]:choice.id}});assert.equal(pinned.rows.find(row=>row.requirementId===law.id).option.id,choice.id);assert(pinned.rows.every(row=>[provider,'University'].includes(row.option.provider)));assert.equal(pinned.validation.academicCountsValid,true);}
});
test('the retained supplement records the same reviewed catalog and source facts',()=>{
 const patch=require('./content/curricula/overlays/wgu-bsmgt-study-202605.json');
 assert.equal(patch.modelId,id);assert.equal(patch.catalog,'202605');assert.equal(patch.requirements.length,10);
 assert.equal(patch.requirements.reduce((sum,row)=>sum+row.credits,0),28);
 assert(patch.requirements.every(row=>row.options.every(option=>option.evidence==='conditional'&&option.provider==='Study.com')));
 assert.equal(doc.models.filter(model=>model.id===id).length,1);assert(fs.existsSync('content/curricula/overlays/wgu-bsmgt-study-202605.json'));
});

const test=require('node:test'),assert=require('node:assert/strict');
const doc=require('./content/curricula/wgu.json'),pack=require('./dist/data/curricula/wgu.json'),Planner=require('./dist/planner.js');
const patch=require('./content/curricula/overlays/wgu-bsmgt-sophia-d078-202605.json');
const id='curriculum-wgu-catalog-ecceaa488637ac83',optionId='sophia-soph-0032-bsmgt-business-environment-applications-i-reviewed';
test('Sophia Business Law is an exact university-approved receiving requirement with separate source and award units',()=>{
 const occurrences=doc.models.flatMap(model=>model.requirements.flatMap(row=>row.options.filter(option=>option.id===optionId).map(option=>({model,row,option}))));
 assert.equal(occurrences.length,1);const {model,row,option}=occurrences[0];assert.equal(model.id,id);assert.equal(model.catalog,'202605');assert.equal(model.mappingCheckedOn,'2026-11-20');assert.equal(option.mappingChecked,'2026-11-17');assert.equal(option.mappingReviewId,'wgu-bsmgt-240-approved-20261117');assert.equal(row.code,'D078');assert.equal(row.credits,2);
 assert.equal(option.code,'SOPH-0032');assert.deepEqual(option.codeAliases,['BUSI1050']);assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.credits,2);assert.equal(option.creditSystem,'competency-unit');assert.equal(option.evidence,'published');assert.equal(option.evidenceType,'official-receiving-school-equivalency');
 assert(option.conditions.some(note=>/202605/.test(note)));assert.equal(option.universityMapRecord.programId,240);assert.equal(option.universityMapRecord.agreementId,7112);assert.equal(option.mappingEvidence.receivingCode,'D078');
 const refs=new Map(doc.sources.map(source=>[source.id,source]));for(const sourceId of option.sourceIds)assert(refs.has(sourceId));assert.equal(refs.get('wgu-sophia-business-law-2026-11').checked,'2026-11-15');assert.match(refs.get('wgu-sophia-business-law-2026-11').url,/sophia\.org\/online-courses\/business-law-3$/);
 assert.equal(patch.requirements.length,1);assert.equal(patch.requirements[0].options[0].id,optionId);
});
test('the compiled published alternative is selectable without a conditional override and never awards completed credit',()=>{
 const model=pack.models.find(model=>model.id===id),row=model.requirements.find(row=>row.code==='D078');assert(row.options.some(option=>option.id===optionId));
 const proposed=Planner.generate(model,{providers:['Sophia'],allowConditional:false,optionSelections:{[row.id]:optionId}});assert.equal(proposed.rows.find(item=>item.requirementId===row.id).option.id,optionId);assert.equal(proposed.totals.external,60);assert.equal(proposed.totals.confirmed,0);assert.equal(proposed.validation.academicCountsValid,true);
 const published=Planner.generate(model,{providers:['Sophia'],allowConditional:false});assert(published.rows.some(item=>item.option?.id===optionId));
 assert(!model.requirements.find(row=>row.title==='Introduction to Business Finance').options.some(option=>option.code==='SOPH-0032'));
 const cs=pack.models.find(model=>/Computer Science/.test(model.title));assert(!cs.requirements.some(row=>row.options.some(option=>option.id===optionId||option.provider==='Study.com')));
});

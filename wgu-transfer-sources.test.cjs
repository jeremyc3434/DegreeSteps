const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Planner=require('./dist/planner.js');
const doc=require('./content/curricula/wgu.json'),pack=require('./dist/data/curricula/wgu.json');
const id='curriculum-wgu-catalog-ecceaa488637ac83',business=pack.models.find(model=>model.id===id);
test('the ten retained Study.com choices now have university-issued receiving evidence and independent source quantities',()=>{
 const options=business.requirements.flatMap(row=>row.options.filter(option=>option.provider==='Study.com').map(option=>({row,option})));
 assert.equal(options.length,10);assert.equal(new Set(options.map(({option})=>option.code)).size,10);
 assert.equal(options.reduce((sum,{row})=>sum+row.credits,0),28);
 for(const {row,option}of options){assert.equal(option.evidence,'published');assert.equal(option.creditSystem,'competency-unit');assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceCredits,3);assert.equal(option.credits,row.credits);assert.match(row.code,/^[CD]\d{3}$/);assert(option.conditions.some(note=>/202605/.test(note)));assert.equal(option.universityMapRecord.programId,240);assert.equal(option.universityMapRecord.agreementId,4429);}
 const finance=business.requirements.find(row=>row.title==='Introduction to Business Finance');assert(finance);assert(!finance.options.some(option=>option.provider==='Study.com'));
 const cs=pack.models.find(model=>/Computer Science/.test(model.title));assert(!cs.requirements.some(row=>row.options.some(option=>option.provider==='Study.com')));
});
test('published choices supply the complete 69-CU outside route without claiming completed student awards',()=>{
 const settings={allowConditional:false,priority:'transfer'};
 const sophia=Planner.generate(business,{...settings,providers:['Sophia']}),mixed=Planner.generate(business,{...settings,providers:['Sophia','Study.com']});
 assert.equal(sophia.totals.external,60);assert.equal(mixed.totals.external,69);assert.equal(mixed.totals.institutional,41);assert.equal(mixed.validation.academicCountsValid,true);assert.equal(mixed.totals.confirmed,0);assert(!mixed.blockers.some(error=>error.code==='conditional_mapping'));assert.equal(mixed.costs.universityTuition,null);
});
test('the retained supplement records the same reviewed catalog and source facts',()=>{
 const patch=require('./content/curricula/overlays/wgu-bsmgt-study-202605.json');
 assert.equal(patch.modelId,id);assert.equal(patch.catalog,'202605');assert.equal(patch.requirements.length,10);
 assert.equal(patch.requirements.reduce((sum,row)=>sum+row.credits,0),28);
 assert(patch.requirements.every(row=>row.options.every(option=>option.evidence==='conditional'&&option.provider==='Study.com')));
 assert.equal(doc.models.filter(model=>model.id===id).length,1);assert(fs.existsSync('content/curricula/overlays/wgu-bsmgt-study-202605.json'));
});

const test=require('node:test'),assert=require('node:assert/strict');
const Audit=require('./dist/audit-curriculum.js'),Guide=require('./dist/guide-engine.js');
function reviewedEntry(){
 const entry=Audit.create([{section:'General education',code:'ENG101',title:'Composition',credits:3}],{school:'Example University',title:'B.S. Business',level:'bachelor',modality:'online',totalCredits:3,sourceUrl:'https://catalog.example.edu/degree/',reviewedByStudent:true});
 const model=entry.model,row=model.requirements[0];model.communityTemplate={id:'reviewed-public-123',revision:2,sourcesReviewed:true,academicReviewed:true};
 row.options[0].evidence='published';model.sources.push({id:'official-transfer-map',url:'https://www.example.edu/transfer/sophia.pdf'});
 row.options.push({id:'sophia-english',provider:'Sophia',title:'English Composition I',code:'SOPH-0015',receivingCode:'ENG101',credits:3,creditSystem:'semester',sourceIds:['official-transfer-map'],evidence:'published'});
 return entry;
}
test('reviewed public imports retain exact published course evidence without confirming student records',()=>{
 const entry=reviewedEntry(),before=JSON.stringify(entry),validated=Audit.validateEntry(entry);
 assert(validated.model.requirements[0].options.every(option=>option.evidence==='published'));
 assert.equal(validated.model.auditProvenance.independentlyVerified,false);assert.equal(validated.model.completeExecutablePathway,false);
 const matches=Guide.matchInventory(validated.model,[{id:'earned-english',provider:'Sophia',code:'SOPH-0015',title:'Composition',credits:3,creditSystem:'semester',status:'earned',evaluations:[]}]);
 assert.equal(matches.completed[0].status,'reported');assert.equal(JSON.stringify(entry),before);
});
test('manual, unreviewed, and AI imports cannot promote their options to published',()=>{
 for(const mutate of [m=>delete m.communityTemplate,m=>m.communityTemplate.sourcesReviewed=false,m=>m.communityTemplate.academicReviewed=false,m=>m.communityTemplate.revision=0,m=>m.communityTemplate.revision=1.5,m=>m.communityTemplate.id='',m=>m.communityTemplate.id='bad/id',m=>{m.auditProvenance={...m.auditProvenance,status:'ai-research',reviewedByStudent:false,templateId:'ai-123',templateRevision:1};}]){const entry=reviewedEntry();mutate(entry.model);assert.throws(()=>Audit.validateEntry(entry));}
 const research=Audit.createResearch([{section:'Major',code:'EX101',title:'A researched requirement',credits:3}],{school:'Example University',title:'Example degree',level:'bachelor',modality:'online',totalCredits:3,sourceUrl:'https://example.edu/catalog',templateId:'research-123',templateRevision:1});
 assert(research.model.requirements.every(row=>row.options.every(option=>option.evidence==='conditional')));
});
test('published reviewed choices require exact receiving identity, units, and official source binding',()=>{
 const mutations=[m=>delete m.requirements[0].code,m=>delete m.requirements[0].sourceIds,m=>m.requirements[0].sourceIds=['not-a-source'],m=>m.requirements[0].options[0].code='ENG102',m=>delete m.requirements[0].options[1].receivingCode,m=>m.requirements[0].options[1].receivingCode='ENG102',m=>m.requirements[0].options[1].creditSystem='quarter',m=>m.requirements[0].options[1].sourceIds=['missing-source'],m=>m.sources.find(source=>source.id==='official-transfer-map').url='https://example.edu.attacker.test/transfer.pdf',m=>m.requirements[0].options[1].selectionRequired=true,m=>m.requirements[0].options[1].credits=6,m=>m.requirements[0].institutionalOnly=true,m=>m.completeExecutablePathway=true,m=>m.auditProvenance.independentlyVerified=true];
 for(const mutate of mutations){const entry=reviewedEntry();mutate(entry.model);assert.throws(()=>Audit.validateEntry(entry));}
});
test('actual reviewed Liberty named receiving awards survive the private import boundary',()=>{
 const original=require('./dist/data/liberty-criminal-justice-residential.json'),row=original.requirements.find(row=>row.code==='ENGL 101'),entry=reviewedEntry(),model=entry.model;
 model.school=original.school;model.title=original.title;model.sources=structuredClone(original.sources);model.totalCredits=row.credits;model.requirements=[structuredClone(row)];model.auditProvenance.referenceUrl=original.sources.find(source=>source.url.includes('liberty.edu')).url;
 model.requirements[0].options=model.requirements[0].options.filter(option=>option.provider==='University'||option.receivingCode===row.code);
 for(const option of model.requirements[0].options)if(option.provider==='University'){option.code=option.code||row.code;option.creditSystem=original.creditSystem;}
 entry.route.school=model.school;entry.route.title=model.title;entry.route.url=model.auditProvenance.referenceUrl;
 assert(model.requirements[0].options.some(option=>option.provider==='Sophia'&&option.evidence==='published'));
 const validated=Audit.validateEntry(entry);assert(validated.model.requirements[0].options.every(option=>option.evidence==='published'));assert.equal(validated.model.auditProvenance.independentlyVerified,false);
});

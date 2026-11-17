/** Apply current fixed CLI awards only to exact Liberty undergraduate rows. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {validateLibertyCLIAwards,applicableLibertyCLIAwards} from './liberty-cli-awards.mjs';
const root=resolve(import.meta.dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
export async function readLibertyCLIReview(){
 const document=JSON.parse(await readFile(resolve(root,'content/transfer-awards/liberty-cli-reviewed-2026-11-17.json'),'utf8'));
 const bytes=await readFile(resolve(root,document.calculatorRequest.sourceSnapshot));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),document.calculatorRequest.sha256,'The retained calculator source changed');
 return validateLibertyCLIAwards(document,JSON.parse(bytes));
}
export function addLibertyCLIOptions(input,review,routeRecords=[]){
 if(input?.school!=='Liberty University')return input;
 const declared=input.level||[...new Set(routeRecords.map(route=>route.level))].filter(Boolean).find(level=>['associate','bachelor'].includes(level)),levelKey=String(declared||'').toLowerCase().replace(/[^a-z]/g,''),level=({associates:'associate',bachelors:'bachelor',associate:'associate',bachelor:'bachelor'})[levelKey]||declared;
 if(!['associate','bachelor'].includes(level))return input;
 const model=copy(input),used=new Set();
 const defaults=Array.isArray(input.defaultProviders)?[...input.defaultProviders]:[...new Set((input.requirements||[]).flatMap(row=>(row.options||[]).map(option=>option.provider)))].filter(provider=>provider!=='University'&&provider!==review.provider);
 for(const row of model.requirements||[]){
  for(const award of applicableLibertyCLIAwards(review,{school:model.school,level,format:model.format,creditSystem:model.creditSystem||'semester',credits:row.credits,receivingCode:row.code,institutionalOnly:row.institutionalOnly,requiredAtUniversity:row.requiredAtUniversity})){
   const link=new URL(award.providerCourseUrl),exactCourse=link.hostname==='christianleaders.org'&&link.pathname==='/course/view.php'&&/^\d+$/.test(link.searchParams.get('id')||'');
   const option={...award,...(exactCourse?{courseUrl:link.href}:{providerDirectoryUrl:link.href}),preapprovalRequired:true,receivingMapStatus:'published-university-calculator',issuerReview:copy(review.issuerReview),providerPacePolicy:copy(review.paceReview)};
   const index=(row.options||[]).findIndex(existing=>existing.id===option.id);
   row.options=row.options||[];if(index<0)row.options.push(option);else row.options[index]=option;
   for(const id of [...option.sourceIds,...option.identitySourceIds])used.add(id);
  }
  if((row.options||[]).some(option=>option.provider===review.provider)){
   const official=option=>option.mappingReviewId==='liberty-official-2026-11-10';
   row.options=[...row.options.filter(option=>option.provider!==review.provider&&!official(option)),...row.options.filter(option=>option.provider===review.provider),...row.options.filter(official)];
  }
 }
 if(!used.size)return input;
 // Research candidates are browseable alternatives. They do not silently
 // replace a documented route or a student's saved provider preferences.
 model.defaultProviders=defaults;
 const sources=new Map((model.sources||[]).map(source=>[source.id,source]));
 for(const source of review.sources.filter(source=>used.has(source.id))){assert(!sources.has(source.id)||sources.get(source.id).url===source.url);sources.set(source.id,copy(source));}
 model.sources=[...sources.values()];model.cliMappingReview={checkedOn:review.checkedOn,sourceSnapshot:review.calculatorRequest.sourceSnapshot,receivingAwardSource:review.calculatorRequest.url,scope:'Exact fixed receiving awards; undergraduate degree/format and eligible transcript-route conditions remain explicit.'};
 return model;
}
export async function run({check=false}={}){
 const review=await readLibertyCLIReview(),files=['liberty.json','liberty-criminal-justice-online.json','liberty-criminal-justice-residential.json'];let placements=0;
 for(const file of files){const path=resolve(root,'dist/data',file),before=JSON.parse(await readFile(path,'utf8')),after=addLibertyCLIOptions(before,review);placements+=after.requirements.reduce((sum,row)=>sum+row.options.filter(option=>option.provider===review.provider).length,0);if(check)assert.deepEqual(before,after,file+' needs current CLI award evidence');else await writeFile(path,JSON.stringify(after,null,2)+'\n');}
 return{check,files:files.length,placements,distinctReceivingAwards:review.awards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));

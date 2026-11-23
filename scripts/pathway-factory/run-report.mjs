/**
 * Pull request body for an automated draft run (.github/workflows/factory-draft.yml): which drafts verify, their
 * errors, and each drafted program's coverage by in-scope equivalencies. Reads the batch summary that
 * `draft.mjs --batch --summary <file>` writes. Prints Markdown; never changes the kit.
 * Usage: node scripts/pathway-factory/run-report.mjs --school <kit-dir-or-id> --summary <file.json> [--run-url <url>]
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {list,exists,loadKit,resolveKitDir,readJSON,parseArgs,isMain,root,today} from './lib.mjs';
import {verifyKit} from './verify.mjs';
import {programCoverage,schoolReport,formatReport} from './report.mjs';
import {estimateCost} from './draft.mjs';

export const MAX_BODY=60000;
const cell=value=>String(value??'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');

export function draftRunMarkdown({summary,kit,verification,catalog=null,runUrl=''}){
  const items=list(summary.items),drafted=items.filter(item=>item.status==='drafted');
  const byFile=new Map();for(const error of list(verification?.errors))(byFile.get(error.file)||byFile.set(error.file,[]).get(error.file)).push(error);
  const programFile=item=>`programs/${item.slug}.json`;
  const usage=items.reduce((sum,item)=>({input:sum.input+(item.usage?.input||0),output:sum.output+(item.usage?.output||0)}),{input:0,output:0});
  const lines=[
    `## Pathway Factory draft run: ${kit.school.name} (\`${kit.school.id}\`)`,'',
    `${items.length} catalog page(s) submitted; ${drafted.length} drafted; ${drafted.filter(item=>!(byFile.get(programFile(item))||[]).length).length} pass verification.`+(summary.batchId?` Message Batch \`${summary.batchId}\`.`:'')+(runUrl?` [Workflow run](${runUrl}).`:''),
  ];
  if(usage.input||usage.output)lines.push('',`Billed tokens (batch rates): ${usage.input} input, ${usage.output} output, about $${estimateCost(usage).toFixed(2)}.`);
  if(summary.newSchool)lines.push('',`**New school.** \`${summary.newSchool}\` is a skeleton: replace its placeholder name, add the school's sources and policies, and check its credit system before review.`);
  lines.push('','**Every program here is `status: draft`.** Drafts never compile or publish. A reviewer checks each requirement against its quote, fixes errors, binds route ids, then sets `review: {status: "reviewed", reviewer, reviewedOn}` in a separate change. Publishing stays a human step (`npm run factory:publish`).','',
    '| Catalog page | Result | Program | Verification | Covered by in-scope equivalencies |','| --- | --- | --- | --- | --- |');
  for(const item of items){
    if(item.status!=='drafted'){lines.push(`| ${cell(item.url)} | ${cell(item.status)} | — | ${cell(item.error||'not drafted')} | — |`);continue;}
    const program=kit.programs.find(p=>p.slug===item.slug),errors=byFile.get(programFile(item))||[];
    const coverage=program?programCoverage(kit,program):null;
    lines.push(`| ${cell(item.url)} | drafted | \`${cell(programFile(item))}\` ${cell(program?.title||'')} | ${errors.length?`${errors.length} error(s)`:'passes'} | ${coverage?`${coverage.coveredPercent}% (${coverage.coveredCredits}/${coverage.totalCredits} ${coverage.creditSystem}; candidates ${coverage.candidatePercent}%)`:'—'} |`);
  }
  const failing=drafted.filter(item=>(byFile.get(programFile(item))||[]).length);
  if(failing.length){
    lines.push('','### Verification errors in the drafts');
    for(const item of failing){lines.push('',`**${programFile(item)}**`);for(const error of byFile.get(programFile(item)))lines.push(`- [${error.code}] ${cell(error.message)}`);}
  }
  const other=[...byFile].filter(([file])=>!drafted.some(item=>programFile(item)===file));
  if(other.length)lines.push('',`Existing kit files also report ${other.reduce((n,[,e])=>n+e.length,0)} error(s) (${other.map(([file])=>'`'+file+'`').join(', ')}); they are not part of this run.`);
  const body=lines.join('\n')+'\n',leverage=['','<details><summary>Kit leverage report</summary>','','```',formatReport(schoolReport(kit,catalog)),'```','','</details>',''].join('\n');
  // GitHub caps a pull request body at 65,536 characters; the leverage report is the part to drop.
  return body.length+leverage.length<=MAX_BODY?body+leverage:body.length<=MAX_BODY?body+'\nThe kit leverage report is too long for this description; run `npm run factory:report -- '+kit.school.id+'` locally.\n':body.slice(0,MAX_BODY-200)+'\n\n… truncated; see the workflow run log for the rest.\n';
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.school||!args.summary)throw Error('Usage: run-report.mjs --school <kit-dir-or-id> --summary <file.json> [--run-url <url>]');
  const summary=JSON.parse(await readFile(resolve(args.summary),'utf8'));
  const dir=resolveKitDir(args.school);
  if(!await exists(resolve(dir,'school.json'))){
    // A new school whose every page failed has no kit yet: report the pages only.
    process.stdout.write([`## Pathway Factory draft run: new school \`${args.school}\``,'','No program was drafted, so no kit was created. Captures that succeeded are included for a hand draft.','',...list(summary.items).map(item=>`- ${item.url}: ${item.status}${item.error?' — '+item.error:''}`)].join('\n')+'\n');
    return;
  }
  const kit=await loadKit(dir);
  const verification=await verifyKit(kit,{asOf:today()});
  let catalog=null;try{catalog=await readJSON(resolve(root,'dist/data/program-catalog.json'));}catch{}
  process.stdout.write(draftRunMarkdown({summary,kit,verification,catalog,runUrl:args['run-url']||''}));
}
if(isMain(import.meta))await main();

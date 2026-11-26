/** Refresh reviewed school kits and their dependent public indexes, in dependency order. */
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const scripts=[
  ['pathway-factory/compile.mjs',['--publish']],
  ['build-curriculum-registry.mjs',[]],
  ['build-research-references.mjs',[]],
  ['build-plan-estimate-rates.mjs',[]],
  ['build-academic-registry.mjs',[]],
  ['build-pathway-quality-report.mjs',[]],
  ['build-plan-expansion-queue.mjs',[]],
  ['build-plan-library-index.mjs',[]],
  ['build-plan-course-index.mjs',[]],
  ['catalog-plan-identities.mjs',[]],
  ['provider-directory-discovery.mjs',[]],
  ['build-provider-coverage-report.mjs',[]],
  ['build-research-priorities.mjs',[]],
  ['build-school-research-batch.mjs',[]],
  ['build-coach-index.mjs',[]]
];

export function refreshPlan({check=false}={}){
  return scripts.map(([script,args])=>({script:'scripts/'+script,args:[...args,...(check?['--check']:[])]}));
}

export function parseArguments(args){
  for(const arg of args)if(!['--check','--plan'].includes(arg))throw Error('Unknown option '+arg+'. Use --check to validate or --plan to print commands without running them.');
  return {check:args.includes('--check'),planOnly:args.includes('--plan')};
}

function executeStep(step){
  return new Promise((accept,reject)=>{
    const child=spawn(process.execPath,[resolve(root,step.script),...step.args],{cwd:root,stdio:'inherit',shell:false});
    child.once('error',reject);
    child.once('close',(status,signal)=>accept({status,signal}));
  });
}

export async function refreshFactory({check=false,planOnly=false,execute=executeStep,now=()=>performance.now(),emit=value=>console.log(JSON.stringify(value))}={}){
  const plan=refreshPlan({check});
  if(planOnly){
    const report={workflow:'plan-factory',mode:check?'check':'refresh',planOnly:true,commands:plan.map(step=>({executable:process.execPath,...step})),executedSteps:0};
    emit(report);return report;
  }
  const started=now(),steps=[];
  for(const step of plan){
    emit({workflow:'plan-factory',script:step.script,status:'started',check});
    const stepStarted=now();
    let result;
    try{result=await execute(step);}catch(error){result={status:null,signal:null,error:error.message};}
    const passed=result?.status===0&&!result?.signal&&!result?.error;
    const receipt={script:step.script,status:passed?'passed':'failed',durationMs:Math.round((now()-stepStarted)*100)/100,exitCode:result?.status??null,...(result?.signal?{signal:result.signal}:{}),...(result?.error?{error:result.error}:{})};
    steps.push(receipt);emit({workflow:'plan-factory',...receipt});
    if(!passed){
      const report={workflow:'plan-factory',mode:check?'check':'refresh',status:'failed',durationMs:Math.round((now()-started)*100)/100,steps};
      emit(report);const error=Error('Plan factory stopped at '+step.script+'. Fix the failure and rerun; later indexes were not refreshed.');error.report=report;throw error;
    }
  }
  const report={workflow:'plan-factory',mode:check?'check':'refresh',status:'passed',durationMs:Math.round((now()-started)*100)/100,steps};
  emit(report);return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{await refreshFactory(parseArguments(process.argv.slice(2)));}catch(error){console.error(error.message);process.exitCode=1;}
}

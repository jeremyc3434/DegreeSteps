/** Native Anthropic caching of explicitly supplied, public static system text.
 * Eligibility is measured with constant non-private messages. Neither questions
 * nor course records enter the verification cache or a cache breakpoint. */
const COUNT_API='https://api.anthropic.com/v1/messages/count_tokens';
const API_VERSION='2026-10-21';
const MODEL_MINIMUMS=Object.freeze({'claude-sonnet-5-5':512});
const OVERHEAD_MARGIN=64,MAX_RESPONSE_BYTES=8192;
const COUNT_MESSAGE=Object.freeze({role:'user',content:'Ready.'});
const encode=new TextEncoder();

function systemBlocks(value){
  const source=typeof value==='string'?[{type:'text',text:value}]:value;
  if(!Array.isArray(source)||!source.length||source.length>8||source.some(block=>!block||block.type!=='text'||typeof block.text!=='string'||!block.text.length))throw Error('Static system text blocks are required.');
  const blocks=source.map(block=>({type:'text',text:block.text}));
  if(encode.encode(JSON.stringify(blocks)).byteLength>131072)throw Error('The static system prefix is too large.');
  return blocks;
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
function clone(value){return JSON.parse(JSON.stringify(value));}

async function countTokens(body,{apiKey,fetcher,apiVersion,timeoutMs}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let aborted;
  const stopped=new Promise((_,reject)=>{aborted=()=>reject(Error('Count request timed out.'));controller.signal.addEventListener('abort',aborted,{once:true});});
  try{
    const pending=Promise.resolve().then(()=>fetcher(COUNT_API,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Accept':'application/json','anthropic-version':apiVersion,'x-api-key':apiKey},body:JSON.stringify(body),signal:controller.signal}));
    void pending.then(response=>{if(controller.signal.aborted)void response?.body?.cancel().catch(()=>{});},()=>{});
    const response=await Promise.race([pending,stopped]);
    if(!response?.ok||Number(response.headers.get('Content-Length'))>MAX_RESPONSE_BYTES){void response?.body?.cancel().catch(()=>{});throw Error('Count request failed.');}
    const reader=response.body?.getReader();if(!reader)throw Error('Missing count response.');
    const cancel=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancel,{once:true});
    let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
    try{while(true){const part=await Promise.race([reader.read(),stopped]);if(controller.signal.aborted)throw Error('Count request timed out.');if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw Error('Count response too large.');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
    finally{controller.signal.removeEventListener('abort',cancel);await Promise.race([reader.cancel().catch(()=>{}),stopped.catch(()=>{})]);reader.releaseLock();}
    const data=JSON.parse(text),n=data?.input_tokens;
    if(!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('Invalid count response.');
    return n;
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',aborted);}
}

/** The factory permits isolated deterministic tests; production uses the bounded
 * module singleton below. There is no prewarming or background generation. */
export function createAnthropicPromptCache({maxEntries=64,verificationTtlMs=3600000,countTimeoutMs=5000,now=Date.now}={}){
  const bound=Math.max(1,Math.min(128,Math.floor(maxEntries)||64)),lifetime=Math.max(1,Math.min(86400000,Number(verificationTtlMs)||3600000)),timeout=Math.max(10,Math.min(10000,Number(countTimeoutMs)||5000)),entries=new Map();
  function retain(key,entry){entries.delete(key);entries.set(key,entry);while(entries.size>bound)entries.delete(entries.keys().next().value);}
  async function prepare({model,workflow,promptVersion,system:providedSystem,enabled=false,apiKey,fetcher=fetch,apiVersion=API_VERSION,thinking,outputConfig}={}){
    const blocks=systemBlocks(providedSystem);
    const telemetry={workflow,promptVersion,cacheMode:'off',cacheStatus:'disabled',prefixTokens:null};
    if(!enabled)return{system:blocks,telemetry};
    const minimum=MODEL_MINIMUMS[model];
    if(!minimum)return{system:blocks,telemetry:{...telemetry,cacheStatus:'unknown-model'}};
    if(typeof apiKey!=='string'||apiKey.length<20||apiKey.length>4096||!/^[\x21-\x7e]+$/.test(apiKey)||typeof fetcher!=='function')return{system:blocks,telemetry:{...telemetry,cacheStatus:'verification-failed'}};
    let prefixDigest,config,settingsDigest;
    try{prefixDigest=await digest(JSON.stringify(blocks));config={...(thinking?{thinking:clone(thinking)}:{}),...(outputConfig?{output_config:clone(outputConfig)}:{})};settingsDigest=await digest(JSON.stringify(config));}
    catch{return{system:blocks,telemetry:{...telemetry,cacheStatus:'verification-failed'}};}
    const key=[model,promptVersion,prefixDigest,settingsDigest,apiVersion].join(':');
    let entry=entries.get(key),verification;
    if(entry&&entry.expiresAt>now()){retain(key,entry);verification=await entry.promise;}
    else{
      entries.delete(key);
      const promise=(async()=>{
        // max_tokens is not a Count Tokens parameter. The two requests contain
        // identical model/output settings and only this constant user message.
        const baseline={model,...config,messages:[{...COUNT_MESSAGE}]};
        const values=await Promise.allSettled([
          countTokens({...baseline,system:blocks},{apiKey,fetcher,apiVersion,timeoutMs:timeout}),
          countTokens(baseline,{apiKey,fetcher,apiVersion,timeoutMs:timeout})
        ]);
        if(values.some(result=>result.status!=='fulfilled'))return{status:'verification-failed',tokens:null};
        const tokens=Math.max(0,values[0].value-values[1].value-OVERHEAD_MARGIN);
        return{status:tokens>=minimum?'verified':'below-minimum',tokens};
      })();
      entry={promise,expiresAt:now()+lifetime};retain(key,entry);verification=await promise;
      if(verification.status==='verification-failed'&&entries.get(key)===entry)entries.delete(key);
    }
    if(verification.status!=='verified')return{system:blocks,telemetry:{...telemetry,cacheStatus:verification.status,prefixTokens:verification.tokens}};
    return{system:blocks.map((block,index)=>index===blocks.length-1?{...block,cache_control:{type:'ephemeral',ttl:'5m'}}:block),telemetry:{...telemetry,cacheMode:'explicit-5m',cacheStatus:'verified',prefixTokens:verification.tokens}};
  }
  return Object.freeze({prepare,statistics:()=>({entries:entries.size,maxEntries:bound})});
}
const defaultPromptCache=createAnthropicPromptCache();
export async function prepareAnthropicPromptCache(options){return defaultPromptCache.prepare(options);}

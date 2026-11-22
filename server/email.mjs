/** Outbound email through Resend's HTTP API (POST https://api.resend.com/emails, Bearer key).
 * House pattern for outbound calls: injectable fetch (EMAIL_FETCH), a hard timeout, no redirects,
 * bounded response reads. RESEND_API_KEY is read only at send time and never logged, thrown or returned. */
const DegreeEmail=(()=>{
  'use strict';
  const RESEND_URL='https://api.resend.com/emails',DEFAULT_FROM='DegreeSteps <plans@degreesteps.com>';
  const TIMEOUT=10000,MAX_RESPONSE=16384,MAX_SUBJECT=200,MAX_BODY=200000;
  const ADDRESS=/^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const unsafe=value=>/[\u0000-\u001f\u007f]/.test(value);
  function validAddress(value){return typeof value==='string'&&value.length<=254&&ADDRESS.test(value);}
  function sender(value){
    const from=typeof value==='string'&&value.trim()?value.trim():DEFAULT_FROM;
    if(from.length>200||unsafe(from))return null;
    const named=from.match(/^([^<>"\r\n]{1,80}) <([^<>\s]+)>$/);
    return (named?validAddress(named[2]):validAddress(from))?from:null;
  }
  /** Settings safe to show an operator: never includes the key itself. */
  function settings(env={}){
    const key=typeof env.RESEND_API_KEY==='string'?env.RESEND_API_KEY.trim():'';
    const cap=Math.floor(Number(env.EMAIL_DAILY_CAP));
    return{keyConfigured:Boolean(key)&&key.length<=512&&!unsafe(key),from:sender(env.EMAIL_FROM),postalAddress:typeof env.EMAIL_POSTAL_ADDRESS==='string'&&env.EMAIL_POSTAL_ADDRESS.trim()&&!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(env.EMAIL_POSTAL_ADDRESS)?env.EMAIL_POSTAL_ADDRESS.trim().slice(0,300):'',dailyCap:Number.isSafeInteger(cap)&&cap>=0&&cap<=100000?cap:200};
  }
  async function readBounded(response){
    const reader=response.body?.getReader();if(!reader)return null;let size=0;const parts=[];
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_RESPONSE){await reader.cancel().catch(()=>{});return null;}parts.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return null;}
  }
  /** Sends one message. Returns {ok:true,id} or {ok:false,code,retryable}; never throws and never echoes provider text. */
  async function send(env,message){
    const config=settings(env),key=config.keyConfigured?env.RESEND_API_KEY.trim():'';
    if(!key||!config.from)return{ok:false,code:'not_configured',retryable:false};
    const {to,subject,text,html,headers={},idempotencyKey,tags=[]}=message||{};
    if(!validAddress(to)||typeof subject!=='string'||!subject||subject.length>MAX_SUBJECT||unsafe(subject)||typeof text!=='string'||!text||text.length>MAX_BODY||typeof html!=='string'||!html||html.length>MAX_BODY)return{ok:false,code:'invalid_message',retryable:false};
    for(const [name,value]of Object.entries(headers))if(!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name)||typeof value!=='string'||value.length>2000||unsafe(value))return{ok:false,code:'invalid_message',retryable:false};
    const body={from:config.from,to:[to],subject,text,html,...(Object.keys(headers).length?{headers}:{}),...(tags.length?{tags:tags.filter(tag=>/^[A-Za-z0-9_-]{1,256}$/.test(tag?.name||'')&&/^[A-Za-z0-9_-]{1,256}$/.test(tag?.value||''))}:{})};
    const requestHeaders={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'};
    if(typeof idempotencyKey==='string'&&/^[A-Za-z0-9_:/.-]{1,256}$/.test(idempotencyKey))requestHeaders['Idempotency-Key']=idempotencyKey;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(TIMEOUT,Math.max(1,Number(env.EMAIL_TIMEOUT_MS)||TIMEOUT)));
    try{
      const fetcher=typeof env.EMAIL_FETCH==='function'?env.EMAIL_FETCH:fetch;
      // Never follow a redirect with the API key attached.
      const response=await fetcher(RESEND_URL,{method:'POST',redirect:'manual',signal:controller.signal,headers:requestHeaders,body:JSON.stringify(body)});
      if(response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>{});return{ok:false,code:'provider_redirect',retryable:false};}
      if(!response.ok){await response.body?.cancel().catch(()=>{});return{ok:false,code:response.status===429?'rate_limited':response.status===401||response.status===403?'not_authorized':response.status>=500?'provider_unavailable':'rejected',retryable:response.status===429||response.status>=500};}
      const data=await readBounded(response);
      return typeof data?.id==='string'&&data.id.length<=200?{ok:true,id:data.id}:{ok:false,code:'invalid_response',retryable:false};
    }catch{return{ok:false,code:controller.signal.aborted?'timeout':'network',retryable:true};}
    finally{clearTimeout(timer);}
  }
  return{send,settings,validAddress,sender,RESEND_URL,DEFAULT_FROM};
})();
export function sendEmail(env,message){return DegreeEmail.send(env,message);}
export function emailSettings(env){return DegreeEmail.settings(env);}
export function validEmailAddress(value){return DegreeEmail.validAddress(value);}

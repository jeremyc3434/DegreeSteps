/* DegreeSteps degree coach (beta). Renders nothing unless GET /api/coach/status says {enabled:true}.
 * Model text is never inserted as HTML: answers are split into paragraphs, "- " bullets and links, and only
 * same-site relative links (or the known app pages) become anchors. Reads the saved draft only when the student
 * ticks the box for one message, and sends only course titles, providers, credits and the chosen plan id. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.DegreeCoach=api;if(root.document)api.boot(root);}
}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const DRAFT_KEY='degreepath-guide-v3',MAX_QUESTION=1000,MAX_HISTORY=10;
  const KNOWN_PAGES=/^(?:portal|programs|credits-worth|plan)\.html(?:[?#][A-Za-z0-9\-._~\/?=&%#+]*)?$/;
  const STARTERS=['Which plan uses my Sophia courses best?','What does “needs school confirmation” mean?','Cheapest online psychology bachelor’s?'];
  const NOTICE='Questions are saved without your name to improve DegreeSteps. Don’t include personal details.';

  /** A same-site relative path (or a known app page), else null. Never a scheme, protocol-relative or encoded trick. */
  function safeHref(value){
    if(typeof value!=='string')return null;
    const href=value.trim();
    if(!href||href.length>300||/[\s\\<>"'`\u0000-\u001f\u007f]/.test(href))return null;
    if(/^\/(?![\/\\])[A-Za-z0-9\-._~\/?=&%#+]*$/.test(href)&&!/%2f|%5c|%0|%09/i.test(href.slice(0,4)))return href;
    if(KNOWN_PAGES.test(href))return '/'+href;
    return null;
  }
  const LINK=/\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)|(?:^|(?<=[\s(]))(\/(?![\/\\])[A-Za-z0-9\-._~\/?=&%#+]*|(?:portal|programs|credits-worth|plan)\.html(?:[?#][A-Za-z0-9\-._~\/?=&%#+]*)?|[a-z][a-z0-9+.-]{1,20}:[^\s)]+)/gi;
  /** Splits one line into text and link parts. Unsafe targets stay plain text. */
  function inline(line){
    const parts=[];let last=0,match;LINK.lastIndex=0;
    while((match=LINK.exec(line))){
      let label=match[1],target=match[2]||match[3],end=match.index+match[0].length,trail='';
      if(!label){const stripped=target.replace(/[.,;:!?]+$/,'');trail=target.slice(stripped.length);target=stripped;end-=trail.length;}
      if(match.index>last)parts.push({text:line.slice(last,match.index)});
      const href=safeHref(target);
      parts.push(href?{text:label||target,href}:{text:label||target});
      last=end;
    }
    if(last<line.length)parts.push({text:line.slice(last)});
    return parts.reduce((out,part)=>{const prev=out[out.length-1];if(prev&&!prev.href&&!part.href)prev.text+=part.text;else out.push({...part});return out;},[]);
  }
  /** Plain text -> blocks: paragraphs, bullet lists, and a "Next step:" paragraph. No HTML is interpreted. */
  function parseAnswer(text){
    const blocks=[];let list=null;
    for(const raw of String(text??'').replace(/\r/g,'').split('\n')){
      const line=raw.trim();
      if(!line){list=null;continue;}
      const bullet=line.match(/^(?:[-*•]|\d{1,2}[.)])\s+(.*)$/);
      if(bullet){if(!list){list={type:'list',items:[]};blocks.push(list);}list.items.push(inline(bullet[1]));continue;}
      list=null;
      blocks.push({type:/^next step:/i.test(line)?'next':'paragraph',parts:inline(line)});
    }
    return blocks;
  }
  function renderParts(doc,parent,parts){
    for(const part of parts){
      if(part.href){const a=doc.createElement('a');a.href=part.href;a.textContent=part.text;parent.appendChild(a);}
      else parent.appendChild(doc.createTextNode(part.text));
    }
  }
  /** Builds DOM nodes from parsed blocks using textContent only. */
  function renderAnswer(doc,text){
    const fragment=doc.createDocumentFragment();
    for(const block of parseAnswer(text)){
      if(block.type==='list'){const ul=doc.createElement('ul');for(const item of block.items){const li=doc.createElement('li');renderParts(doc,li,item);ul.appendChild(li);}fragment.appendChild(ul);}
      else{const p=doc.createElement('p');if(block.type==='next')p.className='coach-next';renderParts(doc,p,block.parts);fragment.appendChild(p);}
    }
    return fragment;
  }
  /** Compact summary of the saved draft: finished course titles, providers, credits and the chosen plan id. */
  function savedSummary(storage){
    let state;try{state=JSON.parse(storage?.getItem(DRAFT_KEY)||'null');}catch{return null;}
    if(!state||typeof state!=='object')return null;
    const courses=(Array.isArray(state.learning)?state.learning:[]).filter(record=>record&&record.status==='earned'&&typeof record.title==='string'&&record.title.trim()).slice(0,40)
      .map(record=>({title:String(record.title).trim().slice(0,100),provider:typeof record.provider==='string'?record.provider.trim().slice(0,60):'',credits:Number.isFinite(Number(record.credits))?Number(record.credits):null}));
    const planId=typeof state.selectedPathwayId==='string'&&/^[a-z0-9][a-z0-9-]{2,99}$/.test(state.selectedPathwayId)?state.selectedPathwayId:'';
    return courses.length||planId?{courses,planId}:null;
  }

  function boot(win){
    const doc=win.document;
    const start=()=>{
      win.fetch('/api/coach/status',{credentials:'same-origin',headers:{Accept:'application/json'}})
        .then(response=>response.json().catch(()=>null).then(body=>response.ok?body:null)).catch(()=>null)
        .then(status=>{if(status&&status.enabled===true)mount(win,status);});
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  function mount(win,status){
    const doc=win.document;
    if(doc.querySelector('[data-coach-root]'))return;
    const el=(tag,attrs={},...children)=>{const node=doc.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(value===false||value===null||value===undefined)continue;if(key==='class')node.className=value;else if(key==='text')node.textContent=value;else node.setAttribute(key,value===true?'':value);}for(const child of children)if(child)node.appendChild(typeof child==='string'?doc.createTextNode(child):child);return node;};
    if(!doc.querySelector('link[data-coach-style]')){const link=el('link',{rel:'stylesheet',href:'/coach.css','data-coach-style':true});doc.head.appendChild(link);}
    let remaining=Number(status.remaining)||0;const limit=Number(status.limit)||0,history=[];let busy=false,opener=null;

    const rootNode=el('div',{class:'coach-root','data-coach-root':true});
    const launcher=el('button',{type:'button',class:'coach-launcher','aria-haspopup':'dialog','aria-expanded':'false','data-coach-open':true},el('span',{class:'coach-launcher-icon','aria-hidden':'true',text:'?'}),'Ask the coach');
    const backdrop=el('div',{class:'coach-backdrop',hidden:true,'data-coach-backdrop':true});
    const title=el('h2',{id:'coach-title',text:'Ask the coach'});
    const close=el('button',{type:'button',class:'coach-close','aria-label':'Close the coach','data-coach-close':true,text:'×'});
    const intro=el('p',{class:'coach-intro',text:'Short answers from DegreeSteps’ researched plans, with links. Your school decides what transfers.'});
    const starters=el('div',{class:'coach-starters',role:'group','aria-label':'Example questions'});
    for(const text of STARTERS)starters.appendChild(el('button',{type:'button',class:'coach-starter','data-coach-starter':true,text}));
    const log=el('div',{class:'coach-log',role:'log','aria-live':'polite','aria-relevant':'additions','aria-label':'Coach answers','data-coach-log':true});
    const label=el('label',{for:'coach-question',text:'Your question'});
    const input=el('textarea',{id:'coach-question',name:'question',rows:'3',maxlength:String(MAX_QUESTION),'aria-describedby':'coach-notice coach-count','data-coach-input':true});
    const count=el('span',{id:'coach-count',class:'coach-count','aria-live':'off',text:'0 / '+MAX_QUESTION});
    const saved=savedSummary(win.localStorage);
    const consent=el('input',{type:'checkbox',id:'coach-include-saved','data-coach-include':true});
    const consentRow=saved?el('div',{class:'coach-consent'},consent,el('label',{for:'coach-include-saved',text:'Include my saved courses and plan in this question'})):null;
    const submit=el('button',{type:'submit',class:'coach-submit','data-coach-submit':true,text:'Ask'});
    const left=el('p',{class:'coach-remaining','data-coach-remaining':true});
    const notice=el('p',{id:'coach-notice',class:'coach-notice',text:NOTICE});
    const form=el('form',{class:'coach-form','data-coach-form':true,novalidate:true},label,input,el('div',{class:'coach-form-row'},count,submit),consentRow,left,notice);
    const panel=el('section',{class:'coach-panel',role:'dialog','aria-modal':'true','aria-labelledby':'coach-title',hidden:true,'data-coach-panel':true,tabindex:'-1'},
      el('header',{class:'coach-head'},el('div',{},title,el('span',{class:'coach-badge',text:'Beta'})),close),
      el('div',{class:'coach-body'},intro,starters,log),form);
    rootNode.append(launcher,backdrop,panel);doc.body.appendChild(rootNode);

    // Sit above a fixed bottom navigation bar (the app shell's phone tabs) instead of covering it.
    const lift=()=>{let offset=0;for(const node of doc.body.querySelectorAll('nav,div,footer,section')){if(rootNode.contains(node))continue;const style=win.getComputedStyle(node);if(style.position!=='fixed'&&style.position!=='sticky')continue;const box=node.getBoundingClientRect();if(box.height>0&&box.height<200&&Math.abs(box.bottom-win.innerHeight)<2&&box.width>=win.innerWidth*0.5)offset=Math.max(offset,box.height);}launcher.style.bottom=offset?Math.round(offset+12)+'px':'';};
    lift();win.addEventListener('resize',lift);win.setTimeout(lift,600);
    const updateRemaining=()=>{left.textContent=remaining>0?remaining+' of '+limit+' questions left today':'No questions left today. Try again tomorrow.';submit.disabled=busy||remaining<=0;};
    updateRemaining();
    input.addEventListener('input',()=>{count.textContent=input.value.length+' / '+MAX_QUESTION;});

    const focusables=()=>[...panel.querySelectorAll('button,textarea,input,a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>!node.disabled&&!node.closest('[hidden]')&&node.getClientRects().length);
    const inertSiblings=on=>{for(const child of doc.body.children){if(child===rootNode)continue;if(on){if(!child.hasAttribute('inert')){child.setAttribute('inert','');child.setAttribute('data-coach-inert','');}}else if(child.hasAttribute('data-coach-inert')){child.removeAttribute('inert');child.removeAttribute('data-coach-inert');}}};
    function open(){opener=doc.activeElement&&doc.activeElement!==doc.body?doc.activeElement:launcher;panel.hidden=false;backdrop.hidden=false;launcher.setAttribute('aria-expanded','true');launcher.hidden=true;inertSiblings(true);doc.documentElement.classList.add('coach-open');input.focus();}
    function shut(){panel.hidden=true;backdrop.hidden=true;launcher.hidden=false;launcher.setAttribute('aria-expanded','false');inertSiblings(false);doc.documentElement.classList.remove('coach-open');(opener&&opener.isConnected&&!opener.hidden?opener:launcher).focus();}
    launcher.addEventListener('click',open);close.addEventListener('click',shut);backdrop.addEventListener('click',shut);
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();shut();return;}
      if(event.key!=='Tab')return;
      const items=focusables();if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===panel)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
    });
    starters.addEventListener('click',event=>{const button=event.target.closest('[data-coach-starter]');if(!button)return;input.value=button.textContent;count.textContent=input.value.length+' / '+MAX_QUESTION;send();});
    form.addEventListener('submit',event=>{event.preventDefault();send();});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}});

    function bubble(kind,node){const item=el('div',{class:'coach-msg coach-msg-'+kind});item.appendChild(node);log.appendChild(item);item.scrollIntoView?.({block:'nearest'});return item;}
    function post(path,body){return win.fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json','X-Coach-Request':'1'},body:JSON.stringify(body)}).then(async response=>{let data=null;try{data=await response.json();}catch{}return{ok:response.ok,status:response.status,data:data||{}};});}

    function feedbackControls(id){
      const wrap=el('div',{class:'coach-feedback',role:'group','aria-label':'Was this answer helpful?'});
      const up=el('button',{type:'button',class:'coach-thumb','aria-pressed':'false','aria-label':'Helpful','data-coach-rate':'up',text:'👍'});
      const down=el('button',{type:'button',class:'coach-thumb','aria-pressed':'false','aria-label':'Not helpful','data-coach-rate':'down',text:'👎'});
      const status=el('span',{class:'coach-feedback-status',role:'status'});
      wrap.append(el('span',{class:'coach-feedback-label',text:'Helpful?'}),up,down,status);
      const finish=(rating,reason)=>{up.disabled=true;down.disabled=true;(rating==='up'?up:down).setAttribute('aria-pressed','true');post('/api/coach/feedback',{id,rating,...(reason?{reason}:{})}).then(result=>{status.textContent=result.ok?'Thanks for the feedback.':'Feedback could not be saved.';}).catch(()=>{status.textContent='Feedback could not be saved.';});};
      up.addEventListener('click',()=>finish('up'));
      down.addEventListener('click',()=>{
        up.disabled=true;down.disabled=true;down.setAttribute('aria-pressed','true');
        const reasonId='coach-reason-'+id.slice(0,8),field=el('input',{type:'text',id:reasonId,maxlength:'200',class:'coach-reason-input'});
        const box=el('div',{class:'coach-reason'},el('label',{for:reasonId,text:'What was wrong? (optional, no personal details)'}),field,el('div',{class:'coach-reason-actions'},el('button',{type:'button',class:'coach-reason-send','data-coach-reason-send':true,text:'Send'}),el('button',{type:'button',class:'coach-reason-skip',text:'Skip'})));
        wrap.appendChild(box);field.focus();
        box.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;const reason=target.classList.contains('coach-reason-send')?field.value.trim():'';box.remove();down.setAttribute('aria-pressed','false');finish('down',reason);});
      });
      return wrap;
    }

    function send(){
      const question=input.value.trim();
      if(busy||!question||remaining<=0)return;
      if(question.length>MAX_QUESTION)return;
      busy=true;updateRemaining();starters.hidden=true;
      const body={question,history:history.slice(-MAX_HISTORY)};
      if(consentRow&&consent.checked){const summary=savedSummary(win.localStorage);if(summary){body.includeSaved=true;body.saved=summary;}}
      consent.checked=false;
      bubble('user',el('p',{text:question}));
      input.value='';count.textContent='0 / '+MAX_QUESTION;
      const loading=bubble('loading',el('p',{text:'Checking DegreeSteps’ researched plans…'}));log.setAttribute('aria-busy','true');
      post('/api/coach/ask',body).then(result=>{
        loading.remove();
        if(result.ok&&typeof result.data.answer==='string'){
          const node=renderAnswer(doc,result.data.answer),wrap=doc.createDocumentFragment();wrap.appendChild(node);
          const item=bubble('coach',wrap);
          if(typeof result.data.id==='string')item.appendChild(feedbackControls(result.data.id));
          history.push({role:'user',text:question},{role:'assistant',text:result.data.answer,sig:result.data.sig});
          if(Number.isFinite(result.data.remaining))remaining=result.data.remaining;
        }else{
          const message=typeof result.data.error==='string'?result.data.error:'The coach could not answer right now. Please try again.';
          const item=bubble('error',renderAnswer(doc,message));item.setAttribute('role','alert');
          if(result.status===429)remaining=Number.isFinite(result.data.remaining)?result.data.remaining:remaining;
          if(result.data.code==='coach_daily_limit')remaining=0;
        }
      }).catch(()=>{loading.remove();const item=bubble('error',el('p',{text:'The coach could not be reached. Check your connection and try again.'}));item.setAttribute('role','alert');})
        .finally(()=>{busy=false;log.removeAttribute('aria-busy');updateRemaining();input.focus();});
    }
    return{open,close:shut};
  }

  return{safeHref,parseAnswer,inline,renderAnswer,savedSummary,boot,mount,STARTERS,NOTICE,DRAFT_KEY};
}));

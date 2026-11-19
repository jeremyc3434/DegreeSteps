'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/home-steps.js','utf8');

// Geometry, native events and focus are modeled here. This does not certify
// browser rendering, touch gestures, or CSS; it executes the shipped handlers.
function mount({count=3,reduced=false,inert=true,missing='',deferred=false,clamp=false,badLayout=false,noScrollTo=false}={}){
  const timers=new Map(),scrolls=[],observers=[];let sequence=0;
  const document={activeElement:null},metrics={step:900,cardWidth:880,viewportWidth:1000,bad:badLayout};
  function element(name){
    const attrs=new Map(),classes=new Set(),listeners=new Map();
    const node={name,dataset:{},hidden:false,disabled:false,parent:null,attrs,classes,listeners};
    if(inert)node.inert=false;
    node.classList={add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},toggle(value,force){const add=force===undefined?!classes.has(value):force;if(add)classes.add(value);else classes.delete(value);return add;},contains:value=>classes.has(value)};
    node.setAttribute=(key,value)=>attrs.set(key,String(value));node.getAttribute=key=>attrs.has(key)?attrs.get(key):null;node.removeAttribute=key=>attrs.delete(key);
    node.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
    node.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
    node.emit=(type,values={})=>{const event={target:node,prevented:false,preventDefault(){this.prevented=true;},...values};for(const fn of [...(listeners.get(type)||[])])fn(event);return event;};
    node.contains=child=>{for(let target=child;target;target=target.parent)if(target===node)return true;return false;};
    node.focus=options=>{document.activeElement=node;node.lastFocus=options;};
    node.click=()=>{if(!node.disabled){node.focus();node.emit('click');}};
    return node;
  }
  const root=element('root'),viewport=element('viewport'),track=element('track'),controls=element('controls'),back=element('back'),next=element('next'),status=element('status'),build=element('build'),window=element('window'),media=element('media');
  controls.hidden=true;viewport.parent=root;track.parent=viewport;viewport.scrollLeft=0;viewport.clientLeft=2;
  media.matches=reduced;window.matchMedia=()=>media;window.setTimeout=fn=>{const id=++sequence;timers.set(id,fn);return id;};window.clearTimeout=id=>timers.delete(id);
  window.ResizeObserver=class{constructor(fn){this.fn=fn;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}};
  viewport.getBoundingClientRect=()=>({left:37,width:metrics.viewportWidth});
  const cards=Array.from({length:count},(_,i)=>{const card=element('card-'+i);card.parent=track;card.dataset.stepTitle=['Find your degree','We find the courses','Follow your plan'][i]||'Another step';card.getBoundingClientRect=()=>{if(metrics.bad)throw Error('Detached layout');return{left:37+viewport.clientLeft+i*metrics.step-viewport.scrollLeft,width:metrics.cardWidth};};return card;});
  const max=()=>Math.max(0,(cards.length-1)*metrics.step+metrics.cardWidth-metrics.viewportWidth+(clamp?0:metrics.viewportWidth));
  function move(left){viewport.scrollLeft=Math.max(0,Math.min(max(),left));viewport.emit('scroll');}
  if(!noScrollTo)viewport.scrollTo=options=>{scrolls.push(options);if(deferred&&options.behavior==='smooth')viewport.pending=options.left;else{delete viewport.pending;move(options.left);}};
  const map=new Map([['viewport',viewport],['track',track],['controls',controls],['back',back],['next',next],['status',status],['build',build]].map(([key,value])=>['[data-home-step-'+key+']',value]));
  root.querySelector=selector=>selector===missing?null:map.get(selector)||null;root.querySelectorAll=selector=>selector==='[data-home-step]'?cards:[];
  document.querySelectorAll=selector=>selector==='[data-home-steps]'?[root]:[];
  const context={document,window,Number,Infinity,Error};Object.defineProperty(context,'fetch',{get(){throw Error('No network access in the introduction');}});Object.defineProperty(context,'localStorage',{get(){throw Error('No account or device state access in the introduction');}});
  vm.runInNewContext(source,context);
  return{root,viewport,track,cards,controls,back,next,status,build,window,media,document,metrics,scrolls,observers,timers,
    active:()=>cards.findIndex(card=>card.classes.has('is-current')),
    flush(){for(let loops=0;timers.size&&loops<10;loops++){const batch=[...timers.values()];timers.clear();batch.forEach(fn=>fn());}assert.equal(timers.size,0,'The walkthrough does not schedule itself to advance');},
    swipe(left){move(left);},finishScroll(){if(viewport.pending!==undefined){move(viewport.pending);delete viewport.pending;}viewport.emit('scrollend');},
    nested(index,tag='a'){const child=element(tag);child.parent=cards[index];return child;},
    key(key,values={}){return viewport.emit('keydown',{key,...values});}
  };
}

test('the visitor chooses each step and endpoints retain a clear focused way forward',()=>{
  const f=mount();assert(f.root.classes.has('is-enhanced'));assert(!f.controls.hidden);assert.equal(f.active(),0);assert.equal(f.status.textContent,'Step 1 of 3: Find your degree');assert(f.back.disabled);assert(!f.next.disabled);assert.equal(f.timers.size,0);
  f.next.click();f.flush();assert.equal(f.active(),1);assert.equal(f.viewport.scrollLeft,900);assert.equal(f.document.activeElement,f.next);
  f.next.click();f.flush();assert.equal(f.active(),2);assert(f.next.disabled);assert.equal(f.document.activeElement,f.build);assert.equal(f.build.lastFocus.preventScroll,true);assert.match(f.status.textContent,/Step 3 of 3: Follow your plan/);
  f.back.click();f.flush();assert.equal(f.active(),1);f.back.click();f.flush();assert.equal(f.active(),0);assert(f.back.disabled);assert.equal(f.document.activeElement,f.next);
  assert.deepEqual(f.scrolls.map(row=>row.left),[0,900,1800,900,0]);
});

test('native scrolling updates the step after settling, including a clamped final card',()=>{
  const f=mount({clamp:true});f.swipe(920);assert.equal(f.active(),0,'A finger drag does not flicker through several active cards');f.flush();assert.equal(f.active(),1);assert.match(f.status.textContent,/We find the courses/);
  f.next.click();f.finishScroll();assert.equal(f.viewport.scrollLeft,1680);assert.equal(f.active(),2);assert(f.next.disabled);
  f.swipe(0);f.viewport.emit('scrollend');assert.equal(f.active(),0);assert.equal(f.timers.size,0);assert(!f.next.disabled);
});

test('rapid deliberate Next clicks can select the final card during smooth movement',()=>{
  const f=mount({deferred:true});f.next.click();assert.equal(f.active(),1);assert.equal(f.viewport.scrollLeft,0);f.next.click();assert.equal(f.active(),2);assert.equal(f.document.activeElement,f.build);
  f.finishScroll();assert.equal(f.active(),2);assert.equal(f.viewport.scrollLeft,1800);f.flush();assert.equal(f.active(),2);
});

test('a resize during smooth movement keeps the intended step and cancels the old pixel destination',()=>{
  const f=mount({deferred:true});f.next.click();assert.equal(f.viewport.pending,900);assert.equal(f.active(),1);
  f.metrics.step=700;f.metrics.cardWidth=680;f.metrics.viewportWidth=800;f.window.emit('resize');
  assert.equal(f.viewport.pending,undefined);assert.equal(f.viewport.scrollLeft,700);assert.equal(f.scrolls.at(-1).behavior,'auto');
  f.finishScroll();f.flush();assert.equal(f.active(),1);assert.match(f.status.textContent,/We find the courses/);
});

test('keyboard navigation is scoped to the focused viewport and leaves ordinary controls and page keys alone',()=>{
  const f=mount(),input=f.nested(0,'select'),link=f.nested(0);
  assert(!f.key('ArrowRight',{target:input}).prevented);assert(!f.key('ArrowLeft',{target:link}).prevented);assert(!f.key('ArrowRight',{ctrlKey:true}).prevented);assert(!f.key('PageDown').prevented);assert(!f.key('Tab').prevented);assert.equal(f.active(),0);
  assert(f.key('ArrowRight').prevented);f.flush();assert.equal(f.active(),1);assert(f.key('End').prevented);f.flush();assert.equal(f.active(),2);assert(f.key('Home').prevented);f.flush();assert.equal(f.active(),0);
  f.window.emit('keydown',{key:'ArrowRight'});assert.equal(f.active(),0);assert.equal(f.window.listeners.get('keydown'),undefined);
});

test('reduced motion changes and resizing preserve the chosen step without vertical scrolling',()=>{
  const f=mount({reduced:true});f.next.click();f.flush();assert.equal(f.active(),1);assert(f.scrolls.every(row=>row.behavior==='auto'));assert(f.scrolls.every(row=>!Object.hasOwn(row,'top')));
  f.metrics.step=720;f.metrics.cardWidth=700;f.metrics.viewportWidth=820;f.window.emit('resize');assert.equal(f.active(),1);assert.equal(f.viewport.scrollLeft,720);
  assert.equal(f.observers[0].target,f.viewport);f.metrics.step=660;f.observers[0].fn();assert.equal(f.viewport.scrollLeft,660);assert.equal(f.active(),1);
  f.media.matches=false;f.media.emit('change');f.next.click();assert.equal(f.scrolls.at(-1).behavior,'smooth');
  f.media.matches=true;f.media.emit('change');assert.equal(f.scrolls.at(-1).behavior,'auto');f.flush();assert.equal(f.active(),2);
});

test('inactive cards are guarded without leaving keyboard focus inside hidden content',()=>{
  const f=mount(),link=f.nested(0);link.focus();assert(!f.cards[0].inert);assert(f.cards[1].inert);assert.equal(f.cards[1].attrs.get('aria-hidden'),'true');
  f.swipe(900);f.flush();assert.equal(f.active(),1);assert.equal(f.document.activeElement,f.viewport);assert.equal(f.viewport.lastFocus.preventScroll,true);assert(f.cards[0].inert);assert(!f.cards[1].inert);assert.equal(f.cards[1].attrs.get('aria-hidden'),'false');
  assert(f.cards[0].classes.has('is-seen'));assert(f.cards[1].classes.has('is-seen'));assert(!f.cards[2].classes.has('is-seen'));
});

test('older inert/scroll APIs retain a readable introduction and working explicit navigation',()=>{
  const f=mount({inert:false,noScrollTo:true});assert.equal(f.active(),0);assert(f.cards.every(card=>!card.attrs.has('aria-hidden')));
  f.next.click();assert.equal(f.active(),1);assert.equal(f.viewport.scrollLeft,900);f.next.click();assert.equal(f.active(),2);assert.equal(f.viewport.scrollLeft,1800);assert.equal(f.document.activeElement,f.build);
});

test('incomplete, single-card or failed-layout markup falls back to readable stacked content',()=>{
  for(const settings of [{count:1},{missing:'[data-home-step-next]'},{badLayout:true}]){
    const f=mount(settings);assert(!f.root.classes.has('is-enhanced'));assert(f.controls.hidden);assert(f.cards.every(card=>!card.inert&&!card.attrs.has('aria-hidden')));assert.equal(f.timers.size,0);
  }
  const f=mount();f.metrics.bad=true;f.next.click();assert(!f.root.classes.has('is-enhanced'));assert(f.controls.hidden);assert(f.cards.every(card=>!card.inert&&!card.attrs.has('aria-hidden')));assert(f.observers[0].disconnected);
  assert([...f.viewport.listeners.values()].every(listeners=>listeners.size===0));
});

test('reopening the introduction starts at the first step without reading saved student data',()=>{
  const original=mount();original.next.click();original.next.click();original.flush();assert.equal(original.active(),2);
  const reopened=mount();assert.equal(reopened.active(),0);assert(reopened.back.disabled);assert.equal(reopened.timers.size,0);
});

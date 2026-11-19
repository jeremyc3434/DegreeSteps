'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dist/home-steps.js','utf8');

// Execute the shipped enhancement against changing viewport geometry. This is
// synthetic interaction QA, not browser-layout or screen-reader certification.
function mount({count=3,scrollY=0,height=800,noObserver=false,noResizeObserver=false,noFrame=false,observerThrows=false,resizeObserverThrows=false,badLayout=false,reduced=false}={}){
  const frames=new Map(),observers=[],resizeObservers=[],protectedChanges=[],scrolls=[],focuses=[];let sequence=0;
  const metrics={scrollY,height,bad:badLayout,tops:[120,800,1600],heights:[600,750,650]};
  function element(name){
    const classes=new Set(),attrs=new Map(),listeners=new Map(),node={name,dataset:{},classes,attrs,listeners,parent:null};
    node.classList={contains:name=>classes.has(name),add(...names){names.forEach(name=>classes.add(name));},toggle(name,on){if(on)classes.add(name);else classes.delete(name);return on;}};
    for(const property of ['hidden','inert']){
      if(name==='document'&&property==='hidden')Object.defineProperty(node,property,{value:false,writable:true});
      else Object.defineProperty(node,property,{get(){return false;},set(value){protectedChanges.push([name,property,value]);}});
    }
    node.setAttribute=(name,value)=>{attrs.set(name,String(value));protectedChanges.push([node.name,name,value]);};
    node.getAttribute=name=>attrs.get(name)||null;
    node.removeAttribute=name=>{attrs.delete(name);protectedChanges.push([node.name,name,null]);};
    node.focus=()=>focuses.push(name);node.scrollTo=options=>scrolls.push(options);node.scrollIntoView=options=>scrolls.push(options);
    node.addEventListener=(type,fn,options)=>{if(!listeners.has(type))listeners.set(type,new Map());listeners.get(type).set(fn,options);};
    node.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
    node.emit=(type,extra={})=>{const event={target:node,prevented:false,preventDefault(){this.prevented=true;},...extra};for(const fn of [...(listeners.get(type)?.keys()||[])])fn(event);return event;};
    return node;
  }
  const root=element('root'),window=element('window'),document=element('document');document.documentElement={clientHeight:height};document.activeElement=element('focused-link');document.hidden=false;
  Object.defineProperty(window,'innerHeight',{get:()=>metrics.height});
  window.scrollTo=options=>scrolls.push(options);window.scrollBy=options=>scrolls.push(options);
  window.setTimeout=()=>{throw Error('The reading journey must not use timers.');};
  window.matchMedia=()=>({matches:reduced});
  if(!noFrame){window.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};window.cancelAnimationFrame=id=>frames.delete(id);}
  if(!noObserver)window.IntersectionObserver=class{
    constructor(fn,options){if(observerThrows)throw Error('Observer unavailable');this.fn=fn;this.options=options;this.targets=[];this.disconnected=false;observers.push(this);}
    observe(target){this.targets.push(target);}disconnect(){this.disconnected=true;}
  };
  if(!noResizeObserver)window.ResizeObserver=class{
    constructor(fn){if(resizeObserverThrows)throw Error('Resize observer unavailable');this.fn=fn;this.targets=[];this.disconnected=false;resizeObservers.push(this);}
    observe(target){this.targets.push(target);}disconnect(){this.disconnected=true;}
  };
  const chapters=Array.from({length:count},(_,index)=>{
    const chapter=element('chapter-'+index);chapter.parent=root;chapter.dataset.stepTitle=['The degree you want','More ways to earn credit','Your route, made clear'][index];
    chapter.getBoundingClientRect=()=>{if(metrics.bad)throw Error('Detached layout');const top=(metrics.tops[index]??index*800)-metrics.scrollY;return{top,bottom:top+(metrics.heights[index]??650)};};return chapter;
  });
  root.querySelectorAll=selector=>selector==='[data-home-step]'?chapters:[];document.querySelectorAll=selector=>selector==='[data-home-steps]'?[root]:[];
  const context={document,window,Number,Infinity,Error};
  Object.defineProperty(context,'fetch',{get(){throw Error('No network access is allowed.');}});Object.defineProperty(context,'localStorage',{get(){throw Error('No student storage access is allowed.');}});
  vm.runInNewContext(source,context);
  return{root,chapters,window,document,metrics,observers,resizeObservers,frames,protectedChanges,scrolls,focuses,
    active:()=>chapters.findIndex(chapter=>chapter.classes.has('is-current')),
    flush(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());assert.equal(frames.size,0,'No autonomous animation loop is scheduled.');},
    scrollTo(value){metrics.scrollY=value;window.emit('scroll');},
    observer(entries=[]){observers[0].fn(entries,observers[0]);}
  };
}

test('the vertical journey accents the current chapter while every chapter and control remains accessible',()=>{
  const f=mount(),focused=f.document.activeElement;
  assert(f.root.classes.has('is-enhanced'));assert.equal(f.active(),0);assert.equal(f.root.dataset.currentStep,'1');
  assert.equal(f.observers[0].targets.length,3);assert.equal(f.resizeObservers[0].targets.length,3);
  assert.equal(f.protectedChanges.length,0);assert.equal(f.focuses.length,0);assert.equal(f.document.activeElement,focused);assert.equal(f.scrolls.length,0);
  assert(f.chapters[0].classes.has('is-seen'));assert(!f.chapters[2].classes.has('is-seen'));
  for(const name of ['keydown','wheel','touchstart','touchmove','click'])assert(!f.window.listeners.has(name));
  assert([...f.window.listeners.get('scroll').values()].every(options=>options.passive));
});

test('native scrolling updates the reading accent without intercepting page input or moving focus',()=>{
  const f=mount();f.scrollTo(800);assert.equal(f.active(),0);f.flush();assert.equal(f.active(),1);assert.equal(f.root.dataset.currentStep,'2');
  f.scrollTo(1600);f.flush();assert.equal(f.active(),2);f.scrollTo(0);f.flush();assert.equal(f.active(),0);
  assert(f.chapters.every(chapter=>chapter.classes.has('is-seen')));assert.equal(f.protectedChanges.length,0);assert.equal(f.scrolls.length,0);assert.equal(f.focuses.length,0);
  for(const type of ['keydown','wheel','touchmove'])assert(!f.window.emit(type,{key:'PageDown'}).prevented);
});

test('observer notifications use current geometry rather than stale intersection order during fast scrolling',()=>{
  const f=mount();f.metrics.scrollY=1650;f.observer([{target:f.chapters[0],isIntersecting:true,intersectionRatio:1}]);f.flush();assert.equal(f.active(),2);
  f.metrics.scrollY=760;f.observer([{target:f.chapters[2],isIntersecting:true},{target:f.chapters[0],isIntersecting:false}]);f.flush();assert.equal(f.active(),1);
  assert.equal(f.protectedChanges.length,0);assert.equal(f.scrolls.length,0);
});

test('a tall chapter stays current until the next chapter reaches the reading line',()=>{
  const f=mount();f.metrics.tops=[0,1800,2100];f.metrics.heights=[1800,300,900];
  f.scrollTo(1300);f.flush();assert.equal(f.active(),0,'A short fully visible next chapter does not prematurely replace the chapter being read');
  f.scrollTo(1625);f.flush();assert.equal(f.active(),1);f.scrollTo(1980);f.flush();assert.equal(f.active(),2);
});

test('restored positions, resizing and layout changes preserve native page position and choose the visible chapter',()=>{
  const f=mount({scrollY:1700});assert.equal(f.active(),2);assert.equal(f.metrics.scrollY,1700);
  f.metrics.scrollY=500;f.window.emit('pageshow');f.flush();assert.equal(f.active(),1);
  f.metrics.height=600;f.window.emit('resize');f.flush();assert.equal(f.active(),0);
  f.metrics.tops=[0,500,1300];f.resizeObservers[0].fn([]);f.flush();assert.equal(f.active(),1);assert.equal(f.metrics.scrollY,500);
  f.metrics.scrollY=1400;f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.frames.size,0);
  f.document.hidden=false;f.document.emit('visibilitychange');f.flush();assert.equal(f.active(),2);assert.equal(f.scrolls.length,0);
});

test('reduced motion needs no hidden-content or focus transition to keep the journey useful',()=>{
  const f=mount({reduced:true});f.scrollTo(1600);f.flush();assert.equal(f.active(),2);
  assert.equal(f.protectedChanges.length,0);assert.equal(f.scrolls.length,0);assert.equal(f.focuses.length,0);
});

test('missing or failed observer APIs retain passive reading accents and all content',()=>{
  for(const options of [{noObserver:true,noResizeObserver:true},{observerThrows:true,resizeObserverThrows:true},{noObserver:true,noResizeObserver:true,noFrame:true}]){
    const f=mount(options);f.scrollTo(1600);f.flush();assert.equal(f.active(),2);assert.equal(f.protectedChanges.length,0);assert.equal(f.scrolls.length,0);
  }
});

test('scroll and observer bursts coalesce into one update without a recurring timer or animation loop',()=>{
  const f=mount();for(let i=0;i<30;i++){f.metrics.scrollY=800+i;f.window.emit('scroll');f.observer([]);f.window.emit('resize');}
  assert.equal(f.frames.size,1);f.flush();assert.equal(f.active(),1);assert.equal(f.frames.size,0);
});

test('invalid or missing layout fails harmlessly and disconnects the enhancement',()=>{
  const empty=mount({count:0});assert(!empty.root.classes.has('is-enhanced'));assert.equal(empty.protectedChanges.length,0);
  const single=mount({count:1});assert(!single.root.classes.has('is-enhanced'));assert.equal(single.protectedChanges.length,0);
  const broken=mount({badLayout:true});assert(!broken.root.classes.has('is-enhanced'));assert.equal(broken.protectedChanges.length,0);
  const f=mount();f.metrics.bad=true;f.window.emit('scroll');f.flush();assert(!f.root.classes.has('is-enhanced'));assert.equal(f.root.dataset.currentStep,undefined);
  assert(f.observers[0].disconnected);assert(f.resizeObservers[0].disconnected);assert.equal(f.protectedChanges.length,0);assert.equal(f.scrolls.length,0);
  assert([...f.window.listeners.values()].every(listeners=>listeners.size===0));
});

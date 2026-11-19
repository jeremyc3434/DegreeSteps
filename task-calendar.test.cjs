'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Calendar=require('./dist/task-calendar.js'),fs=require('node:fs'),vm=require('node:vm');
const task={id:'private-user-task-123',title:'Register for classes',dueOn:'2028-02-29',status:'todo',notes:'Private note that must not leave the plan',learning:[{title:'Private completed course'}],email:'student@example.test',href:'https://evil.test/?student_id=private'};
const options={now:'2026-11-19T12:30:45Z',uid:'12345678-1234-4234-8234-123456789012'};
const unfold=text=>text.replace(/\r\n[ \t]/g,'');
test('calendar export uses an all-day saved due date with an exclusive next-day end',()=>{
 const result=Calendar.build(task,options);
 assert.match(result,/BEGIN:VCALENDAR\r\nVERSION:2.0/);assert.match(result,/DTSTAMP:20261119T123045Z/);assert.match(result,/DTSTART;VALUE=DATE:20280229/);assert.match(result,/DTEND;VALUE=DATE:20280301/);assert.match(result,/SUMMARY:Register for classes/);assert.match(result,/URL:https:\/\/degreesteps.com\/plan.html/);assert(result.endsWith('END:VCALENDAR\r\n'));
 assert(!/TZID|DTSTART:.*T|ATTENDEE|ORGANIZER|BEGIN:VALARM/.test(result));
});
test('private notes, learning records, source URLs and student identifiers are excluded',()=>{
 const result=Calendar.build(task,options);
 for(const secret of [task.id,task.notes,task.email,'Private completed course','evil.test','student_id'])assert(!result.includes(secret),secret);
 assert.match(result,/UID:12345678-1234-4234-8234-123456789012@degreesteps.com/);
 const first=Calendar.build(task),second=Calendar.build(task);assert.notEqual(first.match(/UID:(.+)/)[1],second.match(/UID:(.+)/)[1]);
});
test('text escaping blocks calendar property injection and preserves punctuation and Unicode',()=>{
 const title='Check \\ notes, then; plan\r\nATTENDEE:someone@example.test 🎓';
 const result=unfold(Calendar.build({...task,title},options));
 assert(result.includes('SUMMARY:Check \\\\ notes\\, then\\; plan\\nATTENDEE:someone@example.test 🎓'));assert.equal((result.match(/\r\nATTENDEE:/g)||[]).length,0);assert.equal((result.match(/BEGIN:VEVENT/g)||[]).length,1);
 const folded=Calendar.build({...task,title:'🎓'.repeat(40)},options);
 for(const line of folded.split('\r\n'))assert(Buffer.byteLength(line,'utf8')<=75,line);
 assert(unfold(folded).includes('SUMMARY:'+'🎓'.repeat(40)));
});
test('unfinished tasks require a genuine saved date and month/year boundaries remain valid',()=>{
 for(const dueOn of ['',null,'2026-02-29','2026-04-31','2026-01-01T12:00Z','9999-12-31']){assert.equal(Calendar.eligible({...task,dueOn}),false);assert.throws(()=>Calendar.build({...task,dueOn}),/Save a due date/);}
 assert.equal(Calendar.eligible({...task,status:'done'}),false);assert.throws(()=>Calendar.build({...task,status:'done'}));
 assert.match(Calendar.build({...task,dueOn:'2026-12-31'},options),/DTEND;VALUE=DATE:20270101/);
});
test('download is explicit, local, uses a calendar Blob, and revokes its object URL',()=>{
 const calls=[],blobs=[],timers=[];
 const environment={Blob:class{constructor(parts,opts){blobs.push({parts,opts});}},URL:{createObjectURL(blob){calls.push(['create',blob]);return'blob:calendar';},revokeObjectURL(url){calls.push(['revoke',url]);}},document:{body:{append(link){calls.push(['append',link.download]);}},createElement(){return{click(){calls.push(['click',this.href]);},remove(){calls.push(['remove']);}};}},setTimeout:fn=>timers.push(fn),crypto:{randomUUID:()=>options.uid}};
 const before=JSON.stringify(task);assert.equal(Calendar.download(task,environment),true);assert.equal(JSON.stringify(task),before);assert.equal(blobs[0].opts.type,'text/calendar;charset=utf-8');assert(calls.some(c=>c[0]==='click'&&c[1]==='blob:calendar'));assert(!calls.some(c=>c[0]==='revoke'));timers.forEach(fn=>fn());assert(calls.some(c=>c[0]==='revoke'&&c[1]==='blob:calendar'));
});
function viewFixture({status='todo',dueOn='2026-12-01',currentDue=dueOn,currentTitle='Ask about registration',currentStatus=status}={}){
 const listeners=new Map(),downloads=[],live={classList:{toggle(){}},textContent:''},saved={id:'custom-1',title:'Ask about registration',status,dueOn,notes:'Private saved notes',custom:true,canSetStatus:true,group:'planning'};
 const model={valid:true,scope:'example',planContext:{scope:'example'},tasks:[saved],groups:[{id:'planning',title:'Planning',tasks:[saved]}],progress:{done:status==='done'?1:0,total:1}};
 const fields={title:{value:currentTitle},dueOn:{value:currentDue},status:{value:currentStatus},notes:{value:'Unsaved private note'}};
 const form={querySelector:selector=>fields[selector.match(/name="([^"]+)"/)?.[1]]||null};let focused=false,actions=0;
 const button={dataset:{dcCalendar:saved.id},closest:()=>form,focus:()=>focused=true};
 const content={innerHTML:'',querySelectorAll:()=>[],contains:()=>false,addEventListener:(type,fn)=>listeners.set(type,fn)};
 const node={innerHTML:'',ownerDocument:{activeElement:null,defaultView:{}},querySelector:selector=>selector==='[data-dc-content]'?content:live};
 const root={DegreeChecklist:{build:()=>model},DegreeTaskCalendar:{eligible:Calendar.eligible,download:item=>downloads.push(JSON.parse(JSON.stringify(item)))},console,URL};vm.runInNewContext(fs.readFileSync('dist/student-checklist-view.js','utf8'),root);
 root.DegreeChecklistView.update(node,{}, {},{onAction:()=>actions++});
 return{content,live,fields,downloads,model,actions:()=>actions,focused:()=>focused,click(){listeners.get('click')({preventDefault(){},target:{closest:selector=>selector==='[data-dc-calendar]'?button:null}});}};
}
test('the checklist offers calendar export only for saved unfinished due dates',()=>{
 assert.match(viewFixture().content.innerHTML,/Add to calendar/);assert.doesNotMatch(viewFixture({status:'done'}).content.innerHTML,/data-dc-calendar/);assert.doesNotMatch(viewFixture({dueOn:''}).content.innerHTML,/data-dc-calendar/);
});
test('calendar clicks preserve unsaved notes, current focus, checklist data and academic records',()=>{
 const f=viewFixture(),before=JSON.stringify(f.model),html=f.content.innerHTML;f.click();assert.equal(f.downloads.length,1);assert.equal(f.fields.notes.value,'Unsaved private note');assert.equal(f.content.innerHTML,html);assert.equal(JSON.stringify(f.model),before);assert.equal(f.actions(),0);assert.equal(f.focused(),true);assert.match(f.live.textContent,/choose a reminder/);
 const changed=viewFixture({currentDue:'2026-12-05'});changed.click();assert.equal(changed.downloads.length,0);assert.match(changed.live.textContent,/Save your task changes/);assert.equal(changed.fields.notes.value,'Unsaved private note');
});

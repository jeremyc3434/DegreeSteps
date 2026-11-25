/* Optional student feedback. No fetch, analytics, account integration or form submission. */
(function () {
  'use strict';
  const form=document.getElementById('student-feedback-form');
  if(!form)return;
  const KEY='degreesteps-student-test-feedback-v1',status=document.getElementById('test-status');
  const fields=['situation','device','task1','task1Note','task2','task2Note','task3','task3Note','task4','task4Note','task5','task5Note','confidence','blocker','trust'];
  const taskNames=['Find a degree','Bring past courses','Change degree and correct a status','Save and return','Identify the first action'];
  let storageAvailable=true;
  function announce(message){status.textContent=message;}
  function answers(){const values=new FormData(form);return Object.fromEntries(fields.map(name=>[name,String(values.get(name)||'').slice(0,3000)]));}
  function remember(){try{sessionStorage.setItem(KEY,JSON.stringify(answers()));}catch{storageAvailable=false;}}
  function restore(){try{const raw=sessionStorage.getItem(KEY);if(!raw||raw.length>55000)return;const values=JSON.parse(raw);for(const name of fields){const value=values?.[name];if(typeof value!=='string'||value.length>3000)continue;const inputs=[...form.querySelectorAll('[name="'+name+'"]')];for(const input of inputs){if(input.type==='radio')input.checked=input.value===value;else if(input.tagName!=='SELECT'||[...input.options].some(option=>option.value===value))input.value=value;}}}catch{storageAvailable=false;}}
  function feedback(){const values=answers();const lines=['DegreeSteps student feedback','Date: '+new Date().toISOString().slice(0,10),'Situation: '+(values.situation||'Not answered'),'Device: '+(values.device||'Not answered'),''];taskNames.forEach((name,index)=>{const n=index+1;lines.push(n+'. '+name,'Result: '+(values['task'+n]||'Not answered'),'Notes: '+(values['task'+n+'Note']||'None entered'),'');});lines.push('Confidence about the next step (1–5): '+(values.confidence||'Not answered'),'What would keep me from using it: '+(values.blocker||'Not answered'),'What felt unclear or hard to trust: '+(values.trust||'Not answered'),'','This feedback was created locally by the participant. It was not sent to DegreeSteps automatically.');return lines.join('\n');}
  function fallback(text){const panel=document.getElementById('test-copy-fallback'),area=document.getElementById('test-feedback-text');panel.hidden=false;area.value=text;area.focus();area.select();announce('Automatic copying is unavailable. Select and copy the feedback below, or download it.');}
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('input',remember);form.addEventListener('change',remember);
  document.getElementById('test-download-feedback').addEventListener('click',()=>{const text=feedback();try{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='degreesteps-feedback-'+new Date().toISOString().slice(0,10)+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);announce('Your feedback file is ready. Share it with the person who invited you; nothing was sent automatically.');}catch{fallback(text);}});
  document.getElementById('test-copy-feedback').addEventListener('click',async()=>{const text=feedback();try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);document.getElementById('test-copy-fallback').hidden=true;announce('Feedback copied. Share it with the person who invited you; nothing was sent automatically.');}catch{fallback(text);}});
  const confirmation=document.getElementById('test-clear-confirm');
  document.getElementById('test-clear-answers').addEventListener('click',()=>{confirmation.hidden=false;document.getElementById('test-cancel-clear').focus();});
  document.getElementById('test-cancel-clear').addEventListener('click',()=>{confirmation.hidden=true;document.getElementById('test-clear-answers').focus();});
  document.getElementById('test-confirm-clear').addEventListener('click',()=>{form.reset();try{sessionStorage.removeItem(KEY);}catch{}confirmation.hidden=true;document.getElementById('test-copy-fallback').hidden=true;document.getElementById('test-feedback-text').value='';announce('Your feedback answers in this tab were cleared. Your DegreeSteps plan has not changed.');document.getElementById('test-clear-answers').focus();});
  restore();
  if(!storageAvailable)announce('This browser cannot keep answers when the page reloads. Download or copy your feedback before leaving.');
}());

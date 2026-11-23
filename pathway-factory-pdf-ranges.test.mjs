/** Page-ranged PDF captures (`#pages=…&columns=2`): parsing, extraction, sidecars, two-column reading and freshness. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeJSON,readJSON} from './scripts/pathway-factory/lib.mjs';
import {parsePageFragment,fetchPage,capture,MAX_RANGED_PAGES} from './scripts/pathway-factory/capture.mjs';
import {parseUrlList} from './scripts/pathway-factory/draft.mjs';
import {checkFreshness} from './scripts/pathway-factory/freshness.mjs';

/** A minimal valid PDF: each page is a list of {x, y, text} drawn in Helvetica 11pt on a US-letter page. */
function makePdf(pages){
  const esc=s=>s.replace(/[\\()]/g,m=>'\\'+m);
  const objects=[];
  const add=body=>{objects.push(body);return objects.length;};
  const catalog=add(null),pagesId=add(null),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids=[];
  for(const items of pages){
    const stream=items.map(i=>`BT /F1 11 Tf ${i.x} ${i.y} Td (${esc(i.text)}) Tj ET`).join('\n');
    const content=add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId-1]=`<< /Type /Pages /Kids [${kids.map(k=>k+' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let pdf='%PDF-1.4\n';const offsets=[];
  objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf,'latin1'));
}
const lines=(texts,x=72,top=720)=>texts.map((text,k)=>({x,y:top-k*18,text}));
const catalogPdf=({page2='ACCT 220 Principles of Accounting I (3)',page3='General education: 41 credits'}={})=>makePdf([
  lines(['Catalog cover','Welcome to Demo University']),
  lines(['Bachelor of Science in Accounting',page2,'Total 120 credits']),
  lines(['General Education Requirements',page3]),
  lines(['Index'])
]);
const twoColumn=makePdf([[...lines(['Left one','Left two','Left three','Left four']),...lines(['Right one','Right two','Right three','Right four'],330)]]);
const pdfResponse=(url,bytes)=>({ok:true,status:200,url,headers:{get:()=>'application/pdf'},arrayBuffer:async()=>bytes.slice().buffer});

test('the #pages fragment is parsed strictly and never sent to the server',()=>{
  assert.deepEqual(parsePageFragment('https://x.edu/c.pdf#pages=34-37,120-123'),{fetchUrl:'https://x.edu/c.pdf',pages:[[34,37],[120,123]],columns:1,spec:'34-37,120-123'});
  assert.deepEqual(parsePageFragment('https://x.edu/c.pdf#pages=12&columns=2').pages,[[12,12]]);
  assert.equal(parsePageFragment('https://x.edu/c.pdf#pages=12&columns=2').columns,2);
  assert.deepEqual(parsePageFragment('https://x.edu/c.pdf'),{fetchUrl:'https://x.edu/c.pdf',pages:null,columns:1});
  assert.equal(parsePageFragment('https://x.edu/page#section-2').fetchUrl,'https://x.edu/page#section-2','an ordinary anchor is left alone');
  for(const bad of ['#pages=','#pages=0','#pages=5-3','#pages=a-b','#pages=1-3,2-4','#pages=1&columns=3','#pages=1&zoom=2','#columns=2',`#pages=1-${MAX_RANGED_PAGES+1}`])
    assert.throws(()=>parsePageFragment('https://x.edu/c.pdf'+bad),undefined,bad);
  assert.throws(()=>parseUrlList('https://x.edu/c.pdf#pages=9-1'),/range/);
  assert.deepEqual(parseUrlList('https://x.edu/c.pdf#pages=1-2\nhttps://x.edu/c.pdf#pages=3'),['https://x.edu/c.pdf#pages=1-2','https://x.edu/c.pdf#pages=3']);
});

test('a single range and several ranges capture only those pages, with the range and the whole document hash in the sidecar',async()=>{
  const bytes=catalogPdf(),fetched=[];
  const fetchImpl=async(url)=>{fetched.push(url);return pdfResponse(url,bytes);};
  const one=await fetchPage('https://demo.edu/catalog.pdf#pages=2',{fetchImpl});
  assert.equal(fetched[0],'https://demo.edu/catalog.pdf','the fragment is not sent');
  assert.match(one.text,/ACCT 220 Principles of Accounting I \(3\)/);
  assert.doesNotMatch(one.text,/Catalog cover|General Education Requirements|Index/);
  assert.equal(one.pages,'2');assert.equal(one.columns,1);assert.match(one.documentSha256,/^[0-9a-f]{64}$/);
  const many=await fetchPage('https://demo.edu/catalog.pdf#pages=2-3',{fetchImpl});
  assert.match(many.text,/Total 120 credits\n\nGeneral Education Requirements/,'pages are separated by a blank line in order');
  const split=await fetchPage('https://demo.edu/catalog.pdf#pages=3,1',{fetchImpl});
  assert.ok(split.text.indexOf('General Education')<split.text.indexOf('Catalog cover'),'ranges are read in the order written');
  const whole=await fetchPage('https://demo.edu/catalog.pdf',{fetchImpl});
  assert.match(whole.text,/Catalog cover[\s\S]*Index/);assert.equal(whole.pages,undefined,'unranged PDFs keep the old capture shape');
  const dir=await mkdtemp(join(tmpdir(),'pdf-ranges-'));
  try{
    const stored=await capture('https://demo.edu/catalog.pdf#pages=2-3',{dir,fetchImpl,now:()=>new Date('2026-11-23T00:00:00Z')});
    const sidecar=await readJSON(stored.sidecar);
    assert.equal(sidecar.url,'https://demo.edu/catalog.pdf#pages=2-3');assert.equal(sidecar.finalUrl,'https://demo.edu/catalog.pdf');
    assert.equal(sidecar.pages,'2-3');assert.equal(sidecar.columns,1);assert.equal(sidecar.documentSha256,one.documentSha256,'the hash covers the whole PDF, not the pages');
    assert.equal(sidecar.sha256,many.sha256,'the text hash is of the ranged text');
    assert.equal(await readFile(stored.path,'utf8'),many.text,'quotes are grounded against exactly the ranged text');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid requests fail loudly: a page past the end and #pages on a non-PDF',async()=>{
  const bytes=catalogPdf();
  await assert.rejects(fetchPage('https://demo.edu/catalog.pdf#pages=3-9',{fetchImpl:async u=>pdfResponse(u,bytes)}),/has 4 pages; #pages asks for page 5/);
  const html={ok:true,status:200,url:'https://demo.edu/p',headers:{get:()=>'text/html'},arrayBuffer:async()=>new TextEncoder().encode('<p>Hi</p>').buffer};
  await assert.rejects(fetchPage('https://demo.edu/p#pages=1',{fetchImpl:async()=>html}),/applies only to PDFs/);
});

test('columns=2 reads a two-column page left column first instead of joining the columns line by line',async()=>{
  const fetchImpl=async u=>pdfResponse(u,twoColumn);
  const joined=await fetchPage('https://demo.edu/two.pdf#pages=1',{fetchImpl});
  assert.match(joined.text,/Left one Right one/,'without the option both columns share a line, as before');
  const columns=await fetchPage('https://demo.edu/two.pdf#pages=1&columns=2',{fetchImpl});
  assert.equal(columns.text,'Left one\nLeft two\nLeft three\nLeft four\nRight one\nRight two\nRight three\nRight four\n');
  const single=await fetchPage('https://demo.edu/catalog.pdf#pages=2&columns=2',{fetchImpl:async u=>pdfResponse(u,catalogPdf())});
  assert.match(single.text,/^Bachelor of Science in Accounting\nACCT 220/,'a one-column page is unchanged by columns=2');
});

test('freshness compares only the ranged pages and downloads a shared catalog PDF once',async()=>{
  const base=await mkdtemp(join(tmpdir(),'pdf-fresh-'));
  const kits=join(base,'content/pathway-kits'),captures=join(base,'content/source-captures');
  const program='https://demo.edu/catalog.pdf#pages=2',gened='https://demo.edu/catalog.pdf#pages=3';
  try{
    const original=catalogPdf();
    const a=await capture(program,{dir:captures,fetchImpl:async u=>pdfResponse(u,original)});
    const b=await capture(gened,{dir:captures,fetchImpl:async u=>pdfResponse(u,original)});
    const rel=p=>p.slice(base.length+1);
    await writeJSON(join(kits,'demo','school.json'),{kind:'pathway-kit-school',version:1,id:'demo',name:'Demo',creditSystem:'semester',checkedOn:'2026-11-23',sources:[
      {id:'demo-acct',url:program,checked:'2026-11-23',capture:rel(a.path)},{id:'demo-gened',url:gened,checked:'2026-11-23',capture:rel(b.path)}]});
    await writeJSON(join(kits,'providers','sophia.json'),{kind:'pathway-kit-provider',version:1,provider:'Sophia',sources:[],courses:[]});
    const run=async bytes=>{let downloads=0;const report=await checkFreshness({base,asOf:'2026-11-30',write:false,delayMs:0,log:()=>{},fetchImpl:async u=>{downloads++;return pdfResponse(u,bytes);}});return {report,downloads};};
    const same=await run(original);
    assert.equal(same.report.summary.changed,0);assert.equal(same.downloads,1,'two ranged sources of one PDF share one download');
    const elsewhere=await run(catalogPdf({page3:'General education: 42 credits'}));
    assert.deepEqual(elsewhere.report.changed.map(c=>c.url),[gened],'an edit on page 3 flags only the source that cites page 3');
    const own=await run(catalogPdf({page2:'ACCT 221 Principles of Accounting II (3)'}));
    assert.deepEqual(own.report.changed.map(c=>c.url),[program]);
    assert.equal((await readdir(captures)).length,4,'a dry run stores nothing');
  }finally{await rm(base,{recursive:true,force:true});}
});

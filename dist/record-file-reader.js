/* Local record decoding only. File bytes never go to an API or runtime CDN. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeRecordFileReader=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const limits=Object.freeze({maxBytes:10*1024*1024,maxPages:30,maxRows:500,maxColumns:50,maxZipBytes:25*1024*1024,maxZipEntryBytes:8*1024*1024,maxZipEntries:256,maxCells:25000,maxSheets:50,maxPdfPageItems:5000,maxPdfItems:50000,maxPdfCharacters:2000000});
 const error=(code,message)=>Object.assign(new Error(message),{code}),abort=code=>Object.assign(error(code,code==='superseded'?'A newer file replaced this request.':'File reading was cancelled.'),{name:'AbortError'});
 const textDecoder=(encoding='utf-8')=>new TextDecoder(encoding,{fatal:true});
 const bytesOf=value=>value instanceof Uint8Array?value:new Uint8Array(value);
 const nonempty=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const scriptURL=root.document?.currentScript?.src;
 const baseURL=scriptURL?new URL('.',scriptURL).href:root.location?.href?new URL('.',root.location.href).href:null;
 function classify(file,bytes){
  const name=String(file?.name||''),ext=name.split('.').pop().toLowerCase(),type=String(file?.type||'').toLowerCase();
  if(['pdf','xlsx','csv','tsv','txt'].includes(ext))return ext==='txt'?'text':ext;
  if(type==='application/pdf')return 'pdf';
  if(type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return 'xlsx';
  if(type==='text/csv')return 'csv';if(type==='text/tab-separated-values')return 'tsv';
  if(bytes&&String.fromCharCode(...bytes.subarray(0,5))==='%PDF-')return 'pdf';
  throw error('unsupported-file','Choose a PDF, Excel .xlsx, CSV or tab-separated text file. For older .xls files, use Save As .xlsx or CSV first.');
 }
 function decodeText(bytes){
  let encoding='utf-8',start=0;
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)start=3;
  else if(bytes[0]===0xff&&bytes[1]===0xfe){encoding='utf-16le';start=2;}
  else if(bytes[0]===0xfe&&bytes[1]===0xff){encoding='utf-16be';start=2;}
  try{const text=textDecoder(encoding).decode(bytes.subarray(start)).replace(/^\uFEFF/,'');if(text.includes('\u0000'))throw Error('binary');return{text,encoding};}
  catch{throw error('text-encoding','This text file could not be read. Save it as CSV UTF-8 or tab-separated Unicode text, then choose the new file.');}
 }
 const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
 function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
 function unpackWorkbook(input,fflate){
  const bytes=bytesOf(input);if(bytes.length>limits.maxBytes)throw error('file-too-large','Choose a file smaller than 10 MB.');
  if(!fflate?.inflateSync||!fflate?.zipSync)throw error('reader-unavailable','The Excel reader could not load. Reload this page or export the sheet as CSV.');
  const unsafe=message=>{throw error('xlsx-unsafe',message||'This workbook could not be opened safely. Save a new .xlsx or CSV copy and try again.');};
  if(bytes.length<22)unsafe();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===bytes.length){end=at;break;}
  if(end<0)unsafe('This is not a readable .xlsx workbook. Older or password-protected Excel files must be saved as an unprotected .xlsx or CSV.');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0||view.getUint16(end+8,true)!==count||count===65535||count>limits.maxZipEntries||start+size!==end)unsafe();
  const entries=[],names=new Set();let at=start,total=0;
  for(let index=0;index<count;index++){
   if(at+46>end||view.getUint32(at,true)!==0x02014b50)unsafe();
   const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),compressed=view.getUint32(at+20,true),original=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
   if(at+46+nameLength+extra+comment>end||flags&1||![0,8].includes(method)||local+30>start||view.getUint32(local,true)!==0x04034b50)unsafe();
   let name;try{name=textDecoder().decode(bytes.subarray(at+46,at+46+nameLength));}catch{unsafe();}
   if(!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||names.has(name)||/vbaProject\.bin|\/macrosheets\//i.test(name))unsafe();
   names.add(name);total+=original;
   if(original>limits.maxZipEntryBytes||total>limits.maxZipBytes||original>Math.max(1024*1024,compressed*250))throw error('xlsx-too-large','This workbook expands beyond the local reading limit. Copy the course table into a new .xlsx or CSV file.');
   const localNameLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),data=local+30+localNameLength+localExtra;
   let localName;try{localName=textDecoder().decode(bytes.subarray(local+30,local+30+localNameLength));}catch{unsafe();}
   if(localName!==name||view.getUint16(local+8,true)!==method||view.getUint16(local+6,true)&1||data+compressed>start||method===0&&compressed!==original)unsafe();
   entries.push({name,method,crc,compressed,original,data});at+=46+nameLength+extra+comment;
  }
  if(at!==start+size||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))unsafe();
  const files=Object.create(null);let cellCount=0;
  for(const entry of entries){
   // Images, embedded objects and other binary content are never passed to the
   // spreadsheet reader. Only bounded XML parts can describe our raw rows.
   if(!/\.xml$|\.rels$/i.test(entry.name))continue;
   const compressed=bytes.subarray(entry.data,entry.data+entry.compressed);let decoded;
   try{decoded=entry.method===0?compressed.slice():fflate.inflateSync(compressed,{out:new Uint8Array(entry.original+1)});}catch{unsafe();}
   if(decoded.length!==entry.original||crc32(decoded)!==entry.crc)unsafe();
   let xml;try{xml=textDecoder().decode(decoded);}catch{unsafe();}
   if(/<!DOCTYPE|<!ENTITY/i.test(xml))unsafe();
   if(entry.name==='[Content_Types].xml')for(const match of xml.matchAll(/<Override\b[^>]*>/g))if(/\bPartName=["']\/xl\/workbook\.xml["']/i.test(match[0])&&/\bContentType=["'][^"']*macroEnabled/i.test(match[0]))unsafe();
   if(/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)){
    const references=xml.matchAll(/<c\b[^>]*\br=["']([A-Za-z]+)(\d+)["'][^>]*>/g);
    for(const match of references){
     let column=0;for(const letter of match[1].toUpperCase())column=column*26+letter.charCodeAt(0)-64;
     if(++cellCount>limits.maxCells||Number(match[2])>limits.maxRows||column>limits.maxColumns)throw error('xlsx-too-large','Keep the course table within 500 rows and 50 columns. Copy just those rows into a new workbook or CSV.');
    }
   }
   files[entry.name]=decoded;
  }
  return fflate.zipSync(files,{level:0});
 }
 function excelDate(value,date1904){
  if(!Number.isFinite(value)||value<0||value>2958465)return null;
  const day=Math.floor(value);if(!date1904&&day===60)return null;
  const date=new Date((date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,31))+(day-(date1904?0:day>60?1:0))*86400000);if(date.getUTCFullYear()>9999)return null;
  return [date.getUTCFullYear(),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')].join('-');
 }
 function inspectWorkbook(input,{XLSX,fflate,sheet}={}){
  if(!XLSX?.read||!XLSX?.utils)throw error('reader-unavailable','The Excel reader could not load. Reload this page or export the sheet as CSV.');
  const safeZip=unpackWorkbook(input,fflate);let workbook;
  try{workbook=XLSX.read(safeZip,{type:'array',cellDates:false,cellNF:true,cellFormula:true,cellHTML:false,cellText:false,bookVBA:false,bookDeps:false,sheetRows:limits.maxRows+1});}
  catch{throw error('xlsx-invalid','This workbook could not be read. Open it in Excel or Google Sheets and save a new .xlsx or CSV copy.');}
  if(!workbook.SheetNames?.length||workbook.SheetNames.length>limits.maxSheets)throw error('xlsx-invalid','Choose a workbook with a visible course sheet and no more than 50 sheets.');
  const date1904=workbook.Workbook?.WBProps?.date1904===true||workbook.Workbook?.WBProps?.date1904===1,issues=[],tables=[];let actualCells=0;
  for(const [index,name]of workbook.SheetNames.entries()){
   const worksheet=workbook.Sheets[name]||{},range=worksheet['!ref']?XLSX.utils.decode_range(worksheet['!fullref']||worksheet['!ref']):null;
   if(range&&(range.e.r>=limits.maxRows||range.e.c>=limits.maxColumns))throw error('xlsx-too-large','Keep the course table within 500 rows and 50 columns. Copy just those rows into a new workbook or CSV.');
   const rows=[],sheetIssues=[];let count=0,formulaCount=0;
   if(range)for(let r=0;r<=range.e.r;r++){
    const row=[];
    for(let c=0;c<=range.e.c;c++){
     const address=XLSX.utils.encode_cell({r,c}),cell=worksheet[address];if(cell&&++actualCells>limits.maxCells)throw error('xlsx-too-large','This workbook has too many populated cells. Copy just the course table into a new workbook or CSV.');let value=cell?.v??null;
     const add=(code,message)=>{const issue={sheet:name,row:r+1,column:c+1,address,code,message};if(typeof cell?.v==='number'||typeof cell?.v==='string')issue.rawValue=cell.v;sheetIssues.push(issue);};
     if(cell&&(own(cell,'f')||own(cell,'F'))){formulaCount++;value=null;add('formula','This cell uses a formula. Paste its original value into a new copy before importing; cached formula results are not used.');}
     else if(cell?.t==='e'){value=null;add('cell-error','This cell contains an Excel error. Correct its original value before importing.');}
     else if(cell?.t==='n'&&typeof cell.z==='string'&&XLSX.SSF?.is_date(cell.z)){
      value=excelDate(cell.v,date1904);if(value===null)add('invalid-date','This Excel date is invalid or uses the fictitious February 29, 1900. Enter the actual completion date.');
      else if(!Number.isInteger(cell.v))add('date-time-omitted','The original calendar day is retained; the time of day is omitted from the completion date.');
     }else if(cell?.t==='d'){
      const original=typeof cell.v==='string'?cell.v:typeof cell.v?.getUTCFullYear==='function'?[cell.v.getUTCFullYear(),String(cell.v.getUTCMonth()+1).padStart(2,'0'),String(cell.v.getUTCDate()).padStart(2,'0')].join('-'):'';
      value=/^\d{4}-\d{2}-\d{2}/.test(original)?original.slice(0,10):null;if(!value)add('invalid-date','Enter the actual completion date in YYYY-MM-DD format.');
     }
     if(typeof value==='number'&&!Number.isFinite(value)){value=null;add('invalid-number','Enter a finite original number for this cell.');}
     if(typeof value==='string'&&value.length>20000)throw error('xlsx-too-large','A spreadsheet cell is too long. Copy only the course table into a new file.');
     if(nonempty(value))count++;row.push(value);
    }
    rows.push(row);
   }
   while(rows.length&&!rows.at(-1).some(nonempty))rows.pop();
   const useful=rows.some(row=>row.filter(nonempty).length>1),hidden=Number(workbook.Workbook?.Sheets?.[index]?.Hidden||0)>0;
   tables.push({index:index+1,name,hidden,rowCount:rows.length,columnCount:range?range.e.c+1:0,formulaCount,useful,rows,issues:sheetIssues,nonEmptyCells:count});
  }
  const selected=sheet===undefined?tables.find(item=>!item.hidden&&item.useful)||tables.find(item=>item.useful)||tables.find(item=>item.nonEmptyCells):tables.find(item=>typeof sheet==='number'?item.index===sheet:item.name===sheet);
  if(!selected)throw error('xlsx-no-sheet','No readable course table was found. Choose another sheet or paste the course rows into the import form.');
  issues.push(...selected.issues);
  return{format:'xlsx',rows:selected.rows,sheets:tables.map(({rows,issues,...metadata})=>metadata),selectedSheet:{index:selected.index,name:selected.name},dateSystem:date1904?'1904':'1900',cellIssues:issues,needsSheetChoice:tables.filter(item=>item.useful&&!item.hidden).length>1,warnings:[]};
 }
 function pageLines(items){
  const groups=[];
  for(const item of items){if(!item.text)continue;let line=groups.find(group=>Math.abs(group.y-item.y)<=Math.max(2,Math.min(group.height,item.height||10)*0.3));if(!line){line={y:item.y,height:item.height||10,items:[]};groups.push(line);}line.items.push(item);}
  return groups.sort((a,b)=>a.y-b.y).map(group=>{
   const entries=group.items.sort((a,b)=>a.x-b.x||a.order-b.order);let text='',previous=null;
   for(const item of entries){
    const gap=previous?item.x-(previous.x+previous.width):0,separator=previous&&!/\s$/.test(text)&&!/^\s/.test(item.text)?gap>Math.max(8,(item.height||10)*0.9)?'\t':gap>Math.max(1,(item.height||10)*0.12)?' ':'':'';
    text+=separator+item.text;previous=item;
   }
   return{text:text.trimEnd(),y:group.y,items:entries};
  });
 }
 function create(config={}){
  let sequence=0,current=null,pdfModule=null,disposed=false;
  const localBase=config.baseURL||baseURL;
  const local=path=>{if(!localBase)throw error('reader-unavailable','The local file reader could not load. Reload this page to try again.');const url=new URL(path,localBase);if(root.location?.origin&&url.origin!==root.location.origin)throw error('reader-unavailable','File readers must load from this website.');return url.href;};
  function release(job){
   if(!job)return;job.cancelled=true;clearTimeout(job.timeout);job.timeout=null;const worker=job.worker;job.worker=null;worker?.terminate();for(const task of job.renders||[])task.cancel?.();job.renders=[];
   for(const reader of job.textReaders||[])try{reader.cancel().catch?.(()=>{});}catch{}job.textReaders=[];
   try{const loadingTask=job.loadingTask;job.loadingTask=null;const destroying=loadingTask?.destroy();destroying?.catch?.(()=>{});}catch{}
   try{job.pdfWorker?.destroy();}catch{}
   for(const canvas of job.canvases||[]){canvas.width=0;canvas.height=0;}job.canvases=[];job.reject?.(abort(job.cancelCode||'cancelled'));job.reject=null;
  }
  function cancel(code='cancelled'){if(current){current.cancelCode=code;release(current);current=null;}}
  function begin(file,signal,reuse=false){
   if(disposed)throw error('reader-closed','This file reader is closed. Reload the page to try again.');
   if(signal?.aborted)throw abort('cancelled');
   if(Number(file?.size)>limits.maxBytes)throw error('file-too-large','Choose a file smaller than 10 MB.');
   let job;if(reuse&&current?.file===file&&current.pdf&&!current.busy&&!current.cancelled){job=current;job.busy=true;}else{cancel('superseded');job={id:++sequence,file,busy:true,cancelled:false,worker:null,loadingTask:null,pdfWorker:null,pdf:null,renders:[],canvases:[]};current=job;}
   const onAbort=()=>{job.cancelCode='cancelled';release(job);if(current===job)current=null;};
   signal?.addEventListener('abort',onAbort,{once:true});job.detach=()=>signal?.removeEventListener('abort',onAbort);return job;
  }
  function check(job){if(current!==job||job.cancelled)throw abort(job.cancelCode||'superseded');}
  function progress(job,callback,value){check(job);callback?.(value);}
  async function pageText(job,page){
   const items=[];let characters=0;
   const append=chunk=>{for(const item of chunk?.items||[]){if(typeof item.str!=='string')continue;characters+=item.str.length;if(items.length>=limits.maxPdfPageItems||job.textItemCount+items.length>=limits.maxPdfItems||job.textCharacterCount+characters>limits.maxPdfCharacters)throw error('pdf-too-much-text','This PDF contains too much text to read locally. Save just the transcript pages into a new PDF or copy the course table into CSV.');items.push(item);}};
   if(typeof page.streamTextContent==='function'){
    const reader=page.streamTextContent({disableNormalization:false}).getReader();job.textReaders??=[];job.textReaders.push(reader);
    try{for(;;){check(job);const chunk=await reader.read();check(job);if(chunk.done)break;append(chunk.value);}}
    catch(cause){try{await reader.cancel();}catch{}throw cause;}
    finally{try{reader.releaseLock();}catch{}job.textReaders=job.textReaders.filter(value=>value!==reader);}
   }else{const content=await page.getTextContent({disableNormalization:false});check(job);append(content);}
   job.textItemCount+=items.length;job.textCharacterCount+=characters;return items;
  }
  async function fileBytes(job){if(typeof job.file?.arrayBuffer!=='function')throw error('invalid-file','Choose the original file again.');const buffer=await job.file.arrayBuffer();check(job);const bytes=bytesOf(buffer);if(bytes.length>limits.maxBytes)throw error('file-too-large','Choose a file smaller than 10 MB.');return bytes;}
  async function loadPDF(job){
   if(job.pdf)return job.pdf;const bytes=await fileBytes(job);if(!String.fromCharCode(...bytes.subarray(0,1024)).includes('%PDF-'))throw error('pdf-invalid','This file is not a readable PDF. Save a new PDF copy and try again.');
   if(!pdfModule)pdfModule=Promise.resolve().then(()=>config.loadPdf?config.loadPdf():import(local('vendor/pdfjs/pdf.mjs'))).catch(cause=>{pdfModule=null;throw error('reader-unavailable','The PDF reader could not load. Reload this page or paste the course rows instead.');});
   const pdfjs=await pdfModule;check(job);job.pdfjs=pdfjs;
   if(pdfjs.GlobalWorkerOptions&&!config.loadPdf)pdfjs.GlobalWorkerOptions.workerSrc=local('vendor/pdfjs/pdf.worker.mjs');
   if(pdfjs.PDFWorker)job.pdfWorker=new pdfjs.PDFWorker();
   const task=pdfjs.getDocument({data:bytes,worker:job.pdfWorker||undefined,useWasm:false,enableXfa:false,disableFontFace:true,useSystemFonts:true,isEvalSupported:false,stopAtErrors:true,isImageDecoderSupported:false,canvasMaxAreaInBytes:16000000,maxImageSize:40000000,useWorkerFetch:false,disableAutoFetch:true,disableStream:true});
   job.loadingTask=task;task.onPassword=()=>{job.password=true;try{task.destroy();}catch{}};
   try{job.pdf=await task.promise;check(job);if(job.pdf.numPages>limits.maxPages)throw error('too-many-pages','Choose a PDF with no more than 30 pages. Save only the transcript pages into a new PDF.');return job.pdf;}
   catch(cause){if(job.password||cause?.name==='PasswordException')throw error('password-protected','This PDF is password protected. Open it with its password in your PDF viewer, save an unprotected copy, then choose that copy.');if(cause?.code)throw cause;check(job);throw error('pdf-invalid','This PDF could not be read. Save a new PDF copy or paste its course rows instead.');}
  }
  async function readSpreadsheet(job,bytes,options){
   const factory=config.workerFactory||(typeof root.Worker==='function'?()=>new root.Worker(local('record-file-worker.js')):null);
   if(!factory)throw error('reader-unavailable','This browser cannot read Excel files locally. Export the course sheet as CSV or use a newer browser.');
   return new Promise((resolve,reject)=>{
    check(job);job.reject=reject;job.worker=factory();job.timeout=setTimeout(()=>{job.reject=null;release(job);reject(error('xlsx-timeout','This workbook took too long to read. Copy the course table into a smaller workbook or CSV.'));},20000);
    const finish=()=>{clearTimeout(job.timeout);job.timeout=null;job.worker?.terminate();job.worker=null;job.reject=null;};
    job.worker.onmessage=event=>{const result=event.data;if(result?.id!==job.id||current!==job||job.cancelled)return;finish();if(result.ok)resolve({...result.value,name:String(job.file.name||'')});else reject(error(result.error?.code||'xlsx-invalid',result.error?.message||'This workbook could not be read. Export the course sheet as CSV and try again.'));};
    job.worker.onerror=event=>{event.preventDefault?.();finish();reject(error('reader-unavailable','The Excel reader could not load. Reload this page or export the course sheet as CSV.'));};
    try{const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);job.worker.postMessage({id:job.id,kind:'xlsx',buffer,sheet:options.sheet},[buffer]);}catch(cause){finish();reject(cause);}
   });
  }
  async function read(file,options={}){
   const job=begin(file,options.signal);try{
    const format=classify(file),name=String(file.name||'');
    if(format==='pdf'){
     progress(job,options.onProgress,{stage:'reading-pdf',page:0});const pdf=await loadPDF(job),pages=[];job.textItemCount=0;job.textCharacterCount=0;
     for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      check(job);const page=await pdf.getPage(pageNumber);check(job);const viewport=page.getViewport({scale:1}),content=await pageText(job,page);check(job);
      const items=content.map((item,order)=>{const t=item.transform||[1,0,0,1,0,0],v=viewport.transform||[1,0,0,1,0,0];return{text:item.str,x:v[0]*t[4]+v[2]*t[5]+v[4],y:v[1]*t[4]+v[3]*t[5]+v[5],width:Math.abs(Number(item.width)||0),height:Math.abs(Number(item.height)||Math.hypot(t[2],t[3])||10),order,hasEOL:item.hasEOL===true};});
      const lineItems=pageLines(items),lines=lineItems.map(line=>line.text),text=lines.join('\n'),imageOnly=!/\p{L}|\p{N}/u.test(text);
      pages.push({page:pageNumber,width:viewport.width,height:viewport.height,text,lines,items,lineItems,imageOnly});page.cleanup?.();progress(job,options.onProgress,{stage:'reading-pdf',page:pageNumber,totalPages:pdf.numPages});
     }
     const imagePages=pages.filter(page=>page.imageOnly).length,extractionStatus=imagePages===pages.length?'image-only':imagePages?'mixed':'text';
     return{format:'pdf',name,text:pages.map(page=>page.text).join('\n\n'),pages,pageCount:pdf.numPages,extractionStatus,needsAI:imagePages>0,message:imagePages?'Some pages are images without readable text. You can use the optional AI reading step or paste the course rows; no courses have been added.':'',warnings:[]};
    }
    const bytes=await fileBytes(job);if(format==='xlsx'){progress(job,options.onProgress,{stage:'reading-spreadsheet'});return await readSpreadsheet(job,bytes,options);}
    const decoded=decodeText(bytes);return{format:format==='text'?'text':format,name,...decoded,warnings:[]};
   }catch(cause){release(job);if(current===job)current=null;throw cause;}
   finally{job.detach?.();job.busy=false;}
  }
  async function renderForAI(file,options={}){
   const bound=(value,fallback,maximum)=>{if(value===undefined)return fallback;if(!Number.isInteger(value)||value<1)throw error('invalid-render-limit','Use a positive whole-number image limit.');return Math.min(maximum,value);};
   const maximumPages=bound(options.maxPages,25,25),dimension=bound(options.maxDimension,2000,2000),maximumPixels=bound(options.maxTotalPixels,40000000,40000000),job=begin(file,options.signal,true);
   try{
    const pdf=await loadPDF(job);if(pdf.numPages>maximumPages)throw error('ai-too-many-pages','AI reading supports no more than 25 pages. Save only the transcript pages into a new PDF; no pages will be dropped automatically.');
    const sizes=[];let pixels=0;
    for(let number=1;number<=pdf.numPages;number++){check(job);const page=await pdf.getPage(number),view=page.getViewport({scale:1});if(!Number.isFinite(view.width)||!Number.isFinite(view.height)||view.width<=0||view.height<=0)throw error('pdf-invalid','A page has an invalid size. Save a new PDF copy and try again.');const scale=dimension/Math.max(view.width,view.height);const width=Math.min(dimension,Math.max(1,Math.ceil(view.width*scale))),height=Math.min(dimension,Math.max(1,Math.ceil(view.height*scale)));sizes.push({number,page,scale,width,height});pixels+=width*height;}
    if(pixels>maximumPixels){const reduction=Math.sqrt(maximumPixels/pixels);pixels=0;for(const size of sizes){size.scale*=reduction;size.width=Math.max(1,Math.floor(size.width*reduction));size.height=Math.max(1,Math.floor(size.height*reduction));pixels+=size.width*size.height;}if(pixels>maximumPixels||sizes.some(size=>Math.max(size.width,size.height)<800))throw error('ai-too-many-pixels','These pages exceed the readable AI image limit. Save fewer transcript pages into a new PDF; no pages will be dropped automatically.');}
    const pages=[];let totalBytes=0,renderedPixels=0;
    for(const size of sizes){
     let blob;const targetBytes=Math.min(2*1024*1024,Math.floor((8*1024*1024-totalBytes)/(sizes.length-pages.length)));
     for(let attempt=0;attempt<5;attempt++){
      check(job);const canvas=config.createCanvas?config.createCanvas(size.width,size.height):root.document?.createElement('canvas');if(!canvas)throw error('render-unavailable','This browser cannot prepare PDF images. Paste the course rows or try a newer browser.');
      canvas.width=size.width;canvas.height=size.height;job.canvases.push(canvas);const context=canvas.getContext('2d',{alpha:false});if(!context)throw error('render-unavailable','This browser could not prepare PDF images. Paste the course rows instead.');
      const task=size.page.render({canvasContext:context,viewport:size.page.getViewport({scale:size.scale}),background:'rgb(255,255,255)'});job.renders.push(task);await task.promise;check(job);
      blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(error('render-unavailable','This page could not be converted to a PNG image.')),'image/png'));check(job);
      canvas.width=0;canvas.height=0;job.canvases=job.canvases.filter(item=>item!==canvas);job.renders=job.renders.filter(item=>item!==task);
      if(blob.size<=targetBytes)break;
      const reduction=Math.min(0.85,Math.sqrt(targetBytes/blob.size)*0.9);
      size.width=Math.max(1,Math.floor(size.width*reduction));size.height=Math.max(1,Math.floor(size.height*reduction));size.scale*=reduction;
      if(attempt===4||Math.max(size.width,size.height)<800)throw error('ai-image-too-large','A page cannot fit the readable AI image budget. Save fewer transcript pages in a new PDF and try again; no pages were dropped.');
     }
     if(blob.size>2*1024*1024)throw error('ai-image-too-large','A prepared page exceeds the 2 MB image limit. Save fewer transcript pages and try again.');
     totalBytes+=blob.size;if(totalBytes>8*1024*1024)throw error('ai-images-too-large','The prepared images exceed 8 MB. Save fewer transcript pages into a new PDF and try again.');
     const bytes=new Uint8Array(await blob.arrayBuffer());check(job);let binary='';for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));
     const data=root.btoa?root.btoa(binary):typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):null;if(!data)throw error('render-unavailable','This browser could not prepare image data.');
     pages.push({page:size.number,mediaType:'image/png',data});renderedPixels+=size.width*size.height;size.page.cleanup?.();progress(job,options.onProgress,{stage:'preparing-ai-images',page:size.number,totalPages:pdf.numPages});
    }
    return{pages,totalPixels:renderedPixels,totalBytes};
   }catch(cause){release(job);if(current===job)current=null;throw cause;}
   finally{job.detach?.();job.busy=false;}
  }
  return Object.freeze({read,renderForAI,cancel(){cancel();},destroy(){disposed=true;cancel();}});
 }
 return Object.freeze({create,inspectWorkbook,decodeText,excelDate,limits,classify});
}));

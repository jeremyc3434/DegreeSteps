/* Bounded local spreadsheet decoding. No file contents leave this worker. */
'use strict';
importScripts('vendor/fflate/fflate.js','vendor/xlsx/xlsx.min.js','record-file-reader.js');
self.addEventListener('message',event=>{
 const request=event.data;if(!request||!Number.isSafeInteger(request.id)||request.kind!=='xlsx')return;
 try{self.postMessage({id:request.id,ok:true,value:self.DegreeRecordFileReader.inspectWorkbook(new Uint8Array(request.buffer),{XLSX:self.XLSX,fflate:self.fflate,sheet:request.sheet})});}
 catch(cause){self.postMessage({id:request.id,ok:false,error:{code:cause?.code||'xlsx-invalid',message:cause?.message||'This workbook could not be read. Export the course sheet as CSV and try again.'}});}
});

/* Original workbook bytes are read locally. No URLs or formulas are executed. */
'use strict';
importScripts('vendor/fflate/fflate.js','vendor/xlsx/xlsx.min.js','template-import-engine.js');
self.addEventListener('message',event=>{
 const {id,buffer,sheet}=event.data||{};if(!Number.isSafeInteger(id)||!(buffer instanceof ArrayBuffer))return;
 try{self.postMessage({id,ok:true,value:self.DegreeTemplateImport.inspectWorkbook(new Uint8Array(buffer),{XLSX:self.XLSX,fflate:self.fflate,sheet})});}
 catch(error){self.postMessage({id,ok:false,error:error?.message||'This workbook could not be read.'});}
});

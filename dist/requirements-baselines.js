/* Reviewed catalog requirements seed private drafts; they never award credit or select a plan. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeRequirementsBaselines=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const CATALOG_ID='2024-2025',BASELINE_ID='umass-global-mypath-bba-requirements-2024-2025',BASELINE_REVISION=1;
 const BASELINE_HASH='011044787d5a9f6f5328cdeed2596b0046634c7237c9f8816d8818790cb88e56';
 const SOURCE_PDF_SHA256='a43b249a19718b5dbafd4c5c61a8aeb780a97a190b5b88a50dddedd103b5e29c',SOURCE_LEDGER_SHA256='3e1d6ddd0e24ccfb2bd28b91c10ec374e0e8d93eea8e636d7a39d1d2408182e3';
 const SOURCE_URL='https://catalog.umassglobal.edu/pdf/University%20of%20Massachusetts%20Global%202024-2025%20Catalog.pdf';
 const EMPHASIS_IDS=Object.freeze(['general-business','gis-and-data-analytics','information-systems-management','management-and-organizational-leadership','marketing','supply-chain-management-and-logistics']);
 const labels=['General Business','GIS and Data Analytics','Information Systems Management','Management and Organizational Leadership','Marketing','Supply Chain Management and Logistics'],counts=[1,7,7,7,9,8];
 const commonCodes='LBSC100 COMC410 COMC101 ENGC103 ENGC104 PHLC110 HUMC110 HUMC115 LBSC320 LBSC321 NSCC115 NSCC111 NSCC112 MATC203 MATC103 SOSC110 SOSC115 ACCC215 ACCC230 ACCC240 ACCC225 ACCC235 ACCC220 ACCC360 ACCC210 FINC305 ECNC201 ECNC202 ECNC205 MGTC400 BUSC305 MGTC315 MGTC310 OLCC350 MGTC305 MGTC330 MGTC415 BUSC300 MGTC420 MGTC410 CSCC200 MGTC301 OLCC430 OLCC425 MGTC405 OLCC355 MKTC305 MKTC301 MGTC325 MGTC335 MGTC320'.split(' ');
 const emphasisCodes=['','CSCC301 CSCC302 CSCC303 CSCC363 CSCC304 CSCC305 CSCC395','CSCC251 CSCC408 CSCC205 CSCC210 CSCC410 CSCC270 CSCC395','HRCC445 OLCC303 OLCC300 OLCC325 HRCC349 OLCC400 OLCC414','MKTC415 MKTC450 MKTC310 MKTC465 MKTC320 MKTC410 MKTC325 MKTC430 MKTC470','MGTC350 MKTC430 MKTC445 MGTC430 CSCC325 CSCC320 MGTC425 MGTC345'].map(value=>value.split(' '));
 const copy=value=>JSON.parse(JSON.stringify(value)),codeKey=value=>value.replace(/\s/g,''),total=rows=>Math.round(rows.reduce((sum,row)=>sum+row.credits,0)*1000)/1000;
 const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const fail=()=>{throw Error('The reviewed requirements baseline is unavailable or invalid. Your saved workspace has not changed.');};
 const check=value=>{if(!value)fail();};
 function text(value,max=200){return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);}
 function keys(value,allowed){check(plain(value)&&Object.keys(value).length===allowed.length&&Object.keys(value).every(key=>allowed.includes(key)));}
 function page(value,min,max){keys(value,['printedPage','physicalPage']);check(Number.isInteger(value.printedPage)&&value.printedPage>=min&&value.printedPage<=max&&value.physicalPage===value.printedPage+1);}
 function row(value,allocation=false){
  keys(value,['section','code','title','credits','requiredAtUniversity','upperLevel','sourceUrl','allocationRequired']);
  check(text(value.section,100)&&text(value.title)&&typeof value.code==='string'&&(allocation?value.code==='':/^[A-Z]{4} \d{3}$/.test(value.code)));
  check(Number.isFinite(value.credits)&&value.credits>0&&value.credits<=19&&value.allocationRequired===allocation&&value.upperLevel===false);
  check(value.requiredAtUniversity===(['LBSC 320','LBSC 321'].includes(value.code)));
  check(typeof value.sourceUrl==='string'&&/^#page=(?:116|117|118|119|120)$/.test(value.sourceUrl.slice(SOURCE_URL.length))&&value.sourceUrl.startsWith(SOURCE_URL));
  if(allocation)check(value.title==='Business electives — specific courses not selected'&&value.credits===19);
 }
 function validateCatalog(data){
  // These anchors identify the reviewed same-origin asset. Node tests bind its
  // canonical payload and retained source bytes; a browser hash field is not origin evidence.
  keys(data,['kind','version','id','revision','catalogId','school','program','learningFormat','modality','level','creditSystem','creditUnitLabel','creditSystemNote','totalCredits','mode','source','commonRows','commonSummary','emphases','rowProvenance','policy','conflicts','limits','optionalOrientation','hash']);
  check(data.kind==='umass-global-mypath-bba-requirements-baselines'&&data.version===1&&data.id===BASELINE_ID&&data.revision===BASELINE_REVISION&&data.catalogId===CATALOG_ID&&data.hash===BASELINE_HASH);
  check(data.school==='University of Massachusetts Global'&&data.program==='Bachelor of Business Administration (MyPath)'&&data.learningFormat==='competency-based'&&data.modality==='online'&&data.level==='bachelor'&&data.creditSystem==='semester'&&data.creditUnitLabel==='catalog-equivalent credits'&&data.mode==='requirements-only'&&data.totalCredits===120&&text(data.creditSystemNote,1000));
  keys(data.source,['title','url','pdfSha256','pdfBytes','ledgerPath','ledgerSha256','checkedOn','pageConvention']);
  check(data.source.url===SOURCE_URL&&data.source.pdfSha256===SOURCE_PDF_SHA256&&data.source.pdfBytes===7265202&&data.source.ledgerSha256===SOURCE_LEDGER_SHA256&&data.source.ledgerPath==='content/research-intake/evidence/issue63/'+SOURCE_LEDGER_SHA256+'.json'&&data.source.checkedOn==='2026-11-27'&&text(data.source.title)&&text(data.source.pageConvention));
  check(Array.isArray(data.commonRows)&&data.commonRows.length===51);data.commonRows.forEach(value=>row(value));
  check(data.commonRows.every((value,index)=>codeKey(value.code)===commonCodes[index])&&total(data.commonRows)===101&&total(data.commonRows.slice(1,17))===48&&total(data.commonRows.slice(17))===50&&data.commonRows[0].credits===3);
  keys(data.commonSummary,['studentSuccessCredits','generalEducationNamedCount','generalEducationCredits','businessCoreNamedCount','businessCoreCredits','equivalentCredits']);
  check([data.commonSummary.studentSuccessCredits,data.commonSummary.generalEducationNamedCount,data.commonSummary.generalEducationCredits,data.commonSummary.businessCoreNamedCount,data.commonSummary.businessCoreCredits,data.commonSummary.equivalentCredits].join(',')==='3,16,48,34,50,101');
  check(Array.isArray(data.emphases)&&data.emphases.length===6);
  for(const[index,emphasis]of data.emphases.entries()){
   keys(emphasis,['id','title','requirementType','namedCompetencyCount','equivalentCredits','requiresAllocation','rows','evidenceAt',...(index===0?['allocationNote']:[])]);
   check(emphasis.id===EMPHASIS_IDS[index]&&emphasis.title===labels[index]&&emphasis.requirementType===(index===0?'open-business-electives':'prescribed-competencies')&&emphasis.namedCompetencyCount===(index===0?null:counts[index])&&emphasis.requiresAllocation===(index===0)&&emphasis.equivalentCredits===19);
   check(Array.isArray(emphasis.rows)&&emphasis.rows.length===counts[index]);emphasis.rows.forEach(value=>row(value,index===0));
   check(total(emphasis.rows)===19&&emphasis.rows.every((value,i)=>codeKey(value.code)===emphasisCodes[index][i]));page(emphasis.evidenceAt,117,119);
   if(index===0)check(text(emphasis.allocationNote,1000));
  }
  const named=[...data.commonRows,...data.emphases.flatMap(emphasis=>emphasis.rows)].filter(value=>value.code),codes=[...new Set(named.map(value=>value.code))];
  check(plain(data.rowProvenance)&&Object.keys(data.rowProvenance).length===codes.length&&Object.keys(data.rowProvenance).every(code=>codes.includes(code)));
  for(const code of codes){
   const proof=data.rowProvenance[code];keys(proof,['requirementPages','creditPage','descriptionTitle','creditLabelAsPrinted','advisorySequencingQuotes','formalPrerequisiteCodes','upperLevelStatus','transferRestrictionStatus']);
   check(Array.isArray(proof.requirementPages)&&proof.requirementPages.length>0&&proof.requirementPages.length<=6);proof.requirementPages.forEach(value=>page(value,115,119));page(proof.creditPage,335,348);
   check(text(proof.descriptionTitle)&&typeof proof.creditLabelAsPrinted==='string'&&text(proof.creditLabelAsPrinted.replace(/\s+/g,' '),80)&&proof.formalPrerequisiteCodes===null&&proof.upperLevelStatus==='not-inferred-by-this-baseline'&&['not-established-by-course-listing','explicit-program-restriction'].includes(proof.transferRestrictionStatus)&&Array.isArray(proof.advisorySequencingQuotes)&&proof.advisorySequencingQuotes.length<=5&&proof.advisorySequencingQuotes.every(value=>text(value,2000)));
   const amount=Number(proof.creditLabelAsPrinted.match(/^(\d+(?:\.\d+)?)\s+[Cc]redits?\.?$/)?.[1]);
   check(named.filter(value=>value.code===code).every(value=>value.credits===amount&&proof.requirementPages.some(page=>value.sourceUrl===SOURCE_URL+'#page='+page.physicalPage)));
  }
  keys(data.policy,['institutionMinCredits','requiredAtUniversityCodes','sourcePage','upperMinCredits','externalMaxCredits','alternativeMaxCredits','transferAwardStatus','postEnrollmentOutsideCoursePermission']);
  check(data.policy.institutionMinCredits===30&&JSON.stringify(data.policy.requiredAtUniversityCodes)==='["LBSC 320","LBSC 321"]'&&data.policy.upperMinCredits===null&&data.policy.externalMaxCredits===null&&data.policy.alternativeMaxCredits===null&&data.policy.transferAwardStatus==='not-established'&&data.policy.postEnrollmentOutsideCoursePermission==='not-established');page(data.policy.sourcePage,60,60);
  check(Array.isArray(data.conflicts)&&data.conflicts.length===4&&data.conflicts.map(value=>value?.id).join(',')==='ge-header-count-mismatch,accounting-advisory-sequencing-cycle,database-description-body-mismatch,description-title-variants'&&data.conflicts.every(value=>plain(value)&&text(value.detail,2000)));
  check(Array.isArray(data.limits)&&data.limits.length===6&&data.limits.every(value=>text(value,1000)));
  keys(data.optionalOrientation,['code','required','includedInRows']);check(data.optionalOrientation.code==='ORIC 100'&&data.optionalOrientation.required===false&&data.optionalOrientation.includedInRows===false);
  return copy(data);
 }
 function prepareDraft(state,data,choice,A){
  const catalog=validateCatalog(data);
  if(!plain(choice)||choice.catalogId!==CATALOG_ID||!EMPHASIS_IDS.includes(choice.emphasisId))throw Error('Choose the exact 2024–2025 MyPath catalog and your declared emphasis. Enrollment year or school notes do not select them.');
  if(!A||['validatePrivateWork','readDraft','saveDraft','launchURL'].some(name=>typeof A[name]!=='function'))throw Error('The requirements workspace is not ready. Your saved plan has not changed.');
  A.validatePrivateWork(state);
  const emphasis=catalog.emphases.find(value=>value.id===choice.emphasisId),rows=copy([...catalog.commonRows,...emphasis.rows]);
  const metadata={school:catalog.school,title:catalog.program+' — '+emphasis.title,programId:'requirements-baseline-umass-global-mypath-bba-'+CATALOG_ID+'-'+emphasis.id+'-r'+BASELINE_REVISION,level:catalog.level,modality:catalog.modality,catalog:CATALOG_ID,creditSystem:catalog.creditSystem,sourceUrl:catalog.source.url,totalCredits:120,institutionMinCredits:30,upperMinCredits:'',reviewedByStudent:false,baselineId:BASELINE_ID,baselineRevision:BASELINE_REVISION,baselineHash:BASELINE_HASH,baselineMode:'requirements-only',baselineEmphasisId:emphasis.id,creditUnitLabel:catalog.creditUnitLabel,learningFormat:catalog.learningFormat};
  const context={school:metadata.school,degree:metadata.title,programId:metadata.programId,level:metadata.level,modality:metadata.modality,catalog:metadata.catalog,creditSystem:metadata.creditSystem,sourceUrl:metadata.sourceUrl};
  const baseline={id:BASELINE_ID,revision:BASELINE_REVISION,hash:BASELINE_HASH,mode:'requirements-only',catalogId:CATALOG_ID,emphasisId:emphasis.id,emphasisTitle:emphasis.title,requiresAllocation:emphasis.requiresAllocation,creditUnitLabel:catalog.creditUnitLabel,learningFormat:catalog.learningFormat,source:copy(catalog.source),rowProvenance:copy(catalog.rowProvenance),conflicts:copy(catalog.conflicts),limits:copy(catalog.limits),policy:copy(catalog.policy)};
  const existing=A.readDraft(state,context),href=A.launchURL(context);
  if(existing){
   const saved=existing.metadata;
   if(saved.baselineId!==BASELINE_ID||String(saved.baselineRevision)!==String(BASELINE_REVISION)||saved.baselineHash!==BASELINE_HASH||saved.baselineMode!=='requirements-only'||saved.baselineEmphasisId!==emphasis.id||saved.creditUnitLabel!==catalog.creditUnitLabel||saved.learningFormat!==catalog.learningFormat)throw Error('The saved baseline draft has different source details. It has not been replaced. Open that draft to review it.');
   return{state,context,metadata:copy(saved),rows:copy(existing.rows),reused:true,href,baseline};
  }
  const next=A.saveDraft(state,context,{metadata,rows,csv:'',mode:'rows'});
  return{state:next,context,metadata,rows,reused:false,href,baseline};
 }
 return Object.freeze({CATALOG_ID,BASELINE_ID,BASELINE_REVISION,BASELINE_HASH,SOURCE_PDF_SHA256,SOURCE_LEDGER_SHA256,EMPHASIS_IDS,validateCatalog,prepareDraft});
}));

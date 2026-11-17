/** Academic admission for reviewed research uses the same planner as student plans. */
const TemplateAcademicAdmission = (() => {
  'use strict';
  const known=value=>typeof value==='number'&&Number.isFinite(value),list=value=>Array.isArray(value)?value:[],copy=value=>JSON.parse(JSON.stringify(value));
  const key=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
  const alternativeProviders=new Set(['SOPHIA','SOPHIALEARNING','STUDYCOM','STRAIGHTERLINE','CLEP','DSST','SAYLOR','DAVAR','COOPERSMITH','MODERNSTATES']);
  const alternativeOrigins=new Set(['alternative','alternative-credit','ace','ace-recommended','nccrs','nccrs-recommended','noncollegiate','exam','credit-by-exam']);
  const origins=new Set(['institutional','institutional-credit','college','college-issued','regionally-accredited','university','alternative','alternative-credit','ace','ace-recommended','nccrs','nccrs-recommended','noncollegiate','exam','credit-by-exam']);
  const conditionalCodes=new Set(['conditional_mapping','policy_review']);
  const letters=new Set(['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','P','PASS','S','SATISFACTORY']);
  const policies=['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorMinInstitutionCredits','majorInstitutionFraction','majorResidencyBasisCredits','upperGroupMinimums','gradePolicy','transferGradePolicy','minimumGrade','minGrade','policyReview','policySourceIds','graduationRequirements','obligations','rulesNotes','prerequisiteNotes'];
  function convert(artifact){
    const issues=[],issue=message=>{if(!issues.includes(message))issues.push(message);};
    if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))return{issues:['A complete reviewed degree artifact is required.'],model:null};
    let a;try{a=copy(artifact);}catch{return{issues:['Degree facts must be plain JSON.'],model:null};}
    if(!['associate','bachelor','master','doctorate','specialist'].includes(a.level)||!['online','campus'].includes(a.modality)||!['semester','quarter','competency-unit'].includes(a.creditSystem))issue('The planner needs a supported degree level, study format and credit units.');
    if(!known(a.totalCredits)||a.totalCredits<=0||a.totalCredits>500)issue('The published degree total must be a positive known credit quantity.');
    if(typeof a.schoolName!=='string'||!a.schoolName.trim()||typeof a.programName!=='string'||!a.programName.trim())issue('The exact school and degree must be named.');
    const model={id:'reviewed-template-academic-check',school:a.schoolName,title:a.programName,level:a.level,format:a.modality==='online'?'Online':'Residential',modalities:[a.modality],catalogYear:a.catalogYear,creditSystem:a.creditSystem,totalCredits:a.totalCredits,sources:list(a.sources),requirements:[]};
    for(const field of policies)if(a[field]!==undefined)model[field]=copy(a[field]);
    for(const field of ['institutionMinCredits','externalMaxCredits','upperMinCredits'])if(!known(model[field])||model[field]<0||model[field]>a.totalCredits)issue('Confirm a valid '+field+' before publication.');
    for(const field of ['alternativeMaxCredits','majorMinInstitutionCredits','majorResidencyBasisCredits'])if(model[field]!==undefined&&(!known(model[field])||model[field]<0||model[field]>a.totalCredits))issue('The '+field+' policy is outside the degree credit bounds.');
    if(model.majorInstitutionFraction!==undefined&&(!known(model.majorInstitutionFraction)||model.majorInstitutionFraction<0||model.majorInstitutionFraction>1))issue('The major residency fraction must be between zero and one.');
    if(a.majorMinInstitutionCredits===undefined&&(a.majorInstitutionFraction===undefined||a.majorResidencyBasisCredits===undefined))issue('The major residency rule must be explicitly reviewed.');
    if(a.majorInstitutionFraction===0&&a.majorResidencyBasisCredits===0){delete model.majorInstitutionFraction;delete model.majorResidencyBasisCredits;if(model.majorMinInstitutionCredits===undefined)model.majorMinInstitutionCredits=0;}
    if(!Array.isArray(a.unresolved)||a.unresolved.length)issue('Resolve every outstanding research item before publishing a ready plan.');
    const sources=new Set(model.sources.map(source=>source?.id)),rows=list(a.requirements),ids=new Set(),codes=new Map();
    if(!rows.length||rows.length>180)issue('A ready degree needs between one and 180 requirement rows.');
    for(const r of rows){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)){issue('Requirement identifiers must be present and unique.');continue;}ids.add(r.id);const code=key(r.code);if(!code)issue('Every requirement must name its receiving course.');else if(codes.has(code))issue('The same receiving course cannot be counted twice: '+r.code);else codes.set(code,r.id);}
    const dependency=value=>{if(typeof value!=='string'||!value.trim()){issue('Prerequisites must identify exact requirements or receiving course codes.');return null;}if(ids.has(value))return value;const found=codes.get(key(value));if(!found)issue('A prerequisite is absent from the degree ledger: '+value);return found||null;};
    function refs(value,label){if(!Array.isArray(value)||!value.length||value.some(id=>!sources.has(id)))issue(label+' needs valid reviewed source references.');return list(value);}
    function gradeBounds(value,path,depth=0){if(depth>25){issue('Grade metadata is too deeply nested for review.');return;}if(!value||typeof value!=='object')return;for(const [field,item]of Object.entries(value)){
      if(['minimumGrade','minGrade','minimumGradeWhenUpper','minimumTransferGrade'].includes(field)&&!(typeof item==='string'&&letters.has(item.trim().toUpperCase())))issue('The grade rule at '+path+'.'+field+' is not a supported minimum grade.');
      if(/^(?:minimumGpa|minimumGPA|minGpa|minGPA|gpaMinimum)$/.test(field)&&(!known(item)||item<0||item>4.33))issue('The GPA rule at '+path+'.'+field+' must be within the supported zero to 4.33 scale.');
      if(item&&typeof item==='object')gradeBounds(item,path+'.'+field,depth+1);
    }}
    gradeBounds(a,'degree');let optionCount=0;
    for(const r of rows){if(!r||!ids.has(r.id))continue;const section=r.category||r.section||'',category=/general/i.test(section)?'general':/elective/i.test(section)?'elective':/major|concentration|foundation/i.test(section)?'major':null;if(!category||r.category!==undefined&&!['general','major','elective'].includes(r.category))issue('Choose a supported canonical requirement category for '+r.id+'.');
      if(typeof r.upper!=='boolean')issue('Confirm the receiving upper-level classification for '+r.id+'.');
      if(!known(r.credits)||r.credits<=0||r.credits>30||typeof r.title!=='string'||!r.title.trim())issue('Each requirement needs its exact title and positive credits.');
      if(r.researchGap||r.selectionRequired)issue('Choose a named, complete requirement before publication: '+r.id);
      if(r.minimumCompletedCredits!==undefined&&(!known(r.minimumCompletedCredits)||r.minimumCompletedCredits<0||r.minimumCompletedCredits>a.totalCredits-r.credits))issue('The completed-credit prerequisite is not achievable for '+r.id+'.');
      if(r.prerequisites!==undefined&&!Array.isArray(r.prerequisites))issue('Requirement prerequisites must be an array.');
      const next={...r,category:category||'major',institutionalOnly:r.requiredAtUniversity===true||r.institutionalOnly===true,sourceIds:refs(r.sourceIds,'The requirement'),prerequisites:list(r.prerequisites).map(dependency).filter(Boolean),options:[]};delete next.requiredAtUniversity;delete next.section;
      const choices=list(r.options),optionIds=new Set();if(!choices.length||choices.length>100)issue('Every requirement needs one to 100 reviewed named options.');
      for(const o of choices){optionCount++;if(!o||typeof o.id!=='string'||!o.id||optionIds.has(o.id)||typeof o.provider!=='string'||!o.provider.trim()||typeof o.code!=='string'||!o.code.trim()||typeof o.title!=='string'||!o.title.trim()){issue('Course option identifiers and names must be present and unique within each requirement.');continue;}optionIds.add(o.id);
        if(typeof o.upper!=='boolean')issue('Every option needs explicit receiving upper-level facts: '+o.id);
        if(o.credits!==r.credits||o.creditSystem!==a.creditSystem||o.selectionRequired)issue('Each named option must match the requirement’s exact receiving credits and units.');
        const added={...o,sourceIds:refs(o.sourceIds,'The course option'),receivingCode:o.receivingCode||r.code};
        const receiving=key(added.receivingCode),allowed=[r.code,...list(r.allowedCourseCodes)].map(key);
        if(!allowed.includes(receiving)&&r.freeElective!==true)issue('The option receiving course does not match this requirement: '+o.id);
        if(receiving===key(r.code)&&typeof o.upper==='boolean'&&o.upper!==r.upper)issue('Receiving level facts conflict between requirement and option: '+o.id);
        if(next.institutionalOnly&&o.provider!=='University')issue('A university-only requirement cannot use an outside course.');
        if(key(o.provider)==='UNIVERSITY'&&o.provider!=='University')issue('Use the canonical University provider for destination coursework.');
        if(o.prerequisites!==undefined&&!Array.isArray(o.prerequisites))issue('Course option prerequisites must be an array.');
        if(o.prerequisites)added.prerequisites=list(o.prerequisites).map(dependency).filter(Boolean);
        if(o.provider!=='University'){
          const origin=String(o.creditOrigin||o.sourceType||'').toLowerCase().replace(/[\s_]/g,'-');
          if(alternativeProviders.has(key(o.provider))){added.creditOrigin='alternative';if(origin&&!alternativeOrigins.has(origin))issue('A known alternative-credit provider cannot be described as college-issued credit.');}else if(!origins.has(origin))issue('Identify the outside course as college-issued or alternative credit before using its source limits: '+o.id);
          if(['master','doctorate','specialist'].includes(a.level)&&(alternativeProviders.has(key(o.provider))||o.graduateApproval!==true||!['institutional','institutional-credit','college','college-issued','regionally-accredited','university'].includes(origin)))issue('Graduate transfer options need exact graduate approval and college-issued credit.');
          for(const field of ['sourceCredits','sourceCreditSystem','bundleCredits','sourceCreditVerification'])delete added[field];added.sourceCreditStatus='unknown';
        }
        for(const field of ['status','learningId','completedOn','schoolConfirmed','confirmed','evaluations'])delete added[field];
        next.options.push(added);
      }
      model.requirements.push(next);
    }
    if(optionCount>2000)issue('This template has too many course choices for one reviewed plan.');
    const graph=new Map(model.requirements.map(r=>[r.id,new Set([...r.prerequisites,...r.options.flatMap(o=>list(o.prerequisites))])])),visited=new Set(),visiting=new Set();
    const visit=id=>{if(visiting.has(id)){issue('Prerequisites contain a cycle and need correction before publication.');return;}if(visited.has(id))return;visiting.add(id);for(const prerequisite of graph.get(id)||[])visit(prerequisite);visiting.delete(id);visited.add(id);};for(const id of graph.keys())visit(id);
    if(a.policyReview!==undefined){if(!Array.isArray(a.policyReview))issue('Conditional policy notes need individual source references.');else for(const note of a.policyReview)if(!note||typeof note!=='object'||!Array.isArray(note.sourceIds)||!note.sourceIds.length||note.sourceIds.some(id=>!sources.has(id)))issue('Every conditional policy note needs its reviewed source references.');}
    if(a.upperGroupMinimums!==undefined){if(!Array.isArray(a.upperGroupMinimums))issue('Upper-level group minimums must be a reviewed list.');else for(const group of a.upperGroupMinimums)if(!group||typeof group.group!=='string'||!known(group.credits)||group.credits<0||group.credits>a.totalCredits)issue('A subgroup upper-level minimum is outside the degree bounds.');}
    return{issues,model};
  }
  function validate(artifact,{Planner}={}){
    const result=convert(artifact),issues=[...result.issues],add=message=>{if(!issues.includes(message))issues.push(message);};
    if(!Planner||typeof Planner.generate!=='function'||typeof Planner.validate!=='function')return{valid:false,issues:['The shared academic planner is not configured.'],model:result.model};
    if(issues.length)return{valid:false,issues,model:result.model};
    try{const model=result.model,providers=[...new Set(model.requirements.flatMap(r=>r.options.map(o=>o.provider)))].filter(p=>p!=='University'),plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000}),validation=Planner.validate(model,plan);
      if(plan.validation?.academicCountsValid!==true||validation.academicCountsValid!==true)add('The available course options cannot satisfy this degree’s academic credit rules.');
      for(const error of [...list(plan.setupIssues),...list(plan.validation?.errors),...list(validation.errors)])if(!conditionalCodes.has(error.code))add(error.message||'The proposed degree has an unresolved academic constraint.');
      if(plan.rows.length!==model.requirements.length||plan.rows.some(row=>!row.option||row.selectionRequired))add('Every requirement must have a usable named course action.');
      if(plan.sequence?.some(step=>step.executionBlocked))add('The proposed course order has an unresolved prerequisite blocker.');
      return{valid:issues.length===0,issues,model,validation,plan};
    }catch{return{valid:false,issues:['The shared planner could not validate this degree. Review its requirements and policies.'],model:result.model};}
  }
  return{convert,validate};
})();
export function canonicalTemplateAcademicModel(artifact){return TemplateAcademicAdmission.convert(artifact);}
export function validateAcademicTemplate(artifact,options){return TemplateAcademicAdmission.validate(artifact,options);}

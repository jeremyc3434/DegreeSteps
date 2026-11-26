/* Content overlap: two different outside courses that teach the same subject (for example Saylor "Principles of
   Microeconomics" and Sophia "Microeconomics"). The planner's duplicate check (sourceUseErrors) stops one course, one
   provider and code, from counting twice. This file catches the different case: two providers' versions of the same
   course, each placed on a different requirement.

   It does not decide what a school awards. A school's published tables can list each course on its own, and the
   school's rules may still say nothing about taking both. So an overlap is shown as "needs attention: confirm with
   the school", never as an error, and it never changes a plan's counts or which plans are published. Courses that
   only share a subject area (Microeconomics and Macroeconomics, Composition I and II) are not overlaps. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeContentOverlap=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  // Wording that changes a course's name but not its content.
  const filler=/\b(?:principles|principle|introduction|intro|fundamentals|foundations|essentials|basics|survey|concepts|elements)\s+(?:of|to|in)\b/g;
  // Titles that name a kind of credit rather than a subject say nothing about content.
  const generic=/^(?:elective|free elective|general elective|special topics?|topics|independent study|seminar|capstone|internship|practicum|lab|laboratory|course|credit|transfer credit|prior learning)$/;
  const numerals={'1':'i','2':'ii','3':'iii','4':'iv'};
  /** One comparable key per course title, or '' when the title cannot identify a subject. */
  function contentKey(title){
    const text=String(title||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/\([^)]*\)/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(filler,' ').replace(/\b([1-4])\b/g,(m,d)=>numerals[d]).replace(/^\s*(?:the|an|a)\s+/,'').replace(/\s+/g,' ').trim();
    return text.length>=4&&!generic.test(text)?text:'';
  }
  const actionKey=option=>String(option?.provider||'').toLowerCase()+'|'+String(option?.code||option?.id||'').toUpperCase();
  /** Groups a plan's outside-course rows that teach the same subject through different courses.
   *  Rows: {requirementId,title?,status?,option:{provider,code,title,receivingCourseRepeatable?}}. */
  function overlaps(rows){
    const groups=new Map();
    for(const row of list(rows)){
      const option=row?.option;
      if(!option||option.provider==='University'||option.provider==='Prior learning'||option.receivingCourseRepeatable||row.selectionRequired||option.selectionRequired)continue;
      const key=contentKey(option.title);if(!key)continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({requirementId:row.requirementId,requirementTitle:row.title||'',provider:option.provider,code:option.code||'',title:option.title,status:row.status||'planned'});
    }
    // Only different learning actions overlap; the same course twice is the planner's duplicate-source error.
    return [...groups].map(([key,items])=>({key,items})).filter(group=>new Set(group.items.map(actionKey)).size>1)
      .map(group=>({key:group.key,subject:group.items[0].title,items:group.items}));
  }
  /** Plain-language "needs attention" text for one overlap group. */
  function message(group,school){
    const names=group.items.map(item=>item.provider+' '+item.title+(item.code?' ('+item.code+')':'')),who=school||'the school';
    return names.join(' and ')+' cover the same subject. Each is a published match for its own requirement, but '+who+'’s published rules don’t say whether both can earn credit. Ask '+who+' before paying for both, or swap one for a course on a different subject.';
  }
  return Object.freeze({contentKey,overlaps,message});
}));

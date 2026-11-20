/** Shared, decorative-only visual vocabulary for generated public pages.
 * Every icon is aria-hidden; the text beside it always carries the meaning. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const paths={search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
 course:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m10 8 4 2-4 2z"/>',
 exam:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/>',
 university:'<path d="M3 9.5 12 5l9 4.5"/><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7"/><path d="M3 20h18"/>',
 training:'<circle cx="12" cy="9" r="5"/><path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7"/>',
 history:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
 route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>',
 layers:'<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/>',
 campus:'<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M2 20h20"/>',
 checklist:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
 shield:'<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
 clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
 flag:'<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
 people:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5M15 14.5c3 0 5 1.5 5 4.5"/>',
 article:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
 cap:'<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
 online:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>'
};
export function icon(name,className='ds-icon'){return '<svg class="'+className+'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name]||paths.article)+'</svg>';}

/** Credit-source categories used for chips, colors and jump navigation. */
export const sourceCategories=Object.freeze([
 {id:'courses',label:'Self-paced courses',icon:'course',description:'Self-paced online courses, often with ACE or NCCRS credit recommendations. Your school decides which ones count.',kinds:['alternative-provider']},
 {id:'exams',label:'Exams & test prep',icon:'exam',description:'Show what you already know. Pass an exam and your school may award credit without a full course.',kinds:['credit-examination','institutional-examination','language-assessment','industry-certification','preparation-and-funding']},
 {id:'university',label:'University-issued credit',icon:'university',description:'Courses recorded on a college or university transcript. Your receiving school still decides how they apply.',kinds:['institutional-partner','institutional-course','school-mediated-dual-enrollment']},
 {id:'training',label:'Training & prior learning',icon:'training',description:'Certificates, workforce training and military learning that may already be worth college credit.',kinds:['credential-bundle','training-provider','training-and-conversion','qualifying-prior-learning']},
 {id:'historical',label:'Historical routes',icon:'history',description:'Useful when interpreting old learning records. These are not presented as new enrollment options.',kinds:['retired-provider','retired-examination']}
]);
export function sourceCategory(kind){return sourceCategories.find(category=>category.kinds.includes(kind))||(String(kind).startsWith('retired-')?sourceCategories[4]:sourceCategories[0]);}

/** Editorial categories map to a small icon set; unknown categories get a neutral page icon. */
const articleIcons=[[/transfer basics|transfer decisions/i,'route'],[/credit sources|choosing courses|more ways/i,'layers'],[/residential|campus/i,'campus'],[/degree planning|course-by-course/i,'checklist'],[/military/i,'shield'],[/time and cost/i,'clock'],[/getting started|returning/i,'flag'],[/community|real experiences/i,'people'],[/graduate/i,'cap']];
export function articleIcon(category){return (articleIcons.find(([pattern])=>pattern.test(category||''))||[null,'article'])[1];}

/** A text monogram, never a reproduction of a school's logo. */
const knownMarks={'Western Governors University':'WGU','Liberty University':'LU','Thomas Edison State University':'TESU','University of Maine at Presque Isle':'UMPI','Grand Canyon University':'GCU','Southern New Hampshire University':'SNHU'};
export function schoolMark(name){return knownMarks[name]||String(name||'').split(/\s+/).filter(word=>/^[A-Z]/.test(word)).map(word=>word[0]).join('').slice(0,4)||'U';}
export function schoolMarkHTML(name,className='ds-school-mark'){const mark=schoolMark(name);return '<span class="'+className+(mark.length>3?' is-long':'')+'" aria-hidden="true">'+esc(mark)+'</span>';}

/** Horizontal outside-vs-university bar. The bar is decorative; the legend is the text equivalent. */
export function creditSplit({outside,university,total,schoolLabel='the university',unit='credits',className=''}){
 const short=unit==='competency units'?'units':'credits',sum=Number(total)||Number(outside)+Number(university);
 return '<div class="ds-split'+(className?' '+className:'')+'"><div class="ds-split-track" aria-hidden="true"><span class="ds-split-outside" style="flex-grow:'+Number(outside)+'"></span><span class="ds-split-school" style="flex-grow:'+Number(university)+'"></span></div><dl class="ds-split-legend"><div class="is-outside"><dt>Outside courses</dt><dd>'+Number(outside)+'</dd></div><div class="is-school"><dt>At '+esc(schoolLabel)+'</dt><dd>'+Number(university)+'</dd></div><div class="is-total"><dt>Degree '+esc(short)+'</dt><dd>'+sum+'</dd></div></dl></div>';
}

/** Deterministic assignment-format hints. Student instructions remain untrusted
 * task data; this module does not authenticate a user or certify citations. */
export const ASSIGNMENT_FORMAT_VERSION = 'assignment-format-v1-2026-11-28';
export const ASSIGNMENT_FORMAT_SOURCES = Object.freeze({
  apa7: 'https://apastyle.apa.org/instructional-aids/student-paper-setup-guide.pdf',
  mla9: 'https://style.mla.org/formatting-papers/'
});
export const ASSIGNMENT_FORMAT_GUIDANCE = [
  'Apply the resolved assignmentFormat to the requested artifact. Specific assignment or rubric requirements take priority over general style defaults and the course syllabus. Do not impose a citation style when none was requested.',
  'For APA 7 student papers, use author-date citations and a References section. For MLA 9, use author-location citations where the source supplies a locator and a Works Cited section. Preserve actual source author, date, title and locator data. Never invent authors, publication years, page numbers, DOI values or personal title-page details. A URL and title alone do not verify a complete reference.',
  'In a formally styled paper, actual author-date or author-location citations belong in content. Retain the supplied [S#] source-identity mappings in checks details or other evidence metadata, rather than printing [S1] as if it were an APA or MLA citation. Missing bibliographic data belongs in specific checks, not fabricated references. Use established authorless or no-date conventions only when the source really lacks that information.',
  'Honor explicit editions, headings, spacing, fonts, title-page and abstract instructions. Do not silently replace an older or unsupported style with APA 7. Keep required personal details editable and absent until provided. Distinguish a document layout from verified source/citation accuracy. Formatting does not establish originality, a grade, permitted AI use or submission readiness.'
].join('\n');

const EDITION_WORDS = {first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
const DEFAULT_EDITION = {apa:7,mla:9};
const FORMATS = Object.freeze({apa7:{style:'apa',edition:7,label:'APA 7'},mla9:{style:'mla',edition:9,label:'MLA 9'}});
const boundedText = value => typeof value === 'string' ? value.slice(0,48000) : '';
const normalize = value => boundedText(value).replace(/\r\n/g,'\n');
function editionNear(text, start, end) {
  const after=text.slice(end,end+55),before=text.slice(Math.max(0,start-45),start);
  const number=after.match(/^\s*(?:[-:,]\s*)?(?:style\s*)?(?:\(\s*)?(?:(?:edition|ed\.?)\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-–]\s*)?(?:edition|ed\.?)?\b/i)
    ||before.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*(?:[-–]\s*)?(?:edition|ed\.?)\s*$/i);
  if(number){const n=Number(number[1]);if(n>=1&&n<=20)return n;}
  const words=after.match(/^\s*(?:[-:,]\s*)?(?:style\s*)?(?:\(\s*)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*(?:[-–]\s*)?(?:edition|ed\.?)/i)
    ||before.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*(?:[-–]\s*)?(?:edition|ed\.?)\s*$/i);
  return words ? EDITION_WORDS[words[1].toLowerCase()] : null;
}
function requestsIn(value) {
  const text=normalize(value).replace(/https?:\/\/[^\s<>]+/gi,''),found=[];
  for(const m of text.matchAll(/\b(APA|MLA)(?=\b|\d)/gi)){
    const before=text.slice(Math.max(0,m.index-35),m.index);
    if(/\b(?:do\s+not\s+use|don['’]t\s+use|not(?:\s+in)?|avoid|rather\s+than|instead\s+of)\s*$/i.test(before))continue;
    const clause=text.slice(Math.max(0,m.index-90),m.index);
    if(/\b(?:compare|contrast|define|explain|describe|differences? between|history of)\b[^.;!?\n]*$/i.test(clause)&&!/\b(?:use|using|follow|formatted? (?:in|with)|required style)\b[^.;!?\n]*$/i.test(clause))continue;
    found.push({style:m[1].toLowerCase(),edition:editionNear(text,m.index,m.index+m[0].length)});
  }
  // A named alternative must be preserved rather than mistaken for a default.
  for(const m of text.matchAll(/\b(Chicago|Turabian|Harvard|IEEE|AMA|Vancouver|ACS)\b/gi)){
    const before=text.slice(Math.max(0,m.index-35),m.index);
    if(/\b(?:do\s+not\s+use|don['’]t\s+use|not(?:\s+in)?|avoid|rather\s+than|instead\s+of)\s*$/i.test(before))continue;
    const context=text.slice(Math.max(0,m.index-45),Math.min(text.length,m.index+m[0].length+35));
    if(/\b(?:style|format|citation|references?|use|follow|manual)\b/i.test(context))found.push({style:'other',name:m[1],edition:null});
  }
  return found.filter((item,index,all)=>all.findIndex(other=>other.style===item.style&&other.edition===item.edition&&other.name===item.name)===index)
    .filter(item=>item.edition!==null||!found.some(other=>other.style===item.style&&other.name===item.name&&other.edition!==null));
}
function booleanInstruction(text, noun) {
  const neg=new RegExp('\\b(?:no|omit|exclude|without|do not include|not required|not necessary)\\s+(?:an?\\s+)?'+noun+'\\b|\\b'+noun+'\\s+(?:is\\s+)?(?:not required|not necessary|optional)\\b','i');
  if(neg.test(text))return false;
  const yes=new RegExp('\\b(?:include|require[sd]?|must have|add|provide)\\s+(?:an?\\s+)?'+noun+'\\b|\\b'+noun+'\\s+(?:is\\s+)?required\\b','i');
  return yes.test(text)?true:null;
}
function layoutFrom(text) {
  const layout={};
  const font=text.match(/\b(Times\s+New\s+Roman|Calibri|Arial|Georgia|Aptos)\b/i);
  if(font)layout.fontFamily={timesnewroman:'Times New Roman',calibri:'Calibri',arial:'Arial',georgia:'Georgia',aptos:'Aptos'}[font[1].replace(/\s/g,'').toLowerCase()];
  const size=text.match(/\b(\d{1,2}(?:\.5)?)\s*[-–]?\s*(?:point|pt)\b/i)||text.match(/\b(?:Times\s+New\s+Roman|Calibri|Arial|Georgia|Aptos)\s+(\d{1,2}(?:\.5)?)\b/i);
  if(size&&Number(size[1])>=8&&Number(size[1])<=24)layout.fontSizePt=Number(size[1]);
  if(/\b(?:single[-\s]spac(?:ed|ing)|line spacing\s*[:=]?\s*1(?:\.0)?(?![.\d]))\b/i.test(text))layout.lineSpacing=1;
  if(/\b(?:1\.5[-\s](?:spac(?:ed|ing)|line)|line spacing\s*[:=]?\s*1\.5|(?:one[-\s]and[-\s]a[-\s]half)[-\s]spac(?:ed|ing))\b/i.test(text))layout.lineSpacing=1.5;
  if(/\bdouble[-\s]spac(?:ed|ing)\b/i.test(text))layout.lineSpacing=2;
  const all=[...text.matchAll(/\b(\d(?:\.\d{1,2})?)\s*[-–]?\s*(?:inch|in\.?|["″])\s+margins?\b/gi),...text.matchAll(/\bmargins?\s*(?:of|:|=)?\s*(\d(?:\.\d{1,2})?)\s*(?:inch|in\.?|["″])/gi)].find(match=>!/(?:top|right|bottom|left)\s*$/i.test(text.slice(Math.max(0,match.index-12),match.index)));
  if(all&&Number(all[1])>=.5&&Number(all[1])<=2)layout.marginsInches={top:Number(all[1]),right:Number(all[1]),bottom:Number(all[1]),left:Number(all[1])};
  for(const side of['top','right','bottom','left']){
    const m=text.match(new RegExp('\\b'+side+'\\s+margin\\s*(?:of|:|=)?\\s*(\\d(?:\\.\\d{1,2})?)\\s*(?:inch|in\\.?|["″])','i'))||text.match(new RegExp('\\b(\\d(?:\\.\\d{1,2})?)\\s*[-–]?\\s*(?:inch|in\\.?|["″])\\s+'+side+'\\s+margin','i'));
    if(m&&Number(m[1])>=.5&&Number(m[1])<=2){layout.marginsInches??={};layout.marginsInches[side]=Number(m[1]);}
  }
  const pageNumbers=booleanInstruction(text,'page numbers?');if(pageNumbers!==null)layout.pageNumbers=pageNumbers;
  const runningHead=booleanInstruction(text,'running head');if(runningHead!==null)layout.runningHead=runningHead;
  if(/\b(?:US\s+letter|letter[-\s]size|8\.5\s*(?:x|×|by)\s*11)\b/i.test(text))layout.paperSize='letter';
  else if(/\bA4\s*(?:paper|size|pages?)?\b/i.test(text))layout.paperSize='a4';
  return layout;
}
export function resolveAssignmentFormat({project={},course={}}={}) {
  const entries=[['rubric',normalize(project.rubric)],['prompt',normalize(project.prompt)],['syllabus',normalize(course.syllabus)]];
  const matches=entries.map(([source,text])=>({source,text,requests:requestsIn(text)}));
  const winner=matches.find(item=>item.requests.length),chosen=winner?.requests||[];
  const result={version:ASSIGNMENT_FORMAT_VERSION,style:'unspecified',edition:null,profile:'neutral',label:'No specified citation style',source:'none',assumedEdition:false,supported:false,conflicts:[],needsClarification:false,requiresAbstract:false,titlePage:'unspecified',layout:{},warnings:[]};
  if(winner){
    result.source=winner.source;
    if(chosen.length>1){result.style='conflict';result.label='Conflicting citation instructions';result.needsClarification=true;result.conflicts.push({source:winner.source,requested:chosen.map(item=>({style:item.style,edition:item.edition,name:item.name||null})),overridden:false});result.warnings.push('The highest-priority instructions name more than one citation style or edition. Choose the required style before treating the document as formatted.');}
    else{
      const item=chosen[0];result.style=item.style;result.edition=item.edition??DEFAULT_EDITION[item.style]??null;result.assumedEdition=item.edition===null&&!!DEFAULT_EDITION[item.style];
      const key=item.style+String(result.edition||'');result.supported=Object.hasOwn(FORMATS,key);result.profile=result.supported?key:'neutral';result.label=item.style==='other'?item.name+' requested':item.style.toUpperCase()+' '+result.edition;
      if(!result.supported)result.warnings.push(result.label+' was requested. Built-in Word layouts support APA 7 and MLA 9; the requested style is preserved and the export uses a neutral layout unless explicitly changed.');
      if(result.assumedEdition)result.warnings.push(result.label+' is the current default because the instructions did not name an edition.');
    }
    for(const item of matches.slice(matches.indexOf(winner)+1))for(const other of item.requests){
      const edition=other.edition??DEFAULT_EDITION[other.style]??null;
      if(other.style!==result.style||edition!==result.edition)result.conflicts.push({source:item.source,requested:[{style:other.style,edition,name:other.name||null}],overridden:true});
    }
  }
  // General syllabus defaults are applied first; the assignment and rubric can override them.
  let abstract=null,titlePage=null;
  for(const [,text]of [...entries].reverse()){
    const extra=layoutFrom(text);result.layout={...result.layout,...extra,...(extra.marginsInches?{marginsInches:{...result.layout.marginsInches,...extra.marginsInches}}:{})};
    const a=booleanInstruction(text,'abstract');if(a!==null)abstract=a;
    const t=booleanInstruction(text,'(?:title|cover) page');if(t!==null)titlePage=t;
  }
  result.requiresAbstract=abstract===true;
  result.titlePage=titlePage===true?'required':titlePage===false?'not-required':result.profile==='apa7'?'required':result.profile==='mla9'?'not-required':'unspecified';
  return result;
}

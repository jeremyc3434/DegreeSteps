/* Editable academic Word documents. Formatting is separate from source verification.
 * Only local, same-origin ZIP code is loaded; no coursework is uploaded here. */
(function(root,factory){'use strict';const api=factory(root,typeof module==='object'&&module.exports?require('fflate'):null);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeLearningDocumentExport=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root,nodeZip){
  'use strict';
  const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const VERSION='learning-document-export-v1-2026-11-28';
  const PROFILES=Object.freeze({apa7:Object.freeze({profile:'apa7',label:'APA 7 student-paper layout',supported:true,titlePage:'required',requiresAbstract:false}),mla9:Object.freeze({profile:'mla9',label:'MLA 9 paper layout',supported:true,titlePage:'not-required',requiresAbstract:false}),neutral:Object.freeze({profile:'neutral',label:'Standard editable document',supported:false,titlePage:'unspecified',requiresAbstract:false})});
  let zipPromise;
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function validText(value,max=100000){if(typeof value!=='string')return'';if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/.test(value)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))throw Error('This document contains unsupported text or is too large to export.');return value.replace(/\r\n/g,'\n');}
  const clean=value=>validText(typeof value==='string'?value:'',1500).replace(/\s+/g,' ').trim();
  function metadataOf(value={}){const out={};for(const key of['title','studentName','instructor','institution','course','date','lastName','runningHead']){const text=clean(value[key]);if(text)out[key]=text;}const abstract=validText(value.abstract||'',16000).trim();if(abstract)out.abstract=abstract;if(value.includeAbstract===true)out.includeAbstract=true;return out;}
  function selectedFormat(artifact,selected){
    const supplied=object(artifact?.assignmentFormat)?artifact.assignmentFormat:null;
    const explicit=typeof selected==='string'&&selected!=='auto';
    if(explicit&&!Object.hasOwn(PROFILES,selected))throw Error('Choose the assignment format, APA 7, MLA 9 or standard Word layout.');
    const raw=object(selected)?selected:!explicit&&supplied?supplied:null;
    const key=explicit?selected:raw&&Object.hasOwn(PROFILES,raw.profile)?raw.profile:'neutral';
    const out={...PROFILES[key],...(raw||{}),profile:key,layout:object(raw?.layout)?raw.layout:{},warnings:Array.isArray(raw?.warnings)?raw.warnings.filter(v=>typeof v==='string').slice(0,15):[]};
    if(key==='neutral'){out.supported=false;out.label=raw?.label||PROFILES.neutral.label;}
    else{out.supported=true;out.label=PROFILES[key].label;if(!['required','not-required'].includes(out.titlePage))out.titlePage=PROFILES[key].titlePage;}
    if(explicit){out.titlePage=PROFILES[key].titlePage;out.requiresAbstract=supplied?.requiresAbstract===true;out.layout={};}
    out.exportOverride=explicit;
    return out;
  }
  function titleFrom(content,metadata,artifact){if(metadata.title)return metadata.title;const match=content.match(/^\s*#\s+(.+)$/m);return match?match[1].replace(/\*\*|__/g,'').trim():clean(artifact?.title)||'Course project';}
  function layoutOf(format){const raw=object(format.layout)?format.layout:{},font=['Times New Roman','Arial','Calibri','Georgia','Aptos'].includes(raw.fontFamily)?raw.fontFamily:'Times New Roman',size=typeof raw.fontSizePt==='number'&&raw.fontSizePt>=8&&raw.fontSizePt<=24?raw.fontSizePt:12,line=[1,1.5,2].includes(raw.lineSpacing)?raw.lineSpacing:2;const margins={};for(const key of['top','right','bottom','left']){const n=raw.marginsInches?.[key];margins[key]=typeof n==='number'&&n>=.5&&n<=2?n:1;}return{fontFamily:font,fontSizePt:size,lineSpacing:line,marginsInches:margins,paperSize:raw.paperSize==='a4'?'a4':'letter',pageNumbers:raw.pageNumbers!==false,runningHead:raw.runningHead===true};}
  function inspectLearningDocument({artifact={},format='auto',metadata={}}={}){
    if(!object(artifact)||!validText(artifact.content||'').trim())throw Error('Open a saved result with document text before downloading Word.');
    const chosen=selectedFormat(artifact,format),meta=metadataOf(metadata),content=validText(artifact.content),warnings=[...chosen.warnings];
    meta.title=titleFrom(content,meta,artifact);
    const missing=[];
    if(chosen.profile==='apa7'&&chosen.titlePage==='required')for(const key of['studentName','institution','course','instructor','date'])if(!meta[key])missing.push(key);
    if(chosen.profile==='mla9')for(const key of['studentName','instructor','course','date','lastName'])if(!meta[key])missing.push(key);
    const labels={studentName:'student name',institution:'institution',course:'course',instructor:'instructor',date:'assignment date',lastName:'last name for the page header'};
    if(missing.length)warnings.push('Personal document details are still missing: '+missing.map(key=>labels[key]).join(', ')+'. They will be omitted rather than invented.');
    if(chosen.needsClarification)warnings.push('The assignment contains conflicting format requirements. Selecting a Word layout does not resolve the assignment instructions.');
    if(!chosen.supported&&chosen.style&&chosen.style!=='unspecified')warnings.push('The requested citation style has no built-in layout here. The Word file keeps its text and uses a standard layout.');
    const original=artifact.assignmentFormat?.profile;
    if(chosen.exportOverride&&original&&original!=='neutral'&&original!==chosen.profile)warnings.push('This selection changes page layout only. The draft was prepared for '+(artifact.assignmentFormat.label||original)+'; existing citations and reference wording are preserved, not converted.');
    const abstractPresent=!!meta.abstract||/^\s*(?:#{1,6}\s+|\*\*)?Abstract(?:\*\*)?\s*$/im.test(content);
    if(chosen.requiresAbstract&&!abstractPresent)warnings.push('The assignment requires an abstract, but the saved text and supplied metadata do not include one. No abstract will be invented.');
    const styled=chosen.profile==='apa7'||chosen.profile==='mla9',internalMarkers=/\[S[1-9]\d?\]/.test(content),sources=Array.isArray(artifact.sources)?artifact.sources.slice(0,30):[],missingFields=[];
    if(styled){
      if(internalMarkers)warnings.push('Internal [S#] source markers remain in the draft. They are not APA or MLA citations and are preserved for review.');
      for(const [index,source]of sources.entries()){
        const lacks=[];if(!source?.author&&!source?.authors)lacks.push('author');if(!source?.date&&!source?.year)lacks.push('publication date');if(lacks.length)missingFields.push({sourceId:typeof source?.id==='string'?source.id:'source '+(index+1),fields:lacks});
      }
      if(missingFields.length)warnings.push('The source list supplies incomplete bibliographic metadata for '+missingFields.map(item=>item.sourceId).join(', ')+'. Titles and URLs alone do not verify authors, dates, locators or correctly formatted references.');
      const hasReferences=/^\s*(?:#{1,6}\s+|\*\*)?(?:References|Works Cited|Bibliography)(?:\*\*)?\s*$/im.test(content);
      if(sources.length&&!hasReferences)warnings.push('The saved draft has source identities but no reference-list section. No formatted references will be fabricated.');
      if(chosen.profile==='apa7'&&/^\s*(?:#{1,6}\s+|\*\*)?Works Cited(?:\*\*)?\s*$/im.test(content)||chosen.profile==='mla9'&&/^\s*(?:#{1,6}\s+|\*\*)?References(?:\*\*)?\s*$/im.test(content))warnings.push('The reference-list heading does not match the selected style. Its wording and citations are preserved rather than silently relabeled.');
      warnings.push('Word layout is applied; citation accuracy and bibliographic completeness are not verified by this export.');
    }
    return{version:VERSION,format:chosen,metadata:meta,layout:layoutOf(chosen),warnings:[...new Set(warnings)],missingMetadata:missing,layoutReady:chosen.supported&&!chosen.needsClarification&&!missing.length&&(!chosen.requiresAbstract||abstractPresent),bibliographyVerified:false,bibliography:{status:styled?'not-verified':'not-requested',missingFields,internalMarkers}};
  }
  async function zipLibrary(){
    if(nodeZip?.zipSync)return nodeZip;if(root.fflate?.zipSync)return root.fflate;
    if(!root.document?.createElement||!root.location?.origin)throw Error('The Word export library could not load. Reload the page and try again.');
    if(!zipPromise)zipPromise=new Promise((resolve,reject)=>{const script=root.document.createElement('script'),url=new URL('/vendor/fflate/fflate.js',root.location.origin);if(url.origin!==root.location.origin){reject(Error('Word export must load from this website.'));return;}let timer;const finish=error=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();zipPromise=null;reject(error);}else if(root.fflate?.zipSync)resolve(root.fflate);else{script.remove();zipPromise=null;reject(Error('The Word export library was unreadable. Reload and try again.'));}};script.src=url.href;script.async=true;script.onload=()=>finish();script.onerror=()=>finish(Error('The Word export library could not load. Reload and try again.'));timer=setTimeout(()=>finish(Error('Word export took too long to load. Try again.')),10000);root.document.head.append(script);});
    return zipPromise;
  }
  function run(text,{bold=false,italic=false,code=false}={}){const props=(code?'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>':'')+(bold?'<w:b/>':'')+(italic?'<w:i/>':'');return'<w:r>'+(props?'<w:rPr>'+props+'</w:rPr>':'')+'<w:t xml:space="preserve">'+escape(text)+'</w:t></w:r>';}
  function inline(text,base={}){const pattern=/(\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*|(?<![\p{L}\p{N}_])__([^\s_](?:[^_\n]*?[^\s_])?)__(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}*])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_([^\s_](?:[^_\n]*?[^\s_])?)_(?![\p{L}\p{N}_])|`([^`\n]+)`)/gu;let out='',at=0;for(const match of text.matchAll(pattern)){out+=run(text.slice(at,match.index),base);out+=run(match[2]||match[3]||match[4]||match[5]||match[6],{...base,bold:base.bold||!!(match[2]||match[3]),italic:base.italic||!!(match[4]||match[5]),code:!!match[6]});at=match.index+match[0].length;}return out+run(text.slice(at),base);}
  function paragraph(text,{style='Normal',align,firstLine,indent,keepNext=false,pageBreakBefore=false,bold=false,italic=false,raw=false,before}={}){const props='<w:pStyle w:val="'+escape(style)+'"/>'+(keepNext?'<w:keepNext/>':'')+(pageBreakBefore?'<w:pageBreakBefore/>':'')+(before!==undefined?'<w:spacing w:before="'+before+'"/>':'')+(firstLine!==undefined||indent!==undefined?'<w:ind'+(firstLine!==undefined?' w:firstLine="'+firstLine+'"':'')+(indent!==undefined?' w:left="'+indent+'"':'')+'/>':'')+(align?'<w:jc w:val="'+align+'"/>':'');return'<w:p><w:pPr>'+props+'</w:pPr>'+(raw?text:inline(text,{bold,italic}))+'</w:p>';}
  function blocksOf(content){
    const lines=content.replace(/\r\n/g,'\n').split('\n'),blocks=[];let p=[],fence=false,code=[],references=false;
    const flush=()=>{if(p.length){blocks.push({type:references?'reference':'paragraph',text:p.join(' ')});p=[];}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i],trim=line.trim();
      if(/^\s*```/.test(line)){flush();if(fence){blocks.push({type:'code',lines:code});code=[];}fence=!fence;continue;}
      if(fence){code.push(line);continue;}
      if(!trim){flush();continue;}
      const heading=trim.match(/^(#{1,6})\s+(.+?)\s*#*$/),plain=trim.replace(/^\*\*|\*\*$/g,'');
      if(heading||/^(?:References|Works Cited|Bibliography|Abstract)$/i.test(plain)){flush();const text=heading?heading[2]:plain;const referenceHeading=/^(?:References|Works Cited|Bibliography)$/i.test(text);references=referenceHeading;blocks.push({type:'heading',level:heading?.[1].length||1,text,referenceHeading,abstractHeading:/^Abstract$/i.test(text)});continue;}
      if(/^\|?.*\|.*$/.test(trim)&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){flush();const rows=[trim];i++;while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim()){rows.push(lines[++i].trim());}blocks.push({type:'table',rows:rows.map(row=>row.replace(/^\|\s*|\s*\|$/g,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|')))});continue;}
      const list=trim.match(/^(?:([-+*])|([0-9]+[.)]))\s+(.+)$/);
      if(list){flush();blocks.push({type:references?'reference':'list',text:references?list[3]:(list[2]||'•')+' '+list[3]});continue;}
      if(/^>\s?/.test(trim)){flush();blocks.push({type:'quote',text:trim.replace(/^>\s?/,'')});continue;}
      if(/^(?:---+|\*\*\*+|___+)\s*$/.test(trim)){flush();continue;}
      if(references){flush();if(/^\s{2,}/.test(line)&&blocks.at(-1)?.type==='reference')blocks.at(-1).text+=' '+trim;else blocks.push({type:'reference',text:trim});}
      else p.push(trim);
    }
    flush();if(code.length)blocks.push({type:'code',lines:code});return blocks;
  }
  function tableXml(rows,width){const columns=Math.max(...rows.map(row=>row.length));const cellWidth=Math.floor(width/columns);return'<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/></w:tblBorders></w:tblPr><w:tblGrid>'+Array.from({length:columns},()=>'<w:gridCol w:w="'+cellWidth+'"/>').join('')+'</w:tblGrid>'+rows.map((row,index)=>'<w:tr>'+Array.from({length:columns},(_,at)=>'<w:tc><w:tcPr><w:tcW w:w="'+cellWidth+'" w:type="dxa"/></w:tcPr>'+paragraph(row[at]||'',{style:'TableText',bold:index===0})+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>';}
  function formattedDate(value,profile){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'';const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return value;const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).formatToParts(date),get=type=>parts.find(part=>part.type===type)?.value||'';return profile==='mla9'?get('day')+' '+get('month')+' '+get('year'):get('month')+' '+get('day')+', '+get('year');}
  function stylesXml(layout,profile){
    const font=escape(layout.fontFamily),sz=Math.round(layout.fontSizePt*2),line=Math.round(layout.lineSpacing*240);
    const base='<w:rFonts w:ascii="'+font+'" w:hAnsi="'+font+'" w:eastAsia="'+font+'"/><w:sz w:val="'+sz+'"/><w:szCs w:val="'+sz+'"/>';
    const spacing='<w:spacing w:before="0" w:after="0" w:line="'+line+'" w:lineRule="auto"/>';
    const noIndent='<w:ind w:firstLine="0"/>',center='<w:jc w:val="center"/>',keep='<w:keepNext/>';
    const style=(id,p,r='')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+id+'"/><w:basedOn w:val="Normal"/><w:pPr>'+p+'</w:pPr>'+(r?'<w:rPr>'+r+'</w:rPr>':'')+'</w:style>';
    return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
      '<w:docDefaults><w:rPrDefault><w:rPr>'+base+'</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl/>'+spacing+'<w:jc w:val="left"/></w:pPr></w:pPrDefault></w:docDefaults>'+
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr>'+spacing+'<w:ind w:firstLine="720"/></w:pPr><w:rPr>'+base+'</w:rPr></w:style>'+
      style('DocumentTitle',keep+noIndent+center,profile==='apa7'?'<w:b/>':'')+
      style('TitleDetails',noIndent+center)+style('FirstPageDetails',noIndent)+
      style('Heading1',keep+noIndent+'<w:jc w:val="'+(profile==='apa7'?'center':'left')+'"/>','<w:b/>')+
      style('Heading2',keep+noIndent,'<w:b/>')+style('Heading3',keep+noIndent,'<w:b/><w:i/>')+
      style('ReferenceHeading',keep+noIndent+center,profile==='apa7'?'<w:b/>':'')+
      style('Reference','<w:ind w:left="720" w:hanging="720"/>')+
      style('BlockQuote','<w:ind w:left="720" w:firstLine="0"/>')+
      style('ListParagraph','<w:ind w:left="360" w:firstLine="0"/>')+
      style('TableText',noIndent)+style('Code',noIndent,'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')+
      style('Header','<w:spacing w:line="240" w:lineRule="auto"/>'+noIndent+'<w:jc w:val="right"/>')+'</w:styles>';
  }
  const pageField=()=>'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  function headerXml(info,width){let body='';if(info.format.profile==='mla9'&&info.metadata.lastName)body+=run(info.metadata.lastName+' ');if(info.layout.runningHead){const title=info.metadata.runningHead||info.metadata.title.toUpperCase();body=run(title)+'<w:r><w:tab/></w:r>';}if(info.layout.pageNumbers)body+=pageField();const props=info.layout.runningHead?'<w:tabs><w:tab w:val="right" w:pos="'+width+'"/></w:tabs><w:jc w:val="left"/>':'';return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+paragraph(body,{style:'Header',raw:true}) .replace('</w:pPr>',props+'</w:pPr>')+'</w:hdr>';}
  function documentXml(info,artifact){
    const {metadata:meta,format,layout}=info,profile=format.profile,blocks=blocksOf(validText(artifact.content));const leadingTitle=blocks[0]?.type==='heading'&&blocks[0].level===1&&!blocks[0].referenceHeading&&!blocks[0].abstractHeading&&blocks[0].text.replace(/\*\*|__/g,'').trim()===meta.title;if(leadingTitle)blocks.shift();
    let abstractBlocks=[];if(blocks[0]?.abstractHeading){blocks.shift();while(blocks.length&&blocks[0].type!=='heading')abstractBlocks.push(blocks.shift());}
    if(meta.abstract)abstractBlocks=[{type:'paragraph',text:meta.abstract}];
    const cover=format.titlePage==='required',body=[];let hasPage=false;
    const sectionTitle=(text,pageBreakBefore=false,style='DocumentTitle')=>paragraph(text,{style,pageBreakBefore});
    if(cover){body.push(paragraph(meta.title,{style:'DocumentTitle',before:1440}));for(const key of['studentName','institution','course','instructor','date'])if(meta[key])body.push(paragraph(key==='date'?formattedDate(meta[key],profile):meta[key],{style:'TitleDetails'}));hasPage=true;}
    if(abstractBlocks.length&&(format.requiresAbstract||meta.includeAbstract||profile==='apa7')){body.push(sectionTitle('Abstract',hasPage,'ReferenceHeading'));for(const block of abstractBlocks)body.push(paragraph(block.text||'',{firstLine:0}));hasPage=true;}
    else if(abstractBlocks.length)blocks.unshift({type:'heading',level:1,text:'Abstract'},...abstractBlocks);
    if(profile==='mla9'&&!cover)for(const key of['studentName','instructor','course','date'])if(meta[key])body.push(paragraph(key==='date'?formattedDate(meta[key],profile):meta[key],{style:'FirstPageDetails'}));
    body.push(sectionTitle(meta.title,hasPage));
    const pageWidth=layout.paperSize==='a4'?11906:12240,pageHeight=layout.paperSize==='a4'?16838:15840,margins={};for(const key of['top','right','bottom','left'])margins[key]=Math.round(layout.marginsInches[key]*1440);const width=pageWidth-margins.left-margins.right;
    for(let index=0;index<blocks.length;index++){
      const block=blocks[index];
      if(block.type==='heading'){body.push(paragraph(block.text,{style:block.referenceHeading?'ReferenceHeading':'Heading'+Math.max(1,Math.min(3,block.level-(leadingTitle?1:0))),pageBreakBefore:block.referenceHeading}));}
      else if(block.type==='reference')body.push(paragraph(block.text,{style:'Reference'}));
      else if(block.type==='quote')body.push(paragraph(block.text,{style:'BlockQuote'}));
      else if(block.type==='list')body.push(paragraph(block.text,{style:'ListParagraph'}));
      else if(block.type==='code')for(const line of block.lines)body.push(paragraph(run(line,{code:true}),{style:'Code',raw:true}));
      else if(block.type==='table')body.push(tableXml(block.rows,width));
      else body.push(paragraph(block.text));
    }
    const section='<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="'+pageWidth+'" w:h="'+pageHeight+'"/><w:pgMar w:top="'+margins.top+'" w:right="'+margins.right+'" w:bottom="'+margins.bottom+'" w:left="'+margins.left+'" w:header="720" w:footer="720" w:gutter="0"/><w:pgNumType w:start="1"/></w:sectPr>';
    return{xml:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+body.join('')+section+'</w:body></w:document>',width};
  }
  async function createLearningDocx(options={}){
    const info=inspectLearningDocument(options),lib=await zipLibrary(),document=documentXml(info,options.artifact),files={};const add=(name,text)=>{files[name]=lib.strToU8(text);};
    add('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    add('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rIdApp" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    add('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
    add('word/document.xml',document.xml);add('word/styles.xml',stylesXml(info.layout,info.format.profile));add('word/header1.xml',headerXml(info,document.width));add('word/settings.xml','<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>');
    add('docProps/core.xml','<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+escape(info.metadata.title)+'</dc:title><dc:creator>DegreeSteps</dc:creator><cp:lastModifiedBy>DegreeSteps</cp:lastModifiedBy></cp:coreProperties>');
    add('docProps/app.xml','<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DegreeSteps</Application></Properties>');
    const bytes=lib.zipSync(files,{level:6}),name=info.metadata.title.normalize('NFKD').replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,90)||'course-project';
    return{...info,bytes,blob:new Blob([bytes],{type:MIME}),mimeType:MIME,filename:name+'.docx'};
  }
  return Object.freeze({version:VERSION,profiles:PROFILES,mimeType:MIME,inspectLearningDocument,createLearningDocx});
}));

const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {unzipSync,strFromU8}=require('fflate');
const Export=require('./dist/learning-document-export.js');
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const metadata={title:'Inventory policy evidence',studentName:'Alex Morgan',lastName:'Morgan',instructor:'Dr. Rivera',institution:'Example University',course:'Operations 301',date:'2026-11-28'};
const artifact={content:'# Inventory policy evidence\n\nA source states, “Costs & uncertainty—together—matter” (Rivera, 2024, p. 12).\n\n## Evidence\n\nThe conclusion follows the provided case.\n\n## References\n\nRivera, A. (2024). *A verified title*. Example Press.',assignmentFormat:{profile:'apa7',label:'APA 7',style:'apa',edition:7,source:'rubric',supported:true,titlePage:'required',requiresAbstract:false,layout:{}},sources:[{id:'S1',title:'A verified title',url:'https://example.edu/reading'}]};
function files(result){return Object.fromEntries(Object.entries(unzipSync(result.bytes)).map(([key,value])=>[key,strFromU8(value)]));}
function parsePackage(result){const directory=mkdtempSync(join(tmpdir(),'degreesteps-docx-')),path=join(directory,'synthetic.docx');writeFileSync(path,result.bytes);try{return JSON.parse(execFileSync('python3',['-c',`
import sys,zipfile,json,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1])
roots={n:E.fromstring(z.read(n)) for n in z.namelist() if n.endswith('.xml') or n.endswith('.rels')}
ns={'w':'${NS}'}
order=['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange']
for root in roots.values():
 for prop in root.findall('.//w:pPr',ns):
  names=[x.tag.split('}')[-1] for x in prop]
  assert all(n in order for n in names),names
  assert [order.index(n) for n in names]==sorted(order.index(n) for n in names),names
  assert len(names)==len(set(names)),names
doc=roots['word/document.xml'];styles=roots['word/styles.xml'];header=roots['word/header1.xml']
p=[{'text':''.join(x.itertext()) if False else ''.join(t.text or '' for t in x.findall('.//w:t',ns)),'style':(x.find('w:pPr/w:pStyle',ns).get('{${NS}}val') if x.find('w:pPr/w:pStyle',ns) is not None else None),'break':x.find('w:pPr/w:pageBreakBefore',ns) is not None} for x in doc.findall('w:body/w:p',ns)]
normal=styles.find("w:style[@w:styleId='Normal']",ns);reference=styles.find("w:style[@w:styleId='Reference']",ns)
a=lambda x:{k.split('}')[-1]:v for k,v in x.attrib.items()}
print(json.dumps({'names':z.namelist(),'paragraphs':p,'margins':a(doc.find('w:body/w:sectPr/w:pgMar',ns)),'normalFont':a(normal.find('w:rPr/w:rFonts',ns)),'normalSize':a(normal.find('w:rPr/w:sz',ns)),'spacing':a(normal.find('w:pPr/w:spacing',ns)),'referenceIndent':a(reference.find('w:pPr/w:ind',ns)),'headerText':''.join(t.text or '' for t in header.findall('.//w:t',ns)),'pageField':any('PAGE' in (t.text or '') for t in header.findall('.//w:instrText',ns)),'externalRelationships':sum(1 for n,r in roots.items() if n.endswith('.rels') for e in r if e.attrib.get('TargetMode')=='External')}))
`,path],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}));}finally{rmSync(directory,{recursive:true,force:true});}}

test('APA Word export is a readable OPC document with editable standard layout and real page fields',async()=>{
 const result=await Export.createLearningDocx({artifact,format:'auto',metadata});
 assert.equal(result.mimeType,Export.mimeType);assert.equal(result.blob.type,Export.mimeType);assert(result.bytes instanceof Uint8Array);assert.equal(result.filename,'Inventory-policy-evidence.docx');
 const doc=parsePackage(result);assert(doc.names.includes('[Content_Types].xml'));assert.equal(doc.externalRelationships,0);assert.deepEqual(Object.fromEntries(['top','right','bottom','left'].map(k=>[k,doc.margins[k]])),{top:'1440',right:'1440',bottom:'1440',left:'1440'});assert.equal(doc.normalFont.ascii,'Times New Roman');assert.equal(doc.normalSize.val,'24');assert.equal(doc.spacing.line,'480');assert.equal(doc.spacing.after,'0');assert.equal(doc.referenceIndent.hanging,'720');assert.equal(doc.referenceIndent.left,'720');assert(doc.pageField);assert.equal(doc.headerText,'');
 const text=doc.paragraphs.map(p=>p.text);assert(text.includes('Alex Morgan'));assert(text.includes('Example University'));assert(text.includes('November 28, 2026'));assert.equal(doc.paragraphs.filter(p=>p.text==='Inventory policy evidence').length,2);assert(doc.paragraphs.find(p=>p.text==='Inventory policy evidence'&&p.break));assert(doc.paragraphs.find(p=>p.text==='References'&&p.break));assert(doc.paragraphs.find(p=>p.style==='Reference'&&p.text.includes('Rivera, A.')));assert(!text.includes('Abstract'));
});
test('MLA uses its first-page heading, unbold title layout and provided surname header without an APA cover',async()=>{
 const mla={...artifact,content:artifact.content.replace('## References','## Works Cited').replace('(Rivera, 2024, p. 12)','(Rivera 12)'),assignmentFormat:{profile:'mla9',label:'MLA 9',titlePage:'not-required',layout:{}}};
 const result=await Export.createLearningDocx({artifact:mla,metadata}),doc=parsePackage(result),text=doc.paragraphs.map(p=>p.text);
 assert.deepEqual(text.slice(0,5),['Alex Morgan','Dr. Rivera','Operations 301','28 November 2026','Inventory policy evidence']);assert.equal(text.filter(x=>x==='Inventory policy evidence').length,1);assert.equal(doc.headerText,'Morgan ');assert(doc.pageField);assert(!text.includes('Example University'));assert(doc.paragraphs.find(p=>p.text==='Works Cited'&&p.break));assert(!doc.paragraphs[4].break);
 const xml=files(result)['word/styles.xml'];assert.match(xml,/w:styleId="DocumentTitle"[\s\S]*?<w:jc w:val="center"/);const titleStyle=xml.match(/<w:style[^>]*w:styleId="DocumentTitle">([\s\S]*?)<\/w:style>/)[1];assert(!titleStyle.includes('<w:b/>'));
});
test('provided citation text, exact quotations, Unicode and XML-sensitive characters survive export without active markup',async()=>{
 const content='# A title\n\n“Costs & uncertainty—together—matter” (Rivera, 2024, p. 12).\n\n<script>alert("no")</script> is literal text.\n\n> An exact quotation & its source.\n\n```js\nconst x = "<xml>";\n```\n\n| Input | Result |\n|---|---|\n| x | 5 |';
 const result=await Export.createLearningDocx({artifact:{content},format:'neutral'}),doc=parsePackage(result),xml=files(result)['word/document.xml'];
 assert(doc.paragraphs.some(p=>p.text==='“Costs & uncertainty—together—matter” (Rivera, 2024, p. 12).'));assert(doc.paragraphs.some(p=>p.text==='<script>alert("no")</script> is literal text.'));assert(!xml.includes('<script>'));assert(xml.includes('&lt;script&gt;'));assert(doc.paragraphs.some(p=>p.text==='const x = "<xml>";'));assert(xml.includes('<w:tbl>'));assert.equal(doc.externalRelationships,0);
});
test('missing personal details and absent source metadata remain explicit limits rather than fabricated readiness',async()=>{
 const result=await Export.createLearningDocx({artifact:{...artifact,content:'Draft with an internal marker [S1].'},format:'auto'}),doc=parsePackage(result);
 assert.equal(result.layoutReady,false);assert.equal(result.bibliographyVerified,false);assert.equal(result.bibliography.internalMarkers,true);assert.deepEqual(result.bibliography.missingFields,[{sourceId:'S1',fields:['author','publication date']}]);assert(result.warnings.some(x=>x.includes('student name')));assert(result.warnings.some(x=>x.includes('not APA or MLA')));assert(result.warnings.some(x=>x.includes('no reference-list')));const text=doc.paragraphs.map(p=>p.text).join('\n');assert(!text.includes('Alex Morgan'));assert(!text.includes('Example University'));assert(!text.includes('2024'));assert(text.includes('[S1]'));assert.equal(doc.headerText,'');
 const core=files(result)['docProps/core.xml'];assert(core.includes('<dc:creator>DegreeSteps</dc:creator>'));assert(!core.includes('Student'));
});
test('instructor layout overrides apply and explicit unsupported/conflicting requirements remain visible',async()=>{
 const a={...artifact,assignmentFormat:{profile:'apa7',label:'APA 7',titlePage:'not-required',layout:{fontFamily:'Arial',fontSizePt:11,lineSpacing:1.5,marginsInches:{left:1.5},pageNumbers:false}}};
 const result=await Export.createLearningDocx({artifact:a,metadata}),doc=parsePackage(result);assert.equal(doc.normalFont.ascii,'Arial');assert.equal(doc.normalSize.val,'22');assert.equal(doc.spacing.line,'360');assert.equal(doc.margins.left,'2160');assert.equal(doc.margins.right,'1440');assert.equal(doc.pageField,false);assert.equal(doc.paragraphs.filter(x=>x.text===metadata.title).length,1);
 const unsupported=Export.inspectLearningDocument({artifact:{content:'A real draft.',assignmentFormat:{profile:'neutral',label:'APA 6 requested',style:'apa',edition:6,supported:false,warnings:['APA 6 was requested.']}}});assert.equal(unsupported.format.profile,'neutral');assert.equal(unsupported.layoutReady,false);assert(unsupported.warnings.some(x=>x.includes('APA 6')));
 const conflict=Export.inspectLearningDocument({artifact:{content:'A real draft.',assignmentFormat:{profile:'neutral',needsClarification:true}}});assert(conflict.warnings.some(x=>x.includes('conflicting format')));
 const overridden=Export.inspectLearningDocument({artifact,format:'mla9',metadata});assert(overridden.warnings.some(x=>x.includes('page layout only')));assert(overridden.warnings.some(x=>x.includes('reference-list heading')));
});
test('an abstract is never generated and an explicitly supplied abstract remains editable in its own section',async()=>{
 const required={...artifact,assignmentFormat:{...artifact.assignmentFormat,requiresAbstract:true}};
 const missing=Export.inspectLearningDocument({artifact:required,metadata});assert(missing.warnings.some(x=>x.includes('requires an abstract')));assert.equal(missing.layoutReady,false);
 const result=await Export.createLearningDocx({artifact:required,metadata:{...metadata,abstract:'An original summary of the supplied case.'}}),doc=parsePackage(result);const at=doc.paragraphs.findIndex(p=>p.text==='Abstract');assert(at>0);assert(doc.paragraphs[at].break);assert.equal(doc.paragraphs[at+1].text,'An original summary of the supplied case.');assert(doc.paragraphs[at+2].break);
});
test('export rejects unsupported document inputs without changing text or loading remote resources',async()=>{
 assert.throws(()=>Export.inspectLearningDocument({artifact:{content:''}}),/saved result/);assert.throws(()=>Export.inspectLearningDocument({artifact:{content:'x'.repeat(100001)}}),/too large/);assert.throws(()=>Export.inspectLearningDocument({artifact:{content:'Unsafe\u0001text'}}),/unsupported/);assert.throws(()=>Export.inspectLearningDocument({artifact,format:'imaginary-style'}),/Choose the assignment/);const emptyMla=Export.inspectLearningDocument({artifact:{content:'A real draft.'},format:'mla9'});assert(emptyMla.missingMetadata.includes('lastName'));assert(emptyMla.warnings.every(x=>!x.includes('undetectable')));
});
test('a project title cannot discard a different first body heading and markup cannot erase math or citation URLs',async()=>{
 const content='# Introduction\n\nUse 2 * 3 * 4 = 24, x*y*z, and a_b_c.\n\nThe source is https://example.edu/real_source_page.\n\nEmphasis in *Operations evidence* remains editable.';
 const result=await Export.createLearningDocx({artifact:{content},format:'neutral',metadata:{title:'Actual project title'}}),doc=parsePackage(result),text=doc.paragraphs.map(x=>x.text);
 assert(text.includes('Introduction'));assert(text.includes('Use 2 * 3 * 4 = 24, x*y*z, and a_b_c.'));assert(text.includes('The source is https://example.edu/real_source_page.'));assert(text.includes('Emphasis in Operations evidence remains editable.'));
 assert.throws(()=>Export.inspectLearningDocument({artifact:{content:'Invalid\ud800 text'}}),/unsupported/);
 const noCover=Export.inspectLearningDocument({artifact:{content:'A real draft.',assignmentFormat:{profile:'apa7',titlePage:'not-required'}}});assert.equal(noCover.missingMetadata.length,0);assert.equal(noCover.layoutReady,true);
});

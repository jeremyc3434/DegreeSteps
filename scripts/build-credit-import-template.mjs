import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),XLSX=require('xlsx'),root=resolve(import.meta.dirname,'..');
assert.equal(XLSX.version,'0.20.3','Use the pinned official SheetJS release');
const headers=['School/provider','Course code','Course name','Credits','Credit units','Progress','Grade','Exam score','Completion date'];
const guide=[
 ['How to use this template'],
 ['Enter one original course or exam per row on the Courses sheet. That sheet intentionally has no example courses.'],
 ['School/provider: the original college, Sophia, Study.com, CLEP or another provider.'],
 ['Course code: the original course or exam code when known.'],
 ['Course name: the title from your original record.'],
 ['Credits: original credits as a number. Keep fractions such as 4.5; do not enter a receiving-school award instead.'],
 ['Credit units: semester, quarter or competency-unit. Leave unknown units blank for review.'],
 ['Progress: leave unknown progress blank; choose Finished, Taking now, or Not started in review. Blank progress is never treated as completed.'],
 ['Grade: the original letter or pass/fail grade, when known.'],
 ['Exam score: an exam score such as a CLEP score, when known. This is separate from the grade.'],
 ['Completion date: YYYY-MM-DD, when known.'],
 ['Save the workbook and upload it. DegreeSteps shows a preview before you choose which records to add.'],
 ['Instructions are help only. They are not course records and are not imported from the Courses sheet.'],
 ['Example only, not a course row: a 4.5 quarter-credit course remains 4.5 quarter credits in your original collection.'],
 ['Do not include student identifiers, Social Security numbers, home addresses or unrelated documents.']
];
const workbook=XLSX.utils.book_new(),courses=XLSX.utils.aoa_to_sheet([headers]),instructions=XLSX.utils.aoa_to_sheet(guide);
courses['!cols']=headers.map((_,index)=>({wch:[26,18,42,12,20,18,12,14,20][index]}));instructions['!cols']=[{wch:110}];
XLSX.utils.book_append_sheet(workbook,courses,'Courses');XLSX.utils.book_append_sheet(workbook,instructions,'Instructions');
const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx',compression:true}),path=resolve(root,'dist/data/credit-import-template.xlsx');
if(process.argv.includes('--check')){
 const current=XLSX.read(await readFile(path),{type:'buffer'});assert.deepEqual(current.SheetNames,['Courses','Instructions']);
 assert.deepEqual(XLSX.utils.sheet_to_json(current.Sheets.Courses,{header:1,raw:true}),[headers]);assert.deepEqual(XLSX.utils.sheet_to_json(current.Sheets.Instructions,{header:1,raw:true}),guide);
}else await writeFile(path,bytes);
console.log(JSON.stringify({template:'data/credit-import-template.xlsx',columns:headers.length,exampleCourseRows:0}));

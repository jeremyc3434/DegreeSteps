/* Plan copy describes published evidence; it never says a school has accepted a course for this student. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('"Take for less" says the school’s published guide lists these courses, not that the school accepts them',()=>{
 const sheet=fs.readFileSync('dist/sheet.js','utf8');
 assert.match(sheet,/less:'Lower-cost courses the school’s published guide lists for these requirements\. Tap one to change it\.'/);
 assert.doesNotMatch(sheet,/published rules accept/);
});

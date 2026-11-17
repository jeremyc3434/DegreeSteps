/* Audit-only synthetic fixture. No invented programme is included in public data.
 * Run: node docs/audit-optimizer-counterexample.cjs */
const Planner=require('../dist/planner.js');
const option=(id,provider,code)=>({id,provider,code,title:code,credits:3,upper:false,evidence:'published',sourceIds:['fixture']});
const model={id:'audit-only-synthetic',school:'Audit fixture',title:'Two-requirement audit fixture',totalCredits:6,institutionMinCredits:0,upperMinCredits:0,alternativeMaxCredits:6,externalMaxCredits:6,creditSystem:'semester',sources:[{id:'fixture',url:'https://example.edu/fixture/'}],requirements:[
 {id:'r1',code:'R1',title:'Flexible requirement',credits:3,category:'general',options:[option('a1','Sophia','A'),option('b1','Sophia','B'),option('u1','University','U1')]},
 {id:'r2',code:'R2',title:'Requirement accepting only A',credits:3,category:'general',options:[option('a2','Sophia','A'),option('u2','University','U2')]}
]};
const input={providers:['Sophia'],allowConditional:true,priority:'transfer'};
const automatic=Planner.generate(model,input),alternative=Planner.generate(model,{...input,optionSelections:{r1:'b1',r2:'a2'}});
console.log(JSON.stringify({automaticTransferCredits:automatic.totals.external,validAlternativeTransferCredits:alternative.totals.external,alternativeAcademicCountsValid:alternative.validation.academicCountsValid,automaticChoices:automatic.rows.map(row=>[row.requirementId,row.option.code]),alternativeChoices:alternative.rows.map(row=>[row.requirementId,row.option.code])},null,2));

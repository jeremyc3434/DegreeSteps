/** Small exact checker for a single explicit linear equation, never a general
 * answer certifier. No evaluation of executable text, model output or sources. */
const VERSION='linear-rational-v1',MAX_INPUT=4000,MAX_EXPRESSION=512,MAX_TOKENS=160,MAX_DEPTH=24,MAX_BITS=256;
const proofs=new WeakMap();
const abs=n=>n<0n?-n:n;
function gcd(a,b){a=abs(a);b=abs(b);while(b){const r=a%b;a=b;b=r;}return a;}
function rational(n,d=1n){if(d===0n)throw Error('Division by zero.');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);n/=g;d/=g;if(abs(n).toString(2).length>MAX_BITS||d.toString(2).length>MAX_BITS)throw Error('Calculation too large.');return{n,d};}
const zero=()=>rational(0n),one=()=>rational(1n);
const add=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d);
const neg=a=>rational(-a.n,a.d);
const sub=(a,b)=>add(a,neg(b));
const mul=(a,b)=>rational(a.n*b.n,a.d*b.d);
const div=(a,b)=>rational(a.n*b.d,a.d*b.n);
const same=(a,b)=>a.n===b.n&&a.d===b.d;
const display=a=>a.d===1n?String(a.n):a.n+'/'+a.d;
function decimal(value){
  if(typeof value!=='string'||!/^\d*(?:\.\d+)?$/.test(value)||!/[0-9]/.test(value)||value.replace('.','').length>24)throw Error('Unsupported number.');
  const [whole='',fraction='']=value.split('.');if(fraction.length>12)throw Error('Unsupported precision.');return rational(BigInt((whole||'0')+fraction),10n**BigInt(fraction.length));
}
function tokens(text){
  if(!text||text.length>MAX_EXPRESSION)throw Error('Unsupported expression.');
  const out=[];let i=0;
  while(i<text.length){const c=text[i];if(/\s/.test(c)){i++;continue;}if(/[0-9.]/.test(c)){const m=text.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);if(!m)throw Error('Unsupported number.');out.push({kind:'number',value:decimal(m[0])});i+=m[0].length;}else if(c==='x'){out.push({kind:'x'});i++;}else if('+-*/()'.includes(c)){out.push({kind:c});i++;}else throw Error('Unsupported notation.');if(out.length>MAX_TOKENS)throw Error('Expression too complex.');}
  return out;
}
function parse(text){
  const source=tokens(text);let index=0;
  const node=(op,left,right)=>({op,left,right});
  function primary(depth){if(depth>MAX_DEPTH)throw Error('Expression too deep.');const token=source[index++];if(!token)throw Error('Incomplete expression.');if(token.kind==='number')return{op:'number',value:token.value};if(token.kind==='x')return{op:'x'};if(token.kind==='('){const result=expression(depth+1);if(source[index++]?.kind!==')')throw Error('Unbalanced expression.');return result;}throw Error('Unsupported expression.');}
  function unary(depth){if(depth>MAX_DEPTH)throw Error('Expression too deep.');const kind=source[index]?.kind;if(kind==='+'||kind==='-'){index++;const value=unary(depth+1);return kind==='-'?node('neg',value):value;}return primary(depth);}
  function term(depth){let value=unary(depth);while(index<source.length){const kind=source[index]?.kind;if(kind==='*'||kind==='/'){index++;value=node(kind,value,unary(depth));}else if(kind==='x'||kind==='('){value=node('*',value,unary(depth));}else break;}return value;}
  function expression(depth){let value=term(depth);while(source[index]?.kind==='+'||source[index]?.kind==='-'){const op=source[index++].kind;value=node(op,value,term(depth));}return value;}
  const ast=expression(0);if(index!==source.length)throw Error('Unsupported adjacent terms.');return ast;
}
function linear(ast,depth=0){
  if(depth>MAX_TOKENS)throw Error('Expression too deep.');
  if(ast.op==='number')return{a:zero(),b:ast.value};if(ast.op==='x')return{a:one(),b:zero()};
  const l=linear(ast.left,depth+1);if(ast.op==='neg')return{a:neg(l.a),b:neg(l.b)};const r=linear(ast.right,depth+1);
  if(ast.op==='+')return{a:add(l.a,r.a),b:add(l.b,r.b)};if(ast.op==='-')return{a:sub(l.a,r.a),b:sub(l.b,r.b)};
  if(ast.op==='*'){if(l.a.n!==0n&&r.a.n!==0n)throw Error('Nonlinear expression.');return{a:add(mul(l.a,r.b),mul(r.a,l.b)),b:mul(l.b,r.b)};}
  if(ast.op==='/'){if(r.a.n!==0n)throw Error('Variable denominator.');return{a:div(l.a,r.b),b:div(l.b,r.b)};}throw Error('Unsupported expression.');
}
// Separate numeric traversal substitutes the result into the original ASTs,
// rather than checking only the rearranged coefficients.
function substitute(ast,x,depth=0){
  if(depth>MAX_TOKENS)throw Error('Expression too deep.');if(ast.op==='number')return ast.value;if(ast.op==='x')return x;
  const l=substitute(ast.left,x,depth+1);if(ast.op==='neg')return neg(l);const r=substitute(ast.right,x,depth+1);
  return ast.op==='+'?add(l,r):ast.op==='-'?sub(l,r):ast.op==='*'?mul(l,r):div(l,r);
}
function normalized(text){return text.replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/X/g,'x');}
const INSTRUCTION_WORDS=new Set('show the main solution steps and check your answer in original equation explain calculation work method how you got it by substitution verify result solve for x please simplify give an exact fraction use fractions decimals briefly clearly then'.split(' '));
function equationFrom(text){
  if(typeof text!=='string'||!text.trim()||text.length>MAX_INPUT||/https?:|[<>!]=|==|\b(?:medical|medicine|dose|dosage|clinical|patient|current|latest|research|sources?|citations?)\b/i.test(text))return null;
  text=normalized(text.trim());if((text.match(/=/g)||[]).length!==1)return null;
  const equal=text.indexOf('=');let end=text.length;
  for(let i=equal+1;i<text.length;i++)if(/[!?;\n]/.test(text[i])||text[i]==='.'&&!/[0-9]/.test(text[i+1]||'')){end=i;break;}
  let statement=text.slice(0,end).trim(),rest=text.slice(end).replace(/^[\s.!?;]+/,'');
  const instruction=/\s*(?:,\s*)?(?:(?:and|then)\s+)?(?:show|explain|check|verify)\b/i.exec(statement.slice(equal+1));
  if(instruction){const cut=equal+1+instruction.index;rest=statement.slice(cut)+' '+rest;statement=statement.slice(0,cut).trim();}
  if(rest&&(rest.toLowerCase().match(/[a-z]+/g)||[]).some(word=>!INSTRUCTION_WORDS.has(word)))return null;
  statement=statement.replace(/^(?:question|problem|task)\s*:\s*/i,'').replace(/^(?:please\s+)?(?:can you\s+)?solve(?:\s+(?:the|this))?(?:\s+(?:linear\s+)?equation)?(?:\s+for\s+x)?\s*[:,]?\s*/i,'').replace(/^(?:(?:find|determine|calculate)\s+(?:the\s+value\s+of\s+)?x\s+(?:in|for|from|if)|what\s+is\s+x\s+if)\s*:?\s*/i,'');
  // Unknown function names, additional variables, powers and units remain in
  // the expression and are rejected; never extract an apparently linear suffix.
  if(!statement||statement.length>MAX_EXPRESSION||!/^[0-9x\s.+*/()=-]+$/.test(statement))return null;
  const parts=statement.split('=');return parts.length===2&&parts.every(x=>x.trim())?{equation:statement.replace(/\s+/g,' ').trim(),left:parts[0].trim(),right:parts[1].trim()}:null;
}
function signedTerm(a){if(a.n===0n)return'0';if(a.n===a.d)return'x';if(a.n===-a.d)return'-x';return(a.d===1n?display(a):'('+display(a)+')')+'x';}
function polynomial({a,b}){if(a.n===0n)return display(b);const x=signedTerm(a);return b.n===0n?x:x+(b.n<0n?' - ':' + ')+display(rational(abs(b.n),b.d));}

export function getLearningCalculation({project={},message=''}={}){
  try{
    const ownAttempt=typeof message==='string'&&/^\s*(?:i\s+(?:got|think)|my\s+(?:answer|solution)\s+is)\s+x\s*=\s*[+−-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*\d+)?\s*[,.;]?\s*(?:(?:am i|is (?:this|that|it))\s+(?:right|correct)\??)?\s*$/i.test(message);
    const newer=typeof message==='string'&&message.includes('=')&&!ownAttempt;const source=newer?message:project.prompt;
    const item=equationFrom(source);if(!item)return null;
    const leftAST=parse(item.left),rightAST=parse(item.right),left=linear(leftAST),right=linear(rightAST),coefficient=sub(left.a,right.a),constant=sub(right.b,left.b);
    if(coefficient.n===0n)return null;const solution=div(constant,coefficient),leftValue=substitute(leftAST,solution),rightValue=substitute(rightAST,solution);if(!same(leftValue,rightValue))return null;
    const steps=Object.freeze(['Expand and combine like terms: '+polynomial(left)+' = '+polynomial(right)+'.','Collect the variable and constant terms: '+signedTerm(coefficient)+' = '+display(constant)+'.','Divide by '+display(coefficient)+': x = '+display(solution)+'.','Substitute x = '+display(solution)+' in the original equation: left side = '+display(leftValue)+'; right side = '+display(rightValue)+'.']);
    const receipt=Object.freeze({version:VERSION,scope:'single-explicit-linear-equation',equation:item.equation,variable:'x',solution:display(solution),leftValue:display(leftValue),rightValue:display(rightValue),steps,inputSource:newer?'followup':'prompt'});
    proofs.set(receipt,{solution,leftValue,rightValue});return receipt;
  }catch{return null;}
}

const NUMBER='[+-]?\\s*(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:\\s*\\/\\s*[+-]?\\s*(?:\\d+(?:\\.\\d+)?|\\.\\d+))?';
function readClaim(value){try{const raw=value.replace(/\s/g,'');const [n,d]=raw.split('/');const sign=n.startsWith('-')?-1n:1n,a=decimal(n.replace(/^[+-]/,''));const numerator=rational(sign*a.n,a.d);if(!d)return numerator;const ds=d.startsWith('-')?-1n:1n,b=decimal(d.replace(/^[+-]/,''));return div(numerator,rational(ds*b.n,b.d));}catch{return null;}}
function plainLine(line){return normalized(line.replace(/\s+/g,' ').trim().slice(0,1500)).replace(/^#{1,6}\s*/,'').replace(/\*\*|__/g,'').replace(/\\(?:d?frac)\s*\{\s*([+-]?[\d.]+)\s*\}\s*\{\s*([+-]?[\d.]+)\s*\}/g,'$1/$2').replace(/\\[()[\]]|\$/g,'').trim();}
function exactAnswer(line){
  if(/^\s*[>"“‘]/.test(line))return null;line=plainLine(line);if(/^(?:your|student|a common|incorrect|wrong|not|suppose|if|for example)\b/i.test(line))return null;
  const patterns=[new RegExp('^(?:(?:the\\s+)?(?:(?:correct(?:ed)?|final)\\s+){0,2}(?:answer|solution|result)(?:\\s+is)?\\s*[:=]?\\s*)(?:x\\s*(?:=|is|equals)\\s*)?('+NUMBER+')(?!\\d|\\.\\d|/)','i'),new RegExp('^(?:therefore[,;:]?\\s*)?x\\s*(?:=|is|equals)\\s*('+NUMBER+')(?!\\d|\\.\\d|/)','i')];
  for(const pattern of patterns){const match=pattern.exec(line);if(!match)continue;const suffix=line.slice(match[0].length),near=suffix.slice(0,35),approximate=!match[1].includes('/')&&(match[1].includes('.')||/\brounded\b/i.test(near))&&/\b(?:about|approximately|approx|roughly|rounded)\b|≈/i.test(near);if(/^\s*(?:[+*/−-]|\\(?:cdot|times))/.test(suffix)||/^\s*(?:is\s+)?(?:not (?:correct|the (?:answer|solution))|wrong|incorrect)\b/i.test(suffix)||approximate)return null;const value=readClaim(match[1]);if(value)return{value,claim:match[0].trim()};}return null;
}
function lessonLines(value){
  if(typeof value!=='string')return[];const result=[];let code=false;
  for(const raw of value.slice(0,48000).split(/\r?\n/)){if(/^\s*```/.test(raw)){code=!code;continue;}if(code)continue;const line=plainLine(raw);if(/^(?:(?:new|extra|optional|additional|your)\s+)?(?:practice|try it|try this|exercise|challenge|common mistakes|student(?:'s)? (?:attempt|example))\b/i.test(line))break;if(raw.trim())result.push(raw);if(result.length>=160)break;}return result;
}
export function findLearningCalculationConflicts({artifact={},calculation}={}){
  const proof=proofs.get(calculation);if(!proof)return[];const issues=[],seen=new Set();let statedAnswers=0;
  const addIssue=(field,claim,expected,message)=>{const key=field+'|'+claim+'|'+expected;if(!seen.has(key)&&issues.length<6){seen.add(key);issues.push({field,claim,expected,message});}};
  for(const field of['summary','content']){
    const lines=lessonLines(artifact[field]);
    for(let index=0;index<lines.length;index++){
      const line=lines[index],plain=plainLine(line),terminal=/^(?:the\s+)?(?:(?:correct(?:ed)?|final)\s+){0,2}(?:answer|solution|result)\b/i.test(plain);
      if(index<4||terminal){for(const part of line.split(/;\s*/).slice(0,4)){const claim=exactAnswer(part);if(claim){statedAnswers++;if(!same(claim.value,proof.solution))addIssue(field,claim.claim,'x = '+calculation.solution,'The '+field+' claims '+claim.claim+', but exact substitution gives x = '+calculation.solution+'.');}}}
      if(/^\s*[>"“‘]/.test(line)||/\b(?:your|student|incorrect|wrong|not|if|suppose|example|practice)\b/i.test(plain))continue;
      const checkPattern=new RegExp('\\bboth sides (?:are|equal|evaluate to|give)\\s*('+NUMBER+')(?!\\d|\\.\\d|/)','gi');
      for(const match of plain.matchAll(checkPattern)){if(/\b(?:about|approximately|approx|roughly|rounded)\b|≈/i.test(plain.slice(Math.max(0,match.index-15),match.index+match[0].length+20)))continue;const value=readClaim(match[1]);if(value&&!same(value,proof.leftValue))addIssue(field,match[0],calculation.leftValue,'The '+field+' says '+match[0]+', but substituting x = '+calculation.solution+' gives '+calculation.leftValue+' on each original side.');}
    }
  }
  if(!statedAnswers)addIssue('content','No checkable exact solution stated','x = '+calculation.solution,'The response does not state a checkable exact solution for the supported equation. Supply x = '+calculation.solution+' and the original-side substitution check.');
  return issues;
}

export function createLearningCalculationFallback({calculation,action='study'}={}){
  if(!proofs.has(calculation)||action!=='study')throw new TypeError('A supported checked study calculation is required.');
  return{summary:'Checked solution: x = '+calculation.solution+'. Exact substitution gives '+calculation.leftValue+' on both original sides.',content:'Answer: x = '+calculation.solution+'\n\nOriginal equation: '+calculation.equation+'\n\n'+calculation.steps.map((step,index)=>(index+1)+'. '+step).join('\n\n'),questions:[],checks:[{label:'Exact calculation',status:'pass',detail:'The solution was calculated with exact rational arithmetic and substituted into both original expressions. This verifies this equation only.'},{label:'Explanation consistency',status:'review',detail:'The generated explanation did not pass the answer consistency check. This result uses the independently calculated solution and exact substitution steps instead.'}],nextStep:'Read the substitution check. If you want another explanation, ask about the particular step you want to understand.',quiz:[],flashcards:[],slides:[]};
}

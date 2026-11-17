/** Conservative degree identity for reusing an exact reviewed program. */
export function canonicalSchoolName(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
export function canonicalDegreeTitle(value){
 let title=String(value||'').normalize('NFKC').toLowerCase().trim().replace(/\s*[—–-]\s*(?:online|residential)\s*$/u,'').replace(/\((?:online|residential)\)\s*$/u,'');
 const phrases=[[/bachelor(?:’s|'s)? of science in business administration/gu,'bsba'],[/bachelor(?:’s|'s)? of business administration/gu,'bba'],[/bachelor(?:’s|'s)? of science/gu,'bs'],[/bachelor(?:’s|'s)? of arts/gu,'ba'],[/master of business administration/gu,'mba'],[/master of science/gu,'ms'],[/master of arts/gu,'ma'],[/associate of applied science/gu,'aas'],[/associate of science/gu,'as'],[/associate of arts/gu,'aa'],[/doctor of business administration/gu,'dba'],[/doctor of philosophy/gu,'phd']];
 for(const [pattern,award]of phrases)title=title.replace(pattern,' '+award+' ');
 title=title.replace(/\bb\.\s*s\.\s*b\.\s*a\./gu,'bsba').replace(/\bb\.\s*s\./gu,'bs').replace(/\bb\.\s*a\./gu,'ba').replace(/\bm\.\s*b\.\s*a\./gu,'mba').replace(/\bm\.\s*s\./gu,'ms').replace(/\ba\.\s*a\./gu,'aa').replace(/\ba\.\s*s\./gu,'as').replace(/\bp\.?h\.?d\./gu,'phd');
 const words=title.replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean),awards=new Set(['bsba','bba','bs','ba','mba','ms','ma','aas','as','aa','dba','phd','edd','jd','mfa','bsn']),positions=words.map((word,index)=>awards.has(word)?index:-1).filter(index=>index>=0);
 if(positions.length!==1)return words.join(' ');
 const award=words[positions[0]],rest=words.filter((word,index)=>index!==positions[0]);if(['major','degree'].includes(rest.at(-1)))rest.pop();if(rest[0]==='in')rest.shift();
 return award+'|'+rest.join(' ');
}

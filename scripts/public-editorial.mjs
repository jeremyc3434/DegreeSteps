/** Structured editorial blocks and context-preserving actions for public resources. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=value=>Array.isArray(value)?value:[];
export function safeEditorialHref(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.length>2048||/[\\\u0000-\u001f\u007f]/.test(value))return '';
 const raw=value.split(/[?#]/,1)[0];if(/%|(?:^|\/)\.{1,2}(?:\/|$)/.test(raw))return '';
 try{const u=new URL(value,'https://degreesteps.com');if(u.origin!=='https://degreesteps.com'||u.hash&&!/^#[A-Za-z0-9_-]+$/.test(u.hash))return '';
  const allowed=/^\/(?:degree-plans|guides|blog|credit-sources|schools|authors)\/(?:[a-z0-9-]+\/)?$/.test(u.pathname)||/^\/(?:portal|courses|import-courses|compare-plans|programs|request-plan|degree-audit|community|school|campuses)\.html$/.test(u.pathname)||['/about/','/how-it-works/','/resources/','/compare/','/faq/','/privacy/'].includes(u.pathname);
  return allowed?u.pathname+u.search+u.hash:'';
 }catch{return '';}
}
export function articleAction(article){
 const supplied=article?.cta,href=safeEditorialHref(supplied?.href);
 if(href&&typeof supplied.label==='string'&&supplied.label.trim())return {label:supplied.label,href,description:String(supplied.description||'')};
 const actions={
  'organize-transcripts-and-credits':{label:'Upload my past courses',href:'/import-courses.html',description:'Bring a transcript or spreadsheet and review the courses together.'},
  'military-credit-jst-ccaf':{label:'Add my service learning',href:'/import-courses.html',description:'Keep military records and original course sources together.'},
  'degree-audit-and-what-if':{label:'Compare my degree options',href:'/compare-plans.html?from=courses',description:'Use the same course collection to compare available degrees.'},
  'switching-majors-with-transfer-credit':{label:'Compare where my courses fit',href:'/compare-plans.html?from=courses',description:'See which requirements change when the degree changes.'},
  'transfer-credit-for-campus-degrees':{label:'Explore a residential plan',href:'/degree-plans/liberty-business-residential/',description:'See an actual campus route with its outside coursework visible.'},
  'compare-transfer-credit-sources':{label:'Browse courses by provider',href:'/courses.html?tab=browse',description:'Compare available course choices and save the ones that interest you.'}
 };
 return actions[article?.slug]||{label:'Explore complete degree plans',href:'/degree-plans/',description:'See a researched route before making it your own.'};
}
export function sourceAction(source){
 const retired=['onlinedegree','uexcel','aleks'].includes(source?.id)||source?.status==='historical';
 if(retired||source?.id==='military-jst')return {label:retired?'Add my historical courses':'Add my military learning',href:'/import-courses.html',description:'Upload your original records and review the courses before adding them.'};
 const provider=({'study-com':'Study.com','modern-states':'CLEP','sophia':'Sophia','straighterline':'StraighterLine','clep':'CLEP','dsst':'DSST','saylor':'Saylor','coopersmith':'Coopersmith','davar':'Davar','tecep':'TECEP','christian-leaders':'Christian Leaders Institute'})[source?.id]||source?.id;
 return {label:'Explore '+String(source?.name||'this source')+' courses',href:'/courses.html?provider='+encodeURIComponent(provider||''),description:'Keep this provider selected as you explore available course records.'};
}
export function renderActionCallout(action,title,description){
 const href=safeEditorialHref(action?.href);if(!href)return '';
 return '<section class="site-container final-cta"><div><h2>'+esc(title||'Put the answer to work.')+'</h2><p>'+esc(description||action.description)+'</p></div><div><a class="site-button" href="'+esc(href)+'">'+esc(action.label)+'</a><p>No account needed to explore.</p></div></section>';
}
export function renderSubscriptionCalculator(){return '<form class="article-subscription" data-subscription-calculator><h3>Try your own subscription budget</h3><p>Enter the fee and paid months you want to compare. The starting numbers are an illustration, not a quote.</p><label>Monthly provider fee ($)<input type="number" min="0" max="1000000" step="0.01" value="99" inputmode="decimal" data-calc-monthly disabled></label><label>Paid months<input type="number" min="1" max="60" step="1" value="1" inputmode="numeric" data-calc-months disabled></label><label>Extra provider charges ($)<input type="number" min="0" max="1000000" step="0.01" value="0" inputmode="decimal" data-calc-extras disabled></label><output data-calc-result aria-live="polite">$99 in entered provider charges</output><p>This is provider spending only. University tuition, financial aid and any unentered charges are separate. Paid months are your scenario; this does not predict course completion.</p><noscript><p>Example: a $99 monthly fee paid for two months is $198 before extra charges. Enable JavaScript to enter another scenario.</p></noscript></form>';}
export function renderEditorialSection(section,index,{plans=[],renderPlanCard}={}){
 let body=list(section.paragraphs).map(text=>'<p>'+esc(text)+'</p>').join('');
 if(list(section.bullets).length)body+='<ul class="plain-list">'+section.bullets.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>';
 const table=section.table;
 if(table&&list(table.headers).length&&list(table.rows).length){
  const width=table.headers.length;if(!table.rows.every(row=>Array.isArray(row)&&row.length===width))throw Error('Editorial comparison rows must match their headers.');
  body+='<div class="article-comparison" tabindex="0" role="region" aria-label="'+esc(table.caption||'Comparison table')+'"><table>'+(table.caption?'<caption>'+esc(table.caption)+'</caption>':'')+'<thead><tr>'+table.headers.map(text=>'<th scope="col">'+esc(text)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+row.map((text,i)=>'<'+(i?'td':'th scope="row"')+'>'+esc(text)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div>'+(table.note?'<p>'+esc(table.note)+'</p>':'');
 }
 if(section.callout){const c=section.callout,href=safeEditorialHref(c.href);body+='<aside class="article-callout">'+(c.title?'<h3>'+esc(c.title)+'</h3>':'')+'<p>'+esc(c.text)+'</p>'+(href&&c.label?'<a href="'+esc(href)+'">'+esc(c.label)+'</a>':'')+'</aside>';}
 if(section.planPreview){const plan=plans.find(plan=>plan.id===section.planPreview);if(!plan)throw Error('Editorial plan preview must reference a publication-ready route.');body+='<aside class="article-plan-preview" aria-label="Example degree route">'+renderPlanCard(plan).replaceAll('<h2>','<h3>').replaceAll('</h2>','</h3>')+'<p>This is the researched example route. It is separate from an individual student’s transcript and awards.</p></aside>';}
 if(section.calculator==='subscription')body+=renderSubscriptionCalculator();
 return '<section id="section-'+(index+1)+'"><h2>'+esc(section.heading)+'</h2>'+body+'</section>';
}
export function articleAuthor(article,content){return list(content.authors).find(author=>author.id===article.authorId)||list(content.authors).find(author=>author.name===content.editorialByline)||null;}
export function authorPath(author){return author&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(author.id)?'/authors/'+author.id+'/':'';}
export function renderAuthorNote(author){const path=authorPath(author);if(!path)return '';return '<aside class="article-author"><h2>About this research</h2><p><strong><a href="'+esc(path)+'">'+esc(author.name)+'</a></strong>'+(author.role?' · '+esc(author.role):'')+'</p><p>'+esc(author.bio)+'</p></aside>';}
export function renderPlanLinks(links){const clean=list(links).map(link=>({...link,href:safeEditorialHref(link.href)})).filter(link=>link.href&&link.label);return clean.length?'<nav class="article-plan-links" aria-label="Relevant degree plans">'+clean.map(link=>'<a href="'+esc(link.href)+'">'+esc(link.label)+'</a>').join('')+'</nav>':'';}

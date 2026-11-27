/** Public research context only: never awards or removes a student's credits. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const https=value=>{try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}throw Error('Provider research needs an official HTTPS source.');};

export function recommendationWindowStatus(record,{asOf,completedOn,plannedCompletionOn}={}){
 if(!iso(asOf)||!iso(record?.recommendationStart)||!iso(record?.recommendationEnd)||record.recommendationStart>record.recommendationEnd)throw Error('Use exact reviewed recommendation dates.');
 for(const date of [completedOn,plannedCompletionOn])if(date!==undefined&&!iso(date))throw Error('Use an exact completion date.');
 const inside=date=>date>=record.recommendationStart&&date<=record.recommendationEnd;
 // Completion dates identify versions. The review clock never revokes an
 // existing university award, converts source credits, or upgrades a version.
 if(completedOn)return {status:inside(completedOn)?'completed-in-reviewed-window':'match-historical-version',studentRecordsChanged:false};
 if(plannedCompletionOn)return {status:inside(plannedCompletionOn)?'planned-in-reviewed-window':'future-window-not-verified',studentRecordsChanged:false};
 return {status:asOf>record.recommendationEnd?'renewal-not-verified':asOf<record.recommendationStart?'not-yet-effective':'reviewed-window',studentRecordsChanged:false};
}

export function renderProviderResearchFacts(source){
 const review=source.recommendationReview;
 if(!review)return '';
 if(!iso(review.checkedOn)||!Array.isArray(review.records)||!review.records.length)throw Error('A recommendation review needs dated, exact records.');
 const rows=review.records.map(record=>{
  recommendationWindowStatus(record,{asOf:review.checkedOn});
  if(!record.aceId||!record.title||!Number.isSafeInteger(record.version)||record.version<1||!Number.isFinite(record.sourceCredits)||record.sourceCredits<=0||record.sourceCreditSystem!=='semester')throw Error('Keep exact ACE identity, version and original semester credits.');
  return '<tr><th scope="row"><a href="'+esc(https(record.url))+'" target="_blank" rel="noopener">'+esc(record.aceId)+'</a><br>'+esc(record.title)+'</th><td>'+record.version+'</td><td>'+record.sourceCredits+' semester credits</td><td>'+esc(record.recommendationStart)+' to '+esc(record.recommendationEnd)+'</td></tr>';
 }).join('');
 return '<section class="site-container narrow-content article-body" aria-labelledby="source-recommendation-windows"><h2 id="source-recommendation-windows">Which certificate version was reviewed?</h2><p>These are ACE source recommendations, not the credits a particular college awards. The completion date and exact certificate version matter.</p><div class="student-example-table" tabindex="0" role="region" aria-label="Reviewed ACE certificate versions"><table><thead><tr><th scope="col">Certificate</th><th scope="col">Version</th><th scope="col">Source recommendation</th><th scope="col">Reviewed completion window</th></tr></thead><tbody>'+rows+'</tbody></table></div><p>'+esc(review.renewalNote)+'</p><p>'+esc(review.historicalNote)+'</p><p><a href="/guides/ace-nccrs-and-accreditation/">Understand recommendation dates and transfer credit</a></p><p class="reviewed-note">Certificate records checked '+esc(review.checkedOn)+'.</p></section>';
}

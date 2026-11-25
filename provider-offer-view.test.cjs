'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const View=require('./dist/provider-offer-view.js');
test('offer placeholders keep optional loading separate from selected course records',()=>{
 assert.equal(View.html('University'),'');assert.match(View.html('Study.com'),/data-provider-offer-slot="Study.com"/);assert.match(View.html('UPI Study',{compact:true}),/data-offer-compact="true"/);assert.match(View.html('A"<script>'),/A&quot;&lt;script&gt;/);assert.equal(View.html('x'.repeat(121)),'');
});
test('hydration changes only offer contents when their rendered state changes',()=>{
 let writes=0;const slot={getAttribute:name=>name==='data-provider-offer-slot'?'Unknown Provider':'false',get innerHTML(){return '';},set innerHTML(value){writes++;}};
 View.hydrate({querySelectorAll:()=>[slot]});assert.equal(writes,0);assert.doesNotThrow(()=>View.hydrate(null));
});

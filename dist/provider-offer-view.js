/* Optional provider offers hydrate in place; loading never delays or changes a degree plan. */
(function(root,factory){'use strict';const api=factory(root,typeof module==='object'&&module.exports?require('./provider-offers.js'):root.DegreeProviderOffers);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeProviderOfferView=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root,Offers){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(provider,{compact=false}={}){if(typeof provider!=='string'||!provider.trim()||provider.length>120||provider==='University')return '';return '<div class="provider-offer-slot" data-provider-offer-slot="'+esc(provider)+'" data-offer-compact="'+String(compact===true)+'">'+(Offers?.html({provider,compact:compact===true})||'')+'</div>';}
 function hydrate(document=root.document){if(!document?.querySelectorAll)return;for(const slot of document.querySelectorAll('[data-provider-offer-slot]')){const next=Offers?.html({provider:slot.getAttribute('data-provider-offer-slot'),compact:slot.getAttribute('data-offer-compact')==='true'})||'';if(slot.innerHTML!==next)slot.innerHTML=next;}}
 function load(){return Promise.resolve().then(()=>Offers?.load()).then(()=>{hydrate();return true;},()=>false);}
 return Object.freeze({html,hydrate,load});
}));

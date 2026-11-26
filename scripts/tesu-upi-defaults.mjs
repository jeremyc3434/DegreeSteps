/** Reviewed provider availability for the six existing TESU ledgers; never edits student preferences. */
export const tesuUPIModelIds=Object.freeze([
  'tesu-general-management',
  'curriculum-tesu-bsba-accounting',
  'curriculum-tesu-bsba-finance',
  'curriculum-tesu-ba-english',
  'curriculum-tesu-ba-psychology',
  'curriculum-tesu-ba-liberal-studies',
  'curriculum-tesu-bsba-human-resources-organizational-management',
  'curriculum-tesu-bsba-marketing',
  'curriculum-tesu-bs-general-management'
]);
export function applyTESUUPIProviderDefaults(input){
  const model=structuredClone(input);
  if(model.school!=='Thomas Edison State University'||!tesuUPIModelIds.includes(model.id))return model;
  if(model.id==='tesu-general-management'&&model.defaultProviders===undefined)model.defaultProviders=['Sophia','Study.com','CLEP','StraighterLine'];
  if(!Array.isArray(model.defaultProviders))return model;
  if(!model.defaultProviders.includes('UPI Study'))model.defaultProviders.push('UPI Study');
  return model;
}

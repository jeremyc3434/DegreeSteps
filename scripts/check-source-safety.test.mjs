import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSource} from './check-source-safety.mjs';

test('common secret families are flagged without returning their values',()=>{
  for(const prefix of ['sk-'+'ant-','gh'+'p_','sb_'+'secret_','sk_'+'live_']){
    const secret=prefix+'A'.repeat(40),findings=inspectSource('server/example.mjs','const credential="'+secret+'";');
    assert.equal(findings.length,1,prefix);assert(!JSON.stringify(findings).includes(secret));assert.equal(findings[0].line,1);
  }
  assert.equal(inspectSource('server/key.mjs','-----BEGIN '+'PRIVATE KEY-----').length,1);
});
test('privileged legacy JWTs are distinct from publishable public configuration',()=>{
  const jwt=role=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role,iss:'supabase',exp:9999999999})).toString('base64url')+'.'+'x'.repeat(43);
  assert(inspectSource('config.js',jwt('service_role')).some(item=>item.kind==='supabase-service-role-jwt'));
  assert.deepEqual(inspectSource('config.js',jwt('anon')),[]);
  assert.deepEqual(inspectSource('config.js','sb_publishable_'+'A'.repeat(50)+' 123456789-example.apps.googleusercontent.com'),[]);
});
test('secret environment files and private exports cannot enter the tracked source',()=>{
  for(const name of ['.env','.env.production','.dev.vars','infra/key.pem','source.bundle','release.tar.gz'])assert(inspectSource(name).length,name);
  assert.deepEqual(inspectSource('.env.example','ANTHROPIC_API_KEY=\nPORTAL_SUPABASE_PUBLISHABLE_KEY=\n'),[]);
});
test('text snapshots, vendored runtimes and fixtures are scanned before public source sharing',()=>{
  const dummy='sk-'+'ant-'+'A'.repeat(40);
  for(const name of ['content/curricula/snapshots/source.txt','dist/vendor/library.js','test-support/fixtures/course-import/synthetic.csv'])assert(inspectSource(name,dummy).some(item=>item.kind==='anthropic-secret'));
  assert.deepEqual(inspectSource('test-support/fixtures/course-import/synthetic.pdf',dummy),[]);
});

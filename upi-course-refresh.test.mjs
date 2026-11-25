import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('cached directory refresh retains other providers and rolls back failed independent source checks',()=>{
  const result=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./test-support/upi_catalog_refresh.py',import.meta.url))],{encoding:'utf8'}).trim());
  assert.equal(result.suite,'partial-provider-catalog-refresh');assert.equal(result.tests,3);assert.equal(result.failures,0);assert.equal(result.errors,0);assert.equal(result.passed,true);
});

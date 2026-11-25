'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Providers=require('./dist/provider-registry.js');
test('approved provider aliases share course kinds and controlled destinations',()=>{
 assert.equal(Providers.name('University Pathways International'),'UPI Study');
 assert.equal(Providers.key('upi-study'),Providers.key('UPI Study'));
 for(const provider of['UPI Study','Sophia Learning','Study.com','StraighterLine','Saylor Direct Credit','ASU Universal Learner Courses'])assert.equal(Providers.kind(provider),'course');
 assert.equal(Providers.kind('CLEP'),'exam');assert.equal(Providers.kind('Unreviewed provider'),'other');
 assert.equal(Providers.courseURL('https://www.upistudy.com/courses/statistics','UPI Study'),'https://www.upistudy.com/courses/statistics');
 assert.equal(Providers.courseURL('https://www.upistudy.com/collections','UPI Study'),null);
 assert.equal(Providers.directory('UPI Study'),'https://www.upistudy.com/collections');
});
test('a new provider cannot introduce cross-provider, unsafe or disguised enrollment links',()=>{
 for(const url of['http://www.upistudy.com/courses/statistics','javascript:alert(1)','https://upistudy.com.evil.test/courses/statistics','https://upistudy.com@evil.test/courses/statistics','https://www.upistudy.com:8443/courses/statistics','https://www.upistudy.com/courses/a.pdf','https://www.upistudy.com/pages/tesu'])assert.equal(Providers.courseURL(url,'UPI Study'),null,url);
 assert.equal(Providers.courseURL('https://study.com/academy/course/statistics.html','UPI Study'),null);
 assert.equal(Providers.trustedURL('https://www.upistudy.com/pages/tesu','UPI Study'),'https://www.upistudy.com/pages/tesu');
 assert.equal(Providers.trustedURL('https://unknown.test/course','Unknown'),null);
});
test('existing source-specific course URLs retain their precise enrollment routes',()=>{
 const rows=[['Sophia','https://www.sophia.org/online-courses/english-composition-i/'],['Study.com','https://study.com/academy/course/statistics-course.html'],['StraighterLine','https://www.straighterline.com/online-college-courses/college-algebra/'],['CLEP','https://clep.collegeboard.org/clep-exams/college-algebra'],['Saylor','https://learn.saylor.org/course/view.php?id=53'],['Christian Leaders Institute','https://christianleaders.org/course/view.php?id=52']];
 for(const [provider,url]of rows)assert.equal(Providers.courseURL(url,provider),url);
});

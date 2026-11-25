/* Focused UI acceptance. Root runs against its loopback preview; every community
 * API request is intercepted, so the harness cannot seed or change real data. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const BASE = (process.env.DEGREEPATH_TEST_URL || 'http://127.0.0.1:8107/').replace(/\/?$/, '/');
const OUTPUT = process.env.DEGREESTEPS_STARTER_SCREENSHOTS || '/tmp/degreesteps-community-starters-browser';
const preparedAuthor={alias:'DegreeSteps Technology Guide',kind:'degreesteps-guide'};
const now=Date.now();
const prepared={id:'starter-wgu',kind:'question',origin:'degreesteps-starter',author:preparedAuthor,context:'school:wgu',title:'Can my existing courses fit a software degree?',body:'Example situation: I work full time and have 30 college credits. Where should I start?',createdAt:now,updatedAt:now,likes:0,upvotes:0,comments:2,guideAnswers:2,studentComments:0};
const real={id:'student-post',kind:'question',author:{alias:'Student Sam'},context:'school:wgu',title:'My transfer question',body:'I have an actual question about my courses.',createdAt:now-10,updatedAt:now-10,likes:0,upvotes:0,comments:0,guideAnswers:0,studentComments:0};
const pageTwo={...prepared,id:'starter-second',title:'How do I avoid paying twice for the same subject?'};

(async()=>{
  mkdirSync(OUTPUT,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const outcomes=[];
  try {
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
      const errors=[],writes=[],feeds=[],comments=[
        {id:'guide-a',origin:'degreesteps-starter',author:preparedAuthor,createdAt:now,body:'Start with your actual course record and a reviewed degree plan.'},
        {id:'guide-b',origin:'degreesteps-starter',author:{alias:'DegreeSteps Transfer Guide',kind:'degreesteps-guide'},createdAt:now+1,body:'Use the plan to compare course options before you enroll.'}
      ];
      let signedIn=false,upvoted=false;
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/community/**',async route=>{
        const request=route.request(),url=new URL(request.url()),path=url.pathname.slice('/api/community'.length),method=request.method();
        const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
        const current={...prepared,comments:comments.length,studentComments:comments.length-2,upvotes:upvoted?1:0,upvoted};
        if(method!=='GET')writes.push({path,method,body:request.postDataJSON()});
        if(path==='/session')return json({user:signedIn?{id:'test-student',alias:'Student Alex',role:'member'}:null});
        if(path==='/feed'){
          feeds.push(Object.fromEntries(url.searchParams));
          const source=url.searchParams.get('source'),cursor=url.searchParams.get('cursor');
          const items=source==='students'?[real]:cursor?[pageTwo]:source==='starters'?[current]:[real,current];
          return json({items,cursor:cursor?null:source==='students'?null:'second-page'});
        }
        if(path==='/posts/starter-wgu')return json({item:current});
        if(path==='/posts/student-post')return json({item:real});
        if(path==='/context')return json({...current,...(url.searchParams.get('context')==='school:wgu'?{starterDiscussions:2}:{})});
        if(path==='/comments'&&method==='GET')return json({items:comments,cursor:null});
        if(path==='/comments'&&method==='POST'){
          const body=request.postDataJSON();
          assert.equal(signedIn,true);assert.equal(body.context,'post:starter-wgu');
          assert.equal(body.origin,undefined);assert.equal(body.author,undefined);
          comments.push({id:'student-reply',author:{alias:'Student Alex',isYou:true},createdAt:now+2,body:body.body,...(body.parentId?{parentId:body.parentId}:{})});
          return json({item:comments.at(-1)},201);
        }
        if(path==='/posts/starter-wgu/reactions'&&method==='POST'){upvoted=request.postDataJSON().active;return json({item:{...current,upvoted,upvotes:upvoted?1:0}});}
        if(path==='/reports'&&method==='POST')return json({ok:true},201);
        return json({error:'Unexpected mocked community request: '+method+' '+path},404);
      });
      try{
        await page.goto(new URL('community.html?tab=feed',BASE).href,{waitUntil:'domcontentloaded'});
        await page.locator('[data-post-id="starter-wgu"]').waitFor();
        assert.match(await page.locator('#new-community-plan').innerText(),/Ask a question/);
        const cards=page.locator('#community-feed > article');
        assert.equal(await cards.first().getAttribute('data-post-id'),'student-post');
        assert.equal(await cards.first().locator('.community-starter-badge').count(),0);
        const card=page.locator('[data-post-id="starter-wgu"]');
        assert.match(await card.innerText(),/DegreeSteps starter/);
        assert.match(await card.innerText(),/2 guide answers/);
        assert.match(await card.innerText(),/0 student replies/);
        assert.equal(await card.locator('[data-count="upvote"]').innerText(),'0');
        assert.equal(await card.locator('[data-count="like"]').innerText(),'0');
        await card.locator('[data-reaction="upvote"]').click();
        await card.locator('.post-feedback a[href*="account.html"]').waitFor();
        assert.equal(writes.length,0);
        await page.locator('#feed-source').selectOption('starters');
        await page.waitForFunction(()=>document.querySelectorAll('#community-feed > article').length===1);
        assert.equal(new URL(page.url()).searchParams.get('source'),'starters');
        await page.locator('#more-community-posts').click();
        await page.locator('[data-post-id="starter-second"]').waitFor();
        assert.equal(feeds.at(-1).cursor,'second-page');
        await page.locator('#feed-source').selectOption('students');
        await page.waitForFunction(()=>document.querySelector('#community-feed > article')?.dataset.postId==='student-post');
        assert.equal(feeds.at(-1).cursor,undefined);
        await page.locator('#feed-source').selectOption('starters');
        await page.locator('[data-post-id="starter-wgu"]').waitFor();
        await page.locator('[data-post-id="starter-wgu"] .post-title-button').click();
        const dialog=page.locator('#thread-dialog');
        await dialog.locator('.comment[data-comment-id="guide-b"]').waitFor();
        assert.match(await dialog.locator('.community-starter-notice').innerText(),/Example student situation, prepared by DegreeSteps/);
        assert.equal(await dialog.locator('.comment .community-starter-badge').count(),2);
        assert.equal(await dialog.locator('.community-login-note a').count(),1);
        assert.equal(await dialog.getAttribute('aria-label'),'Community discussion');
        await page.screenshot({path:OUTPUT+'/anonymous-'+width+'.png',fullPage:true});
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(),false);
        signedIn=true;await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('[data-post-id="starter-wgu"] .post-title-button').click();
        await dialog.locator('.comment-form').waitFor();
        await dialog.locator('.comment[data-comment-id="guide-a"] [data-reply]').click();
        await dialog.locator('.comment-form textarea').fill('How should I compare my previous English class?');
        await dialog.locator('.comment-form button[type="submit"]').click();
        await dialog.locator('.comment[data-comment-id="student-reply"]').waitFor();
        assert.equal(writes.at(-1).body.parentId,'guide-a');
        const reply=dialog.locator('.comment[data-comment-id="student-reply"]');
        assert.equal(await reply.locator('.community-starter-badge').count(),0);
        assert.match(await reply.innerText(),/Student Alex/);
        assert.match(await dialog.innerText(),/2 guide answers/);
        assert.match(await dialog.innerText(),/1 student reply/);
        await dialog.locator('[data-report-detail]').click();
        await dialog.locator('.report-form textarea').fill('Please review the source link.');
        await dialog.locator('.report-form button[type="submit"]').click();
        await dialog.getByText('Report received. A moderator can review this content.').waitFor();
        await page.screenshot({path:OUTPUT+'/signed-in-'+width+'.png',fullPage:true});
        const sizes=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,body:parseFloat(getComputedStyle(document.querySelector('.comment-body')).fontSize),badge:parseFloat(getComputedStyle(document.querySelector('.community-starter-badge')).fontSize),close:document.querySelector('#close-thread').getBoundingClientRect().height}));
        assert.equal(sizes.overflow,false);assert.ok(sizes.body>=16);assert.ok(sizes.badge>=14);assert.ok(sizes.close>=44);
        await page.keyboard.press('Escape');
        await page.locator('[data-post-id="starter-wgu"] [data-reaction="upvote"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-post-id="starter-wgu"] [data-count="upvote"]')?.textContent==='1');
        assert.deepEqual(writes.map(x=>x.path),['/comments','/reports','/posts/starter-wgu/reactions']);
        assert.deepEqual(errors,[]);
        outcomes.push({width,passed:true,requests:feeds.length,writes:writes.length});
      }catch(error){
        await page.screenshot({path:OUTPUT+'/failure-'+width+'.png',fullPage:true});
        writeFileSync(OUTPUT+'/failure-'+width+'.txt',await page.locator('body').innerText());
        throw error;
      }finally{await context.close();}
    }
    console.log(JSON.stringify({outcomes,screenshots:OUTPUT},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

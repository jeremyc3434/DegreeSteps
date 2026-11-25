const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const clientSource = readFileSync(require.resolve('./dist/community-client.js'), 'utf8');
const pageSource = readFileSync(require.resolve('./dist/community.js'), 'utf8');
function loadClient() {
  let storageReads = 0;
  const root = {};
  Object.defineProperty(root, 'localStorage', { get() { storageReads++; throw Error('Private storage'); } });
  vm.runInNewContext(clientSource, { window: root, URL, URLSearchParams, Date, console });
  return { client: root.DegreeCommunity, storageReads: () => storageReads };
}
const starter = (fields = {}) => ({
  id:'starter-wgu', kind:'question', origin:'degreesteps-starter',
  author:{ alias:'DegreeSteps Technology Guide', kind:'degreesteps-guide' },
  title:'Can I transfer my courses to WGU?', body:'Example situation: I have 30 credits.',
  createdAt:1795550400, likes:0, upvotes:0, comments:2, guideAnswers:2, studentComments:0,
  ...fields
});

test('only the trusted origin and author kind combination receives editorial labels', () => {
  const { client, storageReads } = loadClient();
  const html = client.postHTML(starter());
  assert.match(html, /DegreeSteps starter/);
  assert.match(html, /Prepared by DegreeSteps/);
  assert.match(html, /author-avatar-guide[^>]*[^<]*>DS<\/span>/);
  assert.match(html, /2 guide answers/);
  assert.match(html, /0 student replies/);
  assert.match(html, /data-count="upvote">0</);
  assert.match(html, /data-count="like">0</);
  assert.doesNotMatch(html, /verified|testimonial|active members/i);
  for (const ordinary of [
    starter({origin:undefined}), starter({author:{alias:'DegreeSteps Technology Guide'}}),
    starter({origin:'student',author:{alias:'DegreeSteps Technology Guide',kind:'degreesteps-guide'}})
  ]) {
    const ordinaryHTML = client.postHTML(ordinary);
    assert.doesNotMatch(ordinaryHTML, /community-starter-badge|author-avatar-guide|Prepared by DegreeSteps/);
  }
  assert.equal(storageReads(), 0);
});

test('editorial identity, examples, and student text remain escaped without student impersonation', () => {
  const { client } = loadClient();
  const html = client.postHTML(starter({
    author:{alias:'Student Jane',kind:'degreesteps-guide'}, title:'<img src=x>',body:'<script>bad()</script>'
  }));
  assert.match(html, /DegreeSteps Guide/);
  assert.doesNotMatch(html, /Student Jane|<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  const normal = client.postHTML({id:'real-post',author:{alias:'Jane'},title:'My question',body:'How does this work?',comments:1,likes:0,upvotes:0});
  assert.match(normal, />Jane<\/strong>/);
  assert.match(normal, />1 comment<\/span>/);
  assert.doesNotMatch(normal, /Prepared by DegreeSteps|DegreeSteps starter|guide answer/);
});

test('prepared replies are guide answers, while actual student replies keep normal attribution', () => {
  const { client } = loadClient();
  const prepared = client.commentHTML(starter({body:'Compare the exact catalog first.'}));
  assert.match(prepared, /Guide answer/);
  assert.match(prepared, /DegreeSteps Technology Guide/);
  assert.match(prepared, /author-avatar-guide/);
  const student = client.commentHTML({id:'reply-real',parentId:'guide-comment',author:{alias:'Alex'},body:'I have the same question.',createdAt:1795550400});
  assert.match(student, />Alex<\/strong>/);
  assert.match(student, /comment-reply/);
  assert.doesNotMatch(student, /Guide answer|community-guide-answer|author-avatar-guide/);
  assert.equal(client.starterNotice({author:{alias:'DegreeSteps Guide'}}), '');
  assert.match(client.starterNotice(starter()), /Example student situation, prepared by DegreeSteps\. Add your own question or experience\./);
});

test('guide and student counts use actual consistent API totals and never infer engagement', () => {
  const { client } = loadClient();
  assert.match(client.discussionCountHTML(starter({comments:3,studentComments:1})), /2 guide answers<\/span><span>1 student reply/);
  assert.match(client.discussionCountHTML(starter({comments:0,guideAnswers:0})), /0 guide answers<\/span><span>0 student replies/);
  for (const fields of [
    {guideAnswers:undefined,studentComments:undefined}, {guideAnswers:undefined},
    {comments:3}, {guideAnswers:-1,studentComments:3}, {guideAnswers:Infinity},
    {guideAnswers:1.5,studentComments:.5}, {guideAnswers:'2'}, {guideAnswers:null}
  ]) {
    const html = client.discussionCountHTML(starter(fields));
    assert.doesNotMatch(html, /student repl|guide answer/);
  }
  assert.match(client.discussionCountHTML({comments:3,guideAnswers:1,studentComments:2}), /1 guide answer<\/span><span>2 student replies/);
});

test('feed source query is bounded, preserves exact context and opaque cursor, and defaults to all', () => {
  const { client } = loadClient();
  const url = new URL(client.feedPath({source:'starters',context:'program:wgu/bs-software',kind:'question',mine:true,cursor:'opaque+/= cursor',limit:12}),'https://example.test');
  assert.equal(url.pathname,'/feed');
  assert.deepEqual(Object.fromEntries(url.searchParams),{limit:'12',source:'starters',kind:'question',context:'program:wgu/bs-software',mine:'1',cursor:'opaque+/= cursor'});
  for (const source of ['all','students','starters']) assert.equal(new URL(client.feedPath({source}),'https://example.test').searchParams.get('source'),source);
  const invalid = new URL(client.feedPath({source:'fake',context:'https://example.test',kind:'member',limit:900}),'https://example.test');
  assert.equal(invalid.searchParams.get('source'),'all');
  assert.equal(invalid.searchParams.get('limit'),'20');
  assert.equal(invalid.searchParams.has('context'),false);
  assert.equal(invalid.searchParams.has('kind'),false);
});

test('context links use positive actual starter counts and retain the discussion scope', () => {
  const { client } = loadClient();
  const html = client.contextStarterLink({starterDiscussions:4},'school:tesu');
  assert.match(html,/Explore 4 DegreeSteps starter questions/);
  const url = new URL(html.match(/href="([^"]+)"/)[1],'https://example.test/');
  assert.equal(url.searchParams.get('tab'),'feed');
  assert.equal(url.searchParams.get('source'),'starters');
  assert.equal(url.searchParams.get('context'),'school:tesu');
  for (const n of [undefined,0,-1,1.5,Infinity,'4',null]) assert.equal(client.contextStarterLink({starterDiscussions:n},'school:tesu'),'');
  assert.equal(client.contextStarterLink({starterDiscussions:4},'javascript:bad'),'');
});

// Exercise the actual page controller using a minimal DOM. No API writes, private
// records, network requests, or source generators are involved.
function loadPage(search='?tab=feed', options={}) {
  const nodes = new Map(), requests = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{
      id, tagName:id==='community-signin'?'A':'DIV', innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},
      classList:{toggle(){}},setAttribute(){},toggleAttribute(){},addEventListener(){},focus(){},
      querySelectorAll(){return [];},querySelector(){return null;}
    });
    return nodes.get(id);
  };
  const document = {
    getElementById:node,
    querySelectorAll(){return [];},
    addEventListener(){}
  };
  const {client:realClient} = loadClient();
  const client = {
    user:null,getSession:async()=>null,mountUserArea:async()=>{},bindPostCards(){},signinUrl:()=>'/account.html',
    signinLink:()=>'<a href="/account.html">Sign in</a>',
    feedSource:realClient.feedSource,feedPath:realClient.feedPath,postHTML:realClient.postHTML,
    api:async path=>{requests.push(path);return options.api?options.api(path):{items:[],cursor:null};}
  };
  const location = {href:'https://example.test/community.html'+search,search};
  const history = {replaceState(_state,_title,path){location.href='https://example.test'+path;location.search=new URL(location.href).search;}};
  const root={DegreeCommunity:client,addEventListener(){}};
  const context={window:root,document,location,history,URL,URLSearchParams,console,Date,
    setTimeout,clearTimeout,AbortController,
    fetch:async()=>({ok:false,status:503})
  };
  vm.runInNewContext(pageSource,context,{filename:'community.js'});
  return {nodes,node,requests,location,client};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('feed is transparent by default and offers Ask a question while templates retain Share a plan', async () => {
  const page = loadPage();await tick();
  assert.match(page.node('new-community-plan').innerHTML,/Ask a question/);
  assert.match(page.node('community-featured').innerHTML,/Student discussions and DegreeSteps starters/);
  assert.doesNotMatch(page.node('community-featured').innerHTML,/Real posts from people/);
  assert.match(page.node('community-toolbar').innerHTML,/id="feed-source"/);
  const templates = loadPage('?tab=templates');await tick();
  assert.match(templates.node('new-community-plan').innerHTML,/Share a plan/);
  assert.doesNotMatch(templates.node('new-community-plan').innerHTML,/Ask a question/);
});

test('source changes reset paging, persist the filter, and stale responses cannot replace the new source', async () => {
  const pending=[];
  const page=loadPage('?tab=feed',{api:path=>new Promise(resolve=>pending.push({path,resolve}))});
  await tick();assert.equal(pending.length,1);
  assert.equal(new URL(pending[0].path,'https://example.test').searchParams.get('source'),'all');
  page.node('feed-source').onchange({target:{value:'students'}});await tick();
  assert.equal(pending.length,2);
  assert.equal(new URL(pending[1].path,'https://example.test').searchParams.has('cursor'),false);
  pending[1].resolve({items:[{id:'student-a',author:{alias:'Sam'},title:'Real student question',body:'How?',comments:0}],cursor:'student-cursor'});await tick();
  pending[0].resolve({items:[starter()],cursor:'old-cursor'});await tick();
  assert.match(page.node('community-feed').innerHTML,/Real student question/);
  assert.doesNotMatch(page.node('community-feed').innerHTML,/Can I transfer/);
  assert.equal(new URL(page.location.href).searchParams.get('source'),'students');
  page.node('more-community-posts').onclick();await tick();
  assert.equal(new URL(pending[2].path,'https://example.test').searchParams.get('cursor'),'student-cursor');
  pending[2].resolve({items:[],cursor:null});await tick();
  page.node('feed-source').onchange({target:{value:'starters'}});await tick();
  const next = new URL(pending[3].path,'https://example.test');
  assert.equal(next.searchParams.get('source'),'starters');
  assert.equal(next.searchParams.has('cursor'),false);
  pending[3].resolve({items:[starter()],cursor:null});await tick();
  assert.match(page.node('community-featured').innerHTML,/Example situations prepared by DegreeSteps/);
  assert.match(page.node('community-feed').innerHTML,/DegreeSteps starter/);
});

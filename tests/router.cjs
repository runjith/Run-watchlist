const {JSDOM}=require('jsdom');
const fs=require('node:fs');const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<canvas[\s\S]*?<\/canvas>/g,'');
const scripts=['data','ui','io','portfolio','ipo','datalayer','workspace','desk','portfolio-view','ipo-view','sharing','app'].map(f=>fs.readFileSync('js/'+f+'.js','utf8')).join('\n');
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Router did not settle');};
(async()=>{
 const calls=[];let missingSchema=false;
 const user={id:'33333333-3333-4333-8333-333333333333',email:'guest@example.test'};
 const client={auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange:()=>{}},from(table){calls.push(table);const q={select(){return q},eq(){return q},order(){return q},range(){return q},then(ok){return Promise.resolve({data:[],error:missingSchema&&table==='workspace_owners'?{message:'not found'}:null}).then(ok)}};return q;}};
 const d=new JSDOM(html,{url:'https://runjith.github.io/Run-watchlist/#/portfolio',runScripts:'outside-only',pretendToBeVisual:true});
 const w=d.window;w.scrollTo=()=>{};w.supabase={createClient:()=>client};
 w.eval('const SUPABASE_CONFIG={url:"https://example.supabase.co",anonKey:"sb_publishable_test"};\n'+scripts+'\nwindow.testApp={App,DataLayer,Sharing};');
 await until(()=>w.document.getElementById('sharingRoot').textContent.includes('Nothing is shared'));
 assert.equal(w.document.querySelector('[data-view="portfolio"]').hidden,true);
 assert.equal(w.document.querySelector('[data-view="sharing"]').hidden,false);
 assert.ok(calls.every(t=>['workspace_owners','shared_companies','shared_research'].includes(t)),calls.join(','));
 for(const hash of ['#/company/private-company','#/ipo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','#/desk','#/%ZZ']){
  w.location.hash=hash;await w.testApp.App.rerender();
  assert.equal(w.document.querySelector('[data-view="sharing"]').hidden,false);
 }
 missingSchema=true;await w.testApp.App.afterAuthChange();await w.testApp.App.rerender();
 assert.ok(w.document.getElementById('sharingRoot').textContent.includes('Access setup is incomplete'));
 assert.ok(calls.every(t=>['workspace_owners','shared_companies','shared_research'].includes(t)));
 w.testApp.Sharing.stop();w.close();
 console.log('PASS: guest direct routes, no private data requests, malformed hashes, missing migration fails closed.');
})().catch(e=>{console.error(e);process.exit(1);});

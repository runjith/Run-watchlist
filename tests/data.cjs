const {JSDOM}=require('jsdom');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'};
 const all=Array.from({length:1203},(_,i)=>({id:String(i).padStart(4,'0'),name:'Company '+i}));
 let signoutFails=true;
 const client={auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){},signOut:async()=>({error:signoutFails?{message:'offline'}:null})},from(table){
   let start=0,end=999;
   const q={select(){return q},eq(){return q},order(){return q},range(a,b){start=a;end=b;return q},then(fn){
     const data=table==='workspace_owners'?[{user_id:user.id}]:table==='companies'?all.slice(start,Math.min(end+1,start+100)):[];
     return Promise.resolve({data,error:null,count:table==='companies'?all.length:data.length}).then(fn);
   }};return q;
 }};
 const d=new JSDOM('',{url:'https://runjith.github.io/Run-watchlist/',runScripts:'outside-only'});const w=d.window;w.supabase={createClient:()=>client};
 w.eval('const SUPABASE_CONFIG={url:"https://example.supabase.co",anonKey:"sb_publishable_test"};\n'+['data','ui','io','portfolio','ipo','datalayer'].map(f=>fs.readFileSync('js/'+f+'.js','utf8')).join('\n')+'\nwindow.testAPI={DataLayer,Portfolio,IPO};');
 const {DataLayer:D,Portfolio:P,IPO}=w.testAPI;await D.init();
 const backup=await D.backup();assert.equal(backup.tables.companies.length,1203);assert.ok('shared_research' in backup.tables);
 await assert.rejects(()=>D.auth.signOut());assert.equal(D.auth.isSignedIn(),true);
 signoutFails=false;await D.auth.signOut();assert.equal(D.auth.isSignedIn(),false);await assert.rejects(()=>D.backup());
 const p=P.position([{type:'buy',quantity:10,price:100,fees:10,tradeDate:'2025-01-01'},{type:'sell',quantity:4,price:150,fees:4,tradeDate:'2025-02-01'}]);
 assert.equal(p.qty,6);assert.equal(p.cost,606);assert.equal(p.realised,192);
 assert.ok(Math.abs(P.xirr([{date:'2025-01-01',amount:-100},{date:'2026-01-01',amount:110}])-.1)<1e-7);
 const r=IPO.calc({funding:'sent',outcome:'allotted',lots:1,sharesAllotted:10,sellPrice:120,charges:10,loanInterest:5,settled:false},{issuePrice:100,lotSize:10});
 assert.equal(r.net,185);assert.equal(r.dueBack,1190);
 const pending=IPO.calc({funding:'sent',outcome:'pending',lots:1},{issuePrice:100,lotSize:10});assert.equal(pending.net,null);
 w.close();console.log('PASS: complete 1,203-row backup with 100-row server cap, sharing backup, sign-out failure handling, portfolio and IPO arithmetic smoke checks.');
})().catch(e=>{console.error(e);process.exit(1)});

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname,'..');
const html = readFileSync(path.join(root,'index.html'),'utf8');
const script = html.slice(html.indexOf('async function initApp(){'),html.indexOf('</script>',html.indexOf('async function initApp(){')));
const settle = () => new Promise(r => setImmediate(r));
async function app(t,{remote={},storage={},offline=false}={}) {
  const midnight = await import('../ui/midnight.mjs');
  const dom = new JSDOM('<!doctype html><html><body><div id="moodLayer"></div><div id="appRoot"></div></body></html>',{url:'https://fixture.invalid/',runScripts:'outside-only'});
  t.after(async()=>{await settle();await settle();dom.window.close();});
  const w=dom.window, requests=[]; let failure=offline;
  for(const [k,v] of Object.entries(storage)) w.localStorage.setItem(k,v);
  class ClockDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-05T08:00:00']));} }
  Object.assign(w,{midnight,Date:ClockDate,db:{},doc:()=>({}),VAPID_KEY:'',swReady:Promise.resolve(null),motionReady:Promise.resolve(null),
    matchMedia:()=>({matches:true}),scrollTo:()=>{},confirm:()=>true,
    fetch:async()=>({json:async()=>({})}),caches:{match:async()=>null},
    getDoc:async()=>({exists:()=>true,data:()=>structuredClone(remote)}),
    deleteField:()=>({__delete:true}),
    updateDoc:async(ref,patch)=>{requests.push(structuredClone(patch));if(failure)throw Error('simulated offline');for(const [p,v]of Object.entries(patch)){const keys=p.split('.');let o=remote;for(const k of keys.slice(0,-1))o=o[k]??={};if(v?.__delete)delete o[keys.at(-1)];else o[keys.at(-1)]=structuredClone(v);}},
    setDoc:async(ref,value)=>Object.assign(remote,structuredClone(value))
  });
  await vm.runInContext(script+'\ninitApp();',dom.getInternalVMContext()); await settle(); await settle();
  const $=s=>w.document.querySelector(s);
  const click=s=>{const e=$(s);assert.ok(e,`missing control ${s}`);e.click();return e;};
  const type=(s,v)=>{const e=$(s);assert.ok(e,`missing input ${s}`);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}));e.dispatchEvent(new w.Event('blur'));return e;};
  return {w,$,click,type,remote,requests,dash:w.Dash,storage:()=>Object.fromEntries(Object.entries(w.localStorage)),setOffline:v=>failure=v};
}
test('all four primary destinations and retained reference screens render through the real controller',async t=>{
  const a=await app(t);
  for(const tab of ['today','plan','history','more','money','pr','health','schedule']) {
    if(['money','pr','health','schedule'].includes(tab)) a.click('[data-tab="more"]');
    a.click(`[data-tab="${tab}"]`);
    assert.ok(a.$('main'));
    assert.equal(a.$('nav [aria-current="page"]').dataset.tab,['money','pr','health','schedule'].includes(tab)?'more':tab);
    assert.equal(a.w.document.activeElement.id,'viewContent');
  }
  assert.equal(a.w.location.hash,'');
});
test('low capacity, rest, skip, reopen and off/on work without mutating action records',async t=>{
  const a=await app(t); const before=JSON.stringify(a.dash.state.days);
  a.click('[data-ci="capacity:low"]');
  assert.ok(a.$('[data-ci="focus:read5"]'));assert.equal(a.$('[data-ci="focus:gym"]'),null);
  a.click('[data-ci="focus:rest"]');assert.match(a.$('.step-title').textContent,/rest/);
  a.click('[data-ci-act="skipmorning"]');assert.ok(a.$('[data-ci-act="reopenmorning"]'));
  a.click('[data-ci-act="reopenmorning"]');a.click('[data-ci-act="off"]');a.click('[data-ci-act="on"]');
  assert.equal(JSON.stringify(a.dash.state.days),before);
});
test('text save leaves the clicked target intact, avoids duplicate blur writes and updates the chosen step',async t=>{
  const a=await app(t); const original=a.$('[data-tab="plan"]');
  a.type('[data-ci-text="firstStep"]','Read one page'); await settle();
  assert.equal(a.$('[data-tab="plan"]'),original);
  assert.equal(a.$('.step-title').textContent,'Read one page');
  assert.equal(a.requests.length,1);
  a.type('[data-ci-text="firstStep"]','');await settle();
  assert.equal(a.requests.length,2);assert.match(a.$('.step-title').textContent,/What matters/);
  a.type('[data-ci-text="cue"]','After tea');a.click('[data-tab="plan"]');await settle();
  assert.equal(a.remote.checkIns[a.dash.today].cue,'After tea');
});
test('evening close/reopen persists answers; delete removes only reflection records',async t=>{
  const a=await app(t,{remote:{days:{'2026-09-05':{gym:true}},flow:{m:40,asOf:'2026-09-05'},rewards:{tokens:['kept']}}});
  const before=JSON.stringify({days:a.dash.state.days,flow:a.dash.state.flow,rewards:a.dash.state.rewards});
  a.click('[data-ci-phase="evening"]');a.type('[data-ci-text="win"]','A small start');a.type('[data-ci-text="tomorrow"]','Open the notebook');a.click('[data-ci-act="close"]');
  assert.ok(a.$('[data-ci-act="reopen"]'));a.click('[data-ci-act="reopen"]');
  assert.equal(a.$('[data-ci-text="win"]').value,'A small start');
  a.click('[data-ci-act="delete"]');await settle();
  assert.equal(JSON.stringify(a.dash.state.checkIns),'{}');
  assert.equal(JSON.stringify({days:a.dash.state.days,flow:a.dash.state.flow,rewards:a.dash.state.rewards}),before);
  assert.deepEqual(a.remote.checkIns,{});
});
test('written HTML stays text in Today, inputs and Record',async t=>{
  const payload='</textarea><img src=x onerror="alert(1)"><script>bad()</script>';
  const a=await app(t,{remote:{checkIns:{'2026-09-05':{firstStep:payload,win:payload,cue:payload}}}});
  assert.equal(a.$('.step-title').textContent,payload);
  assert.equal(a.$('img[onerror]'),null);assert.equal(a.$('script'),null);
  a.click('[data-tab="history"]');assert.equal(a.$('img[onerror]'),null);assert.match(a.$('main').textContent,/onerror/);
});
test('expanded checklist stays open while logging; writes are field patches',async t=>{
  const a=await app(t);a.$('[data-disclosure="activities"]').open=true;
  a.click(`[data-toggle="days.${a.dash.today}.anchor"]`);await settle();
  assert.equal(a.$('[data-disclosure="activities"]').open,true);
  assert.deepEqual(Object.keys(a.requests[0]).sort(),[`days.${a.dash.today}.anchor`,`days.${a.dash.today}.log.anchor`].sort());
  assert.equal(a.dash.state.days[a.dash.today].anchor,true);
});
test('offline reflection survives reload, preserves unrelated cloud state and retries',async t=>{
  const a=await app(t,{offline:true});a.type('[data-ci-text="firstStep"]','Keep this draft');await settle();
  assert.match(a.$('#syncStatus').textContent,/to sync/);
  const b=await app(t,{storage:a.storage(),remote:{config:{score:77},days:{'2026-09-05':{gym:true}}}});await settle();
  assert.equal(b.$('.step-title').textContent,'Keep this draft');assert.equal(b.dash.state.config.score,77);assert.equal(b.dash.state.days[b.dash.today].gym,true);
  assert.equal(b.remote.checkIns[b.dash.today].firstStep,'Keep this draft');assert.equal(b.$('#syncStatus').textContent,'Synced to cloud');
});
test('Google entry points stay external; no fake task records or connection claims',async t=>{
  const a=await app(t);assert.match(a.$('main').textContent,/Google Tasks not connected/);
  a.click('[data-tab="plan"]');
  assert.ok(a.$('a[href="https://tasks.google.com/"]'));assert.ok(a.$('a[href="https://calendar.google.com/"]'));
  assert.match(a.$('main').textContent,/No live task or calendar data/);
});
test('new cache bundle exists and check-in form buttons never submit',async t=>{
  const sw=readFileSync(path.join(root,'sw.js'),'utf8');const files=sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
  for(const file of files)assert.ok(existsSync(path.join(root,file)),file);
  const a=await app(t);a.click('[data-ci-phase="evening"]');
  for(const b of a.w.document.querySelectorAll('form button'))assert.equal(b.type,'button');
  for(const input of a.w.document.querySelectorAll('textarea'))assert.ok(a.$(`label[for="${input.id}"]`));
});
test('keyboard focus survives choice redraws and closing the evening review',async t=>{
  const a=await app(t);a.$('[data-ci="capacity:usual"]').focus();a.click('[data-ci="capacity:usual"]');
  assert.equal(a.w.document.activeElement.dataset.ci,'capacity:usual');
  a.click('[data-ci-phase="evening"]');a.$('[data-ci-act="close"]').focus();a.click('[data-ci-act="close"]');
  assert.equal(a.w.document.activeElement.dataset.ciAct,'reopen');
});
test('Record uses readable labels for existing focus and obstacle keys',async t=>{
  const a=await app(t,{remote:{checkIns:{'2026-09-05':{focus:'gym',obstacle:'toomuch',cue:'After tea'}}}});
  a.click('[data-tab="history"]');assert.match(a.$('main').textContent,/Gym session/);assert.match(a.$('main').textContent,/Too much planned/);assert.match(a.$('main').textContent,/After tea/);
});

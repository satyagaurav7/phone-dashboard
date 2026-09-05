// Presentation only. All mutations remain in the existing Dash controller.
export const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow = '<span aria-hidden="true">↗</span>';
const link = (url,label,cls='') => `<a class="${cls}" href="${url}" target="_blank" rel="noopener">${label}${arrow}</a>`;
const caption = label => `<p class="eyebrow">${label}</p>`;
export function header(date, tab) {
  const label = new Date(date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  return `<header class="masthead"><div><a class="wordmark" href="#" data-tab="today" aria-label="FLOWSTATE Today">FLOWSTATE</a><p class="mastdate">${text(label)}</p></div><button type="button" class="sunmark" data-tab="more" aria-label="Open settings and more">☼</button></header>
    <div class="save-line"><span>Dashboard</span><span id="syncStatus" role="status" aria-live="polite">Loading…</span></div>
    ${['pr','money','health','schedule'].includes(tab)?'<button type="button" class="back-link" data-tab="more">← Back to More</button>':''}`;
}
export function today({state,date,checkIn,activity}) {
  const c=state.checkIns?.[date] || {};
  const focus=c.firstStep || (c.focus==='rest'?'Make room for rest.':'');
  return `<div class="today-layout"><section class="daily-lead" aria-labelledby="today-title">
    <div class="hero"><img class="filament" src="assets/filament.svg" alt="" aria-hidden="true"><h1 id="today-title">One thing,<br>then the next.</h1></div>
    <div class="chosen-step">${caption(focus?'YOUR CHOSEN STEP':'A LITTLE DIRECTION')}
      <p class="step-title">${focus?text(focus):'What matters<br>to you today?'}</p>
      <p class="muted">${focus?'An intention you chose. Go at your own pace.':'Find your next action in your full checklist.'}</p></div>
    ${link('https://tasks.google.com/','Open Google Tasks','primary-action')}
    <div class="calendar-link">${link('https://calendar.google.com/','Open calendar','text-link')}</div>
    <p class="source-note"><span aria-hidden="true">ⓘ</span> Google Tasks not connected to this dashboard</p>
  </section><section class="reflection-area" aria-label="Optional daily reflection">${checkIn}</section></div>
  <details class="activity-disclosure" data-disclosure="activities"><summary><span>${caption('YOUR LOCAL RECORD')}<span class="section-serif">Log an activity</span></span><span aria-hidden="true">＋</span></summary>
    <p class="muted">These are dashboard logs. Your complete to-do checklist and its completion stay in Google Tasks.</p>${activity}</details>`;
}
export function plan() {
  return `<section class="plan-view"><span class="outline-label">GOOGLE TOOLS</span><h1>Your day,<br>in its own time.</h1>
    <div class="directory-row"><span class="directory-number" aria-hidden="true">01</span><div>${link('https://tasks.google.com/','Tasks','directory-title')}<p>Your full checklist</p><div class="list-descriptions"><span>Routines</span><span>Personal to-dos</span></div></div></div>
    <div class="directory-row"><span class="directory-number" aria-hidden="true">02</span><div>${link('https://calendar.google.com/','Calendar','directory-title')}<p>Appointments &amp; time blocks</p></div></div>
    <section class="voice-panel">${caption('TRY SAYING')}<blockquote>“What are my tasks<br>due today?”</blockquote><p><span aria-hidden="true">♬</span> Test on your speaker</p></section>
    <p class="source-note">Task completion stays in Google. No live task or calendar data is read here.</p>
    <details class="plain-details" data-disclosure="voice"><summary>More ways to use your speaker</summary><ul><li>“What’s on my calendar tomorrow?”</li><li>“Set a 25-minute timer.”</li><li>“Focus time” — test your saved routine.</li></ul>${link('https://home.google.com/','Open Google Home','text-link')}<p class="muted">Some personal routine settings require the Home mobile app. These examples are not proof of speaker connectivity.</p></details></section>`;
}
const capacities=[['low','Low'],['usual','Usual'],['plenty','Plenty']];
const feelings=[['calm','Calm'],['tense','Tense'],['flat','Flat'],['distracted','Distracted']];
const focusLabels={gym:'Gym session',language:'Language practice',study:'Upskill hour',cooked:'Full cooked day',smokefree:'Smoke-free day',money:'Money move',water:'Hydrate',walk:'Stretch + bottles',read5:'Open the book',cookmeal:'Cook a meal',meditate:'Breathe',phonedown:'Phone down',rest:'Rest today'};
const obstacles=[['toomuch','Too much planned'],['unclear','Unclear next step'],['tired','Tired'],['interrupted','Interrupted'],['waiting','Waiting on someone']];
const chip=(field,val,label,selected)=>`<button type="button" class="choice${selected?' selected':''}" data-ci="${field}:${val}" aria-pressed="${Boolean(selected)}">${text(label)}</button>`;
const input=(field,label,value,placeholder)=>`<label class="field-label" for="ci-${field}">${label}</label><textarea id="ci-${field}" class="ciText" rows="2" data-ci-text="${field}" placeholder="${placeholder}">${text(value)}</textarea>`;
export function checkIn({state,date,day,phase,small,big}) {
  const c=state.checkIns?.[date] || {}, evening=phase==='evening';
  const controls=`<div class="reflection-controls"><button type="button" data-ci-act="off" class="quiet-link">Turn check-ins off</button>${Object.keys(state.checkIns||{}).length?'<button type="button" data-ci-act="delete" class="quiet-link">Delete reflection data</button>':''}</div>`;
  if(state.prefs?.checkIns===false) return `<div class="quiet-state">${caption('A MOMENT FOR YOU')}<h2>Room to just be.</h2><p>Check-ins are off.</p><button type="button" class="outline-button" data-ci-act="on">Turn check-ins on</button></div>`;
  const phaseNav=`<div class="phase-nav" role="group" aria-label="Check-in time"><button type="button" data-ci-phase="morning" aria-pressed="${!evening}">Morning</button><button type="button" data-ci-phase="evening" aria-pressed="${evening}">Evening</button></div>`;
  if(c.closed || (!evening && c.morningSkipped)) return `<div class="quiet-state">${phaseNav}${caption('A MOMENT FOR YOU')}<h2>${c.closed?'Enough for today.':'A little space.'}</h2><p>${c.closed?'Your review is closed. You can always come back.':'Morning check skipped. No answer needed.'}</p>${c.tomorrow?`<p class="reflection-excerpt">${text(c.tomorrow)}</p>`:''}<button type="button" class="outline-button" data-ci-act="${c.closed?'reopen':'reopenmorning'}">Reopen</button>${controls}</div>`;
  if(!evening){
    const menu=c.capacity==='low'?small:big;
    return `<div class="morning-check">${phaseNav}${caption('A MOMENT FOR YOU')}<h2>How much room<br>do you have today?</h2><p class="muted">A quick check. Every answer is optional.</p><div class="capacity-choices">${capacities.map(([v,l])=>chip('capacity',v,l,c.capacity===v)).join('')}</div>
      <details class="plain-details" data-disclosure="morning-notes"><summary>Choose a step or add a note</summary><p class="field-label">What would feel worthwhile?</p><div class="choice-wrap">${menu.map(([v,e,l])=>chip('focus',v,l,c.focus===v)).join('')}${chip('focus','rest','Rest today',c.focus==='rest')}</div>${input('firstStep','First small step',c.firstStep,'Open the book and read one page.')}${input('cue','When or after what?',c.cue,'After I put the kettle on.')}<p class="field-label">Anything you want to note?</p><div class="choice-wrap">${feelings.map(([v,l])=>chip('feeling',v,l,c.feeling===v)).join('')}<button type="button" class="quiet-link" data-ci-act="skipfeeling">Clear feeling</button></div></details>
      <button type="button" class="quiet-link skip-link" data-ci-act="skipmorning">Skip this morning</button>${controls}</div>`;
  }
  const count=Object.entries(day||{}).filter(([key,val])=>val===true && !['completed'].includes(key)).length;
  return `<div class="evening-check">${phaseNav}${caption('EVENING REVIEW')}<h2>Notice what<br>moved forward.</h2><form class="paper" data-reflection-form>
    ${input('win','One win, in your words',c.win,'Something you made room for today.')}
    <p class="record-context">${count?`${count} activities recorded here.`:'Nothing logged here today.'} Things done by voice or elsewhere appear only if you log them here.</p>
    <fieldset><legend class="field-label">What got in the way?</legend><div class="choice-wrap">${obstacles.map(([v,l])=>chip('obstacle',v,l,c.obstacle===v)).join('')}<button type="button" class="choice" data-ci-act="clearobstacle">Nothing to add</button></div></fieldset>
    <div class="paper-rule"></div>${input('tomorrow','Tomorrow’s first step',c.tomorrow,'One small thing, when you’re ready.')}
    <button type="button" class="primary-action paper-action" data-ci-act="close">Close for tonight</button><button type="button" class="quiet-link skip-link" data-ci-act="skip">Skip tonight</button>
    </form><p class="source-note">Private reflection · no score attached</p>${controls}</div>`;
}
export function more({reminders,push}) {
  const rows=[['money','Money','Your saved figures & spending record'],['pr','PR','Documents, dates & saved reference'],['health','Health','Your saved reference notes'],['schedule','Saved timetable','Historical schedule — not live Google data']];
  return `<section><p class="eyebrow">THE REST OF YOUR WORLD</p><h1>A place<br>for everything.</h1><div class="more-directory">${rows.map(([key,title,sub],i)=>`<button type="button" class="more-row" data-tab="${key}"><span class="more-number">0${i+1}</span><span><span class="more-title">${title}</span><span class="more-sub">${sub}</span></span><span aria-hidden="true">→</span></button>`).join('')}</div>
    <details class="plain-details settings-section" data-disclosure="reminders"><summary>Notifications & quiet time</summary>${reminders}${push}</details>
    <section class="connections"><h2>What’s connected</h2><p>Dashboard save status appears at the top of every screen.</p><div class="connection-row"><span>Google Tasks & Calendar</span><span class="outline-label">NOT CONNECTED</span></div><p class="muted">Use Plan to open your Google tools. A dashboard checkmark does not complete a Google task.</p>${link('https://home.google.com/','Google Home settings','text-link')}</section></section>`;
}
export function record({state,history}) {
  const entries=Object.entries(state.checkIns||{}).filter(([,v])=>v&&Object.values(v).some(x=>typeof x==='string'&&x)).sort(([a],[b])=>b.localeCompare(a));
  const reflection=entries.length?entries.map(([date,c])=>`<details class="reflection-entry" data-disclosure="record-${text(date)}"><summary>${text(new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric'}))}</summary>${[['win','A win'],['firstStep','First step'],['cue','A cue'],['focus','Chosen focus'],['tomorrow','Tomorrow'],['feeling','Feeling'],['obstacle','What got in the way']].filter(([key])=>c[key]).map(([key,label])=>`<p><span class="eyebrow">${label}</span><br>${text(key==='obstacle'?(obstacles.find(([v])=>v===c[key])?.[1]||c[key]):key==='focus'?(focusLabels[c[key]]||c[key]):c[key])}</p>`).join('')}${c.capacity?`<p class="muted">Capacity: ${text(c.capacity)}</p>`:''}</details>`).join(''):'<p class="muted">No written reflections yet. Leaving this empty is fine.</p>';
  return `<section class="record-view">${caption('YOUR RECORD')}<h1>Small things.<br>Real life.</h1><p class="muted">A record of what you logged, never a verdict on your day.</p><div class="record-reflections"><h2>In your words</h2>${reflection}${entries.length?'<button type="button" class="quiet-link" data-ci-act="delete">Delete reflection data</button>':''}</div><details class="plain-details" data-disclosure="history" open><summary>Activity history</summary>${history}</details></section>`;
}
export function nav(tab,icon){
  const active=['pr','money','health','schedule'].includes(tab)?'more':tab;
  return `<nav class="bottomNav" aria-label="Main navigation"><div class="navIn">${[['today','check','Today'],['plan','calendar','Plan'],['history','file','Record'],['more','spark','More']].map(([key,i,label])=>`<button type="button" class="navBtn${key===active?' on':''}" data-tab="${key}"${key===active?' aria-current="page"':''}>${icon(i)}<span class="nLbl">${label}</span></button>`).join('')}</div></nav>`;
}

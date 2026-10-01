/* desk-work.js — what From the Desk does with a project, on the phone.
   THE SKY      what still needs doing, as stars; tap one to check it off (it settles small and dim, never deleted).
   YOUR WORDS   a line to add a message or a voice memo (the keyboard's mic); kept in order with the desk's talk.
   WRITE        the AI reads the talk and writes ONLY the scene headings and action lines your words specifically
                name, plus the things still to do. It never writes dialogue. Nothing it writes goes back to the desk.
   SETTINGS     the Salmon of Knowledge: the same key box as Orv, test proves it, Cha-ching opens a paid door.
   Storage: 'desk.<p>.work' {todo:[{id,text,done,at,doneAt}], scenes:[{heading, action:[..], from}], mine:[{who,text,at}], n} */
'use strict';
const work = p => load('desk.' + p + '.work', null) || { todo: [], scenes: [], mine: [], n: 0 };
const putWork = (p, w) => store('desk.' + p + '.work', w);
const grow = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
let CUR = null;

/* ── THE SKY ── */
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function drawSky(svg, d) {
  const w = work(d.p), W = svg.clientWidth || 340, NS = 'http://www.w3.org/2000/svg';
  const H = Math.max(120, 34 * w.todo.length + 30); svg.style.height = H + 'px';
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.textContent = '';
  const items = w.todo.slice().sort((a, b) => (a.done - b.done));
  if (!items.length) { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 8); t.setAttribute('y', H / 2); t.textContent = 'nothing to do yet — tap write, or add one below'; t.setAttribute('fill', '#5b6d7c'); svg.append(t); return; }
  const open = items.filter(t => !t.done), pts = [];
  items.forEach((t, i) => {
    const h = hash(t.id + t.text), lane = W - 190;                 // one star a row, zigzag, a little jitter: never on top of each other
    const x = 14 + (i % 2 ? .55 : .05) * lane + (h % 1000) / 1000 * lane * .4, y = 24 + i * 34 + ((h >>> 10) % 7) - 3;
    pts.push({ t, x, y });
  });
  const thread = pts.filter(q => !q.t.done);                    // a faint thread through what still waits, in order
  for (let i = 1; i < thread.length; i++) { const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', thread[i - 1].x); l.setAttribute('y1', thread[i - 1].y); l.setAttribute('x2', thread[i].x); l.setAttribute('y2', thread[i].y);
    l.setAttribute('stroke', '#2c3d4c'); l.setAttribute('stroke-width', '1'); svg.append(l); }
  pts.forEach(({ t, x, y }) => {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', t.done ? 'done' : ''); g.style.cursor = 'pointer';
    const first = !t.done && open[0] && open[0].id === t.id, r = t.done ? 2 : first ? 5 : 4;
    const st = document.createElementNS(NS, 'rect'); st.setAttribute('x', x - r); st.setAttribute('y', y - r); st.setAttribute('width', r * 2); st.setAttribute('height', r * 2);
    st.setAttribute('fill', t.done ? '#5b6d7c' : first ? '#FFA512' : '#e1e8ed'); st.setAttribute('transform', 'rotate(45 ' + x + ' ' + y + ')');
    const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', x + 10); tx.setAttribute('y', y + 4); tx.textContent = t.text.length > 26 ? t.text.slice(0, 25) + '…' : t.text;
    const hit = document.createElementNS(NS, 'rect'); hit.setAttribute('x', x - 14); hit.setAttribute('y', y - 15); hit.setAttribute('width', 190); hit.setAttribute('height', 30); hit.setAttribute('fill', 'transparent');
    g.append(st, tx, hit);
    g.addEventListener('click', () => { const ww = work(d.p), it = ww.todo.find(z => z.id === t.id); if (!it) return;
      it.done = !it.done; it.doneAt = it.done ? nowIso() : null; putWork(d.p, ww); drawSky(svg, d); });
    svg.append(g);
  });
}
function addTodos(p, texts) {
  const w = work(p), have = new Set(w.todo.map(t => t.text.trim().toLowerCase())); let added = 0;
  texts.forEach(x => { const t = String(x || '').trim().slice(0, 200); if (!t || have.has(t.toLowerCase())) return;
    w.n = (w.n || 0) + 1; w.todo.push({ id: 't' + w.n.toString(36), text: t, done: false, at: nowIso() }); have.add(t.toLowerCase()); added++; });
  putWork(p, w); return added;
}

/* ── WRITE: headings and action only, from what the words name ── */
function talkOf(d) { return d.talk.concat(work(d.p).mine).map(t => ({ who: t.who, text: t.text })); }
async function writeFromWords(d, note, svg, pagesEl) {
  const key = String(box().apiKey || ''), door = keyDoor();
  if (!key || !door) return setOpen('Paste your key and tap test. A Groq or Gemini key is free.');
  if (!paidOpen(door)) return setOpen('The ' + door + ' key costs money. Type ' + K.password + ' on the coin line.');
  const words = talkOf(d); if (!words.length) { note.textContent = 'No messages yet. Add one below, then tap write.'; return; }
  note.className = 'note'; note.textContent = 'reading your words…';
  const sys = K.seed + `
You are reading the King's messages and voice memos about his screenplay "${d.name}".
Logline: ${d.plot.logline || '(none)'}
Beats: ${d.plot.beats.map((b, i) => (i + 1) + '. ' + b).join(' ') || '(none)'}
Already written here: ${work(d.p).scenes.map(s => s.heading).join(' | ') || '(nothing)'}
Answer ONLY with one JSON object: {"say": "<one short line to the King>", "scenes": [{"heading": "INT./EXT. PLACE - TIME", "action": ["<action line>", ...], "from": "<his exact words this came from>"}], "todo": ["<a thing still to do>", ...]}
LAWS: Write a scene heading or an action line ONLY when his words specifically name it (a place, a time, a thing that happens). Never invent scenes he did not mention. NEVER write dialogue or character lines — that is his alone. Use standard screenplay form: headings in caps, action in present tense, short. Skip anything already written here. "todo" lists what still needs doing that his words mention or imply (scenes to write, things to fix, people to see), each a short plain line. Empty arrays are fine.`;
  try {
    const { m, text } = await answer(door, key, sys, [{ role: 'user', content: words.map(t => (t.who || 'king').toUpperCase() + ': ' + t.text).join('\n\n') }]);
    let r = null; try { r = JSON.parse(text); } catch (e) { const j = /\{[\s\S]*\}/.exec(text); if (j) try { r = JSON.parse(j[0]); } catch (e2) { r = null; } }
    if (!r) { note.className = 'note bad'; note.textContent = 'Orv answered, but not in the shape I need. Tap write again.'; return; }
    const w = work(d.p), seen = new Set(w.scenes.map(s => s.heading.toUpperCase()));
    let n = 0;
    (Array.isArray(r.scenes) ? r.scenes : []).forEach(s => { const h = String(s && s.heading || '').trim().toUpperCase().slice(0, 120); if (!h || seen.has(h)) return;
      w.scenes.push({ heading: h, action: (Array.isArray(s.action) ? s.action : []).map(a => String(a).slice(0, 600)).filter(Boolean).slice(0, 12), from: String(s.from || '').slice(0, 300) }); seen.add(h); n++; });
    putWork(d.p, w);
    const t = addTodos(d.p, Array.isArray(r.todo) ? r.todo : []);
    drawSky(svg, d); drawPages(pagesEl, d);
    note.textContent = (r.say ? String(r.say).slice(0, 300) + '\n' : '') + n + ' new scene' + (n === 1 ? '' : 's') + ' · ' + t + ' new thing' + (t === 1 ? '' : 's') + ' to do · ' + door + ' · ' + m;
  } catch (e) { note.className = 'note bad'; note.textContent = 'Orv could not get through: ' + plainWhy(e); }
}
function drawPages(el, d) {
  el.textContent = ''; const sc = work(d.p).scenes;
  if (!sc.length) { el.hidden = true; return; } el.hidden = false;
  sc.forEach(s => { el.append(mk('div', 'h', s.heading)); s.action.forEach(a => el.append(mk('p', 'a', a))); if (s.from) el.append(mk('div', 'src', 'from your words: “' + s.from + '”')); });
}

/* ── into the project page ── */
function deskWork(d, m, plot) {
  CUR = d;
  const skyHead = mk('h2', '', 'WHAT STILL NEEDS DOING');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'sky';
  const addT = mk('div', 'addline'), tIn = mk('textarea'); tIn.rows = 1; tIn.placeholder = 'add a thing to do';
  const tGo = mk('button', 'word', 'add'); addT.append(tIn, tGo);
  const addTodo = () => { const v = tIn.value.trim(); if (!v) return; addTodos(d.p, [v]); tIn.value = ''; grow(tIn); drawSky(svg, d); };
  tGo.addEventListener('click', addTodo); tIn.addEventListener('input', () => grow(tIn));
  tIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } });
  m.insertBefore(skyHead, plot); m.insertBefore(svg, plot); m.insertBefore(addT, plot);

  const wHead = mk('h2', '', 'FROM YOUR WORDS'), wGo = mk('button', 'word', 'write'), note = mk('div', 'note'), pages = mk('div', 'pages');
  wGo.title = 'Orv writes only the scene headings and action your messages name — never dialogue';
  plot.after(wHead, wGo, note, pages);
  wGo.addEventListener('click', () => writeFromWords(d, note, svg, pages));

  /* your own messages and voice memos, after the desk's talk */
  let talk = m.querySelector('.talk');
  if (!talk) { m.append(mk('h2', '', 'THE CONVERSATION')); talk = mk('div', 'talk'); m.append(talk); }
  work(d.p).mine.forEach(x => { const p = mk('p', 'k'); p.append(mk('span', 'who', 'THE KING · ON THE PHONE'), document.createTextNode(x.text)); talk.append(p); });
  const add = mk('div', 'addline'), mIn = mk('textarea'); mIn.rows = 1; mIn.placeholder = 'a message or a voice memo (tap the mic on the keyboard)';
  const mGo = mk('button', 'word', 'keep'); add.append(mIn, mGo); talk.after(add);
  mIn.addEventListener('input', () => grow(mIn));
  mGo.addEventListener('click', () => { const v = mIn.value.trim(); if (!v) return; const w = work(d.p); w.mine.push({ who: 'king', text: v.slice(0, 8000), at: nowIso() }); putWork(d.p, w);
    const p = mk('p', 'k'); p.append(mk('span', 'who', 'THE KING · ON THE PHONE'), document.createTextNode(v)); talk.append(p); mIn.value = ''; grow(mIn); });

  requestAnimationFrame(() => drawSky(svg, d)); drawPages(pages, d);
  if (Array.isArray(d.plot.todo)) { addTodos(d.p, d.plot.todo); drawSky(svg, d); }
}

/* ── SETTINGS behind the salmon (Orv's, the same key) ── */
const TRY = ['gemini', 'groq', 'openrouter', 'anthropic', 'openai', 'xai'];
let SET_BUSY = false;
function setSay(t, how) { const s = $('setSay'); s.textContent = t || ''; s.className = how || ''; }
function setFill() { const d = keyDoor(); if (document.activeElement !== $('setKey')) $('setKey').value = String(box().apiKey || '');
  $('setModel').value = d ? String((load('orv.model', {}) || {})[d] || '') : ''; $('setChaRow').hidden = !(d && !paidOpen(d)); grow($('setKey')); }
function salmonCall() { const d = keyDoor(); $('salmon').classList.toggle('call', !box().apiKey || !d || !paidOpen(d)); }
function setOpen(why) { $('set').hidden = false; setFill(); setSay(why || ''); $('salmon').classList.remove('call'); }
function setClose() { $('set').hidden = true; salmonCall(); }
async function setTest() {
  if (SET_BUSY) return; const v = $('setKey').value.replace(/\s+/g, '');
  if (!v) return setSay('Paste your key on the key line first.', 'bad');
  SET_BUSY = true; $('setTest').textContent = 'testing…'; setSay('asking the doors whose key this is…');
  try {
    const guess = doorOf(v), order = guess ? [guess].concat(TRY.filter(x => x !== guess)) : TRY; let door = null, why = '';
    for (const d of order) { try { const r = await fetchT(DOORS[d].list, { headers: headers(d, v) }); const o = await r.json().catch(() => ({}));
      if (r.ok) { door = d; break; } if (!why) why = doorError(r, o).message; } catch (e) { if (!why) why = String(e.message || e); } }
    if (!door) return setSay('✗ No door took that key.\n' + why.slice(0, 200), 'bad');
    const b = box(), was = b.apiKey; b.apiKey = v; b.door = door; store(BOX, b); store('orv.keyAt', nowIso());
    if (box().apiKey !== v) return setSay('✗ The key works, but this phone refused to keep it.', 'bad');
    if (was !== v) { const k = load('orv.model', {}); delete k[door]; store('orv.model', k); }
    setFill();
    if (!paidOpen(door)) return setSay('✓ The key works (' + door + '). It costs money: type ' + K.password + ' on the coin line, then test again.', 'good');
    const { m, text } = await answer(door, v, K.seed + '\nAnswer ONLY with {"say": "<one short sentence to the High King saying you hear him>"}.', [{ role: 'user', content: 'Orv, can you hear me?' }]);
    let r = null; try { r = JSON.parse(text); } catch (e) { const j = /\{[\s\S]*\}/.exec(text); if (j) try { r = JSON.parse(j[0]); } catch (e2) {} }
    setSay('✓ Works. ' + door + ' · ' + m + '\nOrv: ' + ((r && r.say) || String(text).slice(0, 160)), 'good');
    setTimeout(() => { if (!$('set').hidden) setClose(); }, 2200);
  } catch (e) { setSay('✗ The key is kept, but Orv could not get through: ' + plainWhy(e), 'bad'); }
  finally { SET_BUSY = false; $('setTest').textContent = 'test'; salmonCall(); }
}
$('setTest').addEventListener('click', setTest);
$('setKey').addEventListener('input', () => grow($('setKey')));
$('setKey').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setTest(); } });
$('setCha').addEventListener('change', () => { const w = $('setCha').value.trim(), d = keyDoor(); if (!w || !d) return;
  if (w.toLowerCase() !== K.password.toLowerCase()) return setSay('That is not the word. Type ' + K.password + '.', 'bad');
  const p = load('orv.paid', {}); p[d] = nowIso(); store('orv.paid', p); $('setCha').value = ''; setFill(); setTest(); });
$('setModel').addEventListener('change', () => { const v = $('setModel').value.trim(), d = keyDoor(); if (!d) return; const k = load('orv.model', {});
  if (v) k[d] = v; else delete k[d]; store('orv.model', k); setSay(v ? 'Orv now thinks with ' + v + '. Tap test.' : 'Orv will choose the model himself.'); });
(function salmon() {
  const MAP = ['.......ooooo........', '.....oodddddoo....oo', '...oodddddddddo..odo', '..odwedddkddddoooddo',
    '.osssssssssssssssddo', '..olllllssssssooosdo', '...oollllllsso...oso', '.....ooooooo......oo'];
  const PAL = { o: '#3a1f2b', d: '#e0605a', s: '#fa8072', l: '#ffd0bf', w: '#ffffff', e: '#141733', k: '#b8473f' };
  const S = 4, c = $('salmon'), x = c.getContext('2d');
  c.width = MAP[0].length * S; c.height = MAP.length * S; c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
  MAP.forEach((row, y) => Array.from(row).forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i * S, y * S, S, S); } }));
  c.addEventListener('click', () => $('set').hidden ? setOpen() : setClose());
  salmonCall();
})();
addEventListener('resize', () => { const svg = $('sky'); if (svg && CUR) drawSky(svg, CUR); });

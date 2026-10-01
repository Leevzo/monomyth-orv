/* ═══════════════════════════════════════════════════════════════════════
   ink-core.js — INKLING Phase 1: everything both glasses share.
   The law is inkling/CONTRACT.md. inkling/fixtures/vectors.json is the truth
   Python and this file must match byte for byte (canon, HMAC, record chain,
   topic, seed, mosaic). Scriptorium serves a byte copy at app/ink-core.js.

   ONE global only: window.INK. Everything lives inside the function below,
   so this file loads beside sword-engine.js and _glyph.js (which declare
   G, STAR, WHEEL, el, pix, GLYPH…) without a single name colliding.
   Load palette333.js (window.P333) first; THE 333 is read lazily.
   Plain JS, no framework, no build step. Needs only what a browser has:
   crypto.subtle, TextEncoder, CompressionStream, fetch.

     INK.canon(x)                      → string        §5 canonical JSON
     INK.sha256hex(strOrBytes)         → Promise<hex>
     INK.hmac32(keyHex, obj)           → Promise<32 hex>   HMAC-SHA256(canon(obj))
     INK.b64url(bytes) · INK.unb64url(str) · INK.utf8(str) · INK.unutf8(bytes)
     INK.deflate(bytes) · INK.inflate(bytes) → Promise<Uint8Array> (raw deflate)
     INK.seal(roomB64, obj)            → Promise<body>  b64url(IV ‖ AES-GCM(JSON))
     INK.open(roomB64, body)           → Promise<obj|null>  null if anything is off
     INK.topic(roomB64, projectId)     → Promise<'ink-'+24 hex>
     INK.makeMessage(me, kind, tasks, text, more) → Promise<message>   me.n is bumped
     INK.verifyMessage(msg, keyHex)    → Promise<bool>
     INK.parts(body, msgid)            → [string]       the mailbox chunks
     INK.mailbox(topic)                → {publish, poll, start, stop, since, error}
     INK.messageLink(body) · INK.inviteLink(obj) · INK.readLink(text) → {m}|{ink}|null
     INK.oneThing(tasks) · INK.layout(tasks) · INK.drawSky(svg, tasks, members, opts)
     INK.level(shot, total) · INK.mosaic(cells, level) · INK.nearest(rgb)
     INK.drawSprite(canvas, cells, scale)
     INK.INKS · INK.KING · INK.bump(wanted, taken) · INK.hex(idx)
     INK.SEED · INK.hotContext({name, seed, tasks, scenes, selected, words})
     INK.sampoSeed(id)                 → Promise<int>    §3 the Sampo's seed
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* every tunable value, in one place (CONTRACT §8: KNOBS at the top) */
  const KNOBS = {
    mailbox: 'https://ntfy.sh',          // default road; window.INK_MAILBOX overrides (tests point it at fake_mailbox.py)
    since: '12h',                        // first poll looks back this far (§5)
    pollMs: 4000,                        // poll every 4 s while the page is visible (§5)
    partMax: 3500,                       // a body longer than this is split (§5); ntfy turns >4096 bytes into an attachment
    partsMax: 256,                       // a message of more parts than this is refused (≈ 900 KB)
    partialsMax: 32,                     // unfinished messages kept waiting for their missing parts
    inflateMax: 8 * 1024 * 1024,         // a pasted link may not inflate past this (a zip bomb stops here)
    linkBase: 'https://leevzo.github.io/monomyth-orv/ink.html',
    textMax: 1500, tasksMax: 3,          // §5 message limits
    hotMax: 2048, stateLines: 23, lineMax: 140, wordsMax: 800,   // §7 Orv's hot context
    sky: {                               // §2 the constellation, in SVG user units (≈ px at phone width)
      cols: 5, dx: 72, dy: 84, pad: 32,
      arc: [0, 6, 9, 6, 0],              // the gentle bow of each row, by column on screen
      r: 7, ring: 13, mark: 11, hit: 24, // star, ONE THING ring, selection mark, tap radius (48 px across)
      labelDy: 24, labelMax: 9, font: 11,
      grey: '#8C8C8C', line: '#A6A6A6'   // greys only, R=G=B
    }
  };

  /* the law, verbatim (§7) — never a knob */
  const SEED = "You are Orv, the teasing one-eyed homunculus and Hand. Read before speaking. Surface shapes, don't invent. Guide the King to write. Tease him.";
  const INK_HEX = ['#FF7A12', '#FF12A1', '#FA12FF', '#9212FF', '#2A12FF', '#126EFF',
                   '#12D6FF', '#12FFC2', '#12FF5A', '#22FF12', '#8AFF12', '#F2FF12'];   // §4 the 12 inks, in bump order
  const KING_HEX = '#FFA512';
  const MEMBER_KINDS = ['hello', 'idea', 'say', 'line', 'color'];
  const KING_KINDS = ['say', 'snap'];

  /* ── bytes ─────────────────────────────────────────────────────────── */
  const subtle = () => root.crypto.subtle;
  const utf8 = s => new TextEncoder().encode(String(s));
  const unutf8 = b => new TextDecoder('utf-8', { fatal: true }).decode(b);
  const tohex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  function unhex(h) {
    h = String(h);
    if (h.length % 2 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error('INK: not hex');
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  const bytes = b => (typeof b === 'string' ? utf8(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));
  function join2(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }

  function b64url(b) {
    b = bytes(b); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    const s = String(str);
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('INK: not base64url');
    const bin = root.atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* raw deflate both ways; Python's zlib with wbits=-15 is the same format */
  async function pump(b, stream, max) {
    const reader = new Blob([bytes(b)]).stream().pipeThrough(stream).getReader();
    const chunks = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { try { await reader.cancel(); } catch (e) { /* already gone */ } throw new Error('INK: too big'); }
      chunks.push(value);
    }
    const out = new Uint8Array(n); let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }
  const deflate = b => pump(b, new CompressionStream('deflate-raw'), Infinity);
  const inflate = b => pump(b, new DecompressionStream('deflate-raw'), KNOBS.inflateMax);

  /* ── canon, hashes, signatures (§5, §6) ────────────────────────────── */
  /* Python sorts dict keys by code point; JS sort compares UTF-16 units. They part ways
     above U+FFFF, so compare code points — the vectors decide, not the engine. */
  function byCodePoint(a, b) {
    const A = Array.from(a), B = Array.from(b);
    for (let i = 0; i < A.length && i < B.length; i++) {
      const d = A[i].codePointAt(0) - B[i].codePointAt(0);
      if (d) return d;
    }
    return A.length - B.length;
  }
  /* json.dumps(x, sort_keys=True, separators=(',',':'), ensure_ascii=False), no floats.
     JSON.stringify escapes a string exactly as Python does with ensure_ascii=False. */
  function canon(x) {
    if (x === null) return 'null';
    if (x === true || x === false) return String(x);
    if (typeof x === 'number') {
      if (!Number.isSafeInteger(x)) throw new Error('canon: no floats (or ints past 2^53)');
      return String(x);
    }
    if (typeof x === 'string') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if (typeof x === 'object') {
      const keys = Object.keys(x).filter(k => x[k] !== undefined).sort(byCodePoint);
      return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    }
    throw new Error('canon: cannot carry a ' + typeof x);
  }

  async function sha256hex(s) { return tohex(new Uint8Array(await subtle().digest('SHA-256', bytes(s)))); }

  async function hmac32(keyHex, obj) {
    const key = await subtle().importKey('raw', unhex(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return tohex(new Uint8Array(await subtle().sign('HMAC', key, utf8(canon(obj))))).slice(0, 32);
  }

  /* §3: the Sampo's seed for an inkling — int(sha256(id)[:8], 16) % 2147483647 */
  async function sampoSeed(id) { return parseInt((await sha256hex(String(id))).slice(0, 8), 16) % 2147483647; }

  /* ── the room key: AES-GCM, 12-byte IV in front (§5) ───────────────── */
  async function roomKey(roomB64) {
    const raw = unb64url(roomB64);
    if (raw.length !== 32) throw new Error('INK: a room key is 32 bytes');
    return subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function seal(roomB64, obj) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await roomKey(roomB64), utf8(JSON.stringify(obj))));
    return b64url(join2(iv, ct));
  }
  /* null, never a throw: a stranger's bytes, a wrong key and one flipped bit all look the same */
  async function open(roomB64, body) {
    try {
      const b = unb64url(body);
      if (b.length < 12 + 16) return null;
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await roomKey(roomB64), b.subarray(12));
      return JSON.parse(unutf8(new Uint8Array(pt)));
    } catch (e) { return null; }
  }

  /* §5: topic = 'ink-' + first 24 hex of sha256(room key bytes ‖ project id) */
  async function topic(roomB64, projectId) { return 'ink-' + (await sha256hex(join2(unb64url(roomB64), utf8(projectId)))).slice(0, 24); }

  /* ── messages (§5) ─────────────────────────────────────────────────── */
  const cut = (s, n) => { const a = Array.from(String(s)); return a.length <= n ? String(s) : a.slice(0, n).join(''); };
  const clip = (s, n) => { const a = Array.from(String(s)); return a.length <= n ? String(s) : a.slice(0, n - 1).join('') + '…'; };
  const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  /* me = {p, from, key, n}: the caller keeps `me` and saves it after every call.
     me.n is the LAST n this sender used (0 before the first), so n runs 1, 2, 3… and is never reused.
     more = extra fields, signed with the rest: {c} for 'color', {ai:'<door>'} for a sent Orv reply,
     {snap:{…}} for the King's snap. The King (from 'k') signs only if he has a key (Phase 1: §5). */
  async function makeMessage(me, kind, tasks, text, more) {
    const king = me.from === 'k';
    if (!(king ? KING_KINDS : MEMBER_KINDS).includes(kind)) throw new Error('makeMessage: no kind ' + kind);
    me.n = (Number.isSafeInteger(me.n) && me.n > 0 ? me.n : 0) + 1;
    const m = Object.assign({}, more || {}, {
      v: 1, p: String(me.p), from: String(me.from), n: me.n, at: isoNow(), k: kind,
      tasks: (tasks || []).slice(0, KNOBS.tasksMax).map(String), text: cut(text == null ? '' : text, KNOBS.textMax)
    });
    delete m.sig;
    if (me.key) m.sig = await hmac32(me.key, m);
    return m;
  }

  function shapeOk(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    if (m.v !== 1 || typeof m.p !== 'string' || typeof m.at !== 'string') return false;
    if (!(m.from === 'k' || /^m[1-9][0-9]*$/.test(m.from))) return false;
    if (!Number.isSafeInteger(m.n) || m.n < 1) return false;
    if (!(m.from === 'k' ? KING_KINDS : MEMBER_KINDS).includes(m.k)) return false;
    if (!Array.isArray(m.tasks) || m.tasks.length > KNOBS.tasksMax || !m.tasks.every(t => typeof t === 'string')) return false;
    if (typeof m.text !== 'string' || Array.from(m.text).length > KNOBS.textMax) return false;
    if (m.k === 'color' && !(Number.isSafeInteger(m.c) && m.c >= 0 && m.c < 333)) return false;
    return true;
  }
  function sameHex(a, b) {          // constant time, so a guesser learns nothing from the clock
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }
  /* a member's message needs that member's key and a right sig. A King's message ('k') with no key
     given is trusted on the room key alone — it only got here by opening under the room key (§5,
     Phase 1; Phase 2 is ECDSA). So the desk must ignore 'k' messages that arrive by mailbox. */
  async function verifyMessage(msg, keyHex) {
    if (!shapeOk(msg)) return false;
    if (msg.from === 'k' && !keyHex) return true;
    if (!keyHex || typeof msg.sig !== 'string') return false;
    const body = Object.assign({}, msg); delete body.sig;
    try { return sameHex(await hmac32(keyHex, body), msg.sig); } catch (e) { return false; }
  }

  /* ── the mailbox (§5, §9) ──────────────────────────────────────────── */
  /* a long body goes as parts '<msgid>|<i>/<n>|<slice>', i from 1. A whole body never holds
     '|' (base64url has none), so a '|' is how a reader knows it has a part. */
  function parts(body, msgid) {
    body = String(body); msgid = String(msgid);
    if (body.length <= KNOBS.partMax) return [body];
    if (!/^[^|]{1,64}$/.test(msgid)) throw new Error('INK: a msgid has no | and is ≤ 64 chars');
    const n = Math.ceil(body.length / KNOBS.partMax);
    if (n > KNOBS.partsMax) throw new Error('INK: too many parts');
    const out = [];
    for (let i = 0; i < n; i++) out.push(msgid + '|' + (i + 1) + '/' + n + '|' + body.slice(i * KNOBS.partMax, (i + 1) * KNOBS.partMax));
    return out;
  }
  /* feed one mailbox message in; get the whole body back when it is complete, else null */
  function gather(waiting, text) {
    const m = /^([^|]{1,64})\|([0-9]{1,4})\/([0-9]{1,4})\|/.exec(text);
    if (!m) return text.indexOf('|') < 0 ? text : null;
    const id = m[1], i = +m[2], n = +m[3];
    if (n < 1 || n > KNOBS.partsMax || i < 1 || i > n) return null;
    let w = waiting.get(id);
    if (!w || w.n !== n) { w = { n, got: new Map() }; waiting.delete(id); waiting.set(id, w); }
    w.got.set(i, text.slice(m[0].length));
    while (waiting.size > KNOBS.partialsMax) waiting.delete(waiting.keys().next().value);   // the oldest waits longest; it goes first
    if (w.got.size < n) return null;
    waiting.delete(id);
    let whole = '';
    for (let k = 1; k <= n; k++) whole += w.got.get(k);
    return whole;
  }
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  /* one mailbox per topic. box.since is the last message id seen; save it if the page should
     not re-read old mail after a reload. start(onBody) calls onBody(sealedBody) per whole body. */
  function mailbox(top) {
    if (!/^ink-[0-9a-f]{24}$/.test(String(top))) throw new Error('INK: not a topic');
    const base = () => String(root.INK_MAILBOX || KNOBS.mailbox).replace(/\/+$/, '');
    const waiting = new Map();
    const box = { topic: top, since: KNOBS.since, timer: null, error: '' };
    box.publish = async (body, msgid) => {
      for (const p of parts(body, msgid)) {
        const r = await fetch(base() + '/' + top, { method: 'POST', body: p });
        if (!r.ok) throw new Error('mailbox said ' + r.status);
      }
    };
    box.poll = async () => {
      const r = await fetch(base() + '/' + top + '/json?poll=1&since=' + encodeURIComponent(box.since));
      if (!r.ok) throw new Error('mailbox said ' + r.status);
      const out = [];
      for (const line of (await r.text()).split('\n')) {
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
        if (!ev || ev.event !== 'message' || typeof ev.message !== 'string') continue;
        if (typeof ev.id === 'string' && ev.id) box.since = ev.id;
        const whole = gather(waiting, ev.message);
        if (whole != null) out.push(whole);
      }
      return out;
    };
    box.start = onBody => {
      box.stop();
      const tick = async () => {
        if (visible()) {
          try { (await box.poll()).forEach(b => onBody(b)); box.error = ''; } catch (e) { box.error = String(e && e.message || e); }
        }
        if (box.timer !== null) box.timer = setTimeout(tick, KNOBS.pollMs);
      };
      box.timer = setTimeout(tick, 0);
      return box;
    };
    box.stop = () => { if (box.timer !== null) clearTimeout(box.timer); box.timer = null; };
    return box;
  }

  /* ── links, by hand (§5) ───────────────────────────────────────────── */
  /* #m=  carries one sealed mailbox body (unreadable without the room key).
     #ink= carries an invite (it holds keys: it is sealed by nothing, so it goes by hand only). */
  async function messageLink(body) { return KNOBS.linkBase + '#m=' + b64url(await deflate(utf8(body))); }
  async function inviteLink(invite) { return KNOBS.linkBase + '#ink=' + b64url(await deflate(utf8(JSON.stringify(invite)))); }
  async function readLink(text) {
    const s = String(text || '').trim(), at = s.indexOf('#');
    const m = /^(m|ink)=([A-Za-z0-9_-]+)$/.exec(at >= 0 ? s.slice(at + 1) : s);
    if (!m) return null;
    try {
      const t = unutf8(await inflate(unb64url(m[2])));
      return m[1] === 'm' ? { m: t } : { ink: JSON.parse(t) };
    } catch (e) { return null; }
  }

  /* ── THE 333 and the inks (§1, §4) ─────────────────────────────────── */
  let RGB = null;
  function pal() {
    const P = root.P333;
    if (!P || !Array.isArray(P.flat) || P.flat.length !== 333) throw new Error('INK: load palette333.js first');
    if (!RGB) RGB = P.flat.map(h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)));
    return P;
  }
  const hex = idx => (Number.isInteger(idx) && idx >= 0 && idx < 333 ? pal().flat[idx] : null);
  const indexOfHex = h => { const i = pal().flat.indexOf(h); if (i < 0) throw new Error('INK: ' + h + ' is not in THE 333'); return i; };

  /* §4: a clash is bumped to the next free ink of the 12, in the order above, wrapping round.
     An ink outside the 12 starts the search at the first. null when all 12 are held. */
  function bump(wanted, taken) {
    const inks = INK.INKS, held = new Set(taken || []);
    const start = Math.max(0, inks.indexOf(wanted));
    for (let k = 0; k < inks.length; k++) { const c = inks[(start + k) % inks.length]; if (!held.has(c)) return c; }
    return null;
  }

  /* ── the constellation (§2) ────────────────────────────────────────── */
  /* story order = the order of tasks.json. `after` only draws lines; it never moves a star. */
  const oneThing = tasks => (tasks || []).find(t => !t.done) || null;

  /* rows of 5, left to right, then right to left (a serpentine), each row bowed gently.
     Pure arithmetic on the index: the same tasks always land in the same places. */
  function layout(tasks) {
    const K = KNOBS.sky, list = tasks || [], stars = [], at = new Map();
    list.forEach((t, i) => {
      const row = Math.floor(i / K.cols), col = i % K.cols, c = row % 2 ? K.cols - 1 - col : col;
      const s = { id: t.id, i, x: K.pad + c * K.dx, y: K.pad + row * K.dy + K.arc[c] };
      stars.push(s);
      if (!at.has(t.id)) at.set(t.id, s);
    });
    const lines = [];
    list.forEach((t, i) => (t.after || []).forEach(a => {
      const f = at.get(a), s = stars[i];
      if (f && f !== s) lines.push({ from: a, to: t.id, x1: f.x, y1: f.y, x2: s.x, y2: s.y });
    }));
    const rows = Math.max(1, Math.ceil(list.length / K.cols));
    return { w: 2 * K.pad + (K.cols - 1) * K.dx, h: 2 * K.pad + (rows - 1) * K.dy + Math.max.apply(null, K.arc) + K.labelDy, stars, lines };
  }

  /* draws into an <svg>. Done = filled in the doer's ink, open = grey outline, the ONE THING
     wears a ring in the King's ink, labels are SVG text (never HTML). Tap a star to select it;
     the 4th tap lets go of the oldest. opts = {selected:[ids], onSelect(ids)}.
     Returns sky: sky.draw(tasks?, members?) to redraw, sky.selected is the current pick. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function drawSky(svg, tasks, members, opts) {
    opts = opts || {};
    const sky = { tasks: tasks || [], members: members || [], selected: (opts.selected || []).slice(-KNOBS.tasksMax) };
    sky.toggle = id => {
      const i = sky.selected.indexOf(id);
      if (i >= 0) sky.selected.splice(i, 1); else sky.selected.push(id);
      while (sky.selected.length > KNOBS.tasksMax) sky.selected.shift();
      sky.draw();
      if (opts.onSelect) opts.onSelect(sky.selected.slice());
    };
    sky.draw = (t, m) => { if (t) sky.tasks = t; if (m) sky.members = m; paintSky(svg, sky); return sky; };
    return sky.draw();
  }
  function paintSky(svg, sky) {
    const K = KNOBS.sky, doc = svg.ownerDocument || document, L = layout(sky.tasks);
    const mk = (tag, attrs, parent) => {
      const e = doc.createElementNS(SVGNS, tag);
      for (const k in attrs) e.setAttribute(k, String(attrs[k]));
      if (parent) parent.appendChild(e);
      return e;
    };
    const inkOf = who => {
      const mem = (sky.members || []).find(x => x.id === who);
      return hex(mem && Number.isInteger(mem.color) ? mem.color : INK.KING) || KING_HEX;
    };
    const ids = new Set(sky.tasks.map(t => t.id));
    sky.selected = sky.selected.filter(id => ids.has(id));
    const one = oneThing(sky.tasks);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + L.w + ' ' + L.h);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
    const thin = { 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', fill: 'none' };
    L.lines.forEach(l => mk('line', Object.assign({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, stroke: K.line }, thin), svg));
    L.stars.forEach(s => {
      const t = sky.tasks[s.i], word = String(t.word || 'beat'), picked = sky.selected.indexOf(t.id) >= 0;
      const g = mk('g', { role: 'button', tabindex: 0, 'aria-pressed': picked, 'data-id': t.id,
        'aria-label': word + (t.done ? ', done' : ', open') + (one === t ? ', the one thing' : ''), style: 'cursor:pointer' }, svg);
      mk('title', {}, g).textContent = word + ' — ' + String(t.text || '');
      mk('circle', { cx: s.x, cy: s.y, r: K.hit, fill: 'transparent', 'pointer-events': 'all' }, g);
      if (one === t) mk('circle', Object.assign({ cx: s.x, cy: s.y, r: K.ring, stroke: hex(INK.KING) }, thin), g);
      if (t.done) mk('circle', { cx: s.x, cy: s.y, r: K.r, fill: inkOf(t.who) }, g);
      else mk('circle', Object.assign({ cx: s.x, cy: s.y, r: K.r, stroke: K.grey }, thin), g);
      if (picked) mk('line', Object.assign({ x1: s.x - K.mark, y1: s.y + K.labelDy + 4, x2: s.x + K.mark, y2: s.y + K.labelDy + 4, stroke: 'currentColor' }, thin), g);
      mk('text', { x: s.x, y: s.y + K.labelDy, 'text-anchor': 'middle', 'font-size': K.font, fill: 'currentColor',
        'font-weight': picked ? 700 : 400 }, g).textContent = clip(word, K.labelMax);
      g.addEventListener('click', () => sky.toggle(t.id));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault && e.preventDefault(); sky.toggle(t.id); } });
    });
  }

  /* ── the sprite that sharpens (§3, §11) ────────────────────────────── */
  /* level = min(6, floor(shot/total × 7)), in whole numbers so no float lands a frame early */
  function level(shot, total) {
    shot = Math.max(0, shot | 0); total = total | 0;
    return total > 0 ? Math.min(6, Math.floor(shot * 7 / total)) : 0;
  }
  /* nearest THE 333 colour by squared RGB distance; a tie goes to the lower index (§11) */
  const NEAR = new Map();
  function nearest(rgb) {
    pal();
    const key = rgb[0] * 65536 + rgb[1] * 256 + rgb[2];
    if (NEAR.has(key)) return NEAR.get(key);
    let best = 0, bestD = Infinity;
    for (let i = 0; i < RGB.length; i++) {
      const c = RGB[i], d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    NEAR.set(key, best);
    return best;
  }
  /* the same as mosaic() in fixtures/make_vectors.py, line for line: block = 64 >> level;
     a block is the floor of the mean RGB of its opaque cells, snapped; transparent when
     opaque × 2 < cells. -1 is transparent. */
  function mosaic(cells, lvl) {
    pal();
    const size = cells.length, L = Math.min(6, Math.max(0, lvl | 0));
    const b = size === 64 ? Math.max(1, 64 >> L) : Math.max(1, size >> L);
    const out = [];
    for (let y = 0; y < size; y++) out.push(new Array(size).fill(-1));
    for (let by = 0; by < size; by += b) for (let bx = 0; bx < size; bx += b) {
      let n = 0, op = 0, r = 0, g = 0, bl = 0;
      for (let y = by; y < by + b; y++) for (let x = bx; x < bx + b; x++) {
        n++; const p = cells[y][x];
        if (p >= 0) { op++; r += RGB[p][0]; g += RGB[p][1]; bl += RGB[p][2]; }
      }
      if (op * 2 < n) continue;
      const c = nearest([Math.floor(r / op), Math.floor(g / op), Math.floor(bl / op)]);
      for (let y = by; y < by + b; y++) for (let x = bx; x < bx + b; x++) out[y][x] = c;
    }
    return out;
  }
  /* integer scale only, runs of one colour as one rect, smoothing off: pixels stay pixels */
  function drawSprite(canvas, cells, scale) {
    const s = Math.max(1, Math.floor(scale || 1)), size = cells.length;
    canvas.width = size * s; canvas.height = size * s;
    if (canvas.style) canvas.style.imageRendering = 'pixelated';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < size; y++) {
      let x = 0;
      while (x < size) {
        const p = cells[y][x]; let run = 1;
        while (x + run < size && cells[y][x + run] === p) run++;
        if (p >= 0) { ctx.fillStyle = hex(p); ctx.fillRect(x * s, y * s, run * s, s); }
        x += run;
      }
    }
    return canvas;
  }

  /* ── Orv's hot context (§7) ────────────────────────────────────────── */
  /* o = {name, seed, tasks, scenes, selected:[ids], words}. Order is the law: the seed verbatim,
     the carrying line, ≤ 23 state lines (ONE THING, open tasks, counts), the selected tasks, the
     user's words last. Over 2048: open-task lines go first (from the end), then the words are cut. */
  function hotContext(o) {
    o = o || {};
    const tasks = o.tasks || [], scenes = o.scenes || [], line = t => clip(String(t.word || 'beat') + ' — ' + String(t.text || ''), KNOBS.lineMax);
    const head = [SEED, clip('You are carrying ' + String(o.name || 'an inkling') + '.' + (o.seed ? ' Its sealed seed: ' + o.seed : ''), KNOBS.lineMax * 2)];
    const one = oneThing(tasks), done = tasks.filter(t => t.done).length;
    const counts = [tasks.length ? done + ' of ' + tasks.length + ' tasks done.' : 'No tasks yet.'];
    if (scenes.length) counts.push(scenes.filter(s => s.shot).length + ' of ' + scenes.length + ' scenes shot.');
    const first = one ? ['THE ONE THING: ' + line(one)] : [];
    let open = tasks.filter(t => !t.done && t !== one).map(line).slice(0, KNOBS.stateLines - first.length - counts.length);
    const sel = (o.selected || []).map(id => tasks.find(t => t.id === id)).filter(Boolean).slice(0, KNOBS.tasksMax).map(t => 'Selected: ' + line(t));
    let words = cut(String(o.words || '').trim(), KNOBS.wordsMax);
    const build = () => head.concat(first, open, counts, sel, words ? [words] : []).join('\n');
    let s = build();
    while (s.length > KNOBS.hotMax && open.length) { open = open.slice(0, -1); s = build(); }
    if (s.length > KNOBS.hotMax && words) {
      const room = KNOBS.hotMax - (s.length - words.length);
      words = room > 0 ? words.slice(0, room) : '';
      s = build();
    }
    if (s.length > KNOBS.hotMax) s = s.slice(0, KNOBS.hotMax);
    if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);      // never end on half a character
    return s;
  }

  const INK = {
    KNOBS, SEED, INK_HEX, KING_HEX,
    canon, sha256hex, hmac32, sampoSeed,
    b64url, unb64url, utf8, unutf8, deflate, inflate,
    seal, open, topic,
    makeMessage, verifyMessage,
    parts, mailbox, messageLink, inviteLink, readLink,
    oneThing, layout, drawSky,
    level, nearest, mosaic, drawSprite,
    hex, bump, hotContext
  };
  /* the inks are THE 333 indices, found by colour, so they can never drift from the palette */
  Object.defineProperty(INK, 'INKS', { enumerable: true, get: () => INK_HEX.map(indexOfHex) });
  Object.defineProperty(INK, 'KING', { enumerable: true, get: () => indexOfHex(KING_HEX) });

  root.INK = INK;
  if (typeof module === 'object' && module && module.exports) module.exports = INK;
})(typeof window !== 'undefined' ? window : globalThis);

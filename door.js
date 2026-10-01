/* door.js — the doors, lifted verbatim from index.html (Orv) so From the Desk talks through the same key.
   Needs, defined before it: K.timeoutMs, BOX, load(k,d), store(k,v), box(). */
const DOORS = {
  groq:       { list: 'https://api.groq.com/openai/v1/models', chat: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { list: 'https://openrouter.ai/api/v1/models', chat: 'https://openrouter.ai/api/v1/chat/completions' },
  xai:        { list: 'https://api.x.ai/v1/models', chat: 'https://api.x.ai/v1/chat/completions' },
  openai:     { list: 'https://api.openai.com/v1/models', chat: 'https://api.openai.com/v1/chat/completions' },
  anthropic:  { list: 'https://api.anthropic.com/v1/models?limit=100', chat: 'https://api.anthropic.com/v1/messages' },
  gemini:     { list: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', chat: 'https://generativelanguage.googleapis.com/v1beta/models/' }
};
function fetchT(url, init) { const c = new AbortController(), t = setTimeout(() => c.abort(), K.timeoutMs);
  return fetch(url, Object.assign({}, init, { signal: c.signal, referrerPolicy: 'no-referrer' })).finally(() => clearTimeout(t)); }
function headers(d, key) {
  if (d === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (d === 'gemini') return { 'content-type': 'application/json', 'x-goog-api-key': key };
  return { 'content-type': 'application/json', authorization: 'Bearer ' + key };
}
async function model(d, key, avoid) {
  const b = box(), named = String(((b.models || {})[d]) || '') || String((((b.lists || {})[d]) || {}).pick || '');
  if (named && named !== avoid) return named;
  const kept = load('orv.model', {}); if (kept[d] && kept[d] !== avoid) return kept[d];
  const o = await (await fetchT(DOORS[d].list, { headers: headers(d, key) })).json();
  let ids = d === 'gemini' ? (o.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''))
                           : (o.data || []).map(m => String(m.id));
  ids = ids.filter(id => !/whisper|tts|embed|guard|image|audio|vision|search|realtime|transcribe|moderation|veo|imagen|live/i.test(id));
  if (avoid) ids = ids.filter(id => id !== avoid);
  if (!ids.length) throw new Error('that door listed no models');
  if (d === 'gemini') {   // the newest plain flash: fast, free, not a preview
    const ver = id => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(id) || [0, 0])[1]);
    const flash = ids.filter(id => /^gemini-[\d.]+-flash(-\d+)?$/.test(id)).sort((a, z) => ver(z) - ver(a));
    const g = flash[0] || ids.find(id => /flash/i.test(id) && !/preview|exp/i.test(id)) || ids.find(id => /flash/i.test(id)) || ids[0];
    kept[d] = g; store('orv.model', kept); return g;
  }
  // a fast, able model, chosen from the door's own list (never a name fixed in this code)
  const prefer = [/llama-3\.3-70b|gpt-oss-120b|qwen3|kimi|llama-4/i, /sonnet|flash|mini|70b/i];
  const pick = (prefer.map(re => ids.find(id => re.test(id))).find(Boolean)) || ids[0];
  kept[d] = pick; store('orv.model', kept); return pick;
}
function doorError(r, o) { const e = o && o.error, msg = typeof e === 'string' ? e : (e && e.message) || (o && o.message) || 'status ' + r.status;
  const x = new Error(msg); x.status = r.status; return x; }
/* one answer: if the door is busy, slow or the model is gone, try once more with another model */
async function answer(d, key, sys, turns) {
  const m = await model(d, key);
  try { return { m, text: await call(d, key, m, sys, turns) }; }
  catch (e) {
    if (e.status === 401 || e.status === 403) throw e;
    const kept = load('orv.model', {}); delete kept[d]; store('orv.model', kept);
    await new Promise(r => setTimeout(r, 1200));
    const m2 = await model(d, key, m);
    return { m: m2, text: await call(d, key, m2, sys, turns) };
  }
}
const plainWhy = e => e && e.name === 'AbortError' ? 'it took too long' : String((e && e.message) || e).slice(0, 160);
async function call(d, key, m, system, turns) {
  if (d === 'anthropic') {
    const body = { model: m, max_tokens: 4096, system, messages: turns, output_config: { effort: 'low' } };
    let r = await fetchT(DOORS.anthropic.chat, { method: 'POST', headers: headers(d, key), body: JSON.stringify(body) });
    if (r.status === 400) { delete body.output_config; r = await fetchT(DOORS.anthropic.chat, { method: 'POST', headers: headers(d, key), body: JSON.stringify(body) }); }
    const o = await r.json().catch(() => ({})); if (!r.ok) throw doorError(r, o);
    return (o.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  }
  if (d === 'gemini') {
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } };
    const go = () => fetchT(DOORS.gemini.chat + encodeURIComponent(m) + ':generateContent', { method: 'POST', headers: headers(d, key), body: JSON.stringify(body) });
    let r = await go();
    if (r.status === 400) { delete body.generationConfig.thinkingConfig; r = await go(); }
    const o = await r.json().catch(() => ({})); if (!r.ok) throw doorError(r, o);
    return ((((o.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
  }
  const body = { model: m, messages: [{ role: 'system', content: system }].concat(turns), temperature: 0.6, response_format: { type: 'json_object' } };
  let r = await fetchT(DOORS[d].chat, { method: 'POST', headers: headers(d, key), body: JSON.stringify(body) });
  if (r.status === 400) { delete body.response_format; r = await fetchT(DOORS[d].chat, { method: 'POST', headers: headers(d, key), body: JSON.stringify(body) }); }
  const o = await r.json().catch(() => ({})); if (!r.ok) throw doorError(r, o);
  return ((o.choices || [])[0] || {}).message ? o.choices[0].message.content || '' : '';
}


/* who the key belongs to, and whether its door is open (also from index.html) */
const doorOf = k => { k = String(k || '').trim();
  if (k.startsWith('gsk_')) return 'groq'; if (k.startsWith('sk-ant-')) return 'anthropic'; if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('xai-')) return 'xai'; if (k.startsWith('AIza')) return 'gemini'; if (k.startsWith('sk-')) return 'openai'; return null; };
const keyDoor = () => { const b = box(); return b.door || doorOf(b.apiKey); };
const paidOpen = d => K.freeDoors.includes(d) || !!(load('orv.paid', {})[d]);

import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = 3567;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dir, 'public')));

// ── DB (flat JSON files) ─────────────────────────────────────────────────
const DB_SCRIPTS = join(__dir, 'data', 'scripts.json');
const DB_KEYS    = join(__dir, 'data', 'keys.json');
const DB_STATS   = join(__dir, 'data', 'stats.json');

function readDB(path, def={}) { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : def; }
function writeDB(path, data) { writeFileSync(path, JSON.stringify(data, null, 2)); }

let scripts = readDB(DB_SCRIPTS, {});
let keys    = readDB(DB_KEYS, {});
let stats   = readDB(DB_STATS, { blocked: 0 });

function saveScripts() { writeDB(DB_SCRIPTS, scripts); }
function saveKeys()    { writeDB(DB_KEYS, keys); }
function saveStats()   { writeDB(DB_STATS, stats); }
function incBlocked()  { stats.blocked = (stats.blocked||0)+1; saveStats(); }

// ── Denied Lua GUI (shown in Roblox when key is invalid) ──────────────────
const DENIED_LUA = (reason='Invalid or expired key.') => `-- [[ 0.6xd Protection V2 | ACCESS DENIED ]]
local _r="${reason.replace(/"/g,"'")}"
pcall(function()
  local sg=Instance.new("ScreenGui")
  sg.Name="xd_denied" sg.ResetOnSpawn=false
  local ok,_=pcall(function()sg.Parent=game:GetService("CoreGui")end)
  if not ok then sg.Parent=game.Players.LocalPlayer.PlayerGui end
  local bg=Instance.new("Frame",sg)
  bg.Size=UDim2.new(0,440,0,190)
  bg.Position=UDim2.new(0.5,-220,0.5,-95)
  bg.BackgroundColor3=Color3.fromRGB(8,8,18)
  bg.BorderSizePixel=0
  Instance.new("UICorner",bg).CornerRadius=UDim.new(0,16)
  local stroke=Instance.new("UIStroke",bg)
  stroke.Color=Color3.fromRGB(124,58,237) stroke.Thickness=2
  local t=Instance.new("TextLabel",bg)
  t.Size=UDim2.new(1,0,0,50) t.Position=UDim2.new(0,0,0,18)
  t.BackgroundTransparency=1 t.Text="\xF0\x9F\x94\x92  0.6xd Protection"
  t.TextColor3=Color3.fromRGB(167,139,250) t.TextSize=20
  t.Font=Enum.Font.GothamBold t.TextXAlignment=Enum.TextXAlignment.Center
  local m=Instance.new("TextLabel",bg)
  m.Size=UDim2.new(1,-40,0,50) m.Position=UDim2.new(0,20,0,72)
  m.BackgroundTransparency=1 m.Text="ACCESS DENIED\n".._r
  m.TextColor3=Color3.fromRGB(239,68,68) m.TextSize=14
  m.Font=Enum.Font.Gotham m.TextWrapped=true
  m.TextXAlignment=Enum.TextXAlignment.Center
  local sub=Instance.new("TextLabel",bg)
  sub.Size=UDim2.new(1,0,0,24) sub.Position=UDim2.new(0,0,0,145)
  sub.BackgroundTransparency=1 sub.Text="Get a valid key at 06xdprotect.com"
  sub.TextColor3=Color3.fromRGB(100,116,139) sub.TextSize=12
  sub.Font=Enum.Font.Gotham sub.TextXAlignment=Enum.TextXAlignment.Center
  task.delay(7,function()pcall(function()sg:Destroy()end)end)
end)
error("[0.6xd Protection] ".._r, 0)`;

// ── Obfuscator ───────────────────────────────────────────────────────────
function obfuscate(src) {
    const XOR = Math.floor(Math.random() * 200) + 30;
    const b64xor = (s) => Buffer.from(s.split('').map(c=> String.fromCharCode(c.charCodeAt(0)^XOR)).join(''), 'binary').toString('base64');

    const strTable = [];
    let idx = 0;
    let p = src.replace(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g, (m, d, s) => {
        const raw = d !== undefined ? d : s;
        if (!raw.length) return m;
        strTable.push(b64xor(raw));
        return `_S[${++idx}]`;
    });
    p = p.replace(/\b(\d{3,})\b/g, (m, n) => {
        const num = parseInt(n); if (isNaN(num)) return m;
        const a = Math.floor(Math.random()*400)+50;
        return `(${num+a}-${a})`;
    });
    const encoded = b64xor(p);
    const tbl = strTable.map((v,i) => `[${i+1}]="${v}"`).join(',');
    return `-- [[ 0.6xd Protection V2 | Galactic ]]
local _K=${XOR}
local _T={${tbl}}
local _S=setmetatable({},{__index=function(_,k)
  local e=_T[k] if not e then return "" end
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  e=e:gsub('[^'..b..'=]','') local o,pd={},e:match('(=*)$'):len() e=e:gsub('=','A')
  for i=1,#e,4 do local n=0 for j=0,3 do n=n*(64)+(b:find(e:sub(i+j,i+j))-1) end
  for j=2,0,-1 do table.insert(o,string.char(math.floor(n/256^j)%256)) end end
  for i=1,pd do o[#o]=nil end local r={}
  for _,c in ipairs(o) do table.insert(r,string.char(c:byte()~_K)) end
  return table.concat(r)
end})
local _E="${encoded}"
local function _D(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  s=s:gsub('[^'..b..'=]','') local o,pd={},s:match('(=*)$'):len() s=s:gsub('=','A')
  for i=1,#s,4 do local n=0 for j=0,3 do n=n*64+(b:find(s:sub(i+j,i+j))-1) end
  for j=2,0,-1 do table.insert(o,string.char(math.floor(n/256^j)%256)) end end
  for i=1,pd do o[#o]=nil end local r={}
  for _,c in ipairs(o) do table.insert(r,string.char(c:byte()~_K)) end return table.concat(r)
end
loadstring(_D(_E))()`;
}

function makeLoader(script, key='YOUR-KEY-HERE', style='minimal') {
    const id = script.id;
    const keyLine = `local _key = "${key}"`;
    if (style === 'verbose') return `-- [[ 0.6xd Protection Loader | ${script.name} ]]\n${keyLine}\nlocal _id = "${id}"\nlocal http = game:GetService("HttpService")\nprint("[0.6xd] Validating key...")\nlocal ok = http:GetAsync("http://localhost:${PORT}/v1/validate/".._id.."/".._key)\nif ok ~= "VALID" then error("[0.6xd] Invalid or expired key.") end\nprint("[0.6xd] Key valid. Loading...")\nloadstring(http:GetAsync("http://localhost:${PORT}/v1/load/".._id.."/".._key))()\nprint("[0.6xd] Done.")`;
    if (style === 'silent') return `${keyLine}\nloadstring(game:HttpGet("http://localhost:${PORT}/v1/load/${id}/".._key))()`;
    return `-- [[ 0.6xd Protection | ${script.name} ]]\n${keyLine}\nlocal _id = "${id}"\nlocal http = game:GetService("HttpService")\nassert(http:GetAsync("http://localhost:${PORT}/v1/validate/".._id.."/".._key)=="VALID","[0.6xd] Invalid key.")\nloadstring(http:GetAsync("http://localhost:${PORT}/v1/load/".._id.."/".._key))()`;
}

function genId()  { return 'sc_' + Math.random().toString(36).slice(2, 10); }
function genKey() { const seg = () => Math.random().toString(36).toUpperCase().slice(2,6).padEnd(4,'X'); return `KEY-${seg()}-${seg()}-${seg()}`; }

// ── API Routes ───────────────────────────────────────────────────────────

// Upload & protect a script
app.post('/v1/protect', upload.single('script'), (req, res) => {
    const src = req.file?.buffer?.toString('utf8') || req.body?.source;
    if (!src) return res.status(400).json({ error: 'No source provided' });
    const name = req.body.name || req.file?.originalname?.replace(/\.lua$/, '') || 'script';
    const prot = req.body.protection || 'galactic';
    const id = genId();
    const protected_src = prot === 'none' ? src : obfuscate(src);
    const protLabel = prot === 'galactic' ? 'Galactic V2' : prot === 'max' ? 'Max' : prot === 'none' ? 'None' : 'Standard';
    const script = { id, name, protection: protLabel, added: Date.now(), keyCount: 0, src: protected_src };
    scripts[id] = script;
    saveScripts();
    res.json({ id, name, loader: makeLoader(script), message: 'Script protected successfully.' });
});

// Get all scripts
app.get('/v1/scripts', (req, res) => {
    res.json(Object.values(scripts).map(s => ({ id: s.id, name: s.name, protection: s.protection, added: s.added, keyCount: s.keyCount })));
});

// Get loader for a script
app.get('/v1/scripts/:id/loader', (req, res) => {
    const s = scripts[req.params.id];
    if (!s) return res.status(404).json({ error: 'Script not found' });
    const style = req.query.style || 'minimal';
    const key = req.query.key || 'YOUR-KEY-HERE';
    res.type('text/plain').send(makeLoader(s, key, style));
});

// Delete script
app.delete('/v1/scripts/:id', (req, res) => {
    if (!scripts[req.params.id]) return res.status(404).json({ error: 'Not found' });
    delete scripts[req.params.id];
    saveScripts();
    // also remove keys for this script
    Object.keys(keys).forEach(k => { if (keys[k].scriptId === req.params.id) delete keys[k]; });
    saveKeys();
    res.json({ ok: true });
});

// Validate a key
app.get('/v1/validate/:scriptId/:key', (req, res) => {
    const { scriptId, key } = req.params;
    const k = keys[key];
    if (!k) { incBlocked(); return res.type('text/plain').send('INVALID_KEY'); }
    if (k.scriptId !== scriptId) { incBlocked(); return res.type('text/plain').send('WRONG_SCRIPT'); }
    if (k.expires && Date.now() > k.expires) { incBlocked(); return res.type('text/plain').send('EXPIRED'); }
    k.execs = (k.execs || 0) + 1;
    k.lastUsed = Date.now();
    saveKeys();
    res.type('text/plain').send('VALID');
});

// Load protected script (key-gated)
app.get('/v1/load/:scriptId/:key', (req, res) => {
    const { scriptId, key } = req.params;
    const k = keys[key];
    if (!k || k.scriptId !== scriptId) { incBlocked(); return res.type('text/plain').send(DENIED_LUA('Invalid key.')); }
    if (k.expires && Date.now() > k.expires) { incBlocked(); return res.type('text/plain').send(DENIED_LUA('Key expired.')); }
    const s = scripts[scriptId];
    if (!s) return res.status(404).type('text/plain').send(DENIED_LUA('Script not found.'));
    k.execs = (k.execs || 0) + 1; // count load as execution
    k.lastUsed = Date.now();
    saveKeys();
    res.type('text/plain').send(s.src);
});

// Generate a key
app.post('/v1/keys/generate', (req, res) => {
    const { scriptId, expiresIn, note, hwid } = req.body;
    if (!scripts[scriptId]) return res.status(404).json({ error: 'Script not found' });
    const key = genKey();
    const expires = expiresIn ? Date.now() + expiresIn * 1000 : null;
    keys[key] = { key, scriptId, scriptName: scripts[scriptId].name, expires, note: note||null, hwid: hwid||null, execs: 0, created: Date.now() };
    scripts[scriptId].keyCount = (scripts[scriptId].keyCount||0) + 1;
    saveKeys(); saveScripts();
    res.json({ key, expires, scriptId, message: 'Key generated.' });
});

// List keys
app.get('/v1/keys', (req, res) => {
    const list = Object.values(keys);
    if (req.query.scriptId) return res.json(list.filter(k => k.scriptId === req.query.scriptId));
    res.json(list);
});

// Revoke a key
app.delete('/v1/keys/:key', (req, res) => {
    const key = req.params.key;
    if (!keys[key]) return res.status(404).json({ error: 'Key not found' });
    const scriptId = keys[key].scriptId;
    delete keys[key];
    if (scripts[scriptId]) scripts[scriptId].keyCount = Math.max(0, (scripts[scriptId].keyCount||1)-1);
    saveKeys(); saveScripts();
    res.json({ ok: true });
});

// Stats
app.get('/v1/stats', (req, res) => {
    const allKeys = Object.values(keys);
    res.json({
        scripts: Object.keys(scripts).length,
        keys: allKeys.length,
        activeKeys: allKeys.filter(k => !k.expires || Date.now() < k.expires).length,
        totalExecutions: allKeys.reduce((a, k) => a + (k.execs||0), 0),
        blocked: stats.blocked || 0,
    });
});

// ── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  🔒 0.6xd Protection API`);
    console.log(`  ────────────────────────`);
    console.log(`  Site:    http://localhost:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`  API:     http://localhost:${PORT}/v1/`);
    console.log(`  ────────────────────────\n`);
});

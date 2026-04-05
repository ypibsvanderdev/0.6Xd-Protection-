import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createHash } from 'crypto';
import cors from 'cors';
import multer from 'multer';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = 3567;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dir, 'public')));

// ── DB ──
const DB_DIR = join(__dir, 'data');
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR);

const DB_SCRIPTS = join(DB_DIR, 'scripts.json');
const DB_KEYS    = join(DB_DIR, 'keys.json');
const DB_STATS   = join(DB_DIR, 'stats.json');

const readDB = (p, d={}) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d;
const writeDB = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

let scripts = readDB(DB_SCRIPTS, {});
let keys    = readDB(DB_KEYS, {});
let stats   = readDB(DB_STATS, { blocked: 0 });
let challenges = new Map(); // Temporary challenge tokens

const saveScripts = () => writeDB(DB_SCRIPTS, scripts);
const saveKeys = () => writeDB(DB_KEYS, keys);
const saveStats = () => writeDB(DB_STATS, stats);

// ── UNIVERSAL BOT BLOCKER (Firewall V4) ──
function getFirewallVerdict(req) {
    const ua = req.headers['user-agent'] || '';
    const hwid = req.headers['sentinel-hwid'] || '';
    const ip = req.ip;

    // 1. Mandatory Header Check (Zero-Tolerance)
    if (!ua.includes('Roblox')) return 'UNAUTHORIZED_CLIENT_ENGINE';
    
    // 2. Automation Fingerprinting
    const botPatterns = ['axios/', 'node-fetch', 'Puppeteer', 'Postman', 'curl/', 'Go-http-client', 'Python-urllib'];
    for (const p of botPatterns) if (ua.includes(p)) return 'AUTOMATION_SIGNATURE_DETECTED';

    // 3. Spoofer Detection (Bypass logic detection)
    if (req.headers['x-execution-engine'] || req.headers['delta-fingerprint']) return 'EXECUTOR_SPOOF_SIGNATURE';

    return null;
}

const DENIED_LUA = (reason) => `-- [[ 0.6xd Protection | UNIVERSAL BLOCK ]]
local _r="${reason}"
print("[0.6xd Firewall]: Access Denied. Reason: ".._r)
pcall(function()
  local sg=Instance.new("ScreenGui",game:GetService("CoreGui"))
  local bg=Instance.new("Frame",sg)
  bg.Size=UDim2.new(0,400,0,150) bg.Position=UDim2.new(0.5,-200,0.5,-75)
  bg.BackgroundColor3=Color3.new(0,0,0) bg.BorderSizePixel=2
  local t=Instance.new("TextLabel",bg)
  t.Size=UDim2.new(1,0,1,0) t.Text="VANDER FIREWALL:\\n".._r.."\\n(IP Logged)"
  t.TextColor3=Color3.new(1,0,0) t.TextSize=20
end)
error("[0.6xd]: Security Breach Detected", 0)`;

// ── Challenge-Response Payload (The 'Bot Killer') ──
// This code MUST be executed by a Lua VM (executor) to solve the challenge.
function createChallenge(host, hash) {
    const token = randomBytes(12).toString('hex');
    const salt = Math.floor(Math.random() * 1000);
    challenges.set(token, { hash, salt, ts: Date.now() });

    // Auto-cleanup challenge after 30 seconds
    setTimeout(() => challenges.delete(token), 30000);

    return `-- [[ 0.6xd Security Challenge ]]
local _H = "http://${host}/v1/verify/${token}"
local _S = ${salt}
local function solve(n) return (n * 2) + 1337 - _S end
local res = game:HttpGet(_H .. "?sig=" .. solve(_S))
if res and res:len() > 10 then
  loadstring(res)()
else
  error("Challenge Failed: Invalid Response")
end`;
}

// ── Nuclear Obfuscator (V4 Virtualization) ──
function obfuscate(src) {
    const key = Math.floor(Math.random() * 255) + 1;
    const enc = (s) => Buffer.from(s.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join(''), 'binary').toString('base64');
    const chunks = [];
    for (let i = 0; i < src.length; i += 64) chunks.push(enc(src.substring(i, i + 64)));
    const tbl = chunks.map((c, i) => `[${i+1}]="${c}"`).join(',');
    
    return `local _K,_C = ${key},{${tbl}}
local function _D(s)
  local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  s=s:gsub('[^'..b..'=]','')
  local r = {}
  for i=1,#s,4 do
    local v=0
    for j=0,3 do v=v*64+(b:find(s:sub(i+j,i+j))-1) end
    for j=2,0,-1 do table.insert(r, string.char(math.floor(v/256^j)%256)) end
  end
  for i=1,#r do r[i]=string.char(r[i]:byte()~_K) end
  return table.concat(r)
end
local _S = ""
for i=1,#_C do _S = _S .. _D(_C[i]) end
loadstring(_S)()`;
}

// ── API ──────────────────────────────────────────────────────────────────

// ENTRY POINT: The loader. Returns a CHALLENGE, not the script.
app.get('/files/v4/loaders/:hash', (req, res) => {
    const verdict = getFirewallVerdict(req);
    if (verdict) { stats.blocked++; saveStats(); return res.send(DENIED_LUA(verdict)); }
    
    const hash = req.params.hash.replace(/\.lua$/, '');
    res.type('text/plain').send(createChallenge(req.headers.host, hash));
});

// VERIFICATION POINT: Validates the challenge solution and delivers the MASKED script.
app.get('/v1/verify/:token', (req, res) => {
    const { token } = req.params;
    const { sig } = req.query;
    const challenge = challenges.get(token);
    
    if (!challenge) return res.send('-- CHALLENGE_EXPIRED');
    
    // Validate Solution: (salt * 2) + 1337 - salt
    const expected = (challenge.salt * 2) + 1337 - challenge.salt;
    if (parseInt(sig) !== expected) return res.send('-- INVALID_SOLUTION');

    const k = Object.values(keys).find(k => k.loaderHash === challenge.hash);
    if (!k) return res.send('-- SCRIPT_NOT_FOUND');
    const s = scripts[k.scriptId];
    if (!s) return res.send('-- SOURCE_DELETED');

    challenges.delete(token); // One-time use
    k.execs = (k.execs || 0) + 1; saveKeys();

    res.type('text/plain').send(s.src);
});

app.post('/v1/protect', upload.single('script'), (req, res) => {
    const src = req.file?.buffer?.toString('utf8') || req.body?.source;
    if (!src) return res.status(400).json({ error: 'Empty' });
    const id = 'sc_' + Math.random().toString(36).slice(2, 8);
    scripts[id] = { id, name: req.body.name || 'Script', added: Date.now(), src: obfuscate(src) };
    saveScripts();
    res.json({ id });
});

app.post('/v1/keys/generate', (req, res) => {
    const { scriptId } = req.body;
    if (!scripts[scriptId]) return res.json({ error: '404' });
    const key = '06XD-' + randomBytes(4).toString('hex').toUpperCase();
    const loaderHash = randomBytes(16).toString('hex');
    keys[key] = { key, loaderHash, scriptId, created: Date.now(), execs: 0 };
    saveKeys();
    res.json({ key, loader: `loadstring(game:HttpGet("http://${req.headers.host}/files/v4/loaders/${loaderHash}.lua"))()` });
});

app.get('/v1/stats', (req, res) => res.json({ scripts: Object.keys(scripts).length, blocked: stats.blocked }));

app.listen(PORT, () => console.log(`  🛡️ UNIVERSAL BLOCKER LIVE ON PORT ${PORT}`));

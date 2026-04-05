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

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dir, 'public')));

// ── DB (Stateless Vercel Support) ──
const DB_SCRIPTS = join(__dir, 'data', 'scripts.json');
const DB_KEYS    = join(__dir, 'data', 'keys.json');
const DB_STATS   = join(__dir, 'data', 'stats.json');

const readDB = (p, d={}) => {
    try {
        return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d;
    } catch { return d; }
};

const writeDB = (p, d) => {
    try {
        // Vercel is read-only. We only write if not in production or to /tmp
        if (process.env.VERCEL) {
            console.log("[DB] Vercel environment detected - Write skipped (using memory).");
            return;
        }
        writeFileSync(p, JSON.stringify(d, null, 2));
    } catch (e) {
        console.warn("[DB] Write failed (Normal for Vercel Serverless):", e.message);
    }
};

let scripts = readDB(DB_SCRIPTS, {});
let keys    = readDB(DB_KEYS, {});
let stats   = readDB(DB_STATS, { blocked: 0 });
let challenges = new Map();

const saveScripts = () => writeDB(DB_SCRIPTS, scripts);
const saveKeys = () => writeDB(DB_KEYS, keys);
const saveStats = () => writeDB(DB_STATS, stats);

// ── UNIVERSAL BOT BLOCKER ──
function getFirewallVerdict(req) {
    const ua = req.headers['user-agent'] || '';
    const hwid = req.headers['sentinel-hwid'] || '';
    if (!ua.includes('Roblox')) return 'UNAUTHORIZED_CLIENT';
    const bots = ['axios', 'node-fetch', 'Puppeteer', 'Postman', 'curl', 'Go-http-client'];
    for (const p of bots) if (ua.toLowerCase().includes(p)) return 'BOT_DETECTED';
    if (req.headers['x-execution-engine'] || req.headers['delta-fingerprint']) return 'SPOOFER_DETECTED';
    return null;
}

const DENIED_LUA = (reason) => `-- [[ 0.6xd Protection | UNIVERSAL BLOCK ]]
local _r="${reason}"
warn("[0.6xd Firewall]: Access Denied. Reason: " .. _r)
error("[0.6xd]: Security Breach Detected", 0)`;

function createChallenge(host, hash) {
    const token = randomBytes(12).toString('hex');
    const salt = Math.floor(Math.random() * 1000);
    challenges.set(token, { hash, salt, ts: Date.now() });
    setTimeout(() => challenges.delete(token), 45000); // 45s window

    return `-- [[ 0.6xd Security Challenge ]]
local _H = "http://${host}/v1/verify/${token}"
local _S = ${salt}
local function solve(n) return (n * 2) + 1337 - _S end
local success, res = pcall(game.HttpGet, game, _H .. "?sig=" .. solve(_S))
if success and res and res:len() > 10 then
  loadstring(res)()
else
  error("Challenge Failed: Client Verification Required")
end`;
}

// ── Obfuscator (V4 Virtualization) ──
function obfuscate(src) {
    const key = Math.floor(Math.random() * 255) + 1;
    const enc = (s) => Buffer.from(s.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join(''), 'binary').toString('base64');
    const chunks = [];
    for (let i = 0; i < src.length; i += 60) chunks.push(enc(src.substring(i, i + 60)));
    const tbl = chunks.map((c, i) => `[${i+1}]="${c}"`).join(',');
    
    return `local _K, _C = ${key}, {${tbl}}
local function _D(s)
  local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  s = s:gsub('[^'..b..'=]', '')
  local r = {}
  for i = 1, #s, 4 do
    local v = 0
    for j = 0, 3 do v = v * 64 + (b:find(s:sub(i + j, i + j)) - 1) end
    for j = 2, 0, -1 do table.insert(r, string.char(math.floor(v / 256 ^ j) % 256)) end
  end
  for i = 1, #r do r[i] = string.char(r[i]:byte() ~ _K) end
  return table.concat(r)
end
local _S = ""
for i = 1, #_C do _S = _S .. _D(_C[i]) end
loadstring(_S)()`;
}

// ── API ──

app.get('/files/v4/loaders/:hash', (req, res) => {
    const verdict = getFirewallVerdict(req);
    if (verdict) { stats.blocked++; saveStats(); return res.send(DENIED_LUA(verdict)); }
    const hash = req.params.hash.replace(/\.lua$/, '');
    res.type('text/plain').send(createChallenge(req.headers.host, hash));
});

app.get('/v1/verify/:token', (req, res) => {
    const { token } = req.params;
    const { sig } = req.query;
    const challenge = challenges.get(token);
    if (!challenge) return res.send('-- CHALLENGE_EXPIRED');
    const expected = (challenge.salt * 2) + 1337 - challenge.salt;
    if (parseInt(sig) !== expected) return res.send('-- INVALID_SIGNATURE');

    const k = Object.values(keys).find(k => k.loaderHash === challenge.hash);
    if (!k) return res.send('-- NOT_FOUND');
    const s = scripts[k.scriptId];
    if (!s) return res.send('-- DELETED');

    challenges.delete(token);
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
    const hash = randomBytes(16).toString('hex');
    keys[key] = { key, loaderHash: hash, scriptId, created: Date.now() };
    saveKeys();
    const origin = req.headers.host.includes('localhost') ? `http://${req.headers.host}` : `https://${req.headers.host}`;
    res.json({ key, loader: `loadstring(game:HttpGet("${origin}/files/v4/loaders/${hash}.lua"))()` });
});

app.get('/', (req, res) => res.json({ status: 'LIVE', engine: 'VanderProtectionV4', blocked: stats.blocked }));

export default app; // Vercel Bridge

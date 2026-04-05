import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
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
const readDB = (p, d={}) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d; } catch { return d; } };

// Note: On Vercel, this is read-only.
let scripts = readDB(DB_SCRIPTS, {});
let stats   = { blocked: 0 };
let challenges = new Map();

// ── PREMIUM DENIED GUI (Lua) ──
const DENIED_LUA = (reason) => `
local function create_ui()
    local sg = Instance.new("ScreenGui", game:GetService("CoreGui"))
    sg.Name = "06xd_Firewall"
    
    local main = Instance.new("Frame", sg)
    main.Size = UDim2.new(0, 420, 0, 180)
    main.Position = UDim2.new(0.5, -210, 0.5, -90)
    main.BackgroundColor3 = Color3.fromRGB(10, 10, 15)
    main.BorderSizePixel = 0
    
    local gradient = Instance.new("UIGradient", main)
    gradient.Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(20, 20, 30)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(10, 10, 15))
    })
    
    local stroke = Instance.new("UIStroke", main)
    stroke.Color = Color3.fromRGB(239, 68, 68)
    stroke.Thickness = 2
    stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    
    local corner = Instance.new("UICorner", main)
    corner.CornerRadius = UDim.new(0, 12)
    
    local icon = Instance.new("TextLabel", main)
    icon.Size = UDim2.new(0, 50, 0, 50)
    icon.Position = UDim2.new(0.5, -25, 0, 20)
    icon.BackgroundTransparency = 1
    icon.Text = "⚠️"
    icon.TextSize = 40
    
    local title = Instance.new("TextLabel", main)
    title.Size = UDim2.new(1, 0, 0, 30)
    title.Position = UDim2.new(0, 0, 0, 75)
    title.BackgroundTransparency = 1
    title.Text = "SECURITY BREACH DETECTED"
    title.TextColor3 = Color3.fromRGB(239, 68, 68)
    title.TextSize = 18
    title.Font = Enum.Font.GothamBold
    
    local desc = Instance.new("TextLabel", main)
    desc.Size = UDim2.new(1, -40, 0, 40)
    desc.Position = UDim2.new(0, 20, 0, 105)
    desc.BackgroundTransparency = 1
    desc.Text = "Reason: ${reason}\\nHardware fingerprint logged."
    desc.TextColor3 = Color3.fromRGB(150, 150, 160)
    desc.TextSize = 14
    desc.Font = Enum.Font.Gotham
    desc.TextWrapped = true
end

pcall(create_ui)
error("[0.6xd Firewall]: Access Denied. Reason: ${reason}", 0)
`;

function createChallenge(host, scriptId) {
    const token = randomBytes(12).toString('hex');
    const salt = Math.floor(Math.random() * 1000);
    challenges.set(token, { scriptId, salt, ts: Date.now() });
    setTimeout(() => challenges.delete(token), 60000);

    const origin = host.includes('localhost') ? `http://${host}` : `https://${host}`;

    return `-- [[ 0.6xd Security Challenge | Handshake V5 ]]
local _H = "${origin}/v1/verify/${token}"
local _S = ${salt}
local function solve(n) return (n * 2) + 1337 - _S end
local s, res = pcall(game.HttpGet, game, _H .. "?sig=" .. solve(_S))
if s and res and res:len() > 10 then
  local load = loadstring(res)
  if load then load() else warn("[0.6xd]: Failed to unpack payload") end
else
  error("Handshake Failed: Authorization Required")
end`;
}

// ── API ──

// V5 Keyless Direct Loader (Uses Script ID directly)
app.get('/files/v5/loaders/:scriptId', (req, res) => {
    const id = req.params.scriptId.replace(/\.lua$/, '');
    res.type('text/plain').send(createChallenge(req.headers.host, id));
});

app.get('/v1/verify/:token', (req, res) => {
    const { token } = req.params;
    const { sig } = req.query;
    const challenge = challenges.get(token);
    
    if (!challenge) return res.send('-- Handshake Expired');
    if (parseInt(sig) !== (challenge.salt * 2) + 1337 - challenge.salt) return res.send('-- Breach Detected');

    // On stateless Vercel, we can only serve scripts that were COMMITTED to scripts.json
    // If it's a new script, it only stays in memory for a few minutes.
    const s = scripts[challenge.scriptId];
    if (!s) return res.send('-- [0.6xd Error]: Script not deployed to production. Push to GitHub to finalize.');

    challenges.delete(token);
    res.type('text/plain').send(s.src);
});

// For local development only:
app.post('/v1/protect', upload.single('script'), (req, res) => {
    const src = req.file?.buffer?.toString('utf8') || req.body?.source;
    if (!src) return res.status(400).json({ error: 'Empty' });
    const id = 'sc_' + Math.random().toString(36).slice(2, 8);
    // Note: This won't persist on Vercel unless added to scripts.json manually.
    scripts[id] = { id, name: req.body.name || 'Script', src };
    res.json({ id });
});

app.get('/', (req, res) => res.json({ status: 'LIVE', engine: 'V5-Industrial' }));

export default app;

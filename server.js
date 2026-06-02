'use strict';

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const multer      = require('multer');
const pdfParse    = require('pdf-parse');
const mammoth     = require('mammoth');
const { v4: uuidv4 } = require('uuid');
const crypto      = require('crypto');
const { Pool }    = require('pg');
const PDFDocument = require('pdfkit');

// ── Arabic text helpers ───────────────────────────────────
// Detect if text contains Arabic characters
function hasArabic(text) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

// Reverse Arabic text for RTL rendering in PDFKit
// PDFKit doesn't support RTL natively, so we reverse the string
function prepareArabic(text) {
  if (!hasArabic(text)) return text;
  // Simple reversal for RTL — works for most Arabic text in certificates
  return text.split('').reverse().join('');
}

// Font paths
const FONT_DIR      = path.join(__dirname, 'fonts');
const FONT_REGULAR  = path.join(FONT_DIR, 'Amiri-Regular.ttf');
const FONT_BOLD     = path.join(FONT_DIR, 'Amiri-Bold.ttf');
const FONT_ITALIC   = path.join(FONT_DIR, 'Amiri-Italic.ttf');
const ARABIC_FONTS_AVAILABLE = fs.existsSync(FONT_REGULAR);
const QRCode      = require('qrcode');
const fs          = require('fs');
const { Resend }  = require('resend');

// ── Config ────────────────────────────────────────────────
const PORT        = process.env.PORT || 3001;
const JWT_SECRET  = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_NAME  = process.env.ADMIN_NAME  || 'OriginCheck Team';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const PAYSTACK_KEY  = process.env.PAYSTACK_SECRET_KEY || '';
const APP_URL     = process.env.APP_URL || 'http://localhost:3001';
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'noreply@origincheck.ng';
const COPYLEAKS_EMAIL = process.env.COPYLEAKS_EMAIL || '';
const COPYLEAKS_KEY   = process.env.COPYLEAKS_API_KEY || '';

// Resend email client
let resendClient = null;
function getResend() {
  if (!resendClient && RESEND_KEY) {
    try {
      resendClient = new Resend(RESEND_KEY);
    } catch(e) {
      console.error('Resend init error:', e.message);
    }
  }
  return resendClient;
}

// ── Plans ─────────────────────────────────────────────────
const PLANS = {
  free:       { name: 'Free',       naira: 0,     price: 0,       checks: 1,     copyleaks: 0  },
  basic:      { name: 'Basic',      naira: 3500,  price: 350000,  checks: 30,    copyleaks: 2  },
  researcher: { name: 'Pro',        naira: 10000, price: 1000000, checks: 100,   copyleaks: 5  },
  university: { name: 'University', naira: 25000, price: 2500000, checks: 99999, copyleaks: 15 },
};

// Affiliate commission rates (percentage of payment)
const COMMISSION = {
  basic:      0.20,   // 20% = ₦700 per Basic referral
  researcher: 0.20,   // 20% = ₦2,000 per Pro referral
  university: 0.10,   // 10% = ₦2,500 per University referral
};

// ── Database (Neon PostgreSQL) ────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = {
  query: (text, params) => pool.query(text, params),
  get: async (text, params) => { const r = await pool.query(text, params); return r.rows[0] || null; },
  all: async (text, params) => { const r = await pool.query(text, params); return r.rows; },
  run: async (text, params) => { const r = await pool.query(text, params); return r; },
};

// Init tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      institution TEXT,
      plan TEXT DEFAULT 'none',
      checks_used INTEGER DEFAULT 0,
      checks_limit INTEGER DEFAULT 0,
      copyleaks_used INTEGER DEFAULT 0,
      copyleaks_limit INTEGER DEFAULT 0,
      sub_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS copyleaks_used INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS copyleaks_limit INTEGER DEFAULT 0;
    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT,
      mode TEXT NOT NULL,
      preview TEXT,
      similarity INTEGER,
      grammar INTEGER,
      citations INTEGER,
      sources INTEGER,
      verdict TEXT,
      suggestions TEXT,
      ai_score INTEGER DEFAULT 0,
      ai_verdict TEXT,
      ai_indicators TEXT,
      copyleaks_sources TEXT,
      real_check INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0;
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS ai_verdict TEXT;
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS ai_indicators TEXT;
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS copyleaks_sources TEXT;
    ALTER TABLE checks ADD COLUMN IF NOT EXISTS real_check INTEGER DEFAULT 0;
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      paystack_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      total_referrals INTEGER DEFAULT 0,
      total_earnings INTEGER DEFAULT 0,
      pending_earnings INTEGER DEFAULT 0,
      paid_earnings INTEGER DEFAULT 0,
      bank_name TEXT,
      bank_account TEXT,
      bank_holder TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      affiliate_id TEXT NOT NULL,
      referred_user_id TEXT NOT NULL,
      payment_id TEXT,
      plan TEXT,
      commission INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
    CREATE INDEX IF NOT EXISTS idx_checks_user    ON checks(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user  ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_ref   ON payments(reference);
    CREATE INDEX IF NOT EXISTS idx_affiliates_user ON affiliates(user_id);
    CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(code);
    CREATE INDEX IF NOT EXISTS idx_referrals_aff   ON referrals(affiliate_id);
  `);
  console.log('Database ready');
}

// ── App ───────────────────────────────────────────────────
const app = express();
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Allow requests from Vercel frontend and local dev
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || '',
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Paystack webhooks)
    if (!origin) return cb(null, true);
    // Allow any vercel.app subdomain and the custom domain
    if (origin.includes('.vercel.app') || origin.includes('origincheck.ng') || ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    cb(null, true); // permissive for now — tighten after launch
  },
  credentials: true,
}));

const BUILD = path.join(__dirname, 'client', 'build');
// Only serve static files if React build exists (Render mode)
// On Railway (API-only), this folder won't exist and that's fine
if (fs.existsSync(BUILD)) {
  app.use(express.static(BUILD));
  console.log('Serving React build from:', BUILD);
} else {
  console.log('No React build found — running in API-only mode (Railway)');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'].includes(file.mimetype);
    cb(ok ? null : new Error('Only PDF, DOCX or TXT allowed'), ok);
  },
});

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required.' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}

async function safeUser(id) {
  const u = await db.get('SELECT id,name,email,institution,plan,checks_used,checks_limit,copyleaks_used,copyleaks_limit,sub_expires,created_at FROM users WHERE id=$1', [id]);
  if (u) {
    u.is_admin = (u.email === ADMIN_EMAIL);
    const aff = await db.get('SELECT id,code,total_referrals,total_earnings,pending_earnings,paid_earnings FROM affiliates WHERE user_id=$1', [id]);
    u.affiliate = aff || null;
  }
  return u;
}

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, institution } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const existing = await db.get('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'This email is already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    // Handle referral code if provided
    const refCode = req.body.refCode ? req.body.refCode.trim().toUpperCase() : null;
    let referredBy = null;
    if (refCode) {
      const aff = await db.get('SELECT id,user_id FROM affiliates WHERE code=$1', [refCode]);
      if (aff && aff.user_id !== id) referredBy = aff.id;
    }
    // Give every new user 1 free check to try the platform
    await db.run('INSERT INTO users (id,name,email,password,institution,plan,checks_limit,referred_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, name.trim(), email.toLowerCase().trim(), hash, institution || null, 'free', 1, referredBy]);
    const user = await safeUser(id);
    const token = jwt.sign({ id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const row = await db.get('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (!row || !(await bcrypt.compare(password, row.password)))
      return res.status(401).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: await safeUser(row.id) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed.' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await safeUser(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// ── PLANS ─────────────────────────────────────────────────
app.get('/api/plans', (req, res) => res.json({ plans: PLANS }));

// ── PAYMENT ───────────────────────────────────────────────
app.post('/api/payment/initialize', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan.' });
    if (!PAYSTACK_KEY) return res.status(500).json({ error: 'Payment not configured on server.' });
    const user = await db.get('SELECT id,email,name FROM users WHERE id=$1', [req.user.id]);
    const ref = 'oc_' + uuidv4().replace(/-/g, '').slice(0, 16);
    await db.run('INSERT INTO payments (id,user_id,plan,amount,reference) VALUES ($1,$2,$3,$4,$5)',
      [uuidv4(), user.id, plan, PLANS[plan].price, ref]);
    const ps = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, amount: PLANS[plan].price, reference: ref, currency: 'NGN',
        metadata: { user_id: user.id, plan, user_name: user.name },
        callback_url: `${APP_URL}/api/payment/callback` }),
    });
    const data = await ps.json();
    if (!data.status) throw new Error(data.message);
    res.json({ authorization_url: data.data.authorization_url, reference: ref });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not start payment. Try again.' }); }
});

app.get('/api/payment/callback', async (req, res) => {
  try {
    const ok = await verifyPaystack(req.query.reference);
    res.redirect(ok ? '/?payment=success' : '/?payment=failed');
  } catch { res.redirect('/?payment=error'); }
});

app.get('/api/payment/verify/:ref', auth, async (req, res) => {
  try {
    const pay = await db.get('SELECT * FROM payments WHERE reference=$1 AND user_id=$2', [req.params.ref, req.user.id]);
    if (!pay) return res.status(404).json({ error: 'Payment not found.' });
    if (pay.status === 'success') return res.json({ status: 'success', user: await safeUser(req.user.id) });
    const ok = await verifyPaystack(req.params.ref);
    res.json({ status: ok ? 'success' : 'pending', user: await safeUser(req.user.id) });
  } catch { res.status(500).json({ error: 'Verification failed.' }); }
});

app.post('/api/payment/webhook', (req, res) => {
  try {
    const hash = crypto.createHmac('sha512', PAYSTACK_KEY).update(req.body).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Bad signature');
    const ev = JSON.parse(req.body.toString());
    if (ev.event === 'charge.success') verifyPaystack(ev.data.reference).catch(console.error);
    res.sendStatus(200);
  } catch { res.sendStatus(200); }
});

app.get('/api/payment/history', auth, async (req, res) => {
  try {
    const rows = await db.all('SELECT id,plan,amount,reference,status,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ payments: rows });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

async function verifyPaystack(reference) {
  if (!PAYSTACK_KEY || !reference) return false;
  const r = await fetch(`https://api.paystack.co/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_KEY}` } });
  const data = await r.json();
  if (data.status && data.data.status === 'success') {
    const { user_id, plan } = data.data.metadata || {};
    const pl = PLANS[plan];
    if (!pl || !user_id) return false;
    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    await db.run('UPDATE users SET plan=$1,checks_limit=$2,checks_used=0,copyleaks_limit=$3,copyleaks_used=0,sub_expires=$4 WHERE id=$5',
      [plan, pl.checks, pl.copyleaks || 0, exp.toISOString(), user_id]);
    await db.run('UPDATE payments SET status=$1,paystack_id=$2 WHERE reference=$3',
      ['success', String(data.data.id), reference]);

    // Credit affiliate commission if this user was referred
    try {
      const referredUser = await db.get('SELECT referred_by FROM users WHERE id=$1', [user_id]);
      if (referredUser && referredUser.referred_by) {
        const affId = referredUser.referred_by;
        const commRate = COMMISSION[plan] || 0;
        const commAmount = Math.floor(PLANS[plan].price * commRate); // in kobo
        if (commAmount > 0) {
          // Create referral record
          await db.run(
            'INSERT INTO referrals (id,affiliate_id,referred_user_id,plan,commission,status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
            [uuidv4(), affId, user_id, plan, commAmount, 'pending']
          );
          // Update affiliate totals
          await db.run(
            'UPDATE affiliates SET total_referrals=total_referrals+1, total_earnings=total_earnings+$1, pending_earnings=pending_earnings+$1 WHERE id=$2',
            [commAmount, affId]
          );
          console.log(`Affiliate ${affId} earned ${commAmount} kobo for ${plan} referral`);
        }
      }
    } catch (e) { console.error('Affiliate commission error:', e); }

    return true;
  }
  return false;
}

// ── FILE UPLOAD ───────────────────────────────────────────
app.post('/api/extract', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    let text = '';
    const m = req.file.mimetype;
    if (m === 'application/pdf') {
      const d = await pdfParse(req.file.buffer); text = d.text;
    } else if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const d = await mammoth.extractRawText({ buffer: req.file.buffer }); text = d.value;
    } else {
      text = req.file.buffer.toString('utf-8');
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length < 20) return res.status(422).json({ error: 'Could not extract enough text.' });
    res.json({ text, filename: req.file.originalname });
  } catch (e) { console.error(e); res.status(500).json({ error: 'File extraction failed.' }); }
});

// ── COPYLEAKS HELPERS ──────────────────────────────────────

// Token cache — Copyleaks tokens last 48 hours
let copyleaksToken = null;
let copyleaksTokenExpiry = null;

async function getCopyleaksToken() {
  // Return cached token if still valid (with 1 hour buffer)
  if (copyleaksToken && copyleaksTokenExpiry && new Date() < new Date(copyleaksTokenExpiry - 3600000)) {
    return copyleaksToken;
  }
  if (!COPYLEAKS_EMAIL || !COPYLEAKS_KEY) throw new Error('Copyleaks credentials not configured.');

  const r = await fetch('https://id.copyleaks.com/v3/account/login/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COPYLEAKS_EMAIL, key: COPYLEAKS_KEY }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error('Copyleaks login failed: ' + (data.message || 'Unknown error'));

  copyleaksToken = data.access_token;
  copyleaksTokenExpiry = data['.expires'];
  console.log('Copyleaks token refreshed');
  return copyleaksToken;
}

async function submitCopyleaksScan(text, scanId) {
  const token = await getCopyleaksToken();
  const base64 = Buffer.from(text, 'utf-8').toString('base64');

  const r = await fetch(`https://api.copyleaks.com/v3/businesses/submit/file/${scanId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64,
      filename: 'submission.txt',
      properties: {
        webhooks: {
          status: `${APP_URL}/api/copyleaks-webhook/{STATUS}`,
          newResult: `${APP_URL}/api/copyleaks-webhook/new-result`,
          completion: `${APP_URL}/api/copyleaks-webhook/completion`,
        },
        sandbox: false,
        sensitivityLevel: 4,
        filters: {
          minCopiedWords: 8,
        },
        scanning: {
          internet: true,
          copyleaksDb: true,
        },
      },
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error('Copyleaks submit failed: ' + err);
  }
  return scanId;
}

async function pollCopyleaksScan(scanId, maxWaitMs = 120000) {
  const token = await getCopyleaksToken();
  const startTime = Date.now();
  const POLL_INTERVAL = 4000; // poll every 4 seconds

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const r = await fetch(`https://api.copyleaks.com/v3/businesses/${scanId}/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!r.ok) continue;
    const status = await r.json();

    // Status: 0 = pending, 1 = completed, 2 = error
    if (status.status === 1) {
      // Fetch results
      const res = await fetch(`https://api.copyleaks.com/v3/businesses/${scanId}/results`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not fetch Copyleaks results');
      return await res.json();
    }
    if (status.status === 2) throw new Error('Copyleaks scan failed');
    // status 0 = still scanning, keep polling
  }
  throw new Error('Copyleaks scan timed out after 2 minutes');
}

function parseCopyleaksResults(results, scanId) {
  if (!results) return { similarityPercent: 0, sources: [], matchedWords: 0, scanId };

  // Copyleaks v3 results structure
  const doc = results.scannedDocument || {};
  const totalWords = doc.totalWords || 1;

  // Calculate similarity from identical + minorChanges words
  const matchedWords = (doc.identical?.words || 0) + (doc.minorChanges?.words || 0);
  const score = Math.min(Math.round((matchedWords / totalWords) * 100), 100);

  // Collect sources from all categories
  const allSources = [
    ...(results.internet || []),
    ...(results.database || []),
  ];

  const sources = allSources
    .sort((a, b) => (b.matchedWords || 0) - (a.matchedWords || 0))
    .slice(0, 5)
    .map(r => ({
      url:          r.url || r.link || '',
      title:        r.title || r.url || r.link || 'Unknown Source',
      matchPercent: Math.round(((r.matchedWords || 0) / totalWords) * 100),
      matchedWords: r.matchedWords || 0,
    }))
    .filter(s => s.title);

  return {
    similarityPercent: score,
    sources,
    totalWords,
    matchedWords,
    scanId,
  };
}

// No-op webhook receiver (Copyleaks requires a valid webhook URL)
app.post('/api/copyleaks-webhook/:status', (req, res) => {
  console.log('Copyleaks webhook received:', req.params.status);
  res.sendStatus(200);
});

// ── AI CALL HELPER ────────────────────────────────────────
async function callAI(prompt, maxTokens = 800) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI error');
  const raw = data.content.map(b => b.text || '').join('').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

// ── CHECK ─────────────────────────────────────────────────
app.post('/api/check', auth, async (req, res) => {
  try {
    const { text, mode, filename, certTitle, certInstitution, checkKind } = req.body;
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Please provide some text to check.' });
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'AI service not configured.' });

    const u = await db.get('SELECT plan,checks_used,checks_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);
    // Free tier: 1 check allowed, no subscription required
    // Paid tiers: check subscription validity
    const isFree = u.plan === 'free';
    const isPaid = ['basic','researcher','university'].includes(u.plan);

    if (!isFree && !isPaid)
      return res.status(403).json({ error: 'No active subscription. Please subscribe first.', subscribe: true });
    if (isPaid && u.sub_expires && new Date(u.sub_expires) < new Date())
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });
    if (u.checks_used >= u.checks_limit)
      return res.status(429).json({
        error: isFree
          ? 'You have used your free trial check. Subscribe to continue checking.'
          : 'Monthly check limit reached. Please upgrade.',
        subscribe: true,
        freeLimitReached: isFree,
      });

    const sample = text.slice(0, 3000);
    const modes  = { text: 'full text passage', abstract: 'research abstract', title: 'research title' };
    const kind   = checkKind || 'plagiarism';

    let plag = null, aiDet = null;

    if (kind === 'plagiarism' || kind === 'both') {
      const hasCopyleaks   = !!(COPYLEAKS_EMAIL && COPYLEAKS_KEY);
      const isPaidUser     = ['basic','researcher','university'].includes(u.plan);
      const copyleaksLeft  = (u.copyleaks_limit || 0) - (u.copyleaks_used || 0);
      const canUseCopyleaks = hasCopyleaks && isPaidUser && copyleaksLeft > 0;

      if (canUseCopyleaks) {
        // ── Real Copyleaks database check ──────────────────
        try {
          const scanId = uuidv4().replace(/-/g, '').slice(0, 36);
          console.log('Starting Copyleaks scan:', scanId);
          await submitCopyleaksScan(sample, scanId);
          const rawResults = await pollCopyleaksScan(scanId);
          const cpResult   = parseCopyleaksResults(rawResults);

          // Use Claude to generate a verdict and suggestions based on Copyleaks data
          const verdictPrompt = `You are an academic integrity expert. A plagiarism scan returned these results:
- Similarity score: ${cpResult.similarityPercent}%
- Total words scanned: ${cpResult.totalWords}
- Matched words: ${cpResult.matchedWords}
- Top sources matched: ${cpResult.sources.slice(0,3).map(s => s.title + ' (' + s.matchPercent + '%)').join(', ') || 'None found'}

Write a professional 2-3 sentence verdict and 3 improvement suggestions.
Reply ONLY with JSON: {"verdict":"...","grammarIssues":0,"citationCount":0,"suggestions":["...","...","..."]}`;

          const aiVerdict = await callAI(verdictPrompt, 500).catch(() => ({
            verdict: cpResult.similarityPercent < 20
              ? 'The document shows high originality with minimal matching content found.'
              : cpResult.similarityPercent < 40
              ? 'The document shows moderate similarity to existing sources. Review flagged sections.'
              : 'The document shows significant similarity to existing sources and requires revision.',
            grammarIssues: 0,
            citationCount: cpResult.sources.length,
            suggestions: ['Review and cite all matched sources properly.', 'Paraphrase sections that closely match existing work.', 'Use quotation marks for any direct quotes.'],
          }));

          // Increment copyleaks_used
          await db.run('UPDATE users SET copyleaks_used=copyleaks_used+1 WHERE id=$1', [req.user.id]);

          plag = {
            similarityPercent: cpResult.similarityPercent,
            verdict:           aiVerdict.verdict,
            grammarIssues:     aiVerdict.grammarIssues || 0,
            citationCount:     aiVerdict.citationCount || cpResult.sources.length,
            matchedSources:    cpResult.sources.length,
            suggestions:       aiVerdict.suggestions || [],
            copyleaksSources:  cpResult.sources,
            copyleaksScanId:   cpResult.scanId,
            realCheck:         true,
            copyleaksLeft:     copyleaksLeft - 1,
          };
        } catch (e) {
          console.error('Copyleaks error, falling back to AI:', e.message);
          // Fall back to AI check if Copyleaks fails
          plag = await callAI(`Analyze this ${modes[mode] || 'text'} for academic originality.

Text: "${sample}"

Reply ONLY with JSON: {"similarityPercent":0,"verdict":"2-3 sentence assessment","grammarIssues":0,"citationCount":0,"matchedSources":0,"suggestions":["...","...","..."]}`).catch(() => ({
            similarityPercent: 0, verdict: 'Analysis unavailable.', grammarIssues: 0,
            citationCount: 0, matchedSources: 0, suggestions: ['Please try again.']
          }));
          plag.realCheck = false;
        }
      } else {
        // ── AI-only check (free tier or no Copyleaks configured) ──
        plag = await callAI(`Analyze this ${modes[mode] || 'text'} for academic originality and plagiarism.

Text: "${sample}"

Reply ONLY with this exact JSON (no markdown, no explanation):
{"similarityPercent":0,"verdict":"2-3 sentence professional assessment","grammarIssues":0,"citationCount":0,"matchedSources":0,"suggestions":["tip one","tip two","tip three"]}

Guidance: similarityPercent 0-100. Realistic: 5-20% original, 20-40% moderate, 40%+ serious.`).catch(() => ({
          similarityPercent: 0, verdict: 'Analysis unavailable.', grammarIssues: 0,
          citationCount: 0, matchedSources: 0, suggestions: ['Please try again.']
        }));
        plag.realCheck = false;
      }
    }

    if (kind === 'ai' || kind === 'both') {
      aiDet = await callAI(`You are an expert at detecting whether text was written by a human or generated by AI (ChatGPT, Gemini, Claude, etc.).

Analyze this academic text:

"${sample}"

Check for these AI indicators:
- Uniform sentence length and structure
- Absence of personal voice, emotion, or anecdotes
- Perfect grammar with no natural errors
- Generic, encyclopedic phrasing
- Repetitive transitions (furthermore, moreover, additionally)
- Suspiciously well-organized paragraphs
- No contractions or informal expressions
- Lack of specific personal examples or experiences

Reply ONLY with this exact JSON (no markdown, no explanation):
{"aiScore":0,"aiVerdict":"2-3 sentence assessment of whether this is human or AI written","aiLabel":"Likely Human Written","indicators":["indicator 1","indicator 2","indicator 3"]}

Rules:
- aiScore: 0-100 (0=definitely human, 100=definitely AI)
- aiLabel must be exactly one of: "Likely Human Written" | "Uncertain" | "Likely AI Generated" | "Almost Certainly AI Generated"
- Be realistic: most student writing 10-40%, obvious AI output 70-95%`, 1000).catch(() => ({
        aiScore: 0, aiVerdict: 'AI detection unavailable.', aiLabel: 'Uncertain', indicators: []
      }));
    }

    // Defaults if one type was not run
    if (!plag) plag = { similarityPercent: 0, verdict: '', grammarIssues: 0, citationCount: 0, matchedSources: 0, suggestions: [] };
    if (!aiDet) aiDet = { aiScore: 0, aiVerdict: '', aiLabel: '', indicators: [] };

    const cid = uuidv4();
    await db.run(
      `INSERT INTO checks (id,user_id,filename,mode,preview,similarity,grammar,citations,sources,verdict,suggestions,ai_score,ai_verdict,ai_indicators,copyleaks_sources,real_check)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [cid, req.user.id, filename || null, mode || 'text', text.slice(0, 200),
       plag.similarityPercent, plag.grammarIssues, plag.citationCount, plag.matchedSources,
       plag.verdict, JSON.stringify(plag.suggestions),
       aiDet.aiScore, aiDet.aiVerdict, JSON.stringify(aiDet.indicators || []),
       JSON.stringify(plag.copyleaksSources || []), plag.realCheck ? 1 : 0]
    );
    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);

    res.json({
      ...plag,
      checkId: cid,
      aiScore:      aiDet.aiScore,
      aiVerdict:    aiDet.aiVerdict,
      aiLabel:      aiDet.aiLabel,
      aiIndicators: aiDet.indicators || [],
      copyleaksSources: plag.copyleaksSources || [],
      realCheck:    plag.realCheck || false,
    });
  } catch (e) { console.error('Check error:', e); res.status(500).json({ error: 'Check failed. Please try again.' }); }
});

// ── HUMANISER ─────────────────────────────────────────────────────────
app.post('/api/humanise', auth, async (req, res) => {
  try {
    const { text, style } = req.body;
    if (!text || text.trim().length < 20)
      return res.status(400).json({ error: 'Please provide some text to humanise.' });
    if (!ANTHROPIC_KEY)
      return res.status(500).json({ error: 'AI service not configured.' });

    const u = await db.get('SELECT plan,checks_used,checks_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);
    if (u.plan === 'none' || !u.sub_expires)
      return res.status(403).json({ error: 'No active subscription. Please subscribe first.', subscribe: true });
    if (new Date(u.sub_expires) < new Date())
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });
    if (u.checks_used >= u.checks_limit)
      return res.status(429).json({ error: 'Monthly check limit reached. Please upgrade.', subscribe: true });

    // Persona system prompts - each gives Claude a real human identity to write from
    const personas = {
      academic: `You are a Nigerian professor with 15 years of experience writing academic papers. You have strong opinions and occasionally digress before returning to your point. You use phrases like "one cannot ignore" and "the reality is". Your sentences vary wildly in length. You repeat key ideas in different words for emphasis. You are not afraid to start a sentence with "And" or "But". You write like a person who thinks as they write.`,
      student: `You are a final-year Nigerian university student who is intelligent but writes like a real person. You use contractions freely. You start sentences with "This is because" or "What this means is". Your paragraphs are uneven. You occasionally use a phrase like "it is important to note" but then immediately follow with something more personal. You make small logical jumps without perfectly bridging them.`,
      casual: `You are a knowledgeable Nigerian professional explaining a complex topic to a colleague. You are warm, direct, use rhetorical questions like "But what does this actually mean in practice?" You use "Look," or "Here is the thing:" to introduce key points. You use one-sentence paragraphs for emphasis. Your tone is confident but never stiff.`,
      balanced: `You are an experienced Nigerian researcher writing for an academic journal. You have a distinctive voice: measured but engaged. You vary sentence structure deliberately. You use hedging phrases naturally: "it appears that", "the evidence suggests", "one might argue". You occasionally pose a question and answer it yourself. You write with intellectual curiosity, not like someone filling a template.`,
    };

    const systemPrompt = personas[style] || personas.balanced;

    const userPrompt = `This text was generated by an AI. Completely rewrite it so it reads as genuinely human-written. This is NOT light editing — you must TRANSFORM it deeply.

ORIGINAL AI TEXT:
---
${text.slice(0, 4000)}
---

MANDATORY TRANSFORMATIONS — apply every single one:

SENTENCES:
- Rebuild at least 70% of sentences from scratch — do not just rearrange words
- Create extreme length variation: some sentences 4-6 words, some 30-40 words
- Use sentence fragments for emphasis. Deliberately.
- Start at least 3 sentences with "And", "But", or "So"
- Mix active and passive voice naturally

BANNED AI PHRASES — replace ALL occurrences:
"it is worth noting" → "what stands out here is"
"furthermore" / "moreover" / "additionally" → "on top of that" / "beyond this" / "also"  
"it is important to" → drop it or say "you have to understand that"
"plays a crucial role" → "matters enormously" / "is central to"
"in today's world" → "these days" / "right now"
"in order to" → "to"
"a wide range of" → "many" / "countless"
"it can be seen that" → "clearly" / "evidently"
"this highlights the importance of" → "this is why X matters"
"in conclusion" → "to wrap up" / "all of this points to"
"delve into" → "explore" / "get into"

CONTRACTIONS — use throughout:
it is → it's, they are → they're, we have → we've, cannot → can't, does not → doesn't, is not → isn't

HUMAN MARKERS — add all of these:
- At least 2 em-dashes for natural asides — like this one
- At least 1 rhetorical question: "But why does this matter?" or similar
- At least 2 hedging moments: "arguably", "in most cases", "from what we can tell", "at least in theory"  
- At least 1 acknowledgement of complexity: "admittedly", "it is not that simple", "the picture is messier than it looks"
- At least 1 moment addressing the reader directly: "consider what this means", "think about it this way"
- Vary paragraph lengths: some 1-2 sentences, some 5-6 sentences

PRESERVE EXACTLY:
- Every fact, statistic, argument, and conclusion
- All technical terms, citations, proper nouns
- The overall logical progression

OUTPUT ONLY the rewritten text. Nothing else.`;

    // Try Sonnet first (better quality), fall back to Haiku
    const tryModel = async (model) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || 'API error');
      return data.content.map(b => b.text || '').join('').trim();
    };

    let humanised;
    try {
      humanised = await tryModel('claude-sonnet-4-20250514');
    } catch (e) {
      console.warn('Sonnet unavailable, using Haiku:', e.message);
      humanised = await tryModel('claude-haiku-4-5-20251001');
    }

    if (!humanised) return res.status(502).json({ error: 'No output received. Please try again.' });

    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);
    res.json({ humanised, originalLength: text.length, humanisedLength: humanised.length });

  } catch (e) {
    console.error('Humanise error:', e);
    res.status(500).json({ error: 'Humanisation failed. Please try again.' });
  }
});


// ── FILE UPLOAD ───────────────────────────────────────────
app.post('/api/extract', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    let text = '';
    const m = req.file.mimetype;
    if (m === 'application/pdf') {
      const d = await pdfParse(req.file.buffer); text = d.text;
    } else if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const d = await mammoth.extractRawText({ buffer: req.file.buffer }); text = d.value;
    } else {
      text = req.file.buffer.toString('utf-8');
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length < 20) return res.status(422).json({ error: 'Could not extract enough text.' });
    res.json({ text, filename: req.file.originalname });
  } catch (e) { console.error(e); res.status(500).json({ error: 'File extraction failed.' }); }
});
// ── AI CALL HELPER ────────────────────────────────────────
async function callAI(prompt, maxTokens = 800) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI error');
  const raw = data.content.map(b => b.text || '').join('').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

// ── CHECK ─────────────────────────────────────────────────
app.post('/api/check', auth, async (req, res) => {
  try {
    const { text, mode, filename, certTitle, certInstitution, checkKind } = req.body;
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Please provide some text to check.' });
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'AI service not configured.' });

    const u = await db.get('SELECT plan,checks_used,checks_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);
    if (u.plan === 'none' || !u.sub_expires)
      return res.status(403).json({ error: 'No active subscription. Please subscribe first.', subscribe: true });
    if (new Date(u.sub_expires) < new Date())
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });
    if (u.checks_used >= u.checks_limit)
      return res.status(429).json({ error: 'Monthly check limit reached. Please upgrade.', subscribe: true });

    const sample = text.slice(0, 3000);
    const modes  = { text: 'full text passage', abstract: 'research abstract', title: 'research title' };
    const kind   = checkKind || 'plagiarism';

    let plag = null, aiDet = null;

    if (kind === 'plagiarism' || kind === 'both') {
      const hasCopyleaks   = !!(COPYLEAKS_EMAIL && COPYLEAKS_KEY);
      const isPaidUser     = ['basic','researcher','university'].includes(u.plan);
      const copyleaksLeft  = (u.copyleaks_limit || 0) - (u.copyleaks_used || 0);
      const canUseCopyleaks = hasCopyleaks && isPaidUser && copyleaksLeft > 0;

      if (canUseCopyleaks) {
        // ── Real Copyleaks database check ──────────────────
        try {
          const scanId = uuidv4().replace(/-/g, '').slice(0, 36);
          console.log('Starting Copyleaks scan:', scanId);
          await submitCopyleaksScan(sample, scanId);
          const rawResults = await pollCopyleaksScan(scanId);
          const cpResult   = parseCopyleaksResults(rawResults);

          // Use Claude to generate a verdict and suggestions based on Copyleaks data
          const verdictPrompt = `You are an academic integrity expert. A plagiarism scan returned these results:
- Similarity score: ${cpResult.similarityPercent}%
- Total words scanned: ${cpResult.totalWords}
- Matched words: ${cpResult.matchedWords}
- Top sources matched: ${cpResult.sources.slice(0,3).map(s => s.title + ' (' + s.matchPercent + '%)').join(', ') || 'None found'}

Write a professional 2-3 sentence verdict and 3 improvement suggestions.
Reply ONLY with JSON: {"verdict":"...","grammarIssues":0,"citationCount":0,"suggestions":["...","...","..."]}`;

          const aiVerdict = await callAI(verdictPrompt, 500).catch(() => ({
            verdict: cpResult.similarityPercent < 20
              ? 'The document shows high originality with minimal matching content found.'
              : cpResult.similarityPercent < 40
              ? 'The document shows moderate similarity to existing sources. Review flagged sections.'
              : 'The document shows significant similarity to existing sources and requires revision.',
            grammarIssues: 0,
            citationCount: cpResult.sources.length,
            suggestions: ['Review and cite all matched sources properly.', 'Paraphrase sections that closely match existing work.', 'Use quotation marks for any direct quotes.'],
          }));

          // Increment copyleaks_used
          await db.run('UPDATE users SET copyleaks_used=copyleaks_used+1 WHERE id=$1', [req.user.id]);

          plag = {
            similarityPercent: cpResult.similarityPercent,
            verdict:           aiVerdict.verdict,
            grammarIssues:     aiVerdict.grammarIssues || 0,
            citationCount:     aiVerdict.citationCount || cpResult.sources.length,
            matchedSources:    cpResult.sources.length,
            suggestions:       aiVerdict.suggestions || [],
            copyleaksSources:  cpResult.sources,
            copyleaksScanId:   cpResult.scanId,
            realCheck:         true,
            copyleaksLeft:     copyleaksLeft - 1,
          };
        } catch (e) {
          console.error('Copyleaks error, falling back to AI:', e.message);
          // Fall back to AI check if Copyleaks fails
          plag = await callAI(`Analyze this ${modes[mode] || 'text'} for academic originality.

Text: "${sample}"

Reply ONLY with JSON: {"similarityPercent":0,"verdict":"2-3 sentence assessment","grammarIssues":0,"citationCount":0,"matchedSources":0,"suggestions":["...","...","..."]}`).catch(() => ({
            similarityPercent: 0, verdict: 'Analysis unavailable.', grammarIssues: 0,
            citationCount: 0, matchedSources: 0, suggestions: ['Please try again.']
          }));
          plag.realCheck = false;
        }
      } else {
        // ── AI-only check (free tier or no Copyleaks configured) ──
        plag = await callAI(`Analyze this ${modes[mode] || 'text'} for academic originality and plagiarism.

Text: "${sample}"

Reply ONLY with this exact JSON (no markdown, no explanation):
{"similarityPercent":0,"verdict":"2-3 sentence professional assessment","grammarIssues":0,"citationCount":0,"matchedSources":0,"suggestions":["tip one","tip two","tip three"]}

Guidance: similarityPercent 0-100. Realistic: 5-20% original, 20-40% moderate, 40%+ serious.`).catch(() => ({
          similarityPercent: 0, verdict: 'Analysis unavailable.', grammarIssues: 0,
          citationCount: 0, matchedSources: 0, suggestions: ['Please try again.']
        }));
        plag.realCheck = false;
      }
    }

    if (kind === 'ai' || kind === 'both') {
      aiDet = await callAI(`You are an expert at detecting whether text was written by a human or generated by AI (ChatGPT, Gemini, Claude, etc.).

Analyze this academic text:

"${sample}"

Check for these AI indicators:
- Uniform sentence length and structure
- Absence of personal voice, emotion, or anecdotes
- Perfect grammar with no natural errors
- Generic, encyclopedic phrasing
- Repetitive transitions (furthermore, moreover, additionally)
- Suspiciously well-organized paragraphs
- No contractions or informal expressions
- Lack of specific personal examples or experiences

Reply ONLY with this exact JSON (no markdown, no explanation):
{"aiScore":0,"aiVerdict":"2-3 sentence assessment of whether this is human or AI written","aiLabel":"Likely Human Written","indicators":["indicator 1","indicator 2","indicator 3"]}

Rules:
- aiScore: 0-100 (0=definitely human, 100=definitely AI)
- aiLabel must be exactly one of: "Likely Human Written" | "Uncertain" | "Likely AI Generated" | "Almost Certainly AI Generated"
- Be realistic: most student writing 10-40%, obvious AI output 70-95%`, 1000).catch(() => ({
        aiScore: 0, aiVerdict: 'AI detection unavailable.', aiLabel: 'Uncertain', indicators: []
      }));
    }

    // Defaults if one type was not run
    if (!plag) plag = { similarityPercent: 0, verdict: '', grammarIssues: 0, citationCount: 0, matchedSources: 0, suggestions: [] };
    if (!aiDet) aiDet = { aiScore: 0, aiVerdict: '', aiLabel: '', indicators: [] };

    const cid = uuidv4();
    await db.run(
      `INSERT INTO checks (id,user_id,filename,mode,preview,similarity,grammar,citations,sources,verdict,suggestions,ai_score,ai_verdict,ai_indicators,copyleaks_sources,real_check)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [cid, req.user.id, filename || null, mode || 'text', text.slice(0, 200),
       plag.similarityPercent, plag.grammarIssues, plag.citationCount, plag.matchedSources,
       plag.verdict, JSON.stringify(plag.suggestions),
       aiDet.aiScore, aiDet.aiVerdict, JSON.stringify(aiDet.indicators || []),
       JSON.stringify(plag.copyleaksSources || []), plag.realCheck ? 1 : 0]
    );
    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);

    // Refresh user for latest counts
    const updatedUser = await safeUser(req.user.id);

    res.json({
      ...plag,
      checkId:          cid,
      aiScore:      aiDet.aiScore,
      aiVerdict:    aiDet.aiVerdict,
      aiLabel:      aiDet.aiLabel,
      aiIndicators: aiDet.indicators || [],
      copyleaksSources: plag.copyleaksSources || [],
      realCheck:        plag.realCheck || false,
      copyleaksUsed:    updatedUser.copyleaks_used || 0,
      copyleaksLimit:   updatedUser.copyleaks_limit || 0,
    });
  } catch (e) { console.error('Check error:', e); res.status(500).json({ error: 'Check failed. Please try again.' }); }
});

// ── HUMANISER ─────────────────────────────────────────────
async function runHumanisePass(text, styleDesc, pass) {
  const passInstructions = pass === 1 ? `
PASS 1 — STRUCTURAL TRANSFORMATION:
- Completely restructure sentence order within each paragraph
- Split long compound sentences into 2–3 shorter ones
- Merge some short sentences into one flowing sentence
- Replace EVERY instance of: furthermore, moreover, additionally, consequently, 
  subsequently, nevertheless, notwithstanding, henceforth, thereof
- Rewrite the opening sentence of EVERY paragraph — make each one unique in structure
- Add 1–2 personal hedging phrases per paragraph: "it seems", "one might argue", 
  "interestingly", "it is worth noting", "this suggests"
- Introduce occasional incomplete thoughts completed in the next sentence
` : `
PASS 2 — VOICE AND RHYTHM TRANSFORMATION:
- Read what you produced and identify any remaining robotic patterns
- Vary sentence LENGTH dramatically — some should be under 10 words, some over 30
- Add specific concrete examples where abstract statements exist
- Insert natural parenthetical asides (like this one) where appropriate
- Use contractions in at least 30% of sentences where grammatically natural
- Make the opening of the text feel like a human starting to explain something
- Ensure no two consecutive sentences start with the same word
- Add one or two rhetorical questions where they fit naturally
- The final output must feel like it was written by a thoughtful, intelligent human
  who knows their subject well but writes naturally, not a language model
`;

  const prompt = `You are a world-class academic ghostwriter specialising in making AI-generated text completely undetectable. Your rewrites fool even the most advanced AI detection systems including GPTZero, Turnitin AI, and Originality.ai.

STYLE TARGET: ${styleDesc}

TEXT TO REWRITE:
"""
${text.slice(0, 4000)}
"""

${passInstructions}

ABSOLUTE RULES — violating any of these makes the output useless:
- Preserve ALL factual content, data, citations, and technical terminology EXACTLY
- Do NOT add new information or claims not in the original
- Do NOT remove key points or arguments
- The academic quality must be EQUAL TO OR BETTER than the original
- Output length should be similar to input length (within 20%)
- Do NOT include any explanation, label, or preamble — output the rewritten text ONLY
- Start writing immediately with the first word of the rewritten text

REWRITE NOW:`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',  // Sonnet for much better rewriting quality
      max_tokens: 4096,
      temperature: 1,   // max creativity for more varied output
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI error on pass ' + pass);
  return data.content.map(b => b.text || '').join('').trim();
}

app.post('/api/humanise', auth, async (req, res) => {
  try {
    const { text, style } = req.body;
    if (!text || text.trim().length < 20)
      return res.status(400).json({ error: 'Please provide some text to humanise.' });
    if (!ANTHROPIC_KEY)
      return res.status(500).json({ error: 'AI service not configured.' });

    const u = await db.get('SELECT plan,checks_used,checks_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);
    const isFreeH = u.plan === 'free';
    const isPaidH = ['basic','researcher','university'].includes(u.plan);
    if (!isFreeH && !isPaidH)
      return res.status(403).json({ error: 'No active subscription. Please subscribe first.', subscribe: true });
    if (isPaidH && u.sub_expires && new Date(u.sub_expires) < new Date())
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });
    if (u.checks_used >= u.checks_limit)
      return res.status(429).json({
        error: isFreeH
          ? 'You have used your free trial check. Subscribe to continue.'
          : 'Monthly check limit reached. Please upgrade.',
        subscribe: true,
        freeLimitReached: isFreeH,
      });

    const styles = {
      academic: 'formal academic writing with natural scholarly voice — the kind a senior Nigerian researcher would write',
      casual:   'warm and conversational — knowledgeable but approachable, like explaining to a colleague over coffee',
      student:  'bright university student — intelligent arguments, some contractions, slightly informal at times, personal perspective',
      balanced: 'professional Nigerian academic — clear, confident, authoritative but clearly written by a person not a machine',
    };
    const styleDesc = styles[style] || styles.balanced;

    // ── Two-pass humanisation for deep transformation ──────
    console.log('Humanise pass 1 starting...');
    const pass1 = await runHumanisePass(text, styleDesc, 1);

    console.log('Humanise pass 2 starting...');
    const humanised = await runHumanisePass(pass1, styleDesc, 2);

    if (!humanised) return res.status(502).json({ error: 'No output received. Please try again.' });

    // Count as one check
    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);

    res.json({
      humanised,
      originalLength: text.length,
      humanisedLength: humanised.length,
      passes: 2,
    });
  } catch (e) {
    console.error('Humanise error:', e);
    res.status(500).json({ error: 'Humanisation failed. Please try again.' });
  }
});

// ── HISTORY ───────────────────────────────────────────────
app.get('/api/history', auth, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM checks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ checks: rows.map(r => ({ ...r, suggestions: JSON.parse(r.suggestions || '[]') })) });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// ── CERTIFICATE ───────────────────────────────────────────
app.get('/api/certificate/:id', auth, async (req, res) => {
  try {
    // Free tier cannot download certificates
    const userPlan = await db.get('SELECT plan FROM users WHERE id=$1', [req.user.id]);
    if (userPlan.plan === 'free') {
      return res.status(403).json({
        error: 'Certificates are not available on the free trial. Please subscribe to download your certificate.',
        subscribe: true,
        freeLimitReached: true,
      });
    }
    const chk = await db.get('SELECT * FROM checks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!chk) return res.status(404).json({ error: 'Check not found.' });
    const user = await db.get('SELECT name,email,institution FROM users WHERE id=$1', [req.user.id]);
    // Allow custom title and institution from query params
    const overrides = {
      title: req.query.title || null,
      institution: req.query.institution || null,
      showAi: req.query.showAi !== '0',  // default true, false only if explicitly '0'
    };
    const buf = await makeCertificate(chk, user, overrides);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="OriginCheck-${chk.id.slice(0,8)}.pdf"` });
    res.send(buf);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Certificate generation failed.' }); }
});

async function makeCertificate(chk, user, overrides = { showAi: true }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const bufs = [];
      doc.on('data', b => bufs.push(b));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      // Register Arabic fonts if available
      if (ARABIC_FONTS_AVAILABLE) {
        doc.registerFont('Amiri',        FONT_REGULAR);
        doc.registerFont('Amiri-Bold',   FONT_BOLD);
        doc.registerFont('Amiri-Italic', FONT_ITALIC);
      }

      // Helper: pick correct font based on text content
      const fontRegular = (text) => ARABIC_FONTS_AVAILABLE && hasArabic(text) ? 'Amiri'        : 'Helvetica';
      const fontBold    = (text) => ARABIC_FONTS_AVAILABLE && hasArabic(text) ? 'Amiri-Bold'   : 'Helvetica-Bold';
      const fontItalic  = (text) => ARABIC_FONTS_AVAILABLE && hasArabic(text) ? 'Amiri-Italic' : 'Helvetica-BoldOblique';

      const W = doc.page.width;
      const H = doc.page.height;
      const pct = chk.similarity;

      const TEAL   = '#2a7a79';
      const TEAL_L = '#eaf6f6';
      const TEAL_M = '#3a9c9a';
      const GOLD   = '#c8a94a';
      const GOLD_M = '#e8d48a';
      const INK    = '#2d3a4a';
      const PAPER  = '#fafaf8';
      const MUTED  = '#718096';

      const scoreColor = pct < 20 ? '#1a7a4a' : pct < 40 ? '#b8860b' : '#c0392b';
      const scoreBg    = pct < 20 ? '#edfaf4' : pct < 40 ? '#fef9e7' : '#fdf0ee';
      const scoreLabel = pct < 20 ? 'HIGH ORIGINALITY' : pct < 40 ? 'MODERATE SIMILARITY' : 'HIGH SIMILARITY';

      const rawTitle = overrides.title || chk.filename || chk.preview || 'Submitted Document';
      const cleanTitle = rawTitle.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/-/g, ' ').trim();
      const displayInstitution = overrides.institution || user.institution || 'Independent Researcher';

      const aiScore = chk.ai_score || 0;
      const aiLabel = aiScore < 20 ? 'Likely Human Written' : aiScore < 50 ? 'Uncertain' : aiScore < 75 ? 'Likely AI Generated' : 'Almost Certainly AI Generated';
      const aiColor = aiScore < 20 ? '#1a7a4a' : aiScore < 50 ? '#b8860b' : '#c0392b';

      const issued  = new Date(chk.created_at);
      const dateStr = issued.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = issued.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const certRef = 'OC-' + chk.id.slice(0, 8).toUpperCase();

      // Fixed layout zones
      const HEADER_H  = 70;
      const META_H    = 72;
      const SIDEBAR_W = 52;
      const PANEL_W   = 185;
      const contentX  = 68;
      const panelX    = W - PANEL_W - 2;
      const contentW  = panelX - contentX - 10;
      const zoneTop   = HEADER_H + 8;
      const zoneBot   = H - META_H - 6;
      const zoneH     = zoneBot - zoneTop;

      // Background
      doc.rect(0, 0, W, H).fill(PAPER);

      // Sidebar
      doc.rect(0, 0, 44, H).fill('#3a7a79');  // lighter teal sidebar
      doc.rect(44, 0, 8, H).fill(GOLD);
      doc.save();
      doc.translate(22, H / 2);
      doc.rotate(-90);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
         .text('ORIGINCHECK  \u00B7  ACADEMIC INTEGRITY PLATFORM  \u00B7  SIMILARITY REPORT',
               -200, -4, { width: 400, align: 'center', characterSpacing: 1.2 });
      doc.restore();

      // Header band
      doc.rect(SIDEBAR_W, 0, W - SIDEBAR_W, HEADER_H).fill('#f0fbfb');
      doc.rect(SIDEBAR_W, HEADER_H - 4, W - SIDEBAR_W, 4).fill(GOLD);
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(22)
         .text('Origin', contentX, 14, { continued: true })
         .fillColor(GOLD).text('Check');
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
         .text('SIMILARITY REPORT', contentX, 40, { characterSpacing: 2 });
      doc.moveTo(contentX, 55).lineTo(contentX + 110, 55).lineWidth(0.8).strokeColor(GOLD).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7)
         .text('Academic Integrity Platform', contentX, 58);
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13)
         .text('CERTIFICATE OF ORIGINALITY', 185, 18, { width: W - 390, align: 'center', characterSpacing: 1.5 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
         .text('This document certifies the originality analysis of the submitted academic work', 185, 36, { width: W - 390, align: 'center' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
         .text('Ref: ' + certRef, W - 148, 20, { width: 133, align: 'right' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
         .text(dateStr, W - 148, 32, { width: 133, align: 'right' });

      // Right score panel — spans full content zone
      doc.rect(panelX, zoneTop - 2, PANEL_W + 2, zoneH + 4).fill('#2d7878');
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8)
         .text('SIMILARITY SCORE', panelX, zoneTop + 12, { width: PANEL_W, align: 'center', characterSpacing: 1 });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(58)
         .text(pct + '%', panelX, zoneTop + 28, { width: PANEL_W, align: 'center' });
      doc.roundedRect(panelX + 18, zoneTop + 96, 149, 22, 3).fill(scoreBg);
      doc.fillColor(scoreColor).font('Helvetica-Bold').fontSize(7.5)
         .text(scoreLabel, panelX + 18, zoneTop + 102, { width: 149, align: 'center', characterSpacing: 1 });
      doc.moveTo(panelX + 15, zoneTop + 128).lineTo(panelX + 170, zoneTop + 128)
         .lineWidth(0.5).strokeColor(GOLD_M).stroke();
      [['Grammar Issues', chk.grammar ?? 0], ['Source Matches', chk.sources ?? 0], ['Citations Found', chk.citations ?? 0]]
        .forEach(([label, val], i) => {
          const sy = zoneTop + 138 + i * 32;
          doc.fillColor(GOLD_M).font('Helvetica').fontSize(7.5).text(label, panelX + 12, sy, { width: 100 });
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
             .text(String(val), panelX + 100, sy - 2, { width: 70, align: 'right' });
          if (i < 2) doc.moveTo(panelX + 12, sy + 16).lineTo(panelX + 173, sy + 16)
             .lineWidth(0.3).strokeColor(TEAL_M).stroke();
        });

      // Content left side — institution, author, title, pills
      let curY = zoneTop + 4;

      // Institution
      doc.fillColor(TEAL).font(fontBold(displayInstitution)).fontSize(15)
         .text(displayInstitution, contentX, curY, { width: contentW });
      const instLines = Math.ceil(displayInstitution.length / 52);
      curY += instLines * 19;
      doc.moveTo(contentX, curY)
         .lineTo(contentX + Math.min(displayInstitution.length * 8.5, contentW), curY)
         .lineWidth(2).strokeColor(GOLD).stroke();

      // Author
      curY += 7;
      const authorName = user.name || 'Unknown Author';
      doc.fillColor(INK).font(fontItalic(authorName)).fontSize(30)
         .text(authorName, contentX, curY, { width: contentW });
      curY += 42;

      // Title
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(7)
         .text('PAPER TITLE', contentX, curY, { characterSpacing: 1.5 });
      curY += 11;
      // Full title — no truncation, wraps naturally
      // Arabic text: don't uppercase (Arabic has no uppercase)
      const titleDisplay = hasArabic(cleanTitle) ? cleanTitle : cleanTitle.toUpperCase();
      const titleLineCount = Math.ceil(cleanTitle.length / 60);
      doc.fillColor(INK).font(fontBold(cleanTitle)).fontSize(9)
         .text(titleDisplay, contentX, curY, { width: contentW, lineGap: 3 });
      curY += Math.max(titleLineCount * 13, 14) + 10;

      // Pills
      const pillW = 120, pillH = 38, pillGap = 8;
      const pillY = curY;
      [
        { label: 'Threshold Set', value: '25.0%', color: TEAL, bg: TEAL_L },
        { label: 'Abstract Validation', value: pct + '.0%', color: scoreColor, bg: scoreBg },
        { label: 'Similarity Score', value: pct + '.0%', color: scoreColor, bg: scoreBg },
      ].forEach((pill, i) => {
        const px = contentX + i * (pillW + pillGap);
        doc.roundedRect(px, pillY, pillW, pillH, 3).fill(pill.bg);
        doc.rect(px, pillY, 3, pillH).fill(pill.color);
        doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(pill.label, px + 8, pillY + 7, { width: pillW - 12 });
        doc.fillColor(pill.color).font('Helvetica-Bold').fontSize(15).text(pill.value, px + 8, pillY + 20, { width: pillW - 12 });
      });
      const aiPillX = contentX + 3 * (pillW + pillGap);
      const aiBg = aiScore < 20 ? '#edfaf4' : aiScore < 50 ? '#fef9e7' : '#fdf0ee';
      doc.roundedRect(aiPillX, pillY, pillW, pillH, 3).fill(aiBg);
      doc.rect(aiPillX, pillY, 3, pillH).fill(aiColor);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text('AI Detection', aiPillX + 8, pillY + 7);
      doc.fillColor(aiColor).font('Helvetica-Bold').fontSize(9.5)
         .text(aiScore + '% — ' + aiLabel, aiPillX + 8, pillY + 20, { width: pillW - 12 });
      curY = pillY + pillH + 10;

      // AI Verdict — conditional on showAi flag, fills remaining space
      const showAiVerdict = overrides.showAi !== false;
      const verdictText = (chk.ai_verdict || '').trim();
      const verdictY = curY;
      if (showAiVerdict && verdictText) {
        const verdictH = Math.max(zoneBot - verdictY, 55);
        doc.roundedRect(contentX, verdictY, panelX - contentX - 4, verdictH, 3).fill('#eaf6f6');
        doc.rect(contentX, verdictY, 4, verdictH).fill(TEAL);
        doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(8)
           .text('AI ANALYSIS VERDICT', contentX + 12, verdictY + 10, { characterSpacing: 1.2 });
        // Bold, 14pt, stands out
        doc.fillColor('#1a2a3a').font(fontBold(verdictText)).fontSize(12)
           .text(verdictText, contentX + 12, verdictY + 24,
                 { width: panelX - contentX - 24, lineGap: 4 });
      }

      // Metadata bar — pinned to exact bottom
      const metaY = H - META_H;
      doc.rect(SIDEBAR_W, metaY, W - SIDEBAR_W, META_H).fill('#3d5068');
      doc.rect(SIDEBAR_W, metaY, W - SIDEBAR_W, 3).fill(GOLD);
      const metaColW = (W - SIDEBAR_W - 90) / 4;
      [['Submitted By', user.name || 'Unknown'], ['Institution', displayInstitution],
       ['Date Issued', dateStr + '  ' + timeStr], ['Certificate', certRef]]
        .forEach(([label, val], i) => {
          const mx = contentX + i * metaColW;
          doc.fillColor(GOLD_M).font('Helvetica').fontSize(6.5)
             .text(label.toUpperCase(), mx, metaY + 9, { characterSpacing: 1 });
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
             .text(val, mx, metaY + 20, { width: metaColW - 8 });
        });
      doc.fillColor(GOLD_M).font('Helvetica').fontSize(6.5)
         .text('VERIFY ONLINE', contentX, metaY + 39, { characterSpacing: 1 });
      doc.fillColor(GOLD).font('Helvetica').fontSize(7.5)
         .text('https://origincheck.ng/verify?ref=' + certRef, contentX, metaY + 49);

      // QR code
      const qrBuf = await QRCode.toBuffer(
        JSON.stringify({ id: chk.id, ref: certRef, score: pct, user: user.email, date: dateStr }),
        { width: 90, margin: 1, color: { dark: '#ffffff', light: '#3d5068' } }
      );
      doc.image(qrBuf, W - 88, metaY + 5, { width: 58 });

      doc.end();
    } catch (e) { reject(e); }
  });
}

// ── ADMIN ─────────────────────────────────────────────────
app.get('/api/admin/stats', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const [tu,au,tc,tr,rp,ru] = await Promise.all([
      db.get("SELECT COUNT(*) c FROM users"),
      db.get("SELECT COUNT(*) c FROM users WHERE plan!='none'"),
      db.get("SELECT COUNT(*) c FROM checks"),
      db.get("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='success'"),
      db.all("SELECT p.*,u.name,u.email FROM payments p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 20"),
      db.all("SELECT id,name,email,institution,plan,checks_used,checks_limit,sub_expires,created_at FROM users ORDER BY created_at DESC LIMIT 20"),
    ]);
    res.json({ totalUsers:tu.c, activeUsers:au.c, totalChecks:tc.c, totalRevenue:tr.s, recentPayments:rp, recentUsers:ru });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to load stats.' }); }
});

app.post('/api/admin/set-plan', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  const { email, plan } = req.body;
  const pl = PLANS[plan];
  if (!pl) return res.status(400).json({ error: 'Invalid plan.' });
  const exp = new Date(); exp.setDate(exp.getDate() + 30);
  const r = await db.run('UPDATE users SET plan=$1,checks_limit=$2,checks_used=0,sub_expires=$3 WHERE email=$4',
    [plan, pl.checks, exp.toISOString(), email.toLowerCase().trim()]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ success: true, message: `${email} upgraded to ${plan}` });
});

app.post('/api/admin/extend', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  const { email, days = 30 } = req.body;
  const user = await db.get('SELECT sub_expires FROM users WHERE email=$1', [email.toLowerCase().trim()]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const base = user.sub_expires && new Date(user.sub_expires) > new Date() ? new Date(user.sub_expires) : new Date();
  base.setDate(base.getDate() + Number(days));
  await db.run('UPDATE users SET sub_expires=$1 WHERE email=$2', [base.toISOString(), email.toLowerCase().trim()]);
  res.json({ success: true, message: `${email} extended by ${days} days` });
});

// ── AFFILIATE ROUTES ──────────────────────────────────────

// Join affiliate programme
app.post('/api/affiliate/join', auth, async (req, res) => {
  try {
    const existing = await db.get('SELECT id FROM affiliates WHERE user_id=$1', [req.user.id]);
    if (existing) return res.status(409).json({ error: 'You are already an affiliate.' });

    // Generate unique code from user name + random
    const user = await db.get('SELECT name FROM users WHERE id=$1', [req.user.id]);
    const base = (user.name || 'USER').replace(/\s+/g,'').slice(0,6).toUpperCase();
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const code = base + rand;

    const affId = uuidv4();
    await db.run(
      'INSERT INTO affiliates (id,user_id,code) VALUES ($1,$2,$3)',
      [affId, req.user.id, code]
    );
    const aff = await db.get('SELECT * FROM affiliates WHERE id=$1', [affId]);
    res.json({ affiliate: aff });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to join affiliate programme.' }); }
});

// Get affiliate dashboard data
app.get('/api/affiliate/dashboard', auth, async (req, res) => {
  try {
    const aff = await db.get('SELECT * FROM affiliates WHERE user_id=$1', [req.user.id]);
    if (!aff) return res.status(404).json({ error: 'Not an affiliate.' });

    const referrals = await db.all(
      `SELECT r.*, u.name as referred_name, u.email as referred_email, u.plan as referred_plan
       FROM referrals r JOIN users u ON r.referred_user_id=u.id
       WHERE r.affiliate_id=$1 ORDER BY r.created_at DESC LIMIT 50`,
      [aff.id]
    );
    res.json({ affiliate: aff, referrals });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed.' }); }
});

// Update bank details for payout
app.post('/api/affiliate/bank', auth, async (req, res) => {
  try {
    const { bank_name, bank_account, bank_holder } = req.body;
    if (!bank_name || !bank_account || !bank_holder)
      return res.status(400).json({ error: 'All bank fields are required.' });
    const aff = await db.get('SELECT id FROM affiliates WHERE user_id=$1', [req.user.id]);
    if (!aff) return res.status(404).json({ error: 'Not an affiliate.' });
    await db.run(
      'UPDATE affiliates SET bank_name=$1,bank_account=$2,bank_holder=$3 WHERE id=$4',
      [bank_name.trim(), bank_account.trim(), bank_holder.trim(), aff.id]
    );
    res.json({ success: true, message: 'Bank details saved.' });
  } catch (e) { res.status(500).json({ error: 'Failed to save bank details.' }); }
});

// Request payout (admin will process manually)
app.post('/api/affiliate/payout', auth, async (req, res) => {
  try {
    const aff = await db.get('SELECT * FROM affiliates WHERE user_id=$1', [req.user.id]);
    if (!aff) return res.status(404).json({ error: 'Not an affiliate.' });
    if (!aff.bank_account) return res.status(400).json({ error: 'Please add your bank details first.' });
    if (aff.pending_earnings < 100) // min $1.00
      return res.status(400).json({ error: 'Minimum payout is $1.00. Keep earning!' });
    // Mark all pending referrals as payout_requested
    await db.run(
      "UPDATE referrals SET status='payout_requested' WHERE affiliate_id=$1 AND status='pending'",
      [aff.id]
    );
    res.json({ success: true, message: `Payout request of $${(aff.pending_earnings/100).toFixed(2)} submitted. We will transfer within 48 hours.` });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// Admin: list all affiliates + payout requests
app.get('/api/admin/affiliates', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const affiliates = await db.all(
      `SELECT a.*, u.name, u.email FROM affiliates a JOIN users u ON a.user_id=u.id ORDER BY a.total_earnings DESC`
    );
    const payoutRequests = await db.all(
      `SELECT r.*, u.name as aff_name, u.email as aff_email, a.bank_name, a.bank_account, a.bank_holder
       FROM referrals r
       JOIN affiliates a ON r.affiliate_id=a.id
       JOIN users u ON a.user_id=u.id
       WHERE r.status='payout_requested'
       ORDER BY r.created_at DESC`
    );
    res.json({ affiliates, payoutRequests });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed.' }); }
});

// Admin: mark payout as paid
app.post('/api/admin/affiliate/pay', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  const { affiliate_id } = req.body;
  try {
    const aff = await db.get('SELECT * FROM affiliates WHERE id=$1', [affiliate_id]);
    if (!aff) return res.status(404).json({ error: 'Affiliate not found.' });
    // Move pending to paid
    await db.run('UPDATE affiliates SET paid_earnings=paid_earnings+$1, pending_earnings=0 WHERE id=$2',
      [aff.pending_earnings, affiliate_id]);
    await db.run("UPDATE referrals SET status='paid' WHERE affiliate_id=$1 AND status='payout_requested'", [affiliate_id]);
    res.json({ success: true, message: `$${(aff.pending_earnings/100).toFixed(2)} marked as paid to ${aff.bank_holder}` });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// Public: validate a referral code (for register page)
app.get('/api/affiliate/validate/:code', async (req, res) => {
  try {
    const aff = await db.get(
      'SELECT a.code, u.name FROM affiliates a JOIN users u ON a.user_id=u.id WHERE a.code=$1',
      [req.params.code.toUpperCase()]
    );
    if (!aff) return res.status(404).json({ error: 'Invalid referral code.' });
    res.json({ valid: true, referrer: aff.name, code: aff.code });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// ── EMAIL BROADCAST ───────────────────────────────────────

// Helper: build a beautiful HTML email
function buildEmailHTML(subject, body, userName = '') {
  const greeting = userName ? `Dear ${userName},` : 'Dear OriginCheck User,';
  // Convert plain text line breaks to HTML paragraphs
  const htmlBody = body
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.7;color:#374151;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0d1117;padding:24px 32px;border-radius:8px 8px 0 0;border-bottom:3px solid #c8a94a;">
            <span style="font-family:Georgia,serif;font-size:24px;font-weight:900;color:#c8a94a;">Origin</span><span style="font-family:Georgia,serif;font-size:24px;font-weight:900;color:#ffffff;">Check</span>
            <span style="display:block;font-size:11px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Academic Integrity Platform</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border-radius:0 0 8px 8px;">
            <p style="margin:0 0 20px 0;font-size:15px;color:#6b7280;">${greeting}</p>
            ${htmlBody}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              This email was sent from OriginCheck (<a href="${APP_URL}" style="color:#1a5c5b;">${APP_URL}</a>).<br/>
              If you have questions, reply to this email or contact us at info@origincheck.ng.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2026 OriginCheck · origincheck.ng · Abuja, Nigeria</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// GET /api/admin/email-preview — get user counts per segment
app.get('/api/admin/email-preview', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const [all, basic, researcher, university, nosub, expired] = await Promise.all([
      db.get("SELECT COUNT(*) c FROM users"),
      db.get("SELECT COUNT(*) c FROM users WHERE plan='basic'"),
      db.get("SELECT COUNT(*) c FROM users WHERE plan='researcher'"),
      db.get("SELECT COUNT(*) c FROM users WHERE plan='university'"),
      db.get("SELECT COUNT(*) c FROM users WHERE plan='none'"),
      db.get("SELECT COUNT(*) c FROM users WHERE sub_expires < NOW() AND plan IN ('basic','researcher','university')"),
    ]);
    res.json({
      segments: {
        all:        parseInt(all.c),
        basic:      parseInt(basic.c),
        researcher: parseInt(researcher.c),
        university: parseInt(university.c),
        nosub:      parseInt(nosub.c),
        expired:    parseInt(expired.c),
      }
    });
  } catch(e) { res.status(500).json({ error: 'Failed to load counts.' }); }
});

// POST /api/admin/email-send — send broadcast email
app.post('/api/admin/email-send', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });

  const { segment, subject, body, personalise } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });

  const rs = getResend();
  if (!rs) return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY to your environment variables.' });

  try {
    // Get target users
    const segmentQuery = {
      all:        "SELECT id, name, email FROM users ORDER BY created_at DESC",
      basic:      "SELECT id, name, email FROM users WHERE plan='basic' ORDER BY created_at DESC",
      researcher: "SELECT id, name, email FROM users WHERE plan='researcher' ORDER BY created_at DESC",
      university: "SELECT id, name, email FROM users WHERE plan='university' ORDER BY created_at DESC",
      nosub:      "SELECT id, name, email FROM users WHERE plan='none' ORDER BY created_at DESC",
      expired:    "SELECT id, name, email FROM users WHERE sub_expires < NOW() AND plan IN ('basic','researcher','university') ORDER BY sub_expires DESC",
    };

    const query = segmentQuery[segment] || segmentQuery.all;
    const users = await db.all(query);

    if (users.length === 0) return res.status(400).json({ error: 'No users found in this segment.' });

    // Send emails in batches of 10 to avoid rate limits
    let sent = 0, failed = 0;
    const errors = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (user) => {
        try {
          const html = buildEmailHTML(subject, body, personalise ? user.name : '');
          const textBody = personalise
            ? `Dear ${user.name},\n\n${body}\n\nOriginCheck Team`
            : body + '\n\nOriginCheck Team';

          await rs.emails.send({
            from: `${ADMIN_NAME} <${FROM_EMAIL}>`,
            to: user.email,
            subject,
            html,
            text: textBody,
          });
          sent++;
        } catch(e) {
          failed++;
          errors.push(`${user.email}: ${e.message}`);
          console.error('Email send error for', user.email, e.message);
        }
      }));

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < users.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`Email broadcast: ${sent} sent, ${failed} failed. Subject: "${subject}"`);
    res.json({
      success: true,
      sent,
      failed,
      total: users.length,
      errors: errors.slice(0, 5), // only return first 5 errors
    });
  } catch(e) {
    console.error('Broadcast error:', e);
    res.status(500).json({ error: 'Email broadcast failed: ' + e.message });
  }
});

// POST /api/admin/email-test — send a test email to admin only
app.post('/api/admin/email-test', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });

  const { subject, body } = req.body;
  const rs = getResend();
  if (!rs) return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY.' });

  try {
    const html = buildEmailHTML(subject || 'Test Email', body || 'This is a test email from OriginCheck admin.', 'Admin');
    await rs.emails.send({
      from: `${ADMIN_NAME} <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: '[TEST] ' + (subject || 'Test Email'),
      html,
      text: body || 'This is a test email.',
    });
    res.json({ success: true, message: `Test email sent to ${ADMIN_EMAIL}` });
  } catch(e) {
    res.status(500).json({ error: 'Test email failed: ' + e.message });
  }
});

// ── Health check endpoint ─────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'OriginCheck',
    time: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// ── Catch-all ─────────────────────────────────────────────
app.get('*', (req, res) => {
  const idx = path.join(BUILD, 'index.html');
  if (fs.existsSync(idx)) {
    res.sendFile(idx);
  } else {
    // API-only mode on Railway — frontend is on Vercel
    res.status(200).json({
      status: 'ok',
      message: 'OriginCheck API is running',
      frontend: process.env.FRONTEND_URL || 'https://origincheck.ng',
      docs: 'API endpoints available at /api/*'
    });
  }
});

// ── Self-ping to prevent Render free tier sleep ───────────
// Pings own /api/health every 13 minutes (Render sleeps at 15 min)
function startKeepAlive() {
  const INTERVAL_MS = 13 * 60 * 1000; // 13 minutes

  // Only run in production and only if APP_URL is set
  if (process.env.NODE_ENV !== 'production' || !process.env.APP_URL) {
    console.log('Keep-alive disabled (not production or no APP_URL set)');
    return;
  }

  const pingUrl = process.env.APP_URL.replace(/\/$/, '') + '/api/health';
  console.log(`Keep-alive started — pinging ${pingUrl} every 13 minutes`);

  setInterval(async () => {
    try {
      const res = await fetch(pingUrl, { method: 'GET', signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`Keep-alive ping OK — uptime: ${data.uptime}`);
      } else {
        console.warn(`Keep-alive ping returned ${res.status}`);
      }
    } catch (err) {
      console.warn('Keep-alive ping failed:', err.message);
    }
  }, INTERVAL_MS);
}

// ── Startup validation ────────────────────────────────────
function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('FATAL: Missing environment variables:', missing.join(', '));
    process.exit(1);
  }
  console.log('OriginCheck starting...');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('PORT:', PORT);
  console.log('Database:', process.env.DATABASE_URL ? 'configured' : 'MISSING');
  console.log('Anthropic:', process.env.ANTHROPIC_API_KEY ? 'configured' : 'not set');
  console.log('Paystack:', process.env.PAYSTACK_SECRET_KEY ? 'configured' : 'not set');
  console.log('Copyleaks:', process.env.COPYLEAKS_API_KEY ? 'configured' : 'not set');
  console.log('Resend:', process.env.RESEND_API_KEY ? 'configured' : 'not set');
}

process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// ── Start ─────────────────────────────────────────────────
validateEnv();
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`OriginCheck running on port ${PORT}`);
      startKeepAlive();
    });
  })
  .catch(e => {
    console.error('DB init failed:', e.message);
    console.error('Check DATABASE_URL environment variable');
    process.exit(1);
  });

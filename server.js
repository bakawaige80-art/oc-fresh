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
const QRCode      = require('qrcode');
const fs          = require('fs');
// Resend uses direct HTTP API - no npm package needed

// ── Arabic text helpers ───────────────────────────────────
function hasArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

// Font paths
const FONT_DIR      = path.join(__dirname, 'fonts');
const FONT_REGULAR  = path.join(FONT_DIR, 'Amiri-Regular.ttf');
const FONT_BOLD     = path.join(FONT_DIR, 'Amiri-Bold.ttf');
const FONT_ITALIC   = path.join(FONT_DIR, 'Amiri-Italic.ttf');
const FONT_BLACKLETTER = path.join(FONT_DIR, 'UnifrakturCook-Bold.ttf');   // optional: certificate title falls back to Times if missing
const ARABIC_FONTS_AVAILABLE = fs.existsSync(FONT_REGULAR);

// ── Config ────────────────────────────────────────────────
const PORT        = process.env.PORT || 3001;
const JWT_SECRET  = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_NAME  = process.env.ADMIN_NAME  || 'OriginCheck Team';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const PAYSTACK_KEY  = process.env.PAYSTACK_SECRET_KEY || '';
const APP_URL     = process.env.APP_URL || 'http://localhost:3001';
const BREVO_KEY   = process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || '';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'noreply@origincheck.ng';
const GPTZERO_KEY = process.env.GPTZERO_API_KEY || '';

// ── Send email via Brevo (formerly Sendinblue) ─────────────
// Free: 300 emails/day forever. No npm package — pure HTTP.
// Sign up at brevo.com → SMTP & API → API Keys → Create
async function sendEmail({ to, subject, html, text }) {
  if (!BREVO_KEY) throw new Error('Email not configured. Add BREVO_API_KEY to environment variables.');
  const replyTo = process.env.REPLY_TO_EMAIL || ADMIN_EMAIL || FROM_EMAIL;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: ADMIN_NAME || 'OriginCheck', email: FROM_EMAIL },
      to:          Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }],
      replyTo:     { email: replyTo },
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || JSON.stringify(data) || 'Email send failed');
  return data;
}

// ── Plans ─────────────────────────────────────────────────
const PLANS = {
  // gptzeroWords = max words per check using GPTZero deep scan (currently dormant feature)
  free:       { name: 'Free',       naira: 0,     price: 0,       checks: 1,     gptzeroWords: 0,    gptzeroChecks: 0  },
  basic:      { name: 'Basic',      naira: 3500,  price: 350000,  checks: 30,    gptzeroWords: 500,  gptzeroChecks: 5  },
  researcher: { name: 'Pro',        naira: 10000, price: 1000000, checks: 100,   gptzeroWords: 1000, gptzeroChecks: 20 },
  university: { name: 'University', naira: 25000, price: 2500000, checks: 99999, gptzeroWords: 2000, gptzeroChecks: 50 },
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
      gptzero_used INTEGER DEFAULT 0,
      gptzero_limit INTEGER DEFAULT 0,
      sub_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS copyleaks_used INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS copyleaks_limit INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gptzero_used INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gptzero_limit INTEGER DEFAULT 0;
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
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS authorization_url TEXT;
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

    -- Ambassador programme table
    CREATE TABLE IF NOT EXISTS ambassadors (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      institution TEXT NOT NULL,
      role TEXT NOT NULL,
      whatsapp TEXT,
      motivation TEXT,
      status TEXT DEFAULT 'pending',
      referrals_this_month INTEGER DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      activated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ambassadors_user   ON ambassadors(user_id);
    CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON ambassadors(status);
    ALTER TABLE ambassadors ADD COLUMN IF NOT EXISTS referrals_this_month INTEGER DEFAULT 0;
    ALTER TABLE ambassadors ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0;

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
app.set('trust proxy', 1);
// ── PAYSTACK WEBHOOK — must be raw BEFORE express.json() ──
// Paystack sends raw body for HMAC verification
app.post('/api/payment/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    // Always respond 200 immediately so Paystack does not retry
    res.sendStatus(200);

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const hash = crypto.createHmac('sha512', PAYSTACK_KEY).update(rawBody).digest('hex');
    const sig  = req.headers['x-paystack-signature'];

    if (!sig || hash !== sig) {
      console.error('Webhook: bad signature — ignoring. Expected:', hash, 'Got:', sig);
      return;
    }

    const ev = JSON.parse(rawBody.toString());
    console.log('Webhook event received:', ev.event, ev.data?.reference);

    if (ev.event === 'charge.success') {
      const ref = ev.data?.reference;
      if (ref) {
        const ok = await verifyPaystack(ref).catch(e => {
          console.error('Webhook verifyPaystack failed for ref', ref, ':', e.message);
          return false;
        });
        console.log('Webhook payment verification result:', ok, 'for ref:', ref);
      }
    }
  } catch(e) {
    console.error('Webhook error:', e.message);
  }
});

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
  const u = await db.get('SELECT id,name,email,institution,plan,checks_used,checks_limit,gptzero_used,gptzero_limit,sub_expires,created_at FROM users WHERE id=$1', [id]);
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
    // If the user paid but neither callback nor webhook reached us, activate them now.
    const now = Date.now();
    if (now - (lastPaymentSync.get(req.user.id) || 0) > 20000) {
      lastPaymentSync.set(req.user.id, now);
      await syncPendingPayments(req.user.id).catch(e => console.error('auto-sync:', e.message));
    }
    const user = await safeUser(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// ── PLANS ─────────────────────────────────────────────────
app.get('/api/plans', (req, res) => res.json({ plans: PLANS }));

// ── PAYMENT ───────────────────────────────────────────────
// Design goals: a customer who pays gets access automatically, whichever of
// these three safety nets fires first (all are idempotent and safe to repeat):
//   1) Paystack callback  -> browser returns to the site, plan activated
//   2) Paystack webhook   -> server-to-server, even if the user closes the tab
//   3) Auto-sync          -> when the user next opens the app (or taps "Activate my plan")

// Origin of THIS server as the browser sees it. Not taken from APP_URL, so a stale
// env var (old Render service, renamed service, etc.) can never send a customer to a dead site.
function requestOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host  = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : (APP_URL || '');
}
// Where to send the customer after paying: the same site that served the callback
// (single-service deploy). Only use FRONTEND_URL when this server has no built frontend.
function returnOrigin(req) {
  const origin = requestOrigin(req);
  const hasBuiltFrontend = fs.existsSync(path.join(__dirname, 'client', 'build', 'index.html'));
  return hasBuiltFrontend ? origin : (process.env.FRONTEND_URL || origin);
}

app.post('/api/payment/initialize', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan] || plan === 'free') return res.status(400).json({ error: 'Invalid plan.' });
    if (!PAYSTACK_KEY) return res.status(500).json({ error: 'Payment not configured on server.' });
    const user = await db.get('SELECT id,email,name FROM users WHERE id=$1', [req.user.id]);

    // Double-clicks / quick retries: hand back the checkout that is already open instead of creating another payment row.
    const open = await db.get(
      "SELECT reference, authorization_url FROM payments WHERE user_id=$1 AND plan=$2 AND status='pending' AND authorization_url IS NOT NULL AND created_at > NOW() - INTERVAL '10 minutes' ORDER BY created_at DESC LIMIT 1",
      [user.id, plan]);
    if (open) return res.json({ authorization_url: open.authorization_url, reference: open.reference, reused: true });

    const ref = 'oc_' + uuidv4().replace(/-/g, '').slice(0, 16);
    await db.run('INSERT INTO payments (id,user_id,plan,amount,reference) VALUES ($1,$2,$3,$4,$5)',
      [uuidv4(), user.id, plan, PLANS[plan].price, ref]);
    const ps = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, amount: PLANS[plan].price, reference: ref, currency: 'NGN',
        metadata: { user_id: user.id, plan, user_name: user.name },
        callback_url: `${requestOrigin(req)}/api/payment/callback` }),
    });
    const data = await ps.json();
    if (!data.status) {
      await db.run("DELETE FROM payments WHERE reference=$1 AND status='pending'", [ref]).catch(() => {});   // never leave a dead attempt behind
      throw new Error(data.message);
    }
    await db.run('UPDATE payments SET authorization_url=$1 WHERE reference=$2', [data.data.authorization_url, ref]);
    res.json({ authorization_url: data.data.authorization_url, reference: ref });
  } catch (e) { console.error('Payment init error:', e.message); res.status(500).json({ error: 'Could not start payment. Try again.' }); }
});

// Paystack sends the customer here right after payment.
app.get('/api/payment/callback', async (req, res) => {
  const back = returnOrigin(req);
  try {
    const ref = req.query.reference || req.query.trxref;
    if (!ref) return res.redirect(`${back}/?payment=failed`);
    const ok = await verifyPaystack(ref);
    res.redirect(ok ? `${back}/?payment=success&pref=${encodeURIComponent(ref)}` : `${back}/?payment=failed&pref=${encodeURIComponent(ref)}`);
  } catch (e) {
    console.error('Callback error:', e.message);
    res.redirect(`${back}/?payment=error&pref=${encodeURIComponent(req.query.reference || req.query.trxref || '')}`);
  }
});

function subscriptionActive(u) {
  return !!(u && ['basic', 'researcher', 'university'].includes(u.plan) && u.sub_expires && new Date(u.sub_expires) > new Date());
}

// Frontend polls this right after the customer returns from Paystack.
app.get('/api/payment/verify/:ref', auth, async (req, res) => {
  try {
    const pay = await db.get('SELECT * FROM payments WHERE reference=$1 AND user_id=$2', [req.params.ref, req.user.id]);
    if (!pay) return res.status(404).json({ error: 'Payment not found.' });
    let ok = false;
    if (pay.status === 'success' && subscriptionActive(await db.get('SELECT plan,sub_expires FROM users WHERE id=$1', [req.user.id]))) ok = true;
    else ok = await verifyPaystack(req.params.ref).catch(e => { console.error('verify route:', e.message); return false; });
    res.json({ status: ok ? 'success' : 'pending', user: await safeUser(req.user.id) });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Verification failed.' }); }
});

// "I already paid" — checks this user's recent unconfirmed payments with Paystack and activates any that succeeded.
app.post('/api/payment/sync', auth, async (req, res) => {
  try {
    const activated = await syncPendingPayments(req.user.id, { hours: 72, max: 5 });
    res.json({ activated: activated > 0, user: await safeUser(req.user.id) });
  } catch (e) { console.error('sync route:', e.message); res.status(500).json({ error: 'Could not check your payment. Please try again.' }); }
});

// ── ADMIN: Force-verify a stuck payment by reference ──────
app.post('/api/admin/fix-payment', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Reference required.' });
    const ok = await verifyPaystack(String(reference).trim(), { force: true });
    res.json({
      success: ok,
      message: ok
        ? 'Payment verified and subscription activated successfully.'
        : 'Verification failed — Paystack does not show this payment as successful, or the reference is unknown. Check Render logs.',
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payment/history', auth, async (req, res) => {
  try {
    const rows = await db.all('SELECT id,plan,amount,reference,status,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ payments: rows });
  } catch (e) { res.status(500).json({ error: 'Failed.' }); }
});

// Verify with Paystack and activate the plan. Safe to call any number of times for the same reference:
// only the FIRST successful call activates the plan and credits the affiliate.
async function verifyPaystack(reference, { force = false } = {}) {
  if (!PAYSTACK_KEY || !reference) { console.error('verifyPaystack: missing key or reference'); return false; }

  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_KEY}` } });
  const data = await r.json().catch(() => ({}));
  const tx = data && data.data;
  console.log('Paystack verify:', reference, '| api status:', data.status, '| payment status:', tx && tx.status, '| amount:', tx && tx.amount);
  if (!data.status || !tx || tx.status !== 'success') return false;

  // Our own payments row (created when checkout started) is the source of truth; metadata is the fallback.
  let row = await db.get('SELECT * FROM payments WHERE reference=$1', [reference]);
  let meta = tx.metadata || {};
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
  if (!meta.user_id && Array.isArray(meta.custom_fields)) {
    meta.custom_fields.forEach(f => { if (f.variable_name === 'user_id') meta.user_id = f.value; if (f.variable_name === 'plan') meta.plan = f.value; });
  }
  const user_id = (row && row.user_id) || meta.user_id;
  const plan    = (row && row.plan)    || meta.plan;
  const pl = PLANS[plan];
  if (!pl || plan === 'free' || !user_id) {
    console.error('verifyPaystack: cannot identify user/plan for', reference, '| row:', !!row, '| meta:', JSON.stringify(meta));
    return false;
  }

  // Never grant a plan for less than its price.
  if (!force && (Number(tx.amount) < pl.price || (tx.currency && tx.currency !== 'NGN'))) {
    console.error(`verifyPaystack: underpaid/wrong currency for ${reference}: paid ${tx.amount} ${tx.currency}, plan needs ${pl.price} NGN`);
    await db.run("UPDATE payments SET status='underpaid' WHERE reference=$1 AND status<>'success'", [reference]).catch(() => {});
    return false;
  }

  // Make sure a payments row exists (webhook could, in theory, beat our insert).
  if (!row) {
    await db.run('INSERT INTO payments (id,user_id,plan,amount,reference,status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (reference) DO NOTHING',
      [uuidv4(), user_id, plan, Number(tx.amount), reference, 'pending']);
  }

  // Claim: exactly one caller can flip pending -> success. Everyone else is a duplicate.
  const claim = await db.run("UPDATE payments SET status='success', paystack_id=$2 WHERE reference=$1 AND status<>'success' RETURNING id",
    [reference, String(tx.id)]);
  const wonClaim = claim.rowCount > 0;

  const cur = await db.get('SELECT plan,sub_expires FROM users WHERE id=$1', [user_id]);
  if (!cur) { console.error('verifyPaystack: user not found', user_id); return false; }

  if (!wonClaim && !force) {
    // Already processed. If the user is active on any plan, nothing to do — and an old payment must never overwrite a newer plan.
    if (subscriptionActive(cur)) return true;
    console.warn('verifyPaystack: payment was marked paid but user has no active plan — re-activating', reference);
  }

  // Renewing the same plan while still active stacks on the remaining time; anything else starts today.
  let startFrom = new Date();
  if (cur.plan === plan && cur.sub_expires && new Date(cur.sub_expires) > startFrom) startFrom = new Date(cur.sub_expires);
  const exp = new Date(startFrom); exp.setDate(exp.getDate() + 30);

  try {
    const upd = await db.run(
      'UPDATE users SET plan=$1,checks_limit=$2,checks_used=0,gptzero_limit=$3,gptzero_used=0,sub_expires=$4 WHERE id=$5',
      [plan, pl.checks, pl.gptzeroChecks || 0, exp.toISOString(), user_id]);
    if (upd.rowCount === 0) throw new Error('user row not updated');
    console.log(`Activated ${plan} for user ${user_id} until ${exp.toISOString()} (ref ${reference})`);
  } catch (e) {
    // Activation failed: release the claim so a retry (webhook / sync) can try again.
    await db.run("UPDATE payments SET status='pending' WHERE reference=$1", [reference]).catch(() => {});
    console.error('verifyPaystack: activation failed, will retry later:', e.message);
    throw e;
  }

  // Affiliate commission — only for the call that actually processed the payment.
  if (wonClaim) {
    try {
      const referred = await db.get('SELECT referred_by FROM users WHERE id=$1', [user_id]);
      if (referred && referred.referred_by) {
        const commAmount = Math.floor(pl.price * (COMMISSION[plan] || 0));
        if (commAmount > 0) {
          await db.run('INSERT INTO referrals (id,affiliate_id,referred_user_id,plan,commission,status) VALUES ($1,$2,$3,$4,$5,$6)',
            [uuidv4(), referred.referred_by, user_id, plan, commAmount, 'pending']);
          await db.run('UPDATE affiliates SET total_referrals=total_referrals+1, total_earnings=total_earnings+$1, pending_earnings=pending_earnings+$1 WHERE id=$2',
            [commAmount, referred.referred_by]);
          console.log('Affiliate commission credited:', referred.referred_by, commAmount);
        }
      }
    } catch (e) { console.error('Affiliate commission error:', e.message); }
  }
  return true;
}

// Check a user's recent unconfirmed payments with Paystack. Returns how many were activated.
async function syncPendingPayments(userId, { hours = 2, max = 3 } = {}) {
  const rows = await db.all(
    "SELECT reference FROM payments WHERE user_id=$1 AND status='pending' AND created_at > NOW() - make_interval(hours => $2) ORDER BY created_at DESC LIMIT $3",
    [userId, hours, max]);
  let activated = 0;
  for (const p of rows) {
    try { if (await verifyPaystack(p.reference)) activated++; }
    catch (e) { console.error('syncPendingPayments:', p.reference, e.message); }
  }
  return activated;
}
const lastPaymentSync = new Map();   // userId -> timestamp, keeps /api/auth/me cheap


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

// ── GPTZERO HELPER ────────────────────────────────────────
async function runGPTZero(text) {
  if (!GPTZERO_KEY) throw new Error('GPTZero not configured.');

  const r = await fetch('https://api.gptzero.me/v2/predict/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GPTZERO_KEY,
    },
    body: JSON.stringify({ document: text, multiscan: false }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error || data.message || 'GPTZero error');

  const doc = data.documents?.[0];
  if (!doc) throw new Error('No results from GPTZero');

  const sentences = (doc.sentences || []).map(s => ({
    text:          s.sentence,
    aiProbability: Math.round((s.generated_prob || 0) * 100),
    isAI:          (s.generated_prob || 0) > 0.5,
  }));

  const aiScore = Math.round((doc.average_generated_prob || 0) * 100);
  const burstiness = doc.burstiness_scores?.[0] ?? null;
  const perplexity = doc.perplexity ? Math.round(doc.perplexity) : null;
  const classification = doc.predicted_class || 'unknown';

  const labelMap = {
    human: 'Likely Human Written',
    mixed: 'Mixed — Partially AI Generated',
    ai:    'Almost Certainly AI Generated',
  };

  return {
    aiScore,
    aiLabel:    labelMap[classification] || 'Uncertain',
    aiVerdict:  doc.feedback || `GPTZero classified this text as "${classification}". Average AI probability: ${aiScore}%.`,
    sentences,
    burstiness,
    perplexity,
    classification,
    source: 'gptzero',
  };
}

// ── GPTZERO DEEP SCAN ENDPOINT ────────────────────────────
app.post('/api/gptzero-scan', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 50)
      return res.status(400).json({ error: 'Please provide at least 50 characters of text.' });
    if (!GPTZERO_KEY)
      return res.status(500).json({ error: 'GPTZero is not configured on this server.' });

    const u = await db.get('SELECT plan,gptzero_used,gptzero_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);
    const plan = PLANS[u.plan];
    if (!plan || plan.gptzeroChecks === 0)
      return res.status(403).json({ error: 'GPTZero Deep Scan is not available on your current plan. Upgrade to Basic or higher.', upgrade: true });

    if (u.plan !== 'free' && u.sub_expires && new Date(u.sub_expires) < new Date())
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });

    if (u.gptzero_used >= u.gptzero_limit)
      return res.status(429).json({ error: `You have used all ${u.gptzero_limit} GPTZero deep scans this month. Upgrade for more.`, upgrade: true });

    const words = text.trim().split(/\s+/).length;
    const wordLimit = plan.gptzeroWords || 500;
    if (words > wordLimit)
      return res.status(400).json({
        error: `Your text has ${words} words. Your plan allows up to ${wordLimit} words per GPTZero scan. Please shorten the text or upgrade your plan.`,
        wordLimit, wordCount: words,
      });

    const result = await runGPTZero(text.slice(0, wordLimit * 7));
    await db.run('UPDATE users SET gptzero_used=gptzero_used+1 WHERE id=$1', [req.user.id]);

    res.json({ ...result, wordCount: words, wordLimit, gptzeroUsed: u.gptzero_used + 1, gptzeroLimit: u.gptzero_limit });
  } catch(e) {
    console.error('GPTZero error:', e.message);
    res.status(500).json({ error: 'GPTZero scan failed: ' + e.message });
  }
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

// ── WEB-SEARCH-GROUNDED PLAGIARISM CHECK ──────────────────
// Uses Claude's native web_search tool so the model compares the
// submitted text against real, current web content instead of
// guessing from memory alone.
async function callAIWithSearch(prompt, maxTokens = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI search error');

  // Collect search result count for transparency, and the final text answer
  const searchCalls = (data.content || []).filter(b => b.type === 'server_tool_use' && b.name === 'web_search').length;
  const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  const parsed = JSON.parse(match[0]);
  parsed._searchesPerformed = searchCalls;
  return parsed;
}

// Split text into chunks for paragraph-level plagiarism scoring
function chunkText(text, maxChunkWords = 120) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  const chunks = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    if (words.length <= maxChunkWords) {
      chunks.push(para);
    } else {
      // Break long paragraphs into ~maxChunkWords pieces
      for (let i = 0; i < words.length; i += maxChunkWords) {
        chunks.push(words.slice(i, i + maxChunkWords).join(' '));
      }
    }
  }
  return chunks.filter(c => c.split(/\s+/).length >= 15); // skip tiny fragments
}

// ── CHECK ─────────────────────────────────────────────────
app.post('/api/check', auth, async (req, res) => {
  try {
    const { text, mode, filename, certTitle, certInstitution, checkKind } = req.body;
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Please provide some text to check.' });
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'AI service not configured.' });

    const u = await db.get('SELECT plan,checks_used,checks_limit,sub_expires FROM users WHERE id=$1', [req.user.id]);

    // Free plan users get their 1 trial check — no sub_expires needed
    const isFreeUser = u.plan === 'free';
    const isPaidUser = ['basic','researcher','university'].includes(u.plan);

    if (!isFreeUser && !isPaidUser)
      return res.status(403).json({ error: 'No active subscription. Please subscribe first.', subscribe: true });
    if (isPaidUser && (!u.sub_expires || new Date(u.sub_expires) < new Date()))
      return res.status(403).json({ error: 'Your subscription has expired. Please renew.', subscribe: true });
    if (u.checks_used >= u.checks_limit)
      return res.status(429).json({ error: `Monthly check limit reached. ${isFreeUser ? 'Subscribe for more checks.' : 'Please upgrade.'}`, subscribe: true });

    const sample = text.slice(0, 3000);
    const modes  = { text: 'full text passage', abstract: 'research abstract', title: 'research title' };
    const kind   = checkKind || 'plagiarism';

    let plag = null, aiDet = null;

    if (kind === 'plagiarism' || kind === 'both') {
      try {
        const chunks = chunkText(sample, 120).slice(0, 6); // cap at 6 chunks to control cost/latency

        // ── Self-plagiarism check: compare against this user's own past checks ──
        const pastChecks = await db.all(
          'SELECT preview FROM checks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15',
          [req.user.id]
        ).catch(() => []);
        const ownHistoryText = (pastChecks || []).map(c => c.preview).filter(Boolean).join(' ').slice(0, 2000);

        // ── Search-grounded comparison ──
        const searchPrompt = `You are an academic plagiarism detector with live web search access. Analyze this ${modes[mode] || 'text'} for originality.

TEXT TO CHECK:
"${sample}"

${ownHistoryText ? `ADDITIONAL CONTEXT — this author's own previous submissions (check for self-plagiarism / recycled content):
"${ownHistoryText}"
` : ''}

Instructions:
1. Identify 3-5 distinctive phrases or claims from the text that would be unusual if they appeared verbatim elsewhere.
2. Use web_search to check if those phrases appear on existing web pages, academic sources, or common reference content.
3. If self-plagiarism context was provided, compare the new text against it for recycled/duplicate content.
4. Base your similarity score on what you actually find in search results, not assumptions.

Reply ONLY with this exact JSON (no markdown, no explanation, no text outside the JSON):
{"similarityPercent":0,"verdict":"2-3 sentence professional assessment citing what was found","grammarIssues":0,"citationCount":0,"matchedSources":0,"selfPlagiarism":false,"suggestions":["tip one","tip two","tip three"],"flaggedPhrases":["phrase that matched a source, if any"]}

Guidance: similarityPercent 0-100 based on actual search findings. If searches found no matches, score low (0-15%) and say so honestly in the verdict.`;

        const searchResult = await callAIWithSearch(searchPrompt, 1800);

        // ── Chunk-level scoring for the heatmap (runs in parallel, lighter model) ──
        let chunkScores = [];
        if (chunks.length > 1) {
          const chunkPrompt = `Score each of these ${chunks.length} text passages for likely originality (0-100, where 0=fully original and 100=highly likely copied/templated content based on generic phrasing, common knowledge statements, or formulaic structure).

${chunks.map((c, i) => `PASSAGE ${i + 1}: "${c.slice(0, 400)}"`).join('\n\n')}

Reply ONLY with JSON: {"scores":[score1,score2,...]} — one number per passage, same order.`;

          chunkScores = await callAI(chunkPrompt, 600)
            .then(r => r.scores || [])
            .catch(() => chunks.map(() => null));
        }

        plag = {
          similarityPercent: searchResult.similarityPercent,
          verdict:           searchResult.verdict,
          grammarIssues:     searchResult.grammarIssues || 0,
          citationCount:     searchResult.citationCount || 0,
          matchedSources:    searchResult.matchedSources || 0,
          suggestions:       searchResult.suggestions || [],
          selfPlagiarism:    searchResult.selfPlagiarism || false,
          flaggedPhrases:    searchResult.flaggedPhrases || [],
          searchesPerformed: searchResult._searchesPerformed || 0,
          chunks:            chunks.map((text, i) => ({ text: text.slice(0, 200), score: chunkScores[i] ?? null })),
        };
        plag.realCheck = true; // grounded in real web search, not pure guess
      } catch (e) {
        console.error('Search-grounded check failed, falling back to estimate:', e.message);
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
    if (!plag) plag = { similarityPercent: 0, verdict: '', grammarIssues: 0, citationCount: 0, matchedSources: 0, suggestions: [], chunks: [], flaggedPhrases: [], selfPlagiarism: false, searchesPerformed: 0 };
    if (!aiDet) aiDet = { aiScore: 0, aiVerdict: '', aiLabel: '', indicators: [] };

    const cid = uuidv4();
    await db.run(
      `INSERT INTO checks (id,user_id,filename,mode,preview,similarity,grammar,citations,sources,verdict,suggestions,ai_score,ai_verdict,ai_indicators,real_check)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [cid, req.user.id, filename || null, mode || 'text', text.slice(0, 200),
       plag.similarityPercent, plag.grammarIssues, plag.citationCount, plag.matchedSources,
       plag.verdict, JSON.stringify(plag.suggestions),
       aiDet.aiScore, aiDet.aiVerdict, JSON.stringify(aiDet.indicators || []),
       plag.realCheck ? 1 : 0]
    );
    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);

    res.json({
      ...plag,
      checkId:      cid,
      aiScore:      aiDet.aiScore,
      aiVerdict:    aiDet.aiVerdict,
      aiLabel:      aiDet.aiLabel,
      aiIndicators: aiDet.indicators || [],
      realCheck:    plag.realCheck || false,
    });
  } catch (e) { console.error('Check error:', e); res.status(500).json({ error: 'Check failed. Please try again.' }); }
});

// ── HUMANISER ─────────────────────────────────────────────
async function runParaphrasePass(text, styleDesc, pass) {
  const passInstructions = pass === 1 ? `
PASS 1 — SENTENCE-LEVEL PARAPHRASING:
Your job is to rewrite every sentence using completely different words while
keeping the exact same meaning. Think of this as translating English to English.

- Replace every key phrase with a synonym or alternative expression
- Change passive voice to active and vice versa where it improves clarity
- Restructure sentences — if the original puts the main point at the end, put it at the beginning
- Break long sentences into two shorter ones where natural
- Combine two short sentences into one where it flows better
- Change the opening word of every sentence so no two consecutive sentences start the same way
- Replace transitional words (furthermore, moreover, additionally) with different connectors
` : pass === 2 ? `
PASS 2 — ACADEMIC STYLE REFINEMENT:
Refine the paraphrase to match the target style and improve clarity.

- Ensure the writing matches this style target: ${styleDesc}
- Improve sentence variety — mix short punchy sentences with longer explanatory ones
- Ensure the paraphrase makes the same claims with equal or greater clarity
- Strengthen weak language — replace vague words with precise academic terms
- Preserve ALL technical terms, proper nouns, statistics, and citations EXACTLY
- The output should read as polished academic prose
` : `
PASS 3 — ORIGINALITY AND FLOW POLISH:
Final pass — ensure the paraphrase is genuinely distinct and flows naturally.

- Identify any phrases still too close to the original wording — rephrase them
- Ensure paragraph transitions flow naturally
- Vary the rhythm — some ideas move quickly, others should breathe
- Remove any accidental word repetition within the same paragraph
- The final output must be genuinely original in expression while completely
  faithful to the source material in meaning and argument
`;

  const prompt = `You are an expert academic paraphrasing assistant. Help researchers rewrite text in their own words — preserving meaning completely while using entirely different phrasing. This is a legitimate academic skill used to avoid plagiarism and improve clarity.

STYLE TARGET: ${styleDesc}

TEXT TO PARAPHRASE:
"""
${text.slice(0, 4000)}
"""

${passInstructions}

ABSOLUTE RULES:
1. Preserve ALL factual content, arguments, data, and conclusions exactly
2. Keep ALL citations, references, statistics, proper nouns, and technical terms unchanged
3. Do NOT add any new information not in the original
4. Do NOT remove any key points
5. Output length should be similar to input (within 15%)
6. Output the paraphrased text ONLY — no labels, no explanations, no preamble
7. Begin immediately with the first word of the paraphrased text

PARAPHRASE NOW:`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: pass === 2 ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI error on pass ' + pass);
  return data.content.map(b => b.text || '').join('').trim();
}

// Quick similarity check after paraphrasing
async function quickSimilarityCheck(original, paraphrased) {
  const prompt = `Compare these two texts. Estimate how similar they are in wording (0-100, where 0=completely different words, 100=identical). List up to 3 phrases from the paraphrase still too close to the original.

ORIGINAL: "${original.slice(0, 1200)}"
PARAPHRASE: "${paraphrased.slice(0, 1200)}"

Reply ONLY with JSON: {"similarityScore":0,"closeMatches":["phrase if any"]}`;
  return callAI(prompt, 500).catch(() => ({ similarityScore: null, closeMatches: [] }));
}


app.post('/api/paraphrase', auth, async (req, res) => {
  try {
    const { text, style } = req.body;
    if (!text || text.trim().length < 20)
      return res.status(400).json({ error: 'Please provide some text to paraphrase.' });
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
      academic:   'formal academic writing — precise, scholarly, suitable for journal submission',
      simplified: 'clear and simplified — accessible language without sacrificing accuracy, suitable for a wider audience',
      concise:    'concise and direct — shorter sentences, no filler words, every word earns its place',
      formal:     'highly formal — professional tone, third person, appropriate for official reports and theses',
    };
    const styleDesc = styles[style] || styles.academic;

    // Helper to run a pass with a timeout safety net
    const runPassSafe = async (inputText, passNum, timeoutMs = 25000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await runParaphrasePass(inputText, styleDesc, passNum);
        clearTimeout(timer);
        return result || inputText;
      } catch(e) {
        clearTimeout(timer);
        console.warn(`Pass ${passNum} failed: ${e.message} — using input text`);
        return inputText;
      }
    };

    // ── Three-pass paraphrasing ────────────────────────────
    console.log('Paraphrase pass 1 starting...');
    const pass1 = await runPassSafe(text, 1);

    console.log('Paraphrase pass 2 starting...');
    const pass2 = await runPassSafe(pass1, 2);

    console.log('Paraphrase pass 3 starting...');
    const paraphrased = await runPassSafe(pass2, 3);

    if (!paraphrased || paraphrased.trim().length < 20)
      return res.status(502).json({ error: 'No paraphrase output received. Please try again.' });

    // ── Similarity self-check — shows how different from original ──
    const simCheck = await quickSimilarityCheck(text, paraphrased)
      .catch(() => ({ similarityScore: null, closeMatches: [] }));

    await db.run('UPDATE users SET checks_used=checks_used+1 WHERE id=$1', [req.user.id]);

    res.json({
      paraphrased,
      originalLength:     text.length,
      paraphrasedLength:  paraphrased.length,
      passes:             3,
      similarityScore:    simCheck.similarityScore,
      closeMatches:       simCheck.closeMatches || [],
    });
  } catch (e) {
    console.error('Paraphrase error:', e.message);
    res.status(500).json({ error: 'Paraphrasing failed. Please try again.' });
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
      doc.on('end',  () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      const W = doc.page.width, H = doc.page.height;      // 841.89 x 595.28

      // ── Fonts (Times is built in; blackletter + Amiri are optional extras that fall back safely) ──
      const hasBlack = fs.existsSync(FONT_BLACKLETTER);
      if (hasBlack) doc.registerFont('Blackletter', FONT_BLACKLETTER);
      if (ARABIC_FONTS_AVAILABLE) {
        doc.registerFont('Amiri',        FONT_REGULAR);
        doc.registerFont('Amiri-Bold',   FONT_BOLD);
        doc.registerFont('Amiri-Italic', FONT_ITALIC);
      }
      const ar   = t => ARABIC_FONTS_AVAILABLE && hasArabic(String(t));
      const fReg = t => ar(t) ? 'Amiri'        : 'Times-Roman';
      const fIt  = t => ar(t) ? 'Amiri-Italic' : 'Times-Italic';
      const fBd  = t => ar(t) ? 'Amiri-Bold'   : 'Times-Bold';
      const fBI  = t => ar(t) ? 'Amiri-Bold'   : 'Times-BoldItalic';
      const fTitle = hasBlack ? 'Blackletter' : 'Times-Bold';
      // largest size (<= max) at which the text fits on one line
      const fit = (text, font, max, maxW, min = 8) => {
        let s = max; doc.font(font);
        while (s > min) { doc.fontSize(s); if (doc.widthOfString(text) <= maxW) break; s -= 0.5; }
        return s;
      };

      // ── Data ──────────────────────────────────────────────────────
      const pct     = chk.similarity || 0;
      const aiScore = chk.ai_score   || 0;
      const showAi  = overrides.showAi !== false;
      const rawTitle   = overrides.title || chk.filename || chk.preview || 'Submitted Document';
      const paperTitle = rawTitle.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      const inst    = overrides.institution || user.institution || 'Independent Researcher';
      const author  = user.name || 'Unknown Author';
      const issued  = new Date(chk.created_at);
      const dateStr = issued.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const certRef = 'OC-' + chk.id.slice(0, 8).toUpperCase();
      const verifyUrl = `https://origincheck.ng/verify?ref=${certRef}`;

      // ── Palette ───────────────────────────────────────────────────
      const G_LIGHT = '#8fae7c', G_MID = '#6f9160', G_DARK = '#3b5a36', G_DEEP = '#264023';
      const PAPER = '#fffdf6', INK = '#16181d', MUTED = '#5b6270';
      const PURPLE = '#4a3c9a', RED = '#b3261e', TEAL = '#17605c', GOLD = '#b8922f';
      const good = '#1f7a3f', warn = '#b45309', bad = '#b91c1c';
      const simC = pct < 20 ? good : pct < 40 ? warn : bad;
      const simLbl = pct < 20 ? 'High originality' : pct < 40 ? 'Moderate similarity' : 'High similarity';
      const aiC  = aiScore < 20 ? good : aiScore < 50 ? warn : bad;
      const aiLbl = aiScore < 20 ? 'Likely human written' : aiScore < 50 ? 'Uncertain' : aiScore < 75 ? 'Likely AI generated' : 'Almost certainly AI';

      // ══════════════ PAGE, GUILLOCHE BORDER ══════════════
      doc.rect(0, 0, W, H).fill('#ffffff');
      const m = 12, r = 7.5, T = 40, gap = 2;          // outer margin, scallop radius, band thickness
      const b0 = r + gap, b1 = T, Wb = b1 - b0;        // band spans b0..b1 from the outer edge
      const x0 = m, y0 = m, x1 = W - m, y1 = H - m;

      // scalloped outer edge: dark outline pass, then lighter fill pass
      const scallops = (inset, rad, color) => {
        const ax = x0 + r, ay = y0 + r, bx = x1 - r, by = y1 - r, s = rad * 1.65;
        doc.fillColor(color);
        doc.rect(ax + inset, ay + inset, bx - ax - 2 * inset, by - ay - 2 * inset).fill();
        const row = (fx, fy, tx, ty) => {
          const len = Math.hypot(tx - fx, ty - fy), n = Math.round(len / s);
          for (let i = 0; i <= n; i++) doc.circle(fx + (tx - fx) * i / n, fy + (ty - fy) * i / n, rad).fill();
        };
        row(ax, ay, bx, ay); row(ax, by, bx, by); row(ax, ay, ax, by); row(bx, ay, bx, by);
      };
      scallops(0, r, G_DEEP);
      scallops(1, r - 1.3, G_MID);
      // band base + panel
      doc.rect(x0 + b0, y0 + b0, x1 - x0 - 2 * b0, y1 - y0 - 2 * b0).fill(G_LIGHT);

      // woven guilloche waves along one straight band (drawn in local coords: x along the band, y across it)
      const drawBand = len => {
        doc.save(); doc.rect(0, 0, len, Wb).clip();
        doc.rect(0, 0, len, Wb).fill(G_LIGHT);
        const A = Wb / 2 - 3.2, L = 24, yc = Wb / 2;
        for (let k = 0; k < 6; k++) {
          const ph = k * Math.PI / 3;
          doc.lineWidth(0.7).strokeColor(k % 2 ? G_DARK : G_DEEP).opacity(0.95);
          doc.moveTo(0, yc + A * Math.sin(ph));
          for (let x = 1; x <= len; x += 1) doc.lineTo(x, yc + A * Math.sin(2 * Math.PI * x / L + ph));
          doc.stroke();
        }
        doc.opacity(1);
        doc.restore();
        doc.lineWidth(1).strokeColor(G_DEEP);
        doc.moveTo(0, 0.5).lineTo(len, 0.5).stroke(); doc.moveTo(0, Wb - 0.5).lineTo(len, Wb - 0.5).stroke();
      };
      const lenH = x1 - x0 - 2 * b1, lenV = y1 - y0 - 2 * b1;
      doc.save(); doc.translate(x0 + b1, y0 + b0); drawBand(lenH); doc.restore();                  // top
      doc.save(); doc.translate(x0 + b1, y1 - b1); drawBand(lenH); doc.restore();                  // bottom
      doc.save(); doc.translate(x0 + b1, y0 + b1); doc.rotate(90); drawBand(lenV); doc.restore();  // left
      doc.save(); doc.translate(x1 - b0, y0 + b1); doc.rotate(90); drawBand(lenV); doc.restore();  // right
      // corner rosettes
      [[x0 + b0, y0 + b0], [x1 - b1, y0 + b0], [x0 + b0, y1 - b1], [x1 - b1, y1 - b1]].forEach(([cx0, cy0]) => {
        const cx = cx0 + Wb / 2, cy = cy0 + Wb / 2;
        doc.save(); doc.rect(cx0, cy0, Wb, Wb).clip();
        doc.rect(cx0, cy0, Wb, Wb).fill(G_LIGHT);
        for (let i = 1; i <= 7; i++) doc.lineWidth(0.7).strokeColor(i % 2 ? G_DEEP : G_DARK).circle(cx, cy, i * 2.3).stroke();
        for (let a = 0; a < 16; a++) { const t = a * Math.PI / 8; doc.lineWidth(0.5).strokeColor(G_DARK).moveTo(cx, cy).lineTo(cx + 20 * Math.cos(t), cy + 20 * Math.sin(t)).stroke(); }
        doc.restore();
        doc.lineWidth(1).strokeColor(G_DEEP).rect(cx0, cy0, Wb, Wb).stroke();
      });

      // panel with double inner frame
      const px0 = x0 + b1, py0 = y0 + b1, px1 = x1 - b1, py1 = y1 - b1;
      doc.rect(px0, py0, px1 - px0, py1 - py0).fill(PAPER);
      doc.rect(px0, py0, px1 - px0, py1 - py0).lineWidth(1.6).strokeColor(G_DEEP).stroke();
      doc.rect(px0 + 4, py0 + 4, px1 - px0 - 8, py1 - py0 - 8).lineWidth(0.5).strokeColor(G_DARK).stroke();

      // faint rosette watermark behind the text
      doc.save(); doc.opacity(0.07);
      const wcx = W / 2, wcy = H / 2 + 6;
      for (let i = 1; i <= 26; i++) doc.lineWidth(0.8).strokeColor(G_DARK).circle(wcx, wcy, i * 7.5).stroke();
      for (let a = 0; a < 72; a++) { const t = a * Math.PI / 36; doc.lineWidth(0.5).strokeColor(G_DARK).moveTo(wcx + 30 * Math.cos(t), wcy + 30 * Math.sin(t)).lineTo(wcx + 195 * Math.cos(t), wcy + 195 * Math.sin(t)).stroke(); }
      doc.restore();

      // ══════════════ TEXT ══════════════
      const cx = W / 2, CW = 640, cl = cx - CW / 2;
      const center = (txt, font, size, y, color, w = CW, opts = {}) => {
        doc.font(font).fontSize(size).fillColor(color).text(txt, cx - w / 2, y, { width: w, align: 'center', lineGap: 1.5, ...opts });
        return y + doc.heightOfString(txt, { width: w, lineGap: 1.5 });
      };

      // title
      const tTxt = 'Certificate of Originality';
      const tSize = fit(tTxt, fTitle, 50, 560, 30);
      doc.font(fTitle).fontSize(tSize).fillColor(INK).text(tTxt, cx - 290, py0 + 24, { width: 580, align: 'center', characterSpacing: 0.4 });
      let y = py0 + 24 + tSize * 1.12 + 8;
      // ornament under title
      doc.lineWidth(0.8).strokeColor(GOLD).moveTo(cx - 90, y + 4).lineTo(cx - 8, y + 4).stroke();
      doc.moveTo(cx + 8, y + 4).lineTo(cx + 90, y + 4).stroke();
      doc.save().translate(cx, y + 4).rotate(45).rect(-3, -3, 6, 6).fill(GOLD).restore();
      y += 20;

      y = center('This is to certify that', 'Times-Italic', 16, y, INK);
      y += 6;
      const nSize = fit(author, fIt(author), 38, CW, 16);
      doc.font(fIt(author)).fontSize(nSize).fillColor(PURPLE).text(author, cl, y, { width: CW, align: 'center' });
      y += nSize * 1.18;
      doc.lineWidth(0.6).strokeColor(G_MID).moveTo(cx - 170, y).lineTo(cx + 170, y).stroke();
      y += 9;

      if (ar(inst)) {      // right-to-left institution: own line, so it never mixes with the English sentence
        y = center(inst, fBd(inst), 17, y, INK);
        y = center('has submitted the academic work titled', 'Times-Italic', 14.5, y, INK);
      } else {
        y = center(`${inst}, has submitted the academic work titled`, 'Times-Italic', 14.5, y, INK);
      }
      y += 6;
      let tS = 16.5; doc.font(fBI(paperTitle)).fontSize(tS);
      while (tS > 10 && doc.heightOfString('\u201C' + paperTitle + '\u201D', { width: CW, lineGap: 1.5 }) > tS * 1.25 * 3) { tS -= 0.5; doc.fontSize(tS); }
      y = center(ar(paperTitle) ? paperTitle : '\u201C' + paperTitle + '\u201D', fBI(paperTitle), tS, y, INK);
      y += 7;
      y = center('for originality analysis, and has been issued this Certificate of Originality by OriginCheck Academic Integrity Platform.', 'Times-Italic', 12.5, y, INK, 610);

      // ── Results strip ──
      const sy = Math.max(y + 16, 350), sh = 62;
      const sw = showAi ? 560 : 400, sx = cx - sw / 2;
      doc.roundedRect(sx, sy, sw, sh, 3).fill('#f1f6ec');
      doc.roundedRect(sx, sy, sw, sh, 3).lineWidth(0.8).strokeColor(G_DARK).stroke();
      const cols = showAi
        ? [{ l: 'SIMILARITY SCORE', v: pct + '%', s: simLbl, c: simC }, { l: 'AI DETECTION SCORE', v: aiScore + '%', s: aiLbl, c: aiC }, { l: 'REPORT SUMMARY', sum: true }]
        : [{ l: 'SIMILARITY SCORE', v: pct + '%', s: simLbl, c: simC }, { l: 'REPORT SUMMARY', sum: true }];
      const cw = sw / cols.length;
      cols.forEach((c, i) => {
        const x = sx + i * cw;
        if (i) doc.lineWidth(0.6).strokeColor(G_MID).moveTo(x, sy + 8).lineTo(x, sy + sh - 8).stroke();
        doc.font('Times-Bold').fontSize(7.2).fillColor(MUTED).text(c.l, x, sy + 7, { width: cw, align: 'center', characterSpacing: 1.1 });
        if (c.sum) {
          const lines = [['Grammar issues', chk.grammar ?? 0], ['Source matches', chk.sources ?? 0], ['Citations found', chk.citations ?? 0]];
          lines.forEach(([k, v], j) => {
            doc.font('Times-Italic').fontSize(9.2).fillColor(INK).text(k, x + 22, sy + 22 + j * 12.5, { width: cw - 70, align: 'left', lineBreak: false });
            doc.font('Times-Bold').fontSize(9.2).fillColor(INK).text(String(v), x + cw - 48, sy + 22 + j * 12.5, { width: 26, align: 'right', lineBreak: false });
          });
        } else {
          doc.font('Times-BoldItalic').fontSize(25).fillColor(c.c).text(c.v, x, sy + 19, { width: cw, align: 'center' });
          doc.font('Times-Italic').fontSize(9.5).fillColor(MUTED).text(c.s, x, sy + 47, { width: cw, align: 'center' });
        }
      });

      // ══════════════ BOTTOM ROW ══════════════
      const by = sy + sh + 22;

      // logo block (emblem + wordmark)
      const lx = 128, ly = by + 8;
      doc.circle(lx + 17, ly + 17, 17).fill(TEAL);
      doc.circle(lx + 17, ly + 17, 14).lineWidth(0.8).strokeColor('#e8d48a').stroke();
      doc.lineWidth(2.6).lineCap('round').lineJoin('round').strokeColor('#f2dc8a')
         .moveTo(lx + 9.5, ly + 17.5).lineTo(lx + 15, ly + 23).lineTo(lx + 25.5, ly + 11.5).stroke();
      doc.font('Times-Bold').fontSize(22).fillColor(TEAL).text('Origin', lx + 42, ly + 1, { continued: true, lineBreak: false }).fillColor(GOLD).text('Check', { lineBreak: false });
      doc.font('Times-Roman').fontSize(6.3).fillColor(MUTED).text('ACADEMIC INTEGRITY PLATFORM', lx + 42, ly + 27, { characterSpacing: 1.1, lineBreak: false });

      // QR + issuer details
      const qx = 334, qy = by + 2, qs = 64;
      try {
        const qrUrl = await QRCode.toDataURL(verifyUrl, { width: 160, margin: 1, color: { dark: '#1d3b2a', light: '#ffffff' } });
        doc.rect(qx - 3, qy - 3, qs + 6, qs + 6).fill('#ffffff');
        doc.rect(qx - 3, qy - 3, qs + 6, qs + 6).lineWidth(0.6).strokeColor(G_DARK).stroke();
        doc.image(Buffer.from(qrUrl.split(',')[1], 'base64'), qx, qy, { width: qs, height: qs });
      } catch (e) { console.warn('QR failed:', e.message); }
      const tx = qx + qs + 15;
      doc.font('Times-BoldItalic').fontSize(10).fillColor(INK).text('Certificate No.: ' + certRef, tx, by + 2, { lineBreak: false });
      doc.font('Times-Italic').fontSize(10).fillColor(INK).text('Date issued: ' + dateStr, tx, by + 16, { lineBreak: false });
      doc.font('Times-Italic').fontSize(10).fillColor(INK).text('OriginCheck Academic Integrity Platform', tx, by + 30, { lineBreak: false });
      doc.font('Times-Bold').fontSize(10).fillColor(TEAL).text('origincheck.ng', tx, by + 44, { lineBreak: false });
      doc.font('Times-Italic').fontSize(8).fillColor(MUTED).text('Scan the QR code to verify this certificate', tx, by + 59, { lineBreak: false });

      // signature + red stamp
      const gx = 604, gw = 150, gl = by + 56;
      doc.save(); doc.translate(gx + 6, gl - 34);
      doc.lineWidth(1.5).lineCap('round').strokeColor('#1f2f7a').opacity(0.92);
      doc.moveTo(0, 22).bezierCurveTo(6, -4, 17, -6, 19, 8).bezierCurveTo(21, 20, 9, 22, 12, 9)
         .bezierCurveTo(15, -4, 30, 0, 31, 12).bezierCurveTo(32, 22, 39, 2, 44, 10).bezierCurveTo(49, 18, 56, 14, 62, 5)
         .bezierCurveTo(67, -3, 72, 14, 79, 8).bezierCurveTo(86, 2, 92, 11, 101, 6).stroke();
      doc.lineWidth(1.1).moveTo(4, 27).bezierCurveTo(40, 31, 80, 25, 112, 17).stroke();
      doc.restore();
      doc.lineWidth(0.7).strokeColor(INK).opacity(1).moveTo(gx, gl).lineTo(gx + gw, gl).stroke();
      doc.font('Times-Bold').fontSize(10.5).fillColor(INK).text('Authorised Signatory', gx, gl + 4, { width: gw, align: 'center', lineBreak: false });
      doc.font('Times-Italic').fontSize(8).fillColor(MUTED).text('OriginCheck Academic Integrity Platform', gx - 10, gl + 17, { width: gw + 20, align: 'center', lineBreak: false });

      // arc text helper (used by the seal and the stamp)
      const arcText = (str, ccx, ccy, rad, midDeg, size, font, color, spacingDeg, bottom) => {
        const total = (str.length - 1) * spacingDeg;
        doc.font(font).fontSize(size).fillColor(color);
        [...str].forEach((ch, i) => {
          const off = -total / 2 + i * spacingDeg;
          const th = (bottom ? midDeg - off : midDeg + off) * Math.PI / 180;
          const pxx = ccx + rad * Math.sin(th), pyy = ccy - rad * Math.cos(th);
          doc.save(); doc.translate(pxx, pyy); doc.rotate((bottom ? midDeg - off - 180 : midDeg + off));
          doc.text(ch, -size / 2, bottom ? -size * 0.2 : -size * 0.82, { width: size, align: 'center', lineBreak: false });
          doc.restore();
        });
      };

      // red verification stamp (overlaps the signature, like a real office stamp)
      doc.save(); doc.translate(gx + gw - 24, gl - 32); doc.rotate(-13); doc.opacity(0.82);
      doc.lineWidth(1.8).strokeColor(RED).circle(0, 0, 33).stroke();
      doc.lineWidth(0.8).circle(0, 0, 28.5).stroke();
      doc.lineWidth(0.8).circle(0, 0, 17).stroke();
      arcText('ORIGINCHECK', 0, 0, 23.2, 0, 6.8, 'Times-Bold', RED, 15, false);
      arcText('VERIFIED', 0, 0, 23.2, 180, 6.8, 'Times-Bold', RED, 15, true);
      doc.font('Times-Bold').fontSize(8).fillColor(RED).text('OC', -12, -9, { width: 24, align: 'center', lineBreak: false });
      doc.lineWidth(1.4).lineCap('round').strokeColor(RED).moveTo(-6, 4).lineTo(-2, 8).lineTo(7, -1).stroke();
      doc.restore(); doc.opacity(1);

      // gold foil seal, overlapping the border at the bottom-left corner like the reference
      const sealX = px0 + 36, sealY = py1 - 12, R = 44, N = 44;
      doc.save();
      doc.moveTo(sealX + R, sealY);
      for (let i = 0; i <= N * 2; i++) { const a = i * Math.PI / N, rr = i % 2 ? R * 0.9 : R; doc.lineTo(sealX + rr * Math.cos(a), sealY + rr * Math.sin(a)); }
      doc.closePath();
      const gold = doc.radialGradient(sealX - R * 0.35, sealY - R * 0.4, 3, sealX, sealY, R * 1.05);
      gold.stop(0, '#fbf0b6').stop(0.45, '#e2c35f').stop(0.8, '#c2a03b').stop(1, '#9d7d24');
      doc.fill(gold);
      doc.restore();
      doc.lineWidth(0.9).strokeColor('#8a6d1d').circle(sealX, sealY, R * 0.78).stroke();
      doc.lineWidth(0.5).circle(sealX, sealY, R * 0.5).stroke();
      arcText('OFFICIAL SEAL', sealX, sealY, R * 0.64, 0, 6.4, 'Times-Bold', '#7a5f16', 11.5, false);
      arcText('ORIGINCHECK', sealX, sealY, R * 0.64, 180, 6.4, 'Times-Bold', '#7a5f16', 12.5, true);
      [90, 270].forEach(a => { const t = a * Math.PI / 180; doc.circle(sealX + R * 0.64 * Math.sin(t), sealY - R * 0.64 * Math.cos(t), 1.4).fill('#7a5f16'); });
      doc.lineWidth(2.2).lineCap('round').lineJoin('round').strokeColor('#7a5f16')
         .moveTo(sealX - 9, sealY + 1).lineTo(sealX - 3, sealY + 7).lineTo(sealX + 10, sealY - 8).stroke();

      // honest footnote
      doc.font('Times-Italic').fontSize(6.8).fillColor(MUTED)
         .text('Similarity and AI-detection results are automated estimates provided to support academic review.', px0 + 120, py1 - 15, { width: px1 - px0 - 240, align: 'center', lineBreak: false });

      doc.end();
    } catch (e) { reject(e); }
  });
}


// ── ADMIN ─────────────────────────────────────────────────
// SQL fragments shared by the admin user views
const PAID_PLANS_SQL = "('basic','researcher','university')";
const USER_STATUS_SQL = {
  active:  `plan IN ${PAID_PLANS_SQL} AND sub_expires > NOW()`,
  expired: `plan IN ${PAID_PLANS_SQL} AND (sub_expires IS NULL OR sub_expires <= NOW())`,
  free:    "plan = 'free'",
  none:    "plan = 'none'",
};

app.get('/api/admin/stats', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const [tu,au,eu,fu,tc,tr,rp,ru] = await Promise.all([
      db.get("SELECT COUNT(*) c FROM users"),
      db.get(`SELECT COUNT(*) c FROM users WHERE ${USER_STATUS_SQL.active}`),
      db.get(`SELECT COUNT(*) c FROM users WHERE ${USER_STATUS_SQL.expired}`),
      db.get(`SELECT COUNT(*) c FROM users WHERE ${USER_STATUS_SQL.free}`),
      db.get("SELECT COUNT(*) c FROM checks"),
      db.get("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='success'"),
      db.all("SELECT p.id,p.plan,p.amount,p.reference,p.status,p.created_at,u.name,u.email FROM payments p JOIN users u ON p.user_id=u.id WHERE p.status='success' ORDER BY p.created_at DESC LIMIT 20"),
      db.all("SELECT id,name,email,institution,plan,checks_used,checks_limit,sub_expires,created_at FROM users ORDER BY created_at DESC LIMIT 20"),
    ]);
    res.json({ totalUsers:tu.c, activeUsers:au.c, expiredUsers:eu.c, freeUsers:fu.c, totalChecks:tc.c, totalRevenue:tr.s, recentPayments:rp, recentUsers:ru });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to load stats.' }); }
});

// ── ADMIN: payments list (successful by default; abandoned attempts are separate) ──
app.get('/api/admin/payments', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const status = ['success', 'pending', 'all'].includes(req.query.status) ? req.query.status : 'success';
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const page   = Math.max(parseInt(req.query.page) || 1, 1);
    const where  = status === 'all' ? '' : status === 'pending' ? "WHERE p.status <> 'success'" : "WHERE p.status = 'success'";
    const [total, counts, rows] = await Promise.all([
      db.get(`SELECT COUNT(*) c FROM payments p ${where}`),
      db.get("SELECT COUNT(*) FILTER (WHERE status='success') AS n_success, COUNT(*) FILTER (WHERE status <> 'success') AS n_unpaid, COUNT(*) AS n_all FROM payments"),
      db.all(`SELECT p.id,p.plan,p.amount,p.reference,p.status,p.created_at,u.name,u.email
              FROM payments p JOIN users u ON p.user_id=u.id ${where}
              ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]),
    ]);
    const t = parseInt(total.c);
    res.json({ payments: rows, total: t, page, pages: Math.max(Math.ceil(t / limit), 1),
               counts: { success: parseInt(counts.n_success), unpaid: parseInt(counts.n_unpaid), all: parseInt(counts.n_all) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to load payments.' }); }
});

// Remove unpaid attempts older than an hour (an open checkout page is never touched)
async function purgeAbandonedPayments(olderThanHours = 1) {
  // Only plain unpaid attempts. 'underpaid' rows are real money received and are never auto-deleted.
  const r = await db.run("DELETE FROM payments WHERE status = 'pending' AND created_at < NOW() - make_interval(hours => $1)", [olderThanHours]);
  return r.rowCount || 0;
}
app.post('/api/admin/payments/clear-unpaid', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try { const n = await purgeAbandonedPayments(1); res.json({ success: true, deleted: n }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Could not clear unpaid attempts.' }); }
});

// ── ADMIN: all users — search, filter, page, or limit=all for export ──
app.get('/api/admin/users', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const all   = req.query.limit === 'all';
    const limit = all ? 20000 : Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const page  = all ? 1 : Math.max(parseInt(req.query.page) || 1, 1);
    const conds = [], params = [];
    const q = String(req.query.q || '').trim();
    if (q) { params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%'); conds.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR COALESCE(institution,'') ILIKE $${params.length})`); }
    if (['basic', 'researcher', 'university', 'free', 'none'].includes(req.query.plan)) { params.push(req.query.plan); conds.push(`plan = $${params.length}`); }
    if (USER_STATUS_SQL[req.query.status]) conds.push(USER_STATUS_SQL[req.query.status]);
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const [total, counts, rows] = await Promise.all([
      db.get(`SELECT COUNT(*) c FROM users ${where}`, params),
      db.get(`SELECT COUNT(*) AS n_all,
                COUNT(*) FILTER (WHERE ${USER_STATUS_SQL.active}) AS n_active,
                COUNT(*) FILTER (WHERE ${USER_STATUS_SQL.expired}) AS n_expired,
                COUNT(*) FILTER (WHERE ${USER_STATUS_SQL.free}) AS n_free,
                COUNT(*) FILTER (WHERE ${USER_STATUS_SQL.none}) AS n_none FROM users`),
      db.all(`SELECT id,name,email,institution,plan,checks_used,checks_limit,sub_expires,created_at
              FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
              [...params, limit, (page - 1) * limit]),
    ]);
    const t = parseInt(total.c);
    res.json({ users: rows, total: t, page, pages: Math.max(Math.ceil(t / limit), 1),
               counts: { all: +counts.n_all, active: +counts.n_active, expired: +counts.n_expired, free: +counts.n_free, none: +counts.n_none } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to load users.' }); }
});

app.post('/api/admin/set-plan', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  const { email, plan } = req.body;
  const pl = PLANS[plan];
  if (!pl) return res.status(400).json({ error: 'Invalid plan.' });
  const exp = new Date(); exp.setDate(exp.getDate() + 30);
  const r = await db.run('UPDATE users SET plan=$1,checks_limit=$2,checks_used=0,gptzero_limit=$3,gptzero_used=0,sub_expires=$4 WHERE email=$5',
    [plan, pl.checks, pl.gptzeroChecks || 0, exp.toISOString(), email.toLowerCase().trim()]);
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

  if (!BREVO_KEY) return res.status(500).json({ error: 'Email service not configured. Add BREVO_API_KEY to environment variables.' });

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

          await sendEmail({ to: user.email, subject, html, text: textBody });
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
  if (!BREVO_KEY) return res.status(500).json({ error: 'Email service not configured. Add BREVO_API_KEY.' });

  try {
    const html = buildEmailHTML(subject || 'Test Email', body || 'This is a test email from OriginCheck admin.', 'Admin');
    await sendEmail({
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

// ── AMBASSADOR ROUTES ─────────────────────────────────────

app.post('/api/ambassador/apply', auth, async (req, res) => {
  try {
    const { institution, role, whatsapp, motivation } = req.body;
    if (!institution || !role) return res.status(400).json({ error: 'Institution and role are required.' });

    const user = await db.get('SELECT id,name,email FROM users WHERE id=$1', [req.user.id]);
    const existing = await db.get('SELECT id,status FROM ambassadors WHERE user_id=$1', [req.user.id]);
    if (existing) {
      return res.status(409).json({
        error: existing.status === 'approved' ? 'You are already an approved ambassador.' : 'You have already applied. Your application is under review.',
        status: existing.status,
      });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO ambassadors (id,user_id,name,email,institution,role,whatsapp,motivation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, user.id, user.name, user.email, institution, role, whatsapp || null, motivation || null]
    );
    res.json({ success: true, message: 'Application submitted! We will review and respond within 24 hours.' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Application failed.' }); }
});

app.get('/api/ambassador/status', auth, async (req, res) => {
  try {
    const amb = await db.get('SELECT * FROM ambassadors WHERE user_id=$1', [req.user.id]);
    res.json({ ambassador: amb || null });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

app.get('/api/admin/ambassadors', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const [pending, approved, all] = await Promise.all([
      db.get("SELECT COUNT(*) c FROM ambassadors WHERE status='pending'"),
      db.get("SELECT COUNT(*) c FROM ambassadors WHERE status='approved'"),
      db.all(`SELECT a.*, u.plan, u.checks_used FROM ambassadors a JOIN users u ON a.user_id = u.id
              ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC`),
    ]);
    res.json({ pending: parseInt(pending.c), approved: parseInt(approved.c), ambassadors: all });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed.' }); }
});

app.post('/api/admin/ambassador/approve', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const { ambassador_id } = req.body;
    const amb = await db.get('SELECT * FROM ambassadors WHERE id=$1', [ambassador_id]);
    if (!amb) return res.status(404).json({ error: 'Ambassador not found.' });

    await db.run(`UPDATE ambassadors SET status='approved', activated_at=NOW() WHERE id=$1`, [ambassador_id]);

    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    const pl = PLANS['researcher'];
    await db.run(
      `UPDATE users SET plan='researcher', checks_limit=$1,
       checks_used=0, gptzero_limit=$2, gptzero_used=0, sub_expires=$3 WHERE id=$4`,
      [pl.checks, pl.gptzeroChecks || 0, exp.toISOString(), amb.user_id]
    );

    const existingAff = await db.get('SELECT id FROM affiliates WHERE user_id=$1', [amb.user_id]);
    if (!existingAff) {
      const code = amb.name.replace(/\s+/g, '').substring(0, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
      await db.run('INSERT INTO affiliates (id,user_id,code) VALUES ($1,$2,$3)', [uuidv4(), amb.user_id, code]);
    }

    res.json({ success: true, message: `${amb.name} approved as ambassador and given free Pro plan.` });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Approval failed.' }); }
});

app.post('/api/admin/ambassador/reject', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const { ambassador_id } = req.body;
    await db.run(`UPDATE ambassadors SET status='rejected' WHERE id=$1`, [ambassador_id]);
    res.json({ success: true, message: 'Application rejected.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

app.post('/api/admin/ambassador/renew', auth, async (req, res) => {
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only.' });
  try {
    const { ambassador_id } = req.body;
    const amb = await db.get('SELECT * FROM ambassadors WHERE id=$1', [ambassador_id]);
    if (!amb) return res.status(404).json({ error: 'Not found.' });
    const exp = new Date(); exp.setDate(exp.getDate() + 30);
    const pl = PLANS['researcher'];
    await db.run(
      `UPDATE users SET plan='researcher', checks_limit=$1,
       checks_used=0, gptzero_limit=$2, gptzero_used=0, sub_expires=$3 WHERE id=$4`,
      [pl.checks, pl.gptzeroChecks || 0, exp.toISOString(), amb.user_id]
    );
    res.json({ success: true, message: `${amb.name} Pro plan renewed for 30 days.` });
  } catch(e) { res.status(500).json({ error: 'Renewal failed.' }); }
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
  console.log('Brevo email:', process.env.BREVO_API_KEY ? 'configured' : 'not set (add BREVO_API_KEY)');
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
    const server = app.listen(PORT, () => {
      console.log(`OriginCheck running on port ${PORT}`);
      startKeepAlive();
    });
    // Increase timeout to 120s for long-running paraphraser (3 passes) requests
    // Housekeeping: drop unpaid checkout attempts older than 7 days (now, then every 6 hours)
    const cleanupUnpaid = () => purgeAbandonedPayments(24 * 7)
      .then(n => { if (n) console.log(`Cleanup: removed ${n} old unpaid payment attempts`); })
      .catch(e => console.error('Cleanup error:', e.message));
    cleanupUnpaid();
    setInterval(cleanupUnpaid, 6 * 60 * 60 * 1000).unref();
    server.timeout = 120000;
    server.keepAliveTimeout = 120000;
  })
  .catch(e => {
    console.error('DB init failed:', e.message);
    console.error('Check DATABASE_URL environment variable');
    process.exit(1);
  });

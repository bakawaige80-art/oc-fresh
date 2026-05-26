# OriginCheck — Academic Integrity Platform

A full-stack plagiarism detection platform with Paystack payments, user accounts, file upload, and originality certificates.

---

## Project Structure

```
origincheck/
├── server.js           ← All backend code (single file)
├── package.json        ← All server dependencies
├── render.yaml         ← Render deployment config
├── .env.example        ← Environment variables template
├── client/
│   ├── package.json    ← React dependencies
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       └── App.js      ← Complete React frontend
└── data/               ← SQLite database (auto-created)
```

---

## Deploy on Render (Step by Step)

1. Upload this folder to GitHub
2. Go to render.com → New Web Service → connect your repo
3. Set these values:
   - **Build Command:** `npm install && cd client && npm install && npm run build`
   - **Start Command:** `node server.js`
4. Add Environment Variables:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `PAYSTACK_SECRET_KEY` — from paystack.com → Settings → API Keys
   - `JWT_SECRET` — any long random phrase
   - `APP_URL` — your Render URL e.g. https://origincheck.onrender.com
   - `ADMIN_EMAIL` — your email (gives admin dashboard access)
   - `NODE_ENV` — production
5. Click Deploy

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| ANTHROPIC_API_KEY | Yes | Powers AI checking |
| PAYSTACK_SECRET_KEY | Yes | Receives payments |
| JWT_SECRET | Yes | Secures user sessions |
| APP_URL | Yes | Your live URL (for payment callbacks) |
| ADMIN_EMAIL | Yes | Your email — unlocks admin dashboard |
| NODE_ENV | Yes | Set to: production |

---

## Plans

| Plan | Price | Checks/month |
|---|---|---|
| Basic | ₦2,500 | 30 |
| Researcher | ₦7,500 | 100 |
| University | ₦25,000 | Unlimited |

---

## Local Development

```bash
# Install server packages
npm install

# Install client packages
cd client && npm install && cd ..

# Copy environment file
cp .env.example .env
# Edit .env with your keys

# Run server (terminal 1)
node server.js

# Run client (terminal 2)
cd client && npm start
```

---

## Paystack Webhook

After deploying, add your webhook URL in Paystack:
- Go to paystack.com → Settings → API Keys & Webhooks
- Webhook URL: `https://your-domain.onrender.com/api/payment/webhook`

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';

const C = {
  ink:'#0d1117', paper:'#f5f0e8', cream:'#ede8da',
  gold:'#c8a94a', teal:'#1a5c5b', tealL:'#2a8c8a',
  muted:'#6b6557', border:'#d4cfc0', white:'#ffffff',
  green:'#1e6e50', red:'#c0392b', amber:'#b8860b',
};

const GS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:'DM Sans',sans-serif;background:${C.paper};color:${C.ink};overflow-x:hidden}
button{cursor:pointer;font-family:'DM Sans',sans-serif}
input,textarea,select{font-family:'DM Sans',sans-serif}
a{color:${C.teal};text-decoration:none}
a:hover{text-decoration:underline}
img{max-width:100%}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes menuSlide{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}

/* ── Responsive ── */
.hide-mobile{display:flex}
.show-mobile{display:none}
.resp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:2rem}
.resp-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.resp-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem}
.resp-padding{padding:3rem}
.resp-heading{font-size:2.4rem}
.resp-hero-h{font-size:clamp(2rem,5vw,3.8rem)}

@media(max-width:768px){
  .hide-mobile{display:none!important}
  .show-mobile{display:flex!important}
  .resp-grid-2{grid-template-columns:1fr!important}
  .resp-grid-3{grid-template-columns:1fr!important}
  .resp-grid-4{grid-template-columns:1fr 1fr!important}
  .resp-padding{padding:1.5rem!important}
  .resp-heading{font-size:1.7rem!important}
  .resp-hero-h{font-size:2rem!important}
  .mob-stack{flex-direction:column!important}
  .mob-full{width:100%!important}
  .mob-center{text-align:center!important;align-items:center!important}
  .mob-hide{display:none!important}
  .mob-p1{padding:1rem!important}
  .mob-gap1{gap:1rem!important}
  .mob-text-sm{font-size:.82rem!important}
}

@media(max-width:480px){
  .resp-grid-4{grid-template-columns:1fr!important}
}

@media(min-width:769px){
  .desk-hide{display:none!important}
}
`;

// ── API base URL ─────────────────────────────────────────
// In production (Vercel), REACT_APP_API_URL points to Railway backend
// In development, empty string uses the proxy in client/package.json
const API = process.env.REACT_APP_API_URL || '';

const Ctx = createContext(null);
function useAuth() { return useContext(Ctx); }

function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('oc_tok'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    apiFetch('/api/auth/me', {}, token)
      .then(d => setUser(d.user))
      .catch(() => { localStorage.removeItem('oc_tok'); setToken(null); })
      .finally(() => setReady(true));
  }, [token]);

  const login = (tok, usr) => { localStorage.setItem('oc_tok', tok); setToken(tok); setUser(usr); };
  const logout = () => { localStorage.removeItem('oc_tok'); setToken(null); setUser(null); };
  const af = (url, opts = {}) => apiFetch(url, opts, token);
  return <Ctx.Provider value={{ user, setUser, token, ready, login, logout, af }}>{children}</Ctx.Provider>;
}

async function apiFetch(url, opts = {}, token) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  // Prepend API base URL so Vercel frontend can reach Railway backend
  const res  = await fetch(API + url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const Spin = ({ size=18, color=C.teal }) => (
  <span style={{ width:size, height:size, border:`2px solid rgba(0,0,0,.1)`, borderTopColor:color, borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite', flexShrink:0 }} />
);

const Err = ({ msg }) => msg ? (
  <div style={{ background:'#fff0f0', border:`1px solid #ffc0c0`, borderRadius:3, padding:'.7rem 1rem', color:C.red, fontSize:'.85rem', marginBottom:'1rem' }}>{msg}</div>
) : null;

const Field = ({ label, value, onChange, type='text', placeholder, required }) => (
  <div style={{ marginBottom:'1rem' }}>
    <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:C.muted, marginBottom:'.35rem' }}>
      {label}{required && <span style={{ color:C.red }}> *</span>}
    </label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none', color:C.ink }} />
  </div>
);

const Btn = ({ children, onClick, disabled, variant='teal', full, style:s={} }) => {
  const styles = {
    teal:  { background:C.teal,  color:C.white, border:'none' },
    gold:  { background:C.gold,  color:C.ink,   border:'none' },
    ghost: { background:'transparent', color:C.ink, border:`1.5px solid ${C.border}` },
    dark:  { background:C.ink,   color:C.white, border:'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...styles[variant], padding:'.8rem 1.8rem', fontWeight:600, fontSize:'.9rem', borderRadius:2, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'.5rem', width:full?'100%':undefined, opacity:disabled?.6:1, cursor:disabled?'not-allowed':'pointer', transition:'opacity .2s', ...s }}>
      {children}
    </button>
  );
};

// ── NAVBAR ────────────────────────────────────────────────
function Navbar({ page, go }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = (p) => { go(p); setMenuOpen(false); };
  const handleLogout = () => { logout(); go('home'); setMenuOpen(false); };

  return (
    <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:C.ink, borderBottom:`2px solid ${C.gold}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.85rem 1.5rem', maxWidth:'100%' }}>
        <button onClick={()=>nav('home')} style={{ background:'none', border:'none', fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900, color:C.gold, letterSpacing:'-0.02em', flexShrink:0 }}>
          Origin<span style={{ color:C.white }}>Check</span>
        </button>

        {/* Desktop links */}
        <div className="hide-mobile" style={{ gap:'1.25rem', alignItems:'center' }}>
          {!user ? (
            <>
              <button onClick={()=>nav('home')} style={{ background:'none', border:'none', color:page==='home'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>Home</button>
              <button onClick={()=>nav('about')} style={{ background:'none', border:'none', color:page==='about'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>About</button>
              <button onClick={()=>nav('contact')} style={{ background:'none', border:'none', color:page==='contact'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>Contact</button>
              <button onClick={()=>nav('login')} style={{ background:'none', border:`1px solid #2a3040`, color:'#e5e7eb', fontSize:'.82rem', fontWeight:500, padding:'.4rem 1rem', borderRadius:2 }}>Log In</button>
              <button onClick={()=>nav('register')} style={{ background:C.gold, border:'none', color:C.ink, fontSize:'.82rem', fontWeight:700, padding:'.4rem 1rem', borderRadius:2 }}>Sign Up</button>
            </>
          ) : (
            <>
              <button onClick={()=>nav('home')} style={{ background:'none', border:'none', color:page==='home'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>Home</button>
              <button onClick={()=>nav('dash')} style={{ background:'none', border:'none', color:page==='dash'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>Dashboard</button>
              <button onClick={()=>nav('history')} style={{ background:'none', border:'none', color:page==='history'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>History</button>
              <button onClick={()=>nav('humanise')} style={{ background:'none', border:'none', color:page==='humanise'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>✍️ Humanise</button>
              <button onClick={()=>nav('affiliate')} style={{ background:'none', border:'none', color:page==='affiliate'?C.gold:'#e8d48a', fontSize:'.82rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>💰 Earn</button>
              <button onClick={()=>nav('ambassador')} style={{ background:'none', border:'none', color:page==='ambassador'?C.gold:'#9ca3af', fontSize:'.82rem', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>🎖️ Ambassador</button>
              <button onClick={()=>nav('subscribe')} style={{ background:user.plan==='none'?C.gold:user.plan==='free'?C.teal:'none', border:'none', color:user.plan==='none'||user.plan==='free'?C.white:'#9ca3af', fontSize:'.82rem', fontWeight:user.plan==='none'||user.plan==='free'?700:500, textTransform:'uppercase', letterSpacing:'.06em', padding:(user.plan==='none'||user.plan==='free')?'.4rem .9rem':0, borderRadius:2 }}>
                {user.plan==='none'?'⚡ Subscribe':user.plan==='free'?'🎁 Free Trial':'Plans'}
              </button>
              {user.is_admin && (
                <button onClick={()=>nav('admin')} style={{ background:'none', border:'none', color:'#e0b030', fontSize:'.82rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>⚙ Admin</button>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:C.teal, display:'flex', alignItems:'center', justifyContent:'center', color:C.white, fontWeight:700, fontSize:'.82rem', flexShrink:0 }}>{user.name.charAt(0).toUpperCase()}</div>
                <span style={{ color:'#e5e7eb', fontSize:'.82rem' }}>{user.name.split(' ')[0]}</span>
              </div>
              <button onClick={handleLogout} style={{ background:'none', border:`1px solid #c0392b`, color:'#ff8080', fontSize:'.78rem', fontWeight:600, padding:'.4rem .9rem', borderRadius:2 }}>Log Out</button>
            </>
          )}
        </div>

        {/* Hamburger - mobile */}
        <button className="show-mobile" onClick={()=>setMenuOpen(o=>!o)}
          style={{ background:'none', border:`1px solid #2a3040`, color:C.gold, width:38, height:38, borderRadius:3, fontSize:'1.3rem', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background:'#161c26', borderTop:`1px solid #2a3040`, padding:'1rem 1.5rem', display:'flex', flexDirection:'column', gap:'.5rem', animation:'menuSlide .2s ease' }}>
          {!user ? (
            <>
              {[['home','🏠 Home'],['about','ℹ️ About'],['contact','📧 Contact'],['privacy','🔒 Privacy'],['terms','📋 Terms']].map(([p,l])=>(
                <button key={p} onClick={()=>nav(p)} style={{ background:'none', border:'none', color:page===p?C.gold:'#e5e7eb', fontSize:'.92rem', textAlign:'left', padding:'.6rem 0', borderBottom:`1px solid #2a3040`, fontWeight:page===p?600:400 }}>{l}</button>
              ))}
              <div style={{ display:'flex', gap:'.75rem', marginTop:'.5rem' }}>
                <button onClick={()=>nav('login')} style={{ flex:1, background:'none', border:`1px solid #2a3040`, color:'#e5e7eb', fontSize:'.9rem', padding:'.7rem', borderRadius:2 }}>Log In</button>
                <button onClick={()=>nav('register')} style={{ flex:1, background:C.gold, border:'none', color:C.ink, fontSize:'.9rem', fontWeight:700, padding:'.7rem', borderRadius:2 }}>Sign Up</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color:C.gold, fontSize:'.82rem', fontWeight:600, padding:'.25rem 0' }}>Signed in as {user.name}</div>
              {[['home','🏠 Home'],['dash','📊 Dashboard'],['history','📋 History'],['humanise','✍️ Humanise Text'],['affiliate','💰 Earn Commission'],['ambassador','🎖️ Ambassador Programme'],['subscribe','💳 Plans']].map(([p,l])=>(
                <button key={p} onClick={()=>nav(p)} style={{ background:'none', border:'none', color:page===p?C.gold:'#e5e7eb', fontSize:'.92rem', textAlign:'left', padding:'.6rem 0', borderBottom:`1px solid #2a3040`, fontWeight:page===p?600:400 }}>{l}</button>
              ))}
              {user.is_admin && <button onClick={()=>nav('admin')} style={{ background:'none', border:'none', color:'#e0b030', fontSize:'.92rem', textAlign:'left', padding:'.6rem 0', borderBottom:`1px solid #2a3040`, fontWeight:700 }}>⚙️ Admin Dashboard</button>}
              {user.plan==='none' && <button onClick={()=>nav('subscribe')} style={{ background:C.gold, border:'none', color:C.ink, fontSize:'.9rem', fontWeight:700, padding:'.7rem', borderRadius:2, marginTop:'.25rem' }}>⚡ Subscribe Now</button>}
              <button onClick={handleLogout} style={{ background:'#c0392b', border:'none', color:C.white, fontSize:'.9rem', fontWeight:600, padding:'.7rem', borderRadius:2, marginTop:'.25rem' }}>🚪 Log Out</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

// ── FOOTER ────────────────────────────────────────────────
function Footer({ go }) {
  return (
    <footer style={{ background:'#0a0e15', color:'#9ca3af', padding:'3rem', borderTop:'1px solid #1a2030' }}>
      <div style={{ maxWidth:960, margin:'0 auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1.5rem', marginBottom:'2rem' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:900, color:C.gold, marginBottom:'.75rem' }}>OriginCheck</div>
            <div style={{ fontSize:'.82rem', lineHeight:1.7, color:'#6b7280' }}>Nigeria's premier AI-powered academic integrity platform. Protecting scholarship across universities and research institutions.</div>
          </div>
          <div>
            <div style={{ fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:'#4b5563', marginBottom:'.75rem' }}>Platform</div>
            {[['home','Home'],['dash','Dashboard'],['subscribe','Pricing'],['history','Check History']].map(([p,l])=>(
              <div key={p} style={{ marginBottom:'.4rem' }}><button onClick={()=>go(p)} style={{ background:'none', border:'none', color:'#6b7280', fontSize:'.85rem', padding:0, cursor:'pointer' }}>{l}</button></div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:'#4b5563', marginBottom:'.75rem' }}>Company</div>
            {[['contact','Contact Us'],['about','About'],['privacy','Privacy Policy'],['terms','Terms of Service']].map(([p,l])=>(
              <div key={p} style={{ marginBottom:'.4rem' }}><button onClick={()=>go(p)} style={{ background:'none', border:'none', color:'#6b7280', fontSize:'.85rem', padding:0, cursor:'pointer' }}>{l}</button></div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:'#4b5563', marginBottom:'.75rem' }}>Contact</div>
            <div style={{ fontSize:'.85rem', color:'#6b7280', lineHeight:1.8 }}>
              <div>📧 info@origincheck.ng</div>
              <div>📞 +2347016270709</div>
              <div>📍 Abuja, Nigeria</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid #1a2030', paddingTop:'1.5rem', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <div style={{ fontSize:'.78rem', color:'#4b5563' }}>© 2026 OriginCheck. All rights reserved.</div>
          <div style={{ fontSize:'.78rem', color:'#4b5563' }}>Built in Nigeria 🇳🇬 · AI-Powered Academic Platform</div>
        </div>
      </div>
    </footer>
  );
}

// ── HOME ──────────────────────────────────────────────────
function Home({ go }) {
  const { user } = useAuth();
  const features = [
    ['🔍','Plagiarism Detection','Deep similarity scanning against global and local institutional repositories with detailed percentage results.'],
    ['📂','File Upload','Upload PDF, DOCX, or TXT files directly. Text is extracted and analyzed automatically — no copy-pasting needed.'],
    ['✅','Grammar Checker','AI-powered grammar, punctuation, and sentence structure analysis included with every check.'],
    ['🏅','Originality Certificate','Download a QR-verified PDF certificate of originality accepted by institutions and publishers.'],
    ['📊','Check History','All your past checks are permanently saved. Revisit results and re-download certificates at any time.'],
    ['🔬','3 Check Modes','Full text analysis, abstract-only checks, and research title validation — tailored for every stage of research.'],
  ];
  return (
    <div>
      {/* Hero */}
      <section style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'5rem 1.25rem 3rem', background:`radial-gradient(ellipse at 50% 40%,rgba(26,92,91,.1) 0%,transparent 60%),${C.paper}` }}>
        <div style={{ maxWidth:700 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'.5rem', background:C.ink, color:C.gold, fontFamily:"'DM Mono',monospace", fontSize:'.7rem', fontWeight:500, letterSpacing:'.15em', textTransform:'uppercase', padding:'.4rem .9rem', borderRadius:2, marginBottom:'2rem' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:C.gold, animation:'pulse 2s infinite', display:'inline-block' }} />
            AI-Powered · Academic Integrity · Made in Nigeria
          </div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(2.2rem,5vw,3.8rem)', fontWeight:900, lineHeight:1.05, marginBottom:'1.5rem', animation:'fadeUp .7s ease both' }}>
            Guard the <em style={{ fontStyle:'italic', color:C.teal }}>Integrity</em> of Scholarship
          </h1>
          <p style={{ fontSize:'1rem', color:C.muted, lineHeight:1.7, maxWidth:520, margin:'0 auto 2.5rem', animation:'fadeUp .7s .1s ease both' }}>
            Nigeria's most affordable plagiarism detection platform. AI-powered originality checks, grammar analysis, file upload, and verified certificates — built for researchers and universities.
          </p>
          <div style={{ display:'flex', gap:'1rem', justifyContent:'center', flexWrap:'wrap', animation:'fadeUp .7s .2s ease both' }}>
            {user ? (
              <Btn variant="gold" onClick={()=>go('dash')} style={{ fontSize:'1rem', padding:'.9rem 2rem' }}>Go to Dashboard →</Btn>
            ) : (
              <>
                <Btn variant="gold" onClick={()=>go('register')} style={{ fontSize:'1rem', padding:'.9rem 2rem' }}>🎁 Try Free — 1 Check</Btn>
                <Btn variant="ghost" onClick={()=>go('login')} style={{ fontSize:'1rem', padding:'.9rem 2rem' }}>Log In</Btn>
              </>
            )}
            {!user && <div style={{ fontSize:'.78rem', color:C.muted, marginTop:'.75rem' }}>No credit card required · 1 free check on signup · Plans from ₦3,500/mo</div>}
          </div>
          <div style={{ display:'flex', gap:'1.5rem', justifyContent:'center', marginTop:'2rem', paddingTop:'1.5rem', borderTop:`1px solid ${C.border}`, flexWrap:'wrap', animation:'fadeUp .7s .3s ease both' }}>
            {[['98.4%','Detection Accuracy'],['50M+','Indexed Documents'],['200+','Institutions Served'],['₦3,500','Starting Price/mo']].map(([n,l])=>(
              <div key={l}><div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900 }}>{n}</div><div style={{ fontSize:'.72rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginTop:'.2rem' }}>{l}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding:'3rem 1.5rem', background:C.ink }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem', textAlign:'center' }}>Platform Capabilities</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900, color:C.white, textAlign:'center', marginBottom:'3rem' }}>Everything Academic Integrity Demands</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.5px', background:'#2a3040', border:'1.5px solid #2a3040' }}>
            {features.map(([icon,name,desc])=>(
              <div key={name} style={{ background:C.ink, padding:'1.75rem' }}>
                <div style={{ fontSize:'1.4rem', marginBottom:'.9rem' }}>{icon}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.05rem', fontWeight:700, color:C.white, marginBottom:'.5rem' }}>{name}</div>
                <div style={{ fontSize:'.83rem', color:'#9ca3af', lineHeight:1.65 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding:'3rem 1.5rem', background:C.cream }}>
        <div style={{ maxWidth:860, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>How It Works</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900, marginBottom:'3rem' }}>Simple. Thorough. Trustworthy.</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'2rem' }}>
            {[['01','Sign Up','Create your account and choose a plan that fits your needs.'],['02','Upload or Paste','Drop a PDF, DOCX, or TXT file, or paste your text directly.'],['03','Get Results','Receive a detailed similarity score, grammar analysis, and improvement suggestions.'],['04','Download Certificate','Export your QR-verified originality certificate as a PDF.']].map(([n,t,d],i,arr)=>(
              <div key={n} style={{ position:'relative', textAlign:'center' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.5rem', fontWeight:900, color:C.gold, lineHeight:1, marginBottom:'.75rem' }}>{n}</div>
                <div style={{ fontWeight:700, marginBottom:'.4rem', fontSize:'1rem' }}>{t}</div>
                <div style={{ fontSize:'.82rem', color:C.muted, lineHeight:1.6 }}>{d}</div>
                {i<arr.length-1 && <span style={{ position:'absolute', right:'-1rem', top:'1.5rem', fontSize:'1.2rem', color:C.border }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding:'3rem 1.5rem', background:C.paper, textAlign:'center' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Pricing</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900, marginBottom:'.5rem' }}>Affordable for Every Researcher</div>
          <div style={{ color:C.muted, fontSize:'.9rem', marginBottom:'3rem' }}>All plans are billed monthly. Cancel anytime.</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:'1.25rem' }}>
            {[
              { key:'basic',      name:'Basic',      price:'₦3,500', period:'/mo', checks:'30 checks/month',  features:['30 AI-powered checks/mo','Certificate download','Check history','Email support'], feat:false },
              { key:'researcher', name:'Pro',        price:'₦10,000', period:'/mo', checks:'100 checks/month', features:['100 AI-powered checks/mo','Document comparison','Priority processing','Priority support'], feat:true },
              { key:'university', name:'University', price:'₦25,000', period:'/mo', checks:'Unlimited checks', features:['Unlimited AI-powered checks','LMS integration','Admin dashboard','Dedicated support'], feat:false },
            ].map(pl=>(
              <div key={pl.key} style={{ border:`${pl.feat?2:1.5}px solid ${pl.feat?C.teal:C.border}`, borderRadius:4, padding:'2rem 1.75rem', textAlign:'left', background:pl.feat?C.teal:C.white, color:pl.feat?C.white:C.ink, position:'relative' }}>
                {pl.feat && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:C.gold, color:C.ink, fontSize:'.62rem', fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'.1em', textTransform:'uppercase', padding:'.2rem .8rem', borderRadius:20 }}>Most Popular</div>}
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.7rem', letterSpacing:'.15em', textTransform:'uppercase', color:pl.feat?'rgba(255,255,255,.6)':C.muted, marginBottom:'.5rem' }}>{pl.name}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.1rem', fontWeight:900 }}>{pl.price}<span style={{ fontSize:'.8rem', fontWeight:400, color:pl.feat?'rgba(255,255,255,.6)':C.muted }}>{pl.period}</span></div>
                <div style={{ fontSize:'.8rem', color:pl.feat?C.gold:C.teal, fontWeight:600, marginBottom:'.75rem', marginTop:'.25rem' }}>{pl.checks}</div>
                <ul style={{ listStyle:'none', marginBottom:'1.5rem' }}>
                  {pl.features.map(f=><li key={f} style={{ fontSize:'.82rem', color:pl.feat?'rgba(255,255,255,.85)':C.muted, padding:'.35rem 0', display:'flex', gap:'.5rem', borderBottom:`1px solid ${pl.feat?'rgba(255,255,255,.12)':C.border}` }}><span style={{ color:pl.feat?C.gold:C.teal, fontWeight:700 }}>✓</span>{f}</li>)}
                </ul>
                <Btn variant={pl.feat?'gold':'dark'} full onClick={()=>go('register')}>Get Started →</Btn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / trust section */}
      <section style={{ padding:'3rem 1.5rem', background:C.ink, textAlign:'center' }}>
        <div style={{ maxWidth:700, margin:'0 auto' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2rem', fontWeight:900, color:C.white, marginBottom:'1rem' }}>Trusted by Nigerian Academics</div>
          <div style={{ color:'#9ca3af', lineHeight:1.8, fontSize:'.95rem', marginBottom:'2.5rem' }}>
            Join researchers, postgraduate students, and universities who use OriginCheck to ensure the integrity of their academic work before submission.
          </div>
          <Btn variant="gold" onClick={()=>go('register')} style={{ fontSize:'1rem', padding:'.9rem 2.5rem' }}>Start Checking Today →</Btn>
        </div>
      </section>

      <Footer go={go} />
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────
function Login({ go }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try { const d = await apiFetch('/api/auth/login',{method:'POST',body:{email,password:pass}}); login(d.token,d.user); go('dash'); }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'6rem 1.5rem 2rem', background:`radial-gradient(ellipse at 30% 50%,rgba(26,92,91,.1) 0%,transparent 60%),${C.paper}` }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2rem', fontWeight:900 }}>Welcome back</div>
          <div style={{ color:C.muted, fontSize:'.88rem', marginTop:'.3rem' }}>Log in to your OriginCheck account</div>
        </div>
        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2.5rem' }}>
          <Err msg={err} />
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@university.edu" required />
          <Field label="Password" value={pass} onChange={setPass} type="password" placeholder="••••••••" required />
          <div style={{ marginBottom:'1.5rem' }}/>
          <Btn variant="teal" full onClick={submit} disabled={busy||!email||!pass}>
            {busy?<><Spin size={16} color={C.white}/> Logging in…</>:'Log In'}
          </Btn>
        </div>
        <div style={{ textAlign:'center', marginTop:'1.25rem', color:C.muted, fontSize:'.85rem' }}>
          No account? <button onClick={()=>go('register')} style={{ background:'none', border:'none', color:C.teal, fontWeight:600, fontSize:'.85rem' }}>Sign up</button>
        </div>
        <div style={{ textAlign:'center', marginTop:'.5rem' }}>
          <button onClick={()=>go('home')} style={{ background:'none', border:'none', color:C.muted, fontSize:'.82rem' }}>← Back to Home</button>
        </div>
      </div>
    </div>
  );
}

// ── REGISTER ──────────────────────────────────────────────
function Register({ go }) {
  const { login } = useAuth();
  const [f, setF] = useState({ name:'', email:'', password:'', institution:'' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(p=>({...p,[k]:v}));

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      // Check for affiliate referral code in URL or localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref') || localStorage.getItem('oc_ref_code') || '';
      const d = await apiFetch('/api/auth/register',{method:'POST',body:{...f, refCode}});
      login(d.token,d.user);
      localStorage.removeItem('oc_ref_code');
      go('dash');
    }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'6rem 1.5rem 2rem', background:`radial-gradient(ellipse at 70% 50%,rgba(26,92,91,.1) 0%,transparent 60%),${C.paper}` }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2rem', fontWeight:900 }}>Create your account</div>
          <div style={{ color:C.muted, fontSize:'.88rem', marginTop:'.3rem' }}>Join OriginCheck and protect your scholarship</div>
        </div>
        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2.5rem' }}>
          <Err msg={err}/>
          <Field label="Full Name" value={f.name} onChange={set('name')} placeholder="Dr. Abdussamad Ibrahim" required/>
          <Field label="Email Address" value={f.email} onChange={set('email')} type="email" placeholder="you@university.edu" required/>
          <Field label="Password" value={f.password} onChange={set('password')} type="password" placeholder="At least 6 characters" required/>
          <Field label="Institution (optional)" value={f.institution} onChange={set('institution')} placeholder="University of Lagos"/>
          <div style={{ background:C.cream, border:`1px solid ${C.border}`, borderRadius:2, padding:'.7rem 1rem', fontSize:'.8rem', color:C.muted, marginBottom:'1.5rem', lineHeight:1.5 }}>
            After registering, visit <strong>Plans</strong> to subscribe and activate your account.
          </div>
          <Btn variant="gold" full onClick={submit} disabled={busy||!f.name||!f.email||!f.password}>
            {busy?<><Spin size={16} color={C.ink}/> Creating…</>:'Create Account'}
          </Btn>
        </div>
        <div style={{ textAlign:'center', marginTop:'1.25rem', color:C.muted, fontSize:'.85rem' }}>
          Already have an account? <button onClick={()=>go('login')} style={{ background:'none', border:'none', color:C.teal, fontWeight:600, fontSize:'.85rem' }}>Log in</button>
        </div>
        <div style={{ textAlign:'center', marginTop:'.5rem' }}>
          <button onClick={()=>go('home')} style={{ background:'none', border:'none', color:C.muted, fontSize:'.82rem' }}>← Back to Home</button>
        </div>
      </div>
    </div>
  );
}

// ── GPTZERO RESULTS COMPONENT ────────────────────────────
function GPTZeroResults({ result }) {
  const [showSentences, setShowSentences] = useState(true);

  const classColor = { human: C.green, mixed: C.amber, ai: C.red, unknown: C.muted };
  const classBg     = { human: '#f0fff4', mixed: '#fffbf0', ai: '#fff0f0', unknown: C.cream };
  const classLabel  = { human: '✅ Likely Human Written', mixed: '⚠️ Mixed — Partially AI Generated', ai: '🤖 Almost Certainly AI Generated', unknown: '❓ Uncertain' };

  const cls = result.classification || 'unknown';

  return (
    <div style={{ marginBottom:'1rem', animation:'slideIn .3s ease' }}>

      <div style={{ background: classBg[cls], border:`2px solid ${classColor[cls]}40`, borderRadius:3, padding:'1.1rem 1.25rem', marginBottom:'1rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1.25rem', flexWrap:'wrap' }}>
          <div style={{ width:68, height:68, borderRadius:'50%', border:`3px solid ${classColor[cls]}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, background:C.white }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:900, color:classColor[cls], lineHeight:1 }}>{result.aiScore}%</div>
            <div style={{ fontSize:'.55rem', color:classColor[cls], fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em' }}>AI</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:classColor[cls], fontSize:'1rem', marginBottom:'.3rem' }}>{classLabel[cls]}</div>
            <div style={{ fontSize:'.84rem', color:C.ink, lineHeight:1.6 }}>{result.aiVerdict}</div>
          </div>
        </div>

        {(result.perplexity || result.burstiness) && (
          <div style={{ display:'flex', gap:'1.5rem', marginTop:'.85rem', paddingTop:'.85rem', borderTop:`1px solid ${classColor[cls]}30`, flexWrap:'wrap' }}>
            {result.perplexity && (
              <div>
                <div style={{ fontSize:'.68rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>Perplexity</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, color:classColor[cls] }}>{result.perplexity}</div>
                <div style={{ fontSize:'.68rem', color:C.muted }}>Higher = more human</div>
              </div>
            )}
            {result.burstiness !== null && result.burstiness !== undefined && (
              <div>
                <div style={{ fontSize:'.68rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>Burstiness</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, color:classColor[cls] }}>{typeof result.burstiness === 'number' ? result.burstiness.toFixed(2) : result.burstiness}</div>
                <div style={{ fontSize:'.68rem', color:C.muted }}>Higher = more varied</div>
              </div>
            )}
            <div>
              <div style={{ fontSize:'.68rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>Words Scanned</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, color:C.ink }}>{result.wordCount}</div>
              <div style={{ fontSize:'.68rem', color:C.muted }}>of {result.wordLimit} limit</div>
            </div>
            <div>
              <div style={{ fontSize:'.68rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>Source</div>
              <div style={{ fontSize:'.85rem', fontWeight:700, color:'#4338ca' }}>GPTZero API</div>
              <div style={{ fontSize:'.68rem', color:C.muted }}>gptzero.me</div>
            </div>
          </div>
        )}
      </div>

      {result.sentences && result.sentences.length > 0 && (
        <div style={{ background:C.white, border:'1.5px solid #c4b5fd', borderRadius:3, overflow:'hidden' }}>
          <div style={{ background:'#4338ca', padding:'.7rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:'#c4b5fd', letterSpacing:'.08em', fontWeight:600 }}>
              SENTENCE-BY-SENTENCE ANALYSIS ({result.sentences.length} sentences)
            </div>
            <button onClick={()=>setShowSentences(s=>!s)}
              style={{ background:'rgba(255,255,255,.15)', border:'none', color:C.white, fontSize:'.72rem', padding:'.25rem .65rem', borderRadius:2, cursor:'pointer' }}>
              {showSentences ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>

          <div style={{ padding:'.6rem 1rem', background:'#f5f3ff', borderBottom:'1px solid #e0d9ff', display:'flex', gap:'1.25rem', flexWrap:'wrap' }}>
            {[['#dcfce7','#16a34a','Human Written'],['#fef9c3','#b45309','Uncertain'],['#fee2e2','#dc2626','AI Generated']].map(([bg,col,label])=>(
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'.35rem', fontSize:'.72rem', color:C.muted }}>
                <div style={{ width:14, height:14, borderRadius:2, background:bg, border:`1.5px solid ${col}` }}/>
                {label}
              </div>
            ))}
          </div>

          {showSentences && (
            <div style={{ padding:'1rem', lineHeight:2.2, fontSize:'.88rem', color:C.ink }}>
              {result.sentences.map((s, i) => {
                const prob = s.aiProbability;
                const bg   = prob < 30 ? '#dcfce7' : prob < 60 ? '#fef9c3' : '#fee2e2';
                const border = prob < 30 ? '#16a34a' : prob < 60 ? '#b45309' : '#dc2626';
                const textColor = prob < 30 ? '#14532d' : prob < 60 ? '#78350f' : '#7f1d1d';
                return (
                  <span key={i}
                    title={`AI probability: ${prob}%`}
                    style={{ background:bg, borderBottom:`2px solid ${border}`, color:textColor, padding:'2px 1px', cursor:'default', marginRight:'2px' }}>
                    {s.text}{' '}
                  </span>
                );
              })}
            </div>
          )}

          <div style={{ padding:'.75rem 1rem', background:'#f5f3ff', borderTop:'1px solid #e0d9ff', display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>
            {[
              ['Human sentences',  result.sentences.filter(s=>s.aiProbability<30).length,  '#16a34a'],
              ['Uncertain',        result.sentences.filter(s=>s.aiProbability>=30&&s.aiProbability<60).length, '#b45309'],
              ['AI sentences',     result.sentences.filter(s=>s.aiProbability>=60).length, '#dc2626'],
            ].map(([label, count, color])=>(
              <div key={label} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.3rem', fontWeight:900, color }}>{count}</div>
                <div style={{ fontSize:'.7rem', color:C.muted }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── RESULT TABS COMPONENT ────────────────────────────────
function ResultTabs({ result, onDownload, certBusy, showTab, isFree, go }) {
  const [tab, setTab] = useState(showTab || 'plagiarism');

  const pct  = result?.similarityPercent ?? 0;
  const lc   = pct < 20 ? C.green : pct < 40 ? C.amber : C.red;
  const lbg  = pct < 20 ? '#f0fff4' : pct < 40 ? '#fffbf0' : '#fff0f0';
  const llbl = pct < 20 ? '✔ High Originality' : pct < 40 ? '⚠ Moderate Similarity' : '✘ High Similarity';

  const aiScore = result?.aiScore ?? 0;
  const aiLabel = result?.aiLabel || (aiScore < 20 ? 'Likely Human Written' : aiScore < 50 ? 'Uncertain' : aiScore < 75 ? 'Likely AI Generated' : 'Almost Certainly AI Generated');
  const aic  = aiScore < 20 ? C.green : aiScore < 50 ? C.amber : C.red;
  const aibg = aiScore < 20 ? '#f0fff4' : aiScore < 50 ? '#fffbf0' : '#fff0f0';
  const aiIcon = aiScore < 20 ? '🧑' : aiScore < 50 ? '🤔' : aiScore < 75 ? '🤖' : '🤖';

  return (
    <div>
      {/* Result tab switcher */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.border}`, marginBottom:'1rem' }}>
        <button onClick={()=>setTab('plagiarism')} style={{ flex:1, padding:'.7rem', border:'none', background:'transparent', fontFamily:"'DM Mono',monospace", fontSize:'.78rem', letterSpacing:'.05em', fontWeight:600, color:tab==='plagiarism'?C.teal:C.muted, borderBottom:`2px solid ${tab==='plagiarism'?C.gold:'transparent'}`, marginBottom:-2 }}>
          🔍 Plagiarism Check
        </button>
        <button onClick={()=>setTab('ai')} style={{ flex:1, padding:'.7rem', border:'none', background:'transparent', fontFamily:"'DM Mono',monospace", fontSize:'.78rem', letterSpacing:'.05em', fontWeight:600, color:tab==='ai'?C.teal:C.muted, borderBottom:`2px solid ${tab==='ai'?C.gold:'transparent'}`, marginBottom:-2 }}>
          🤖 AI Detection
        </button>
      </div>

      {/* ── PLAGIARISM TAB ── */}
      {tab === 'plagiarism' && (
        <div>
          {/* Score bar */}
          <div style={{ background:lbg, border:`1.5px solid ${lc}30`, borderRadius:3, padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', gap:'1.5rem', marginBottom:'1rem' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', border:`3px solid ${lc}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:"'Playfair Display',serif", fontSize:'1.25rem', fontWeight:900, color:lc }}>
              {pct}%
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:lc, marginBottom:'.3rem', fontSize:'.95rem' }}>{llbl}</div>
              <div style={{ fontSize:'.87rem', lineHeight:1.6 }}>{result.verdict}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.75rem', marginBottom:'1rem' }}>
            {[['✏️','Grammar Issues',result.grammarIssues],['🔗','Source Matches',result.matchedSources],['📚','Citations',result.citationCount]].map(([ic,l,v])=>(
              <div key={l} style={{ background:C.cream, border:`1px solid ${C.border}`, borderRadius:3, padding:'1rem', textAlign:'center' }}>
                <div style={{ fontSize:'1.1rem', marginBottom:'.2rem' }}>{ic}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900 }}>{v}</div>
                <div style={{ fontSize:'.68rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Check method badge */}
          {result.realCheck ? (
            <div style={{ background:'#f0fff4', border:'1px solid #b0e0c0', borderRadius:2, padding:'.5rem .9rem', marginBottom:'.75rem', fontSize:'.78rem', color:C.green, fontWeight:600, display:'flex', alignItems:'center', gap:'.4rem', flexWrap:'wrap' }}>
              🔎 Web-search-grounded check{result.searchesPerformed > 0 ? ` — ${result.searchesPerformed} live searches performed` : ''}
            </div>
          ) : (
            <div style={{ background:'#fff8e8', border:`1px solid ${C.gold}`, borderRadius:2, padding:'.5rem .9rem', marginBottom:'.75rem', fontSize:'.78rem', color:C.amber, fontWeight:600, display:'flex', alignItems:'center', gap:'.4rem' }}>
              ⚡ AI-powered originality estimate
            </div>
          )}

          {/* Self-plagiarism warning */}
          {result.selfPlagiarism && (
            <div style={{ background:'#fff0f0', border:`1.5px solid ${C.red}`, borderRadius:2, padding:'.75rem 1rem', marginBottom:'.75rem', fontSize:'.83rem', color:C.red, fontWeight:600, display:'flex', alignItems:'center', gap:'.5rem' }}>
              ⚠️ This text appears to overlap with your own previous submissions — check for recycled content.
            </div>
          )}

          {/* Flagged phrases that matched search results */}
          {result.flaggedPhrases?.length > 0 && (
            <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:3, overflow:'hidden', marginBottom:'1rem' }}>
              <div style={{ background:C.ink, padding:'.65rem 1rem' }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, letterSpacing:'.08em', fontWeight:600 }}>⚠️ PHRASES FOUND ELSEWHERE ({result.flaggedPhrases.length})</div>
              </div>
              {result.flaggedPhrases.map((phrase, i) => (
                <div key={i} style={{ padding:'.65rem 1rem', borderBottom: i < result.flaggedPhrases.length-1 ? `1px solid ${C.border}` : 'none', fontSize:'.83rem', color:C.ink, fontStyle:'italic' }}>
                  "{phrase}"
                </div>
              ))}
            </div>
          )}

          {/* Paragraph-level heatmap */}
          {result.chunks?.length > 1 && (
            <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:3, overflow:'hidden', marginBottom:'1rem' }}>
              <div style={{ background:C.ink, padding:'.65rem 1rem' }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, letterSpacing:'.08em', fontWeight:600 }}>📊 PARAGRAPH-BY-PARAGRAPH BREAKDOWN</div>
              </div>
              {result.chunks.map((chunk, i) => {
                const score = chunk.score;
                const cColor = score === null ? C.muted : score < 25 ? C.green : score < 55 ? C.amber : C.red;
                const cBg = score === null ? C.cream : score < 25 ? '#f0fff4' : score < 55 ? '#fffbf0' : '#fff0f0';
                return (
                  <div key={i} style={{ padding:'.75rem 1rem', borderBottom: i < result.chunks.length-1 ? `1px solid ${C.border}` : 'none', display:'flex', alignItems:'flex-start', gap:'.75rem', background:cBg }}>
                    <div style={{ width:38, height:38, borderRadius:3, background:C.white, border:`1.5px solid ${cColor}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'.78rem', fontWeight:900, color:cColor }}>{score ?? '—'}</div>
                    </div>
                    <div style={{ fontSize:'.8rem', color:C.ink, lineHeight:1.5, flex:1 }}>{chunk.text}{chunk.text.length >= 200 ? '…' : ''}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions?.length > 0 && (
            <div style={{ background:'#f0f8ff', border:'1px solid #b8d4f0', borderRadius:3, padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:'#1a5c8a', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.5rem' }}>Improvement Suggestions</div>
              {result.suggestions.map((s,i) => (
                <div key={i} style={{ fontSize:'.84rem', color:'#2a4a6a', padding:'.25rem 0', display:'flex', gap:'.5rem' }}>
                  <span style={{ color:C.teal, flexShrink:0 }}>→</span>{s}
                </div>
              ))}
            </div>
          )}

          {isFree ? (
            <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:3, padding:'1rem 1.25rem' }}>
              <div style={{ fontWeight:700, color:C.ink, marginBottom:'.3rem' }}>🏅 Certificate not available on free trial</div>
              <div style={{ fontSize:'.83rem', color:C.muted, marginBottom:'.75rem', lineHeight:1.6 }}>
                Subscribe to download your originality certificate. Plans start at ₦3,500/month.
              </div>
              <Btn variant="gold" full onClick={()=>go('subscribe')}>Subscribe to Get Certificate →</Btn>
            </div>
          ) : (
            <Btn variant="gold" full onClick={onDownload} disabled={certBusy}>
              {certBusy ? <><Spin size={16} color={C.ink}/> Generating…</> : '🏅 Download Originality Certificate (PDF)'}
            </Btn>
          )}
        </div>
      )}

      {/* ── AI DETECTION TAB ── */}
      {tab === 'ai' && (
        <div>
          {/* Main AI score card */}
          <div style={{ background:aibg, border:`1.5px solid ${aic}30`, borderRadius:3, padding:'1.5rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', marginBottom:'1rem' }}>
              {/* Gauge circle */}
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:80, height:80, borderRadius:'50%', border:`4px solid ${aic}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:aibg }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.3rem', fontWeight:900, color:aic, lineHeight:1 }}>{aiScore}%</div>
                  <div style={{ fontSize:'.6rem', color:aic, fontWeight:700, marginTop:'.1rem' }}>AI</div>
                </div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'.4rem' }}>
                  <span style={{ fontSize:'1.3rem' }}>{aiIcon}</span>
                  <span style={{ fontWeight:700, color:aic, fontSize:'1rem' }}>{aiLabel}</span>
                </div>
                <div style={{ fontSize:'.87rem', color:C.ink, lineHeight:1.6 }}>{result.aiVerdict || 'No AI assessment available.'}</div>
              </div>
            </div>

            {/* Score bar */}
            <div style={{ marginTop:'.75rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.72rem', color:C.muted, marginBottom:'.3rem', fontFamily:"'DM Mono',monospace" }}>
                <span>🧑 Human Written (0%)</span>
                <span>🤖 AI Generated (100%)</span>
              </div>
              <div style={{ height:8, background:'#e5e7eb', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${aiScore}%`, background:`linear-gradient(to right, ${C.green}, ${C.amber}, ${C.red})`, borderRadius:4, transition:'width 1s ease' }}/>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.7rem', color:C.muted, marginTop:'.3rem' }}>
                <span style={{ color:C.green }}>● Likely Human</span>
                <span style={{ color:C.amber }}>● Uncertain</span>
                <span style={{ color:C.red }}>● AI Generated</span>
              </div>
            </div>
          </div>

          {/* AI indicators */}
          {result.aiIndicators?.length > 0 && (
            <div style={{ background:C.cream, border:`1px solid ${C.border}`, borderRadius:3, padding:'1rem 1.25rem', marginBottom:'1rem' }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.75rem' }}>
                {aiScore >= 50 ? '⚠️ AI Indicators Detected' : '✅ Characteristics Observed'}
              </div>
              {result.aiIndicators.map((ind, i) => (
                <div key={i} style={{ fontSize:'.84rem', color:C.ink, padding:'.3rem 0', display:'flex', gap:'.6rem', borderBottom:i < result.aiIndicators.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ color: aiScore >= 50 ? C.red : C.green, flexShrink:0, fontWeight:700 }}>{aiScore >= 50 ? '⚠' : '✓'}</span>
                  {ind}
                </div>
              ))}
            </div>
          )}

          {/* What this means box */}
          <div style={{ background: aiScore < 20 ? '#f0fff4' : aiScore < 50 ? '#fef9e7' : '#fff5f5', border:`1px solid ${aic}40`, borderRadius:3, padding:'1rem 1.25rem', marginBottom:'1rem' }}>
            <div style={{ fontSize:'.78rem', fontWeight:700, color:aic, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.5rem' }}>What This Means</div>
            <div style={{ fontSize:'.84rem', color:C.ink, lineHeight:1.7 }}>
              {aiScore < 20 && 'This text shows strong indicators of human authorship. The writing style, vocabulary variation, and natural flow suggest it was written by a person.'}
              {aiScore >= 20 && aiScore < 50 && 'This text has mixed characteristics. Some sections appear human-written while others show patterns common in AI-generated content. Review is recommended.'}
              {aiScore >= 50 && aiScore < 75 && 'This text shows significant AI-like patterns including uniform structure, predictable phrasing, and lack of personal voice. It may have been generated or heavily edited by AI.'}
              {aiScore >= 75 && 'This text very strongly resembles AI-generated content. The writing patterns, structure, and phrasing are highly characteristic of large language model output.'}
            </div>
          </div>

          {isFree ? (
            <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:3, padding:'1rem 1.25rem' }}>
              <div style={{ fontWeight:700, color:C.ink, marginBottom:'.3rem' }}>🏅 Certificate not available on free trial</div>
              <div style={{ fontSize:'.83rem', color:C.muted, marginBottom:'.75rem', lineHeight:1.6 }}>
                Subscribe to download your originality certificate with AI detection results.
              </div>
              <Btn variant="gold" full onClick={()=>go('subscribe')}>Subscribe to Get Certificate →</Btn>
            </div>
          ) : (
            <Btn variant="gold" full onClick={onDownload} disabled={certBusy}>
              {certBusy ? <><Spin size={16} color={C.ink}/> Generating…</> : '🏅 Download Certificate (Includes AI Detection)'}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────
function Dashboard({ go }) {
  const { user, setUser, af } = useAuth();

  // Check type tabs: text/abstract/title (content mode)
  const [mode, setMode]       = useState('text');
  // Check kind: plagiarism or ai
  const [checkKind, setCheckKind] = useState('plagiarism');

  const [text, setText]       = useState('');
  const [fname, setFname]     = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [plagResult, setPlagResult]   = useState(null);
  const [aiResult, setAiResult]       = useState(null);
  const [gptzeroUsed, setGptzeroUsed]       = useState(user?.gptzero_used || 0);
  const [gptzeroLimit, setGptzeroLimit]     = useState(user?.gptzero_limit || 0);
  const [gptzeroResult, setGptzeroResult]   = useState(null);
  const [gptzeroLoading, setGptzeroLoading] = useState(false);
  const [gptzeroErr, setGptzeroErr]         = useState('');
  const [checkId, setCheckId] = useState(null);
  const [err, setErr]         = useState('');
  const [certBusy, setCertBusy]     = useState(false);
  const [drag, setDrag]       = useState(false);
  const [certTitle, setCertTitle]   = useState('');
  const [certInstitution, setCertInstitution] = useState(user?.institution || '');
  const [showAiOnCert, setShowAiOnCert] = useState(true);
  const fileRef = useRef(null);

  const isFree     = user?.plan === 'free';
  const noSub      = !user || user.plan === 'none';
  const expired    = !isFree && user?.sub_expires && new Date(user.sub_expires) < new Date();
  const checksLeft = user ? Math.max(0, user.checks_limit - user.checks_used) : 0;

  // Show success banner if coming back from Paystack payment
  const [paySuccess, setPaySuccess] = useState(() => {
    const flag = sessionStorage.getItem('oc_pay_success');
    if (flag) { sessionStorage.removeItem('oc_pay_success'); return true; }
    return false;
  });

  // Auto-hide the payment success banner after 8 seconds
  useEffect(() => {
    if (!paySuccess) return;
    const t = setTimeout(() => setPaySuccess(false), 8000);
    return () => clearTimeout(t);
  }, [paySuccess]);

  const handleFile = async file => {
    if (!file) return;
    setExtracting(true); setErr('');
    setPlagResult(null); setAiResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch(API + '/api/extract', { method:'POST', headers:{ Authorization:`Bearer ${localStorage.getItem('oc_tok')}` }, body:fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setText(d.text); setFname(d.filename);
    } catch(e) { setErr(e.message); }
    finally { setExtracting(false); }
  };

  const runCheck = async () => {
    if (!text.trim()) return;
    setLoading(true); setErr(''); setCheckId(null);
    // Only clear the relevant result
    if (checkKind === 'plagiarism') setPlagResult(null);
    else setAiResult(null);
    try {
      const d = await af('/api/check', {
        method:'POST',
        body:{ text, mode, filename: certTitle || fname, certTitle, certInstitution, checkKind }
      });
      setCheckId(d.checkId);
      if (checkKind === 'plagiarism') setPlagResult(d);
      else setAiResult(d);
      const me = await af('/api/auth/me'); setUser(me.user);
    } catch(e) {
      setErr(e.message);
      if (e.message.includes('subscription') || e.message.includes('expired') || e.message.includes('limit')) go('subscribe');
    } finally { setLoading(false); }
  };

  const runGPTZeroScan = async () => {
    if (!text.trim()) return;
    setGptzeroLoading(true); setGptzeroErr(''); setGptzeroResult(null);
    try {
      const d = await af('/api/gptzero-scan', { method:'POST', body:{ text } });
      setGptzeroResult(d);
      setGptzeroUsed(d.gptzeroUsed || 0);
      setGptzeroLimit(d.gptzeroLimit || 0);
    } catch(e) {
      setGptzeroErr(e.message);
    } finally { setGptzeroLoading(false); }
  };

  const downloadCert = async () => {
    if (!checkId) return;
    setCertBusy(true);
    try {
      const params = new URLSearchParams();
      if (certTitle) params.set('title', certTitle);
      if (certInstitution) params.set('institution', certInstitution);
      params.set('showAi', showAiOnCert ? '1' : '0');
      const res = await fetch(`/api/certificate/${checkId}?${params}`, { headers:{ Authorization:`Bearer ${localStorage.getItem('oc_tok')}` } });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`OriginCheck-${checkId.slice(0,8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setErr('Certificate failed. Please try again.'); }
    finally { setCertBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ maxWidth:880, margin:'0 auto', padding:'1.5rem 1rem' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900 }}>Welcome, {user?.name?.split(' ')[0]}</div>
            <div style={{ color:C.muted, fontSize:'.88rem' }}>{user?.institution||user?.email}</div>
          </div>
          <div style={{ display:'flex', gap:'.75rem', alignItems:'center' }}>
            {noSub||expired ? (
              <Btn variant="gold" onClick={()=>go('subscribe')}>⚡ Subscribe to Check</Btn>
            ) : (
              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'.75rem 1.1rem', textAlign:'center' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, color:checksLeft<5?C.red:C.teal }}>{checksLeft}</div>
                <div style={{ fontSize:'.65rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.06em' }}>AI Checks</div>
              </div>
            )}
            <Btn variant="ghost" onClick={()=>go('history')} style={{ padding:'.6rem 1.1rem', fontSize:'.82rem' }}>History</Btn>
          </div>
        </div>

        {/* Payment success banner */}
        {paySuccess && (
          <div style={{ background:'#f0fff4', border:`2px solid ${C.green}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem', animation:'slideIn .4s ease' }}>
            <div>
              <div style={{ fontWeight:700, color:C.green, fontSize:'1rem' }}>🎉 Subscription activated successfully!</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>
                Welcome to {user?.plan === 'researcher' ? 'Pro' : user?.plan === 'university' ? 'University' : 'Basic'} plan — your checks are ready to use.
              </div>
            </div>
            <button onClick={()=>setPaySuccess(false)} style={{ background:'none', border:'none', color:C.muted, fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
          </div>
        )}

        {/* Free trial banner */}
        {isFree && checksLeft > 0 && (
          <div style={{ background:'#eaf6f6', border:`1.5px solid ${C.teal}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem' }}>
            <div>
              <div style={{ fontWeight:700, color:C.teal }}>🎉 You have 1 free trial check!</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>Run your first check free. Subscribe to get certificates and more checks.</div>
            </div>
            <Btn variant="teal" onClick={()=>go('subscribe')} style={{ fontSize:'.82rem', padding:'.6rem 1.1rem' }}>See Plans →</Btn>
          </div>
        )}
        {isFree && checksLeft <= 0 && (
          <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem' }}>
            <div>
              <div style={{ fontWeight:700 }}>⚡ Free trial used — subscribe to continue</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>You have used your 1 free check. Subscribe from ₦3,500/month for 30 checks + certificates.</div>
            </div>
            <Btn variant="gold" onClick={()=>go('subscribe')}>Subscribe Now →</Btn>
          </div>
        )}
        {(noSub||expired) && (
          <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem' }}>
            <div>
              <div style={{ fontWeight:700 }}>{expired?'⚠️ Subscription Expired':'👋 No active subscription'}</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>{expired?'Renew your plan to continue.':'Subscribe to start running checks.'}</div>
            </div>
            <Btn variant="gold" onClick={()=>go('subscribe')}>View Plans →</Btn>
          </div>
        )}

        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'hidden' }}>

          {/* ── Check Kind Selector (Plagiarism / AI Detection) ── */}
          <div style={{ display:'flex', background:'#f8f6f2', borderBottom:`2px solid ${C.gold}` }}>
            {[['plagiarism','🔍 Plagiarism Check'],['ai','🤖 AI Detection']].map(([k,l])=>(
              <button key={k} onClick={()=>{ setCheckKind(k); setErr(''); }}
                style={{ flex:1, padding:'.9rem', border:'none', fontWeight:700, fontSize:'.88rem', cursor:'pointer', background:checkKind===k?C.teal:'transparent', color:checkKind===k?C.white:C.muted, borderBottom:`3px solid ${checkKind===k?C.gold:'transparent'}`, transition:'all .2s' }}>
                {l}
              </button>
            ))}
          </div>

          {/* ── Content Mode Tabs (Text / Abstract / Title) ── */}
          <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, background:C.white }}>
            {[['text','Paste Text'],['abstract','Abstract'],['title','Title Check']].map(([v,l])=>(
              <button key={v} onClick={()=>{ setMode(v); }}
                style={{ flex:1, padding:'.7rem', border:'none', fontFamily:"'DM Mono',monospace", fontSize:'.72rem', letterSpacing:'.05em', fontWeight:500, background:mode===v?'#e8f4f4':C.white, color:mode===v?C.teal:C.muted, borderBottom:`2px solid ${mode===v?C.teal:'transparent'}`, transition:'all .2s' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ padding:'1.5rem' }}>

            {/* Description of selected check */}
            <div style={{ background: checkKind==='plagiarism'?'#e8f4f4':'#eef0ff', border:`1px solid ${checkKind==='plagiarism'?C.teal:'#8888cc'}30`, borderRadius:3, padding:'.65rem 1rem', marginBottom:'1rem', fontSize:'.82rem', color:C.ink, lineHeight:1.6 }}>
              {checkKind==='plagiarism'
                ? '🔍 <strong>Plagiarism Check:</strong> Analyzes similarity to existing academic sources, detects grammar issues, citation patterns, and gives improvement suggestions.'
                : '🤖 <strong>AI Detection:</strong> Analyzes whether the text was written by a human or generated by an AI tool like ChatGPT, Gemini, or similar.'
              }
            </div>

            {/* File drop */}
            <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
              onClick={()=>fileRef.current?.click()}
              style={{ border:`2px dashed ${drag?C.teal:C.border}`, borderRadius:3, padding:'1.1rem', textAlign:'center', cursor:'pointer', marginBottom:'1rem', background:drag?'rgba(26,92,91,.04)':C.cream }}>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])}/>
              {extracting
                ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'.5rem', color:C.muted, fontSize:'.88rem' }}><Spin size={16}/> Extracting text…</div>
                : fname
                  ? <div style={{ color:C.teal, fontSize:'.88rem', fontWeight:600 }}>📄 {fname} <span style={{ color:C.muted, fontWeight:400 }}>— click to change</span></div>
                  : <div style={{ color:C.muted, fontSize:'.85rem', lineHeight:1.6 }}><span style={{ fontSize:'1.4rem', display:'block', marginBottom:'.3rem' }}>📂</span><strong style={{ color:C.ink }}>Drop a file here</strong> or click to browse<br/><span style={{ fontSize:'.75rem' }}>PDF, DOCX, TXT — up to 10MB</span></div>
              }
            </div>

            {/* OR divider */}
            <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1rem' }}>
              <div style={{ flex:1, height:1, background:C.border }}/><span style={{ color:C.muted, fontSize:'.72rem', fontFamily:"'DM Mono',monospace" }}>OR TYPE / PASTE</span><div style={{ flex:1, height:1, background:C.border }}/>
            </div>

            {/* Textarea */}
            <textarea value={text} onChange={e=>{setText(e.target.value);setFname('');}} placeholder={
              {text:'Paste your text here…',abstract:'Paste your research abstract here…',title:'Enter your research title or topic…'}[mode]
            } style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, color:C.ink, fontSize:'.9rem', padding:'.9rem', borderRadius:2, resize:'vertical', minHeight:110, lineHeight:1.6, outline:'none' }}/>
            {text && <div style={{ fontSize:'.72rem', color:C.muted, textAlign:'right', marginTop:'.25rem', fontFamily:"'DM Mono',monospace" }}>{text.trim().split(/\s+/).length} words</div>}

            {/* Certificate Details */}
            <div style={{ marginTop:'1rem', background:C.cream, border:`1px solid ${C.border}`, borderRadius:3, padding:'.9rem 1rem' }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.65rem' }}>📄 Certificate Details (optional)</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.65rem', marginBottom:'.65rem' }}>
                <div>
                  <label style={{ display:'block', fontSize:'.7rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.28rem' }}>Paper / Document Title</label>
                  <input value={certTitle} onChange={e=>setCertTitle(e.target.value)} placeholder="Full paper title here…"
                    style={{ width:'100%', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.55rem .8rem', fontSize:'.85rem', outline:'none', color:C.ink }}/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'.7rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.28rem' }}>Institution Name</label>
                  <input value={certInstitution} onChange={e=>setCertInstitution(e.target.value)} placeholder="Your university or institution…"
                    style={{ width:'100%', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.55rem .8rem', fontSize:'.85rem', outline:'none', color:C.ink }}/>
                </div>
              </div>

              {/* Show AI verdict toggle */}
              <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                <div
                  onClick={()=>setShowAiOnCert(v=>!v)}
                  style={{ width:40, height:22, borderRadius:11, background:showAiOnCert?C.teal:'#ccc', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:3, left:showAiOnCert?20:3, width:16, height:16, borderRadius:'50%', background:C.white, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
                </div>
                <div>
                  <div style={{ fontSize:'.82rem', fontWeight:600, color:C.ink }}>
                    {showAiOnCert ? '✅ Include AI detection verdict on certificate' : '⬜ AI detection verdict hidden from certificate'}
                  </div>
                  <div style={{ fontSize:'.72rem', color:C.muted }}>Toggle to show or hide AI analysis results on your downloaded certificate</div>
                </div>
              </div>
            </div>

            {/* Run button */}
            <Btn variant="teal" full onClick={runCheck} disabled={loading||!text.trim()||noSub||expired||checksLeft<=0}
              style={{ marginTop:'.9rem', padding:'.9rem', fontSize:'.95rem' }}>
              {loading
                ? <><Spin size={18} color={C.white}/> {checkKind==='plagiarism'?'Checking for plagiarism…':'Detecting AI content…'}</>
                : noSub ? 'Register to get 1 free check'
                : expired ? 'Subscription expired — renew to continue'
                : checksLeft<=0 && isFree ? '⚡ Free trial used — subscribe to continue'
                : checksLeft<=0 ? 'Monthly limit reached — upgrade plan'
                : isFree ? '🎁 Use My Free Trial Check'
                : checkKind==='plagiarism' ? '🔍 Run Plagiarism Check' : '🤖 Run AI Detection'}
            </Btn>

            {err && <div style={{ marginTop:'.9rem', background:'#fff0f0', border:`1px solid #ffc0c0`, borderRadius:2, padding:'.75rem 1rem', color:C.red, fontSize:'.85rem' }}>{err}</div>}

            {/* Plagiarism Results */}
            {plagResult && checkKind==='plagiarism' && (
              <div style={{ marginTop:'1.5rem', animation:'slideIn .4s ease' }}>
                <ResultTabs result={plagResult} onDownload={isFree ? null : downloadCert} certBusy={certBusy} showTab="plagiarism" isFree={isFree} go={go} />
              </div>
            )}

            {/* AI Detection Results */}
            {aiResult && checkKind==='ai' && (
              <div style={{ marginTop:'1.5rem', animation:'slideIn .4s ease' }}>
                <ResultTabs result={aiResult} onDownload={isFree ? null : downloadCert} certBusy={certBusy} showTab="ai" isFree={isFree} go={go} />
              </div>
            )}

          </div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── HISTORY ───────────────────────────────────────────────
function History({ go }) {
  const { af } = useAuth();
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]   = useState(null);
  const [certBusy, setCertBusy] = useState(null);

  useEffect(()=>{
    af('/api/history').then(d=>{setChecks(d.checks);setLoading(false);}).catch(()=>setLoading(false));
  },[]);

  const lc  = p=>p<20?C.green:p<40?C.amber:C.red;
  const lbg = p=>p<20?'#f0fff4':p<40?'#fffbf0':'#fff0f0';
  const ll  = p=>p<20?'High Originality':p<40?'Moderate':'High Similarity';

  const downloadCert = async id=>{
    setCertBusy(id);
    try {
      const res = await fetch(`${API}/api/certificate/${id}`,{headers:{Authorization:`Bearer ${localStorage.getItem('oc_tok')}`}});
      const blob=await res.blob(); const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`OriginCheck-${id.slice(0,8)}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch{}
    finally{setCertBusy(null);}
  };

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ maxWidth:800, margin:'0 auto', padding:'1.5rem 1rem' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, marginBottom:'.3rem' }}>Check History</div>
        <div style={{ color:C.muted, fontSize:'.88rem', marginBottom:'2rem' }}>All your past checks — permanently saved. Download certificates anytime.</div>
        {loading?<div style={{ textAlign:'center', padding:'3rem' }}><Spin size={32}/></div>
        :checks.length===0?<div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'3rem', textAlign:'center', color:C.muted }}><div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>📄</div><div style={{ fontWeight:600 }}>No checks yet</div><div style={{ fontSize:'.85rem', marginTop:'.3rem' }}>Run your first check from the Dashboard.</div></div>
        :checks.map(c=>(
          <div key={c.id} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'hidden', marginBottom:'.75rem' }}>
            <div onClick={()=>setOpen(open===c.id?null:c.id)} style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'1rem 1.25rem', cursor:'pointer' }}>
              <div style={{ width:52, height:52, borderRadius:'50%', border:`2.5px solid ${lc(c.similarity)}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:"'Playfair Display',serif", fontSize:'1rem', fontWeight:900, color:lc(c.similarity), background:lbg(c.similarity) }}>{c.similarity}%</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.filename||'Pasted Text'} <span style={{ color:C.muted, fontWeight:400, fontSize:'.76rem', textTransform:'uppercase', letterSpacing:'.06em' }}>· {c.mode}</span></div>
                <div style={{ fontSize:'.76rem', color:C.muted }}>{new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div style={{ display:'flex', gap:'.4rem', alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <div style={{ fontSize:'.72rem', fontWeight:600, color:lc(c.similarity), background:lbg(c.similarity), padding:'.25rem .6rem', borderRadius:20 }}>{ll(c.similarity)}</div>
                {c.ai_score !== undefined && c.ai_score !== null && (
                  <div style={{ fontSize:'.72rem', fontWeight:600, color: c.ai_score < 20 ? C.green : c.ai_score < 50 ? C.amber : C.red, background: c.ai_score < 20 ? '#f0fff4' : c.ai_score < 50 ? '#fffbf0' : '#fff0f0', padding:'.25rem .6rem', borderRadius:20 }}>
                    🤖 {c.ai_score}%
                  </div>
                )}
              </div>
              <div style={{ color:C.muted, fontSize:'.75rem' }}>{open===c.id?'▲':'▼'}</div>
            </div>
            {open===c.id&&(
              <div style={{ borderTop:`1px solid ${C.border}`, padding:'1rem 1.25rem', background:C.cream, animation:'slideIn .2s ease' }}>
                <div style={{ fontSize:'.85rem', lineHeight:1.6, marginBottom:'.75rem' }}>{c.verdict}</div>
                <div style={{ display:'flex', gap:'1.25rem', fontSize:'.76rem', color:C.muted, marginBottom:'1rem', fontFamily:"'DM Mono',monospace", flexWrap:'wrap' }}>
                  <span>Grammar: <strong style={{ color:C.ink }}>{c.grammar}</strong></span>
                  <span>Sources: <strong style={{ color:C.ink }}>{c.sources}</strong></span>
                  <span>Citations: <strong style={{ color:C.ink }}>{c.citations}</strong></span>
                  {c.ai_score !== undefined && c.ai_score !== null && (
                    <span style={{ color: c.ai_score < 20 ? C.green : c.ai_score < 50 ? C.amber : C.red }}>
                      🤖 AI: <strong>{c.ai_score}%</strong>
                    </span>
                  )}
                </div>
                <Btn variant="gold" onClick={()=>downloadCert(c.id)} disabled={certBusy===c.id} style={{ padding:'.6rem 1.25rem', fontSize:'.82rem' }}>
                  {certBusy===c.id?<><Spin size={14} color={C.ink}/> Generating…</>:'🏅 Download Certificate'}
                </Btn>
              </div>
            )}
          </div>
        ))}
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── SUBSCRIBE ─────────────────────────────────────────────
function Subscribe({ go }) {
  const { user, setUser, af } = useAuth();
  const [busy, setBusy]   = useState(null);
  const [err, setErr]     = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    const ref=localStorage.getItem('oc_pending_ref');
    if(p.get('payment')==='success'&&ref){setVerifying(true);verify(ref);}
    else if(p.get('payment')==='failed'){setErr('Payment was not completed. Please try again.');window.history.replaceState({},'','/');}
  },[]);

  const verify=async ref=>{
    try{
      const d=await af(`/api/payment/verify/${ref}`);
      if(d.status==='success'){setUser(d.user);localStorage.removeItem('oc_pending_ref');setVerifying(false);window.history.replaceState({},'','/');go('dash');}
      else setTimeout(()=>verify(ref),3000);
    }catch{setVerifying(false);setErr('Could not verify payment. Please contact support.');}
  };

  const subscribe=async key=>{
    if(!user){go('register');return;}
    setBusy(key);setErr('');
    try{
      const d=await af('/api/payment/initialize',{method:'POST',body:{plan:key}});
      localStorage.setItem('oc_pending_ref',d.reference);
      window.location.href=d.authorization_url;
    }catch(e){setErr(e.message);setBusy(null);}
  };

  const plans=[
    {key:'basic',name:'Basic',price:'₦3,500',period:'/mo',checks:'30 checks/month',features:['30 AI-powered checks/mo','Certificate download','Check history','Email support'],feat:false},
    {key:'researcher',name:'Pro',price:'₦10,000',period:'/mo',checks:'100 checks/month',features:['100 AI-powered checks/mo','Document comparison','Priority processing','Priority support'],feat:true},
    {key:'university',name:'University',price:'₦25,000',period:'/mo',checks:'Unlimited checks',features:['Unlimited AI-powered checks','LMS integration','Admin dashboard','Dedicated support'],feat:false},
  ];

  const subExpired=user?.sub_expires&&new Date(user.sub_expires)<new Date();
  const daysLeft=user?.sub_expires?Math.max(0,Math.ceil((new Date(user.sub_expires)-new Date())/86400000)):0;

  if(verifying) return(
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'5rem' }}>
      <div style={{ textAlign:'center' }}><Spin size={40}/>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900, marginTop:'1.5rem', marginBottom:'.5rem' }}>Confirming Your Payment</div>
        <div style={{ color:C.muted, fontSize:'.9rem' }}>Please wait a moment…</div>
      </div>
    </div>
  );

  return(
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'2rem 1.25rem' }}>
        <div style={{ textAlign:'center', marginBottom:'3rem' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Pricing</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.4rem', fontWeight:900, marginBottom:'.5rem' }}>Choose Your Plan</div>
          <div style={{ color:C.muted, fontSize:'.92rem' }}>All plans are billed monthly. Cancel any time.</div>
        </div>
        {user&&user.plan!=='none'&&!subExpired&&(
          <div style={{ background:'#f0fff4', border:`1.5px solid #b0e0c0`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'2rem', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:700, color:C.green }}>✅ Active: {user.plan.charAt(0).toUpperCase()+user.plan.slice(1)} Plan</div>
              <div style={{ fontSize:'.82rem', color:C.muted, marginTop:'.2rem' }}>{user.checks_limit-user.checks_used} checks remaining · {daysLeft} days left</div>
            </div>
            <Btn variant="ghost" onClick={()=>go('history')} style={{ padding:'.5rem 1rem', fontSize:'.82rem' }}>View History</Btn>
          </div>
        )}
        {err&&<Err msg={err}/>}
        {/* Free tier info strip */}
        <div style={{ background:'#eaf6f6', border:`1.5px solid ${C.teal}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'2rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
          <div style={{ fontSize:'1.5rem' }}>🎁</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:C.teal }}>Every new account gets 1 free check</div>
            <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>No credit card required to register and try OriginCheck. Subscribe below to unlock certificates and more checks.</div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.25rem' }}>
          {plans.map(pl=>{
            const isCurrent=user?.plan===pl.key&&!subExpired;
            return(
              <div key={pl.key} style={{ border:`${pl.feat?2:1.5}px solid ${pl.feat?C.teal:C.border}`, borderRadius:4, padding:'2rem 1.75rem', background:pl.feat?C.teal:C.white, color:pl.feat?C.white:C.ink, position:'relative', display:'flex', flexDirection:'column' }}>
                {pl.feat&&<div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:C.gold, color:C.ink, fontSize:'.62rem', fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'.1em', textTransform:'uppercase', padding:'.2rem .8rem', borderRadius:20 }}>Most Popular</div>}
                {isCurrent&&<div style={{ position:'absolute', top:12, right:12, background:C.gold, color:C.ink, fontSize:'.6rem', fontWeight:700, fontFamily:"'DM Mono',monospace", padding:'.2rem .6rem', borderRadius:20 }}>Current</div>}
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.7rem', letterSpacing:'.15em', textTransform:'uppercase', color:pl.feat?'rgba(255,255,255,.6)':C.muted, marginBottom:'.5rem' }}>{pl.name}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900 }}>{pl.price}<span style={{ fontSize:'.8rem', fontWeight:400, color:pl.feat?'rgba(255,255,255,.6)':C.muted }}>{pl.period}</span></div>
                <div style={{ fontSize:'.8rem', color:pl.feat?C.gold:C.teal, fontWeight:600, marginBottom:'.75rem', marginTop:'.25rem' }}>{pl.checks}</div>
                <ul style={{ listStyle:'none', marginBottom:'1.5rem', flex:1 }}>
                  {pl.features.map(f=><li key={f} style={{ fontSize:'.82rem', color:pl.feat?'rgba(255,255,255,.85)':C.muted, padding:'.35rem 0', display:'flex', gap:'.5rem', borderBottom:`1px solid ${pl.feat?'rgba(255,255,255,.12)':C.border}` }}><span style={{ color:pl.feat?C.gold:C.teal, fontWeight:700 }}>✓</span>{f}</li>)}
                </ul>
                <Btn variant={pl.feat?'gold':'dark'} full onClick={()=>subscribe(pl.key)} disabled={busy===pl.key||isCurrent}>
                  {busy===pl.key?<><Spin size={16} color={pl.feat?C.ink:C.white}/> Redirecting…</>:isCurrent?'✓ Current Plan':`Subscribe — ${pl.price}/mo`}
                </Btn>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign:'center', marginTop:'2rem', color:C.muted, fontSize:'.8rem' }}>
          🔒 Payments processed securely by <strong style={{ color:C.ink }}>Paystack</strong> · Cards, Bank Transfer & USSD accepted
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── HUMANISER ────────────────────────────────────────────
function Humaniser({ go }) {
  const { user, setUser, af } = useAuth();
  const [inputText, setInputText]         = useState('');
  const [outputText, setOutputText]       = useState('');
  const [style, setStyle]                 = useState('balanced');
  const [loading, setLoading]             = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [err, setErr]                     = useState('');
  const [copied, setCopied]               = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [fname, setFname]                 = useState('');
  const [selfCheckScore, setSelfCheckScore] = useState(null);
  const [stillFlagged, setStillFlagged]   = useState([]);
  const fileRef                           = useRef(null);

  const noSub   = !user || user.plan === 'none';
  const expired = user?.sub_expires && new Date(user.sub_expires) < new Date();
  const checksLeft = user ? Math.max(0, user.checks_limit - user.checks_used) : 0;

  const handleFile = async file => {
    if (!file) return;
    setExtracting(true); setErr('');
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch(API + '/api/extract', { method:'POST', headers:{ Authorization:`Bearer ${localStorage.getItem('oc_tok')}` }, body:fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setInputText(d.text); setFname(d.filename);
    } catch(e) { setErr(e.message); }
    finally { setExtracting(false); }
  };

  const humanise = async () => {
    if (!inputText.trim()) return;
    setLoading(true); setErr(''); setOutputText('');
    setLoadingMsg('Pass 1 of 3 — Restructuring sentences and paragraphs…');
    try {
      const t1 = setTimeout(() => setLoadingMsg('Pass 2 of 3 — Refining voice and rhythm…'), 14000);
      const t2 = setTimeout(() => setLoadingMsg('Pass 3 of 3 — Scrubbing AI patterns…'), 28000);
      const t3 = setTimeout(() => setLoadingMsg('Running self-check on output…'), 42000);
      const d = await af('/api/humanise', { method:'POST', body:{ text: inputText, style } });
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setOutputText(d.humanised);
      setSelfCheckScore(d.selfCheckScore ?? null);
      setStillFlagged(d.stillFlagged || []);
      const me = await af('/api/auth/me'); setUser(me.user);
    } catch(e) {
      setErr(e.message);
      if (e.message.includes('subscription') || e.message.includes('expired') || e.message.includes('limit')) go('subscribe');
    } finally { setLoading(false); setLoadingMsg(''); }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(outputText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const downloadTxt = () => {
    const blob = new Blob([outputText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='humanised-text.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = t => t.trim() ? t.trim().split(/\s+/).length : 0;

  const styles = [
    { key:'balanced',  label:'Balanced',  desc:'Professional yet natural — best for most academic submissions' },
    { key:'academic',  label:'Academic',  desc:'Scholarly tone with natural human voice and variation' },
    { key:'student',   label:'Student',   desc:'Intelligent but with natural student writing patterns' },
    { key:'casual',    label:'Casual',    desc:'Conversational and warm — for blogs or informal writing' },
  ];

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      {/* Header */}
      <div style={{ background:C.ink, padding:'3rem 2rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>AI Text Humaniser</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900, color:C.white, marginBottom:'.75rem' }}>Make AI Text Sound Human</div>
        <div style={{ color:'#9ca3af', maxWidth:560, margin:'0 auto', lineHeight:1.8, fontSize:'.9rem' }}>
          Paste AI-generated text and get a natural, human-sounding version that preserves your original meaning while removing AI detection patterns.
        </div>
      </div>

      {/* How it works strip */}
      <div style={{ background:C.cream, borderBottom:`1px solid ${C.border}`, padding:'1rem 2rem' }}>
        <div style={{ maxWidth:860, margin:'0 auto', display:'flex', gap:'2rem', justifyContent:'center', flexWrap:'wrap' }}>
          {[['1️⃣','Paste or upload your AI text'],['2️⃣','Choose your writing style'],['3️⃣','Get a natural human version'],['4️⃣','Re-run AI detection to verify']].map(([n,t])=>(
            <div key={t} style={{ display:'flex', alignItems:'center', gap:'.5rem', fontSize:'.82rem', color:C.muted }}>
              <span style={{ fontSize:'1.1rem' }}>{n}</span><span>{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:'0 auto', padding:'2rem 1.25rem' }}>

        {/* Subscription warning */}
        {(noSub || expired) && (
          <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:4, padding:'1rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'.75rem' }}>
            <div>
              <div style={{ fontWeight:700 }}>{expired ? '⚠️ Subscription Expired' : '👋 No active subscription'}</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginTop:'.2rem' }}>Subscribe to use the humaniser.</div>
            </div>
            <Btn variant="gold" onClick={()=>go('subscribe')}>View Plans →</Btn>
          </div>
        )}

        {/* Style selector */}
        <div style={{ marginBottom:'1.25rem' }}>
          <div style={{ fontSize:'.75rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.75rem' }}>Writing Style</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:'.75rem' }}>
            {styles.map(s => (
              <div key={s.key} onClick={()=>setStyle(s.key)}
                style={{ background: style===s.key ? C.teal : C.white, border:`1.5px solid ${style===s.key ? C.teal : C.border}`, borderRadius:3, padding:'.9rem 1rem', cursor:'pointer', transition:'all .15s' }}>
                <div style={{ fontWeight:700, fontSize:'.88rem', color: style===s.key ? C.white : C.ink, marginBottom:'.25rem' }}>{s.label}</div>
                <div style={{ fontSize:'.75rem', color: style===s.key ? 'rgba(255,255,255,.75)' : C.muted, lineHeight:1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column input/output */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', alignItems:'start' }}>

          {/* INPUT */}
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'hidden' }}>
            <div style={{ background:'#f8f6f2', borderBottom:`1px solid ${C.border}`, padding:'.7rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.75rem', color:C.muted, letterSpacing:'.06em' }}>INPUT — AI GENERATED TEXT</div>
              <div style={{ fontSize:'.72rem', color:C.muted, fontFamily:"'DM Mono',monospace" }}>{wordCount(inputText)} words</div>
            </div>

            {/* File upload area */}
            <div onClick={()=>fileRef.current?.click()}
              style={{ margin:'.75rem', border:`1.5px dashed ${C.border}`, borderRadius:2, padding:'.65rem', textAlign:'center', cursor:'pointer', background:C.cream, fontSize:'.8rem', color:C.muted }}>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])}/>
              {extracting ? <><Spin size={13}/> Extracting…</> : fname ? <span style={{ color:C.teal, fontWeight:600 }}>📄 {fname}</span> : '📂 Upload PDF / DOCX / TXT'}
            </div>

            <textarea value={inputText} onChange={e=>{ setInputText(e.target.value); setFname(''); }}
              placeholder="Paste your AI-generated text here, or upload a file above…"
              style={{ width:'100%', border:'none', borderTop:`1px solid ${C.border}`, background:C.white, padding:'1rem', fontSize:'.88rem', lineHeight:1.7, resize:'vertical', minHeight:320, outline:'none', color:C.ink, boxSizing:'border-box' }}/>

            <div style={{ padding:'.75rem 1rem', borderTop:`1px solid ${C.border}`, background:'#f8f6f2' }}>
              <Btn variant="teal" full onClick={humanise}
                disabled={loading || !inputText.trim() || noSub || expired || checksLeft <= 0}
                style={{ padding:'.8rem', fontSize:'.9rem' }}>
                {loading
                  ? <><Spin size={16} color={C.white}/> Humanising your text…</>
                  : noSub || expired ? 'Subscribe to humanise'
                  : checksLeft <= 0 ? 'Check limit reached'
                  : '✍️ Deep Humanise (3-Pass) →'}
              </Btn>
              {!noSub && !expired && (
                <div style={{ fontSize:'.7rem', color:C.muted, textAlign:'center', marginTop:'.4rem', fontFamily:"'DM Mono',monospace" }}>
                  Uses 1 check · {checksLeft} remaining
                </div>
              )}
            </div>
          </div>

          {/* OUTPUT */}
          <div style={{ background:C.white, border:`1.5px solid ${outputText ? C.teal : C.border}`, borderRadius:4, overflow:'hidden' }}>
            <div style={{ background: outputText ? '#e8f4f4' : '#f8f6f2', borderBottom:`1px solid ${C.border}`, padding:'.7rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.75rem', color: outputText ? C.teal : C.muted, letterSpacing:'.06em', fontWeight: outputText ? 700 : 400 }}>
                {outputText ? '✅ HUMANISED TEXT' : 'OUTPUT — HUMANISED VERSION'}
              </div>
              <div style={{ fontSize:'.72rem', color:C.muted, fontFamily:"'DM Mono',monospace" }}>{wordCount(outputText)} words</div>
            </div>

            {outputText ? (
              <>
                {/* Self-check score banner */}
                {selfCheckScore !== null && (
                  <div style={{ margin:'.75rem .75rem 0', padding:'.75rem 1rem', borderRadius:3, background: selfCheckScore < 25 ? '#f0fff4' : selfCheckScore < 55 ? '#fffbf0' : '#fff0f0', border:`1.5px solid ${selfCheckScore < 25 ? C.green : selfCheckScore < 55 ? C.amber : C.red}`, display:'flex', alignItems:'center', gap:'.75rem' }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, color: selfCheckScore < 25 ? C.green : selfCheckScore < 55 ? C.amber : C.red }}>{selfCheckScore}%</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'.85rem', color: selfCheckScore < 25 ? C.green : selfCheckScore < 55 ? C.amber : C.red }}>
                        {selfCheckScore < 25 ? '✅ Passes AI Detection' : selfCheckScore < 55 ? '⚠️ May Still Trigger Some Detectors' : '❌ Still Reads as AI — Humanise Again'}
                      </div>
                      <div style={{ fontSize:'.75rem', color:C.muted, marginTop:'.15rem' }}>Self-check score — lower is better</div>
                    </div>
                  </div>
                )}

                {/* Flagged sentences that still sound AI */}
                {stillFlagged?.length > 0 && (
                  <div style={{ margin:'.5rem .75rem 0', padding:'.75rem 1rem', borderRadius:3, background:'#fffbf0', border:`1px solid ${C.amber}` }}>
                    <div style={{ fontSize:'.72rem', fontWeight:700, color:C.amber, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.4rem' }}>Sentences that may still be flagged:</div>
                    {stillFlagged.map((s, i) => (
                      <div key={i} style={{ fontSize:'.8rem', color:C.ink, fontStyle:'italic', padding:'.25rem 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>"{s}"</div>
                    ))}
                    <div style={{ fontSize:'.72rem', color:C.muted, marginTop:'.4rem' }}>Tip: Copy these sentences and manually rewrite them for best results</div>
                  </div>
                )}

                <div style={{ padding:'1rem', fontSize:'.88rem', lineHeight:1.8, color:C.ink, minHeight:320, maxHeight:500, overflowY:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {outputText}
                </div>
                <div style={{ padding:'.75rem 1rem', borderTop:`1px solid ${C.border}`, background:'#f0fafa', display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
                  <Btn variant="teal" onClick={copyOutput} style={{ padding:'.6rem 1.1rem', fontSize:'.82rem', flex:1 }}>
                    {copied ? '✅ Copied!' : '📋 Copy Text'}
                  </Btn>
                  <Btn variant="gold" onClick={downloadTxt} style={{ padding:'.6rem 1.1rem', fontSize:'.82rem', flex:1 }}>
                    ⬇️ Download .TXT
                  </Btn>
                  <Btn variant="ghost" onClick={()=>{ go('dash'); }} style={{ padding:'.6rem 1.1rem', fontSize:'.82rem', flex:1 }}>
                    🔍 Run AI Detection
                  </Btn>
                </div>
              </>
            ) : (
              <div style={{ minHeight:320, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', textAlign:'center', color:C.muted }}>
                {loading ? (
                  <>
                    <Spin size={36} />
                    <div style={{ marginTop:'1.25rem', fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, color:C.teal }}>
                      {loadingMsg || 'Humanising your text…'}
                    </div>
                    <div style={{ marginTop:'.5rem', fontSize:'.82rem', color:C.muted }}>Three-pass deep rewrite + self-check — takes 40–60 seconds for best results</div>
                    {/* Progress dots */}
                    <div style={{ display:'flex', gap:'.4rem', marginTop:'1rem' }}>
                      {[0,1,2,3,4].map(i=>(
                        <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:C.teal, opacity: 0.3 + (i * 0.15), animation:`pulse ${1 + i*0.2}s infinite` }}/>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>✍️</div>
                    <div style={{ fontWeight:600, color:C.ink, marginBottom:'.4rem' }}>Humanised text will appear here</div>
                    <div style={{ fontSize:'.83rem', lineHeight:1.6 }}>Paste your AI-generated text on the left, choose a style, and click Humanise.</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {err && <div style={{ marginTop:'1rem', background:'#fff0f0', border:`1px solid #ffc0c0`, borderRadius:2, padding:'.75rem 1rem', color:C.red, fontSize:'.85rem' }}>{err}</div>}

        {/* Tips section */}
        <div style={{ marginTop:'2rem', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, marginBottom:'1rem' }}>💡 Tips for Best Results</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'1rem' }}>
            {[
              ['After humanising', 'Run AI Detection again to confirm the score dropped significantly.'],
              ['Long documents', 'For long papers, humanise section by section for better quality.'],
              ['Review carefully', 'Always review the humanised text — check that your meaning is preserved.'],
              ['Multiple passes', 'If the AI score is still high, humanise the output a second time.'],
            ].map(([title, tip]) => (
              <div key={title} style={{ background:C.cream, borderRadius:3, padding:'1rem' }}>
                <div style={{ fontWeight:700, fontSize:'.85rem', marginBottom:'.35rem', color:C.teal }}>{title}</div>
                <div style={{ fontSize:'.8rem', color:C.muted, lineHeight:1.6 }}>{tip}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Important notice */}
        <div style={{ marginTop:'1.25rem', background:'#fff8e8', border:`1px solid ${C.gold}`, borderRadius:3, padding:'1rem 1.25rem', display:'flex', gap:'.75rem', alignItems:'flex-start' }}>
          <span style={{ fontSize:'1.2rem', flexShrink:0 }}>⚠️</span>
          <div style={{ fontSize:'.82rem', color:C.ink, lineHeight:1.7 }}>
            <strong>Academic integrity notice:</strong> The humaniser is designed to help researchers improve their own drafts that were partially assisted by AI tools. Using it to submit entirely AI-generated work as your own original research violates academic integrity policies. OriginCheck encourages honest, ethical use of all its tools.
          </div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── AFFILIATE ────────────────────────────────────────────
function Affiliate({ go }) {
  const { user, af } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name:'', bank_account:'', bank_holder:'' });
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMsg, setBankMsg]   = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg]   = useState('');
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    af('/api/affiliate/dashboard')
      .then(d => { setData(d); setBankForm({ bank_name: d.affiliate.bank_name||'', bank_account: d.affiliate.bank_account||'', bank_holder: d.affiliate.bank_holder||'' }); })
      .catch(() => {}) // not an affiliate yet
      .finally(() => setLoading(false));
  }, []);

  const join = async () => {
    setJoining(true);
    try {
      const d = await af('/api/affiliate/join', { method:'POST', body:{} });
      const dash = await af('/api/affiliate/dashboard');
      setData(dash);
    } catch(e) { alert(e.message); }
    finally { setJoining(false); }
  };

  const saveBank = async () => {
    setBankBusy(true); setBankMsg('');
    try {
      await af('/api/affiliate/bank', { method:'POST', body: bankForm });
      setBankMsg('✅ Bank details saved successfully!');
      const dash = await af('/api/affiliate/dashboard');
      setData(dash);
    } catch(e) { setBankMsg('Error: ' + e.message); }
    finally { setBankBusy(false); }
  };

  const requestPayout = async () => {
    setPayoutBusy(true); setPayoutMsg('');
    try {
      const d = await af('/api/affiliate/payout', { method:'POST', body:{} });
      setPayoutMsg('✅ Payout requested! Admin will process within 24–48 hours.');
      const dash = await af('/api/affiliate/dashboard');
      setData(dash);
    } catch(e) { setPayoutMsg('Error: ' + e.message); }
    finally { setPayoutBusy(false); }
  };

  const refLink = data ? `${window.location.origin}/register?ref=${data.affiliate.code}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(refLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const fmt = kobo => '₦' + ((kobo || 0) / 100).toLocaleString('en-NG');

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'5rem' }}><Spin size={36}/></div>
  );

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      {/* Header */}
      <div style={{ background:C.ink, padding:'3.5rem 2rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Affiliate Programme</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.5rem', fontWeight:900, color:C.white, marginBottom:'1rem' }}>Earn Money by Referring Researchers</div>
        <div style={{ color:'#9ca3af', maxWidth:560, margin:'0 auto', lineHeight:1.8, fontSize:'.95rem' }}>
          Share your unique link. Earn <strong style={{ color:C.gold }}>20% commission</strong> on every Basic and Researcher subscription, and <strong style={{ color:C.gold }}>10%</strong> on University plans.
        </div>
      </div>

      {/* Commission rates */}
      <div style={{ background:C.cream, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:860, margin:'0 auto', padding:'1.5rem', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1rem' }}>
          {[
            ['Basic Plan', '₦3,500/mo', '20%', '₦700', 'per referral'],
            ['Pro Plan', '₦10,000/mo', '20%', '₦2,000', 'per referral'],
            ['University Plan', '₦25,000/mo', '10%', '₦2,500', 'per referral'],
          ].map(([plan, price, rate, earn, label]) => (
            <div key={plan} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.25rem', textAlign:'center' }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.7rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.4rem' }}>{plan}</div>
              <div style={{ fontSize:'.85rem', color:C.muted, marginBottom:'.5rem' }}>{price}</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2rem', fontWeight:900, color:C.teal }}>{earn}</div>
              <div style={{ fontSize:'.75rem', color:C.muted }}>{label} ({rate} commission)</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'2rem 1.5rem' }}>

        {/* NOT YET AN AFFILIATE */}
        {!data && (
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'3rem', textAlign:'center', maxWidth:560, margin:'0 auto' }}>
            <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>💰</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.6rem', fontWeight:900, marginBottom:'.75rem' }}>Join the Affiliate Programme</div>
            <div style={{ color:C.muted, fontSize:'.9rem', lineHeight:1.7, marginBottom:'2rem' }}>
              Get your unique referral link instantly. Share it with colleagues, students, and academic communities. Earn commission on every subscription they take out — paid directly to your Nigerian bank account.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'1rem', marginBottom:'2rem' }}>
              {[['1️⃣','Get your link','Join and copy your unique referral link'],['2️⃣','Share it','Post in WhatsApp, LinkedIn, email'],['3️⃣','Earn money','Get 20% commission for every subscriber']].map(([n,t,d])=>(
                <div key={t} style={{ background:C.cream, borderRadius:3, padding:'1rem', textAlign:'center' }}>
                  <div style={{ fontSize:'1.5rem', marginBottom:'.4rem' }}>{n}</div>
                  <div style={{ fontWeight:700, fontSize:'.85rem', marginBottom:'.3rem' }}>{t}</div>
                  <div style={{ fontSize:'.75rem', color:C.muted, lineHeight:1.5 }}>{d}</div>
                </div>
              ))}
            </div>
            <Btn variant="gold" onClick={join} disabled={joining} style={{ fontSize:'1rem', padding:'.9rem 2.5rem' }}>
              {joining ? <><Spin size={16} color={C.ink}/> Joining…</> : '💰 Join & Get My Referral Link'}
            </Btn>
            <div style={{ fontSize:'.75rem', color:C.muted, marginTop:'1rem' }}>Free to join. No minimum referrals required to earn.</div>
          </div>
        )}

        {/* AFFILIATE DASHBOARD */}
        {data && (
          <div>
            {/* Stats row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
              {[
                ['💰', 'Total Earned', fmt(data.affiliate.total_earnings), C.teal],
                ['⏳', 'Pending Payout', fmt(data.affiliate.pending_earnings), C.amber],
                ['✅', 'Paid Out', fmt(data.affiliate.paid_earnings), C.green],
                ['👥', 'Total Referrals', data.affiliate.total_referrals, C.ink],
              ].map(([icon, label, val, color]) => (
                <div key={label} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.25rem', textAlign:'center' }}>
                  <div style={{ fontSize:'1.4rem', marginBottom:'.3rem' }}>{icon}</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.6rem', fontWeight:900, color }}>{val}</div>
                  <div style={{ fontSize:'.7rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginTop:'.2rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Referral link */}
            <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem', marginBottom:'1.5rem' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, marginBottom:'.75rem' }}>🔗 Your Referral Link</div>
              <div style={{ display:'flex', gap:'.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ flex:1, background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem 1rem', fontSize:'.85rem', color:C.teal, fontFamily:"'DM Mono',monospace", wordBreak:'break-all', minWidth:200 }}>
                  {refLink}
                </div>
                <Btn variant={copied?'ghost':'teal'} onClick={copyLink} style={{ padding:'.7rem 1.25rem', fontSize:'.85rem', flexShrink:0 }}>
                  {copied ? '✅ Copied!' : '📋 Copy Link'}
                </Btn>
              </div>
              <div style={{ marginTop:'1rem' }}>
                <div style={{ fontSize:'.75rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.5rem' }}>Your affiliate code:</div>
                <div style={{ display:'inline-block', background:C.ink, color:C.gold, fontFamily:"'DM Mono',monospace", fontSize:'1.1rem', fontWeight:700, padding:'.4rem 1rem', borderRadius:3, letterSpacing:'.15em' }}>
                  {data.affiliate.code}
                </div>
              </div>

              {/* Share buttons */}
              <div style={{ marginTop:'1rem', display:'flex', gap:'.75rem', flexWrap:'wrap' }}>
                <a href={`https://wa.me/?text=${encodeURIComponent("Check out OriginCheck — Nigeria's most affordable plagiarism detection platform! Use my referral link to sign up: " + refLink)}`}
                  target="_blank" rel="noreferrer"
                  style={{ background:'#25D366', color:C.white, padding:'.6rem 1.1rem', borderRadius:2, fontSize:'.82rem', fontWeight:600, display:'flex', alignItems:'center', gap:'.4rem', textDecoration:'none' }}>
                  📱 Share on WhatsApp
                </a>
                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refLink)}`}
                  target="_blank" rel="noreferrer"
                  style={{ background:'#0077B5', color:C.white, padding:'.6rem 1.1rem', borderRadius:2, fontSize:'.82rem', fontWeight:600, display:'flex', alignItems:'center', gap:'.4rem', textDecoration:'none' }}>
                  💼 Share on LinkedIn
                </a>
                <a href={`mailto:?subject=Try OriginCheck — Affordable Plagiarism Detection&body=Hi, I wanted to share OriginCheck with you — an AI-powered plagiarism and originality checking platform built for Nigerian researchers. Sign up using my link: ${refLink}`}
                  style={{ background:C.teal, color:C.white, padding:'.6rem 1.1rem', borderRadius:2, fontSize:'.82rem', fontWeight:600, display:'flex', alignItems:'center', gap:'.4rem', textDecoration:'none' }}>
                  📧 Share by Email
                </a>
              </div>
            </div>

            {/* Two columns: Bank details + Payout request */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', marginBottom:'1.5rem' }}>

              {/* Bank details */}
              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, marginBottom:'1rem' }}>🏦 Bank Account for Payout</div>
                {[['bank_name','Bank Name','e.g. First Bank'],['bank_account','Account Number','10-digit account number'],['bank_holder','Account Name','Name on account']].map(([k,l,ph])=>(
                  <div key={k} style={{ marginBottom:'.85rem' }}>
                    <label style={{ display:'block', fontSize:'.72rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.3rem' }}>{l}</label>
                    <input value={bankForm[k]} onChange={e=>setBankForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}
                      style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.6rem .85rem', fontSize:'.88rem', outline:'none', color:C.ink }}/>
                  </div>
                ))}
                {bankMsg && <div style={{ fontSize:'.82rem', color: bankMsg.startsWith('✅')?C.green:C.red, marginBottom:'.75rem', fontWeight:600 }}>{bankMsg}</div>}
                <Btn variant="teal" full onClick={saveBank} disabled={bankBusy||!bankForm.bank_name||!bankForm.bank_account||!bankForm.bank_holder}>
                  {bankBusy?<><Spin size={14} color={C.white}/> Saving…</>:'Save Bank Details'}
                </Btn>
              </div>

              {/* Payout request */}
              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700, marginBottom:'1rem' }}>💸 Request Payout</div>
                <div style={{ background: data.affiliate.pending_earnings >= 100000 ? '#f0fff4' : C.cream, border:`1px solid ${data.affiliate.pending_earnings >= 100000 ? '#b0e0c0' : C.border}`, borderRadius:3, padding:'1.25rem', marginBottom:'1rem', textAlign:'center' }}>
                  <div style={{ fontSize:'.75rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.4rem' }}>Available for Payout</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.2rem', fontWeight:900, color: data.affiliate.pending_earnings >= 100000 ? C.green : C.muted }}>
                    {fmt(data.affiliate.pending_earnings)}
                  </div>
                  <div style={{ fontSize:'.78rem', color:C.muted, marginTop:'.4rem' }}>Minimum payout: ₦1,000</div>
                </div>
                <div style={{ fontSize:'.82rem', color:C.muted, lineHeight:1.7, marginBottom:'1rem' }}>
                  Once you request a payout, the admin will transfer the amount to your bank account within <strong>24–48 hours</strong>.
                </div>
                {!data.affiliate.bank_account && (
                  <div style={{ background:'#fff8e8', border:`1px solid ${C.gold}`, borderRadius:2, padding:'.75rem', fontSize:'.8rem', color:C.muted, marginBottom:'1rem' }}>
                    ⚠️ Please add your bank details first before requesting a payout.
                  </div>
                )}
                {payoutMsg && <div style={{ fontSize:'.82rem', color: payoutMsg.startsWith('✅')?C.green:C.red, marginBottom:'.75rem', fontWeight:600 }}>{payoutMsg}</div>}
                <Btn variant="gold" full onClick={requestPayout}
                  disabled={payoutBusy || data.affiliate.pending_earnings < 100000 || !data.affiliate.bank_account}>
                  {payoutBusy?<><Spin size={14} color={C.ink}/> Requesting…</>:'💸 Request Payout'}
                </Btn>
              </div>
            </div>

            {/* Referrals table */}
            {data.referrals?.length > 0 && (
              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'hidden' }}>
                <div style={{ padding:'1rem 1.5rem', borderBottom:`1px solid ${C.border}`, fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:700 }}>
                  👥 Your Referrals ({data.referrals.length})
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:C.ink }}>
                        {['Name','Plan','Commission','Status','Date'].map(h=>(
                          <th key={h} style={{ padding:'.7rem 1rem', textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:'.68rem', color:C.gold, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.map((r,i)=>(
                        <tr key={r.id} style={{ background:i%2===0?C.white:C.paper, borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', fontWeight:600 }}>{r.name}</td>
                          <td style={{ padding:'.7rem 1rem' }}>
                            <span style={{ background:C.teal+'20', color:C.teal, fontSize:'.72rem', fontWeight:700, padding:'.2rem .6rem', borderRadius:20, textTransform:'uppercase', fontFamily:"'DM Mono',monospace" }}>
                              {r.plan||'—'}
                            </span>
                          </td>
                          <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', fontWeight:700, color:C.teal }}>{fmt(r.commission)}</td>
                          <td style={{ padding:'.7rem 1rem' }}>
                            <span style={{ background: r.status==='paid'?C.green+'20':r.status==='payout_requested'?C.amber+'20':C.border, color: r.status==='paid'?C.green:r.status==='payout_requested'?C.amber:C.muted, fontSize:'.72rem', fontWeight:700, padding:'.2rem .6rem', borderRadius:20, fontFamily:"'DM Mono',monospace" }}>
                              {r.status==='paid'?'Paid':r.status==='payout_requested'?'Requested':'Pending'}
                            </span>
                          </td>
                          <td style={{ padding:'.7rem 1rem', fontSize:'.78rem', color:C.muted, whiteSpace:'nowrap' }}>
                            {new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.referrals?.length === 0 && (
              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2.5rem', textAlign:'center', color:C.muted }}>
                <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>🚀</div>
                <div style={{ fontWeight:600, marginBottom:'.4rem' }}>No referrals yet</div>
                <div style={{ fontSize:'.85rem' }}>Share your link above to start earning. Every researcher you refer earns you commission.</div>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── AMBASSADOR ───────────────────────────────────────────
function Ambassador({ go }) {
  const { user, af } = useAuth();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ institution:'', role:'', whatsapp:'', motivation:'' });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');
  const set = k => v => setForm(p => ({...p, [k]: v}));

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    af('/api/ambassador/status')
      .then(d => { setStatus(d.ambassador); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!form.institution || !form.role) return;
    setSubmitting(true); setErr(''); setMsg('');
    try {
      const d = await af('/api/ambassador/apply', { method:'POST', body: form });
      setMsg(d.message);
      const s = await af('/api/ambassador/status');
      setStatus(s.ambassador);
    } catch(e) { setErr(e.message); }
    finally { setSubmitting(false); }
  };

  const benefits = [
    ['🎓', 'Free Pro Plan', 'Get a free OriginCheck Pro plan (₦10,000/month value) for as long as you are an active ambassador.'],
    ['💰', 'Earn Commission', 'Earn 20% on every subscriber you refer — paid directly to your Nigerian bank account.'],
    ['🏅', 'Official Certificate', 'Receive an OriginCheck Ambassador certificate you can add to your academic profile and CV.'],
    ['🌐', 'Listed on Website', 'Your name and institution will be featured on the OriginCheck ambassadors page.'],
    ['🚀', 'Early Access', 'Be the first to test new features before they are released to the public.'],
    ['📣', 'Marketing Support', 'We provide you with ready-made posts, flyers, and talking points to make sharing easy.'],
  ];

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'5rem' }}>
      <Spin size={36}/>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>

      <div style={{ background:C.ink, padding:'4rem 2rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Ambassador Programme</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.5rem', fontWeight:900, color:C.white, marginBottom:'1rem', maxWidth:650, margin:'0 auto 1rem' }}>
          Represent OriginCheck at Your Institution
        </div>
        <div style={{ color:'#9ca3af', maxWidth:560, margin:'0 auto', lineHeight:1.8, fontSize:'.95rem' }}>
          Join our network of Nigerian academic ambassadors. Get a free Pro plan, earn commission, and help researchers at your institution protect the integrity of their work.
        </div>
      </div>

      <div style={{ background:C.cream, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:960, margin:'0 auto', padding:'3rem 1.5rem' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, textAlign:'center', marginBottom:'2rem' }}>What You Get as an Ambassador</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:'1.25rem' }}>
            {benefits.map(([icon, title, desc]) => (
              <div key={title} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem' }}>
                <div style={{ fontSize:'1.5rem', marginBottom:'.6rem' }}>{icon}</div>
                <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'.4rem', color:C.teal }}>{title}</div>
                <div style={{ fontSize:'.83rem', color:C.muted, lineHeight:1.65 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:700, margin:'0 auto', padding:'2.5rem 1.5rem', textAlign:'center' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, marginBottom:'1.25rem' }}>What We Ask in Return</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', textAlign:'left' }}>
            {[
              ['📱', 'Share your referral link in at least 2 academic WhatsApp groups'],
              ['💼', 'Post about OriginCheck on LinkedIn once a month'],
              ['🤝', 'Refer at least 3 paying subscribers per month to keep your free plan'],
              ['📣', 'Mention OriginCheck at departmental or faculty meetings when relevant'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display:'flex', gap:'.75rem', alignItems:'flex-start', background:C.cream, borderRadius:3, padding:'1rem' }}>
                <span style={{ fontSize:'1.1rem', flexShrink:0 }}>{icon}</span>
                <span style={{ fontSize:'.85rem', color:C.ink, lineHeight:1.6 }}>{text}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:'1.25rem', background:'#fff8e8', border:`1px solid ${C.gold}`, borderRadius:3, padding:'.85rem 1.25rem', fontSize:'.83rem', color:C.muted }}>
            ⚠️ The free Pro plan is renewed monthly. If referrals drop below 3 in a month, the plan pauses until activity resumes. Commission earnings are never taken back.
          </div>
        </div>
      </div>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'2.5rem 1.5rem' }}>

        {!user && (
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2.5rem', textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>🎖️</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900, marginBottom:'.75rem' }}>Create an account first</div>
            <div style={{ color:C.muted, fontSize:'.9rem', marginBottom:'1.5rem', lineHeight:1.7 }}>You need an OriginCheck account to apply as an ambassador. Registration is free.</div>
            <div style={{ display:'flex', gap:'1rem', justifyContent:'center' }}>
              <Btn variant="gold" onClick={()=>go('register')}>Create Free Account</Btn>
              <Btn variant="ghost" onClick={()=>go('login')}>Log In</Btn>
            </div>
          </div>
        )}

        {user && status && (
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'hidden' }}>
            <div style={{ background: status.status==='approved' ? C.teal : status.status==='rejected' ? '#c0392b' : '#b8860b', padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', gap:'1rem' }}>
              <div style={{ fontSize:'1.5rem' }}>{status.status==='approved' ? '✅' : status.status==='rejected' ? '❌' : '⏳'}</div>
              <div>
                <div style={{ fontWeight:700, color:C.white, fontSize:'1rem' }}>
                  {status.status==='approved' ? 'You are an Active Ambassador!' : status.status==='rejected' ? 'Application Not Approved' : 'Application Under Review'}
                </div>
                <div style={{ color:'rgba(255,255,255,.75)', fontSize:'.83rem', marginTop:'.2rem' }}>
                  {status.status==='approved' ? 'Your Pro plan is active. Keep referring to maintain your benefits.' : status.status==='rejected' ? 'Thank you for applying. You may reapply after 30 days.' : 'We will review your application within 24 hours and respond by email.'}
                </div>
              </div>
            </div>

            <div style={{ padding:'1.5rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.25rem' }}>
                {[['Institution', status.institution], ['Role', status.role], ['Applied', new Date(status.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})], ['Total Referrals', status.total_referrals || 0]].map(([l,v])=>(
                  <div key={l} style={{ background:C.cream, borderRadius:3, padding:'.85rem 1rem' }}>
                    <div style={{ fontSize:'.7rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.25rem' }}>{l}</div>
                    <div style={{ fontWeight:600, color:C.ink }}>{v}</div>
                  </div>
                ))}
              </div>

              {status.status==='approved' && (
                <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
                  <Btn variant="teal" onClick={()=>go('affiliate')} style={{ padding:'.7rem 1.25rem', fontSize:'.85rem' }}>
                    💰 View My Referral Link
                  </Btn>
                  <Btn variant="ghost" onClick={()=>go('dash')} style={{ padding:'.7rem 1.25rem', fontSize:'.85rem' }}>
                    📊 Go to Dashboard
                  </Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {user && !status && (
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2rem' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900, marginBottom:'.5rem' }}>Apply to Become an Ambassador</div>
            <div style={{ color:C.muted, fontSize:'.85rem', marginBottom:'1.5rem' }}>Applications are reviewed within 24 hours. Approved ambassadors receive their free Pro plan immediately.</div>

            {err && <div style={{ background:'#fff0f0', border:`1px solid #ffc0c0`, borderRadius:2, padding:'.75rem 1rem', color:C.red, fontSize:'.85rem', marginBottom:'1rem' }}>{err}</div>}
            {msg && (
              <div style={{ background:'#f0fff4', border:`1px solid #b0e0c0`, borderRadius:2, padding:'1.25rem', color:C.green, fontSize:'.9rem', marginBottom:'1rem', fontWeight:600, textAlign:'center' }}>
                ✅ {msg}
              </div>
            )}

            {!msg && (
              <>
                <div style={{ marginBottom:'1rem' }}>
                  <label style={{ display:'block', fontSize:'.72rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.35rem' }}>Institution / University <span style={{ color:C.red }}>*</span></label>
                  <input value={form.institution} onChange={e=>set('institution')(e.target.value)} placeholder="e.g. Ahmadu Bello University, Zaria"
                    style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none', color:C.ink }}/>
                </div>

                <div style={{ marginBottom:'1rem' }}>
                  <label style={{ display:'block', fontSize:'.72rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.35rem' }}>Your Role <span style={{ color:C.red }}>*</span></label>
                  <select value={form.role} onChange={e=>set('role')(e.target.value)}
                    style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none', color:form.role?C.ink:C.muted }}>
                    <option value="">Select your role…</option>
                    {['Professor / Lecturer','Postgraduate Coordinator','Research Librarian','PhD Student','MSc Student','Student Union Officer','Department Head','Other Academic Staff'].map(r=>(
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom:'1rem' }}>
                  <label style={{ display:'block', fontSize:'.72rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.35rem' }}>WhatsApp Number (optional)</label>
                  <input value={form.whatsapp} onChange={e=>set('whatsapp')(e.target.value)} placeholder="+234 800 000 0000"
                    style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none', color:C.ink }}/>
                </div>

                <div style={{ marginBottom:'1.25rem' }}>
                  <label style={{ display:'block', fontSize:'.72rem', fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.35rem' }}>Why do you want to be an ambassador? (optional)</label>
                  <textarea value={form.motivation} onChange={e=>set('motivation')(e.target.value)}
                    placeholder="Tell us about your academic community and how you plan to share OriginCheck…"
                    style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.75rem .9rem', fontSize:'.88rem', outline:'none', resize:'vertical', minHeight:90, lineHeight:1.6, color:C.ink }}/>
                </div>

                <Btn variant="gold" full onClick={submit} disabled={submitting||!form.institution||!form.role}
                  style={{ padding:'.9rem', fontSize:'.95rem' }}>
                  {submitting ? <><Spin size={16} color={C.ink}/> Submitting…</> : '🎖️ Submit Ambassador Application'}
                </Btn>

                <div style={{ fontSize:'.75rem', color:C.muted, textAlign:'center', marginTop:'.75rem', lineHeight:1.6 }}>
                  By applying you agree to actively promote OriginCheck within your institution.<br/>Your application will be reviewed within 24 hours.
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── CONTACT ───────────────────────────────────────────────
function Contact({ go }) {
  const [f, setF] = useState({ name:'', email:'', subject:'', message:'' });
  const [sent, setSent] = useState(false);
  const set = k => v => setF(p=>({...p,[k]:v}));

  const submit = () => {
    if (!f.name||!f.email||!f.message) return;
    setSent(true);
  };

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ maxWidth:900, margin:'0 auto', padding:'2rem 1.25rem' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'3rem' }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Get In Touch</div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.4rem', fontWeight:900, marginBottom:'.75rem' }}>Contact Us</div>
          <div style={{ color:C.muted, maxWidth:500, margin:'0 auto', lineHeight:1.7 }}>Have a question, partnership inquiry, or need support? We would love to hear from you.</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'2rem', alignItems:'start' }}>
          {/* Contact info */}
          <div>
            <div style={{ background:C.ink, borderRadius:4, padding:'2rem', marginBottom:'1.5rem' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:700, color:C.white, marginBottom:'1.5rem' }}>Contact Information</div>
              {[['📧','Email','info@origincheck.ng'],['📞','Phone','+2347016270709'],['📍','Address','Abuja, Nigeria'],['🕐','Support Hours','Mon–Fri, 8am–6pm WAT']].map(([icon,label,val])=>(
                <div key={label} style={{ display:'flex', gap:'1rem', marginBottom:'1.25rem', alignItems:'flex-start' }}>
                  <span style={{ fontSize:'1.2rem', flexShrink:0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize:'.75rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'.2rem' }}>{label}</div>
                    <div style={{ color:'#e5e7eb', fontSize:'.9rem' }}>{val}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem' }}>
              <div style={{ fontWeight:700, marginBottom:'.75rem' }}>For Universities & Institutions</div>
              <div style={{ fontSize:'.85rem', color:C.muted, lineHeight:1.7 }}>
                If you are a university administrator or research director looking to onboard your institution, please email us at <strong>institutions@origincheck.ng</strong> for a custom demo and pricing.
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'2rem' }}>
            {sent ? (
              <div style={{ textAlign:'center', padding:'2rem' }}>
                <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>✅</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.4rem', fontWeight:900, marginBottom:'.75rem' }}>Message Sent!</div>
                <div style={{ color:C.muted, lineHeight:1.7, marginBottom:'1.5rem' }}>Thank you for reaching out. We will get back to you within 24 hours.</div>
                <Btn variant="teal" onClick={()=>setSent(false)}>Send Another Message</Btn>
              </div>
            ) : (
              <>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.3rem', fontWeight:700, marginBottom:'1.5rem' }}>Send Us a Message</div>
                <Field label="Your Name" value={f.name} onChange={set('name')} placeholder="Dr. Abdussamad Ibrahim" required/>
                <Field label="Email Address" value={f.email} onChange={set('email')} type="email" placeholder="you@university.edu" required/>
                <Field label="Subject" value={f.subject} onChange={set('subject')} placeholder="e.g. University Subscription Inquiry"/>
                <div style={{ marginBottom:'1rem' }}>
                  <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:C.muted, marginBottom:'.35rem' }}>Message <span style={{ color:C.red }}>*</span></label>
                  <textarea value={f.message} onChange={e=>set('message')(e.target.value)} placeholder="Tell us how we can help you…" style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.75rem .9rem', fontSize:'.9rem', outline:'none', resize:'vertical', minHeight:120, lineHeight:1.6 }}/>
                </div>
                <Btn variant="teal" full onClick={submit} disabled={!f.name||!f.email||!f.message}>Send Message →</Btn>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── ABOUT ─────────────────────────────────────────────────
function About({ go }) {
  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      {/* Hero */}
      <div style={{ background:C.ink, padding:'5rem 3rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Our Story</div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.8rem', fontWeight:900, color:C.white, marginBottom:'1rem', maxWidth:700, margin:'0 auto 1rem' }}>About OriginCheck</div>
        <div style={{ color:'#9ca3af', maxWidth:580, margin:'0 auto', lineHeight:1.8, fontSize:'.95rem' }}>
          Built by Nigerian academics, for Nigerian academics. OriginCheck exists to make world-class academic integrity tools accessible and affordable across Nigeria and Africa.
        </div>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'2rem 1.25rem' }}>
        {/* Mission */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'2rem', marginBottom:'3rem', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, textTransform:'uppercase', letterSpacing:'.2em', marginBottom:'1rem' }}>Our Mission</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, marginBottom:'1rem' }}>Protecting the Integrity of Nigerian Scholarship</div>
            <div style={{ color:C.muted, lineHeight:1.8, fontSize:'.92rem' }}>
              Academic plagiarism undermines the value of Nigerian degrees and research on the global stage. OriginCheck was created to give every Nigerian researcher, student, and institution access to professional-grade plagiarism detection at a price that reflects local realities.
            </div>
          </div>
          <div style={{ background:C.teal, borderRadius:4, padding:'2.5rem', color:C.white }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:700, marginBottom:'1.5rem' }}>Why OriginCheck?</div>
            {['Built and hosted in Nigeria','Prices in Nigerian Naira','Understands Nigerian academic context','Support from people who speak your language','No dollar fees or international complications'].map(p=>(
              <div key={p} style={{ display:'flex', gap:'.75rem', marginBottom:'.75rem', fontSize:'.88rem' }}><span style={{ color:C.gold, fontWeight:700, flexShrink:0 }}>✓</span>{p}</div>
            ))}
          </div>
        </div>

        {/* Values */}
        <div style={{ marginBottom:'4rem' }}>
          <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900 }}>Our Values</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'1.25rem' }}>
            {[['🎯','Accuracy','We are committed to detection accuracy that researchers can trust and institutions can rely on.'],['💰','Affordability','World-class tools should not require dollar payments. Our pricing reflects Nigerian realities.'],['🔒','Privacy','Your documents are analyzed and immediately discarded. We never store your content permanently.'],['🤝','Support','Real human support from people who understand the Nigerian academic environment.']].map(([icon,title,desc])=>(
              <div key={title} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.75rem', textAlign:'center' }}>
                <div style={{ fontSize:'2rem', marginBottom:'1rem' }}>{icon}</div>
                <div style={{ fontWeight:700, marginBottom:'.5rem', fontSize:'1rem' }}>{title}</div>
                <div style={{ fontSize:'.83rem', color:C.muted, lineHeight:1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ background:C.ink, borderRadius:4, padding:'3rem', textAlign:'center' }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, color:C.white, marginBottom:'1rem' }}>Ready to protect your scholarship?</div>
          <div style={{ color:'#9ca3af', marginBottom:'2rem' }}>Join hundreds of Nigerian researchers already using OriginCheck.</div>
          <div style={{ display:'flex', gap:'1rem', justifyContent:'center', flexWrap:'wrap' }}>
            <Btn variant="gold" onClick={()=>go('register')} style={{ fontSize:'.95rem' }}>Get Started Today</Btn>
            <Btn variant="ghost" onClick={()=>go('contact')} style={{ fontSize:'.95rem', border:`1px solid #2a3040`, color:'#e5e7eb' }}>Contact Us</Btn>
          </div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── PRIVACY POLICY ────────────────────────────────────────
function Privacy({ go }) {
  const sections = [
    ['Information We Collect', 'We collect information you provide when registering: your name, email address, and institution name. When you run a check, the text you submit is processed by our AI system and a summary of the results (similarity score, verdict) is saved to your account history. We do not permanently store the full text of your documents.'],
    ['How We Use Your Information', 'Your information is used to provide the OriginCheck service — specifically to authenticate your account, process originality checks, generate certificates, and process payments. We do not sell, rent, or share your personal information with third parties except as required to provide the service (e.g. payment processing via Paystack).'],
    ['Payment Information', 'All payments are processed by Paystack, a PCI-compliant payment provider. OriginCheck does not store your card details. Payment records (plan, amount, date) are stored on our servers to maintain your subscription status.'],
    ['Data Security', 'Your account is protected by password hashing (bcrypt) and JWT authentication. All data is transmitted over HTTPS. We take reasonable measures to protect your data from unauthorised access, though no system is 100% secure.'],
    ['Data Retention', 'Your account information is retained for as long as your account is active. Check history records are retained for up to 2 years. You may request deletion of your account and data by contacting us at info@origincheck.ng.'],
    ['Cookies', 'OriginCheck uses a single authentication token stored in your browser\'s local storage to keep you logged in. We do not use advertising cookies or third-party tracking cookies.'],
    ['Your Rights', 'You have the right to access, correct, or delete your personal data. To exercise these rights, please contact us at info@origincheck.ng. We will respond to requests within 30 days.'],
    ['Changes to This Policy', 'We may update this privacy policy from time to time. We will notify users of significant changes by email. Continued use of OriginCheck after changes constitutes acceptance of the updated policy.'],
  ];

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ background:C.ink, padding:'4rem 3rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.5rem', fontWeight:900, color:C.white, marginBottom:'.75rem' }}>Privacy Policy</div>
        <div style={{ color:'#9ca3af', fontSize:'.9rem' }}>Last updated: January 2026</div>
      </div>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'2rem 1.25rem' }}>
        <div style={{ background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:3, padding:'1.25rem 1.5rem', marginBottom:'2.5rem', fontSize:'.88rem', color:C.muted, lineHeight:1.7 }}>
          OriginCheck is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights regarding your data.
        </div>
        {sections.map(([title, content], i) => (
          <div key={title} style={{ marginBottom:'2rem' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:700, marginBottom:'.75rem', color:C.ink, borderLeft:`3px solid ${C.gold}`, paddingLeft:'1rem' }}>{i+1}. {title}</div>
            <div style={{ color:C.muted, lineHeight:1.8, fontSize:'.9rem', paddingLeft:'1rem' }}>{content}</div>
          </div>
        ))}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'1.5rem', marginTop:'2rem' }}>
          <div style={{ fontSize:'.85rem', color:C.muted }}>Questions about this policy? Contact us at <strong>info@origincheck.ng</strong></div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── TERMS OF SERVICE ──────────────────────────────────────
function Terms({ go }) {
  const sections = [
    ['Acceptance of Terms', 'By accessing or using OriginCheck, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.'],
    ['Description of Service', 'OriginCheck provides AI-powered academic plagiarism detection, grammar analysis, and originality certificates. The service is provided on a subscription basis with plans starting at ₦3,500 per month.'],
    ['User Accounts', 'You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate information when registering. You may not share your account with others or use another person\'s account.'],
    ['Acceptable Use', 'OriginCheck may only be used for legitimate academic integrity purposes. You may not use the platform to facilitate plagiarism, submit false information, attempt to reverse-engineer our algorithms, or use the service in any way that violates Nigerian law.'],
    ['Subscription and Payments', 'Subscription fees are charged monthly in Nigerian Naira. Plans are activated immediately upon successful payment. Refunds are not provided for unused checks within a billing period. You may cancel by simply not renewing — subscriptions are not auto-renewed.'],
    ['Originality Certificates', 'OriginCheck certificates are issued based on AI analysis and are not a guarantee of 100% originality. They reflect the results of our detection system at the time of checking. OriginCheck is not liable for decisions made by institutions based on these certificates.'],
    ['Intellectual Property', 'The OriginCheck platform, including its design, code, and AI models, is the intellectual property of OriginCheck. You may not copy, distribute, or create derivative works from any part of the platform.'],
    ['Limitation of Liability', 'OriginCheck is provided "as is" without warranties of any kind. We are not liable for any damages arising from use of the platform, including but not limited to academic consequences resulting from check results.'],
    ['Governing Law', 'These terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved in Nigerian courts.'],
    ['Changes to Terms', 'We may update these terms at any time. Continued use of OriginCheck after changes constitutes acceptance of the updated terms.'],
  ];

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ background:C.ink, padding:'4rem 3rem', textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'2.5rem', fontWeight:900, color:C.white, marginBottom:'.75rem' }}>Terms of Service</div>
        <div style={{ color:'#9ca3af', fontSize:'.9rem' }}>Last updated: January 2026</div>
      </div>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'2rem 1.25rem' }}>
        <div style={{ background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:3, padding:'1.25rem 1.5rem', marginBottom:'2.5rem', fontSize:'.88rem', color:C.muted, lineHeight:1.7 }}>
          Please read these Terms of Service carefully before using OriginCheck. These terms constitute a legally binding agreement between you and OriginCheck.
        </div>
        {sections.map(([title, content], i) => (
          <div key={title} style={{ marginBottom:'2rem' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.2rem', fontWeight:700, marginBottom:'.75rem', color:C.ink, borderLeft:`3px solid ${C.gold}`, paddingLeft:'1rem' }}>{i+1}. {title}</div>
            <div style={{ color:C.muted, lineHeight:1.8, fontSize:'.9rem', paddingLeft:'1rem' }}>{content}</div>
          </div>
        ))}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'1.5rem', marginTop:'2rem' }}>
          <div style={{ fontSize:'.85rem', color:C.muted }}>Questions about these terms? Contact us at <strong>info@origincheck.ng</strong></div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── ADMIN ─────────────────────────────────────────────────
function Admin({ go }) {
  const { af } = useAuth();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState('');
  const [tab, setTab]       = useState('payments');
  const [email, setEmail]   = useState('');
  const [plan, setPlan]     = useState('basic');
  const [msg, setMsg]       = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [affiliates, setAffiliates]   = useState(null);
  const [ambassadors, setAmbassadors] = useState(null);
  const [emailForm, setEmailForm]   = useState({ segment:'all', subject:'', body:'', personalise:true });
  const [emailCounts, setEmailCounts] = useState(null);
  const [emailBusy, setEmailBusy]   = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [testBusy, setTestBusy]     = useState(false);
  const [testMsg, setTestMsg]       = useState('');

  useEffect(()=>{
    af('/api/admin/stats').then(d=>{setStats(d);setLoading(false);}).catch(e=>{setErr(e.message);setLoading(false);});
    af('/api/admin/affiliates').then(d=>setAffiliates(d)).catch(()=>{});
    af('/api/admin/ambassadors').then(d=>setAmbassadors(d)).catch(()=>{});
    af('/api/admin/email-preview').then(d=>setEmailCounts(d.segments)).catch(()=>{});
  },[]);

  const sendEmail = async () => {
    if (!emailForm.subject.trim() || !emailForm.body.trim()) return;
    const seg = emailCounts?.[emailForm.segment] || 0;
    if (!window.confirm(`Send "${emailForm.subject}" to ${seg} users? This cannot be undone.`)) return;
    setEmailBusy(true); setEmailResult(null);
    try {
      const d = await af('/api/admin/email-send', { method:'POST', body: emailForm });
      setEmailResult(d);
    } catch(e) { setEmailResult({ error: e.message }); }
    finally { setEmailBusy(false); }
  };

  const sendTest = async () => {
    setTestBusy(true); setTestMsg('');
    try {
      const d = await af('/api/admin/email-test', { method:'POST', body:{ subject: emailForm.subject, body: emailForm.body } });
      setTestMsg('✅ ' + d.message);
    } catch(e) { setTestMsg('❌ ' + e.message); }
    finally { setTestBusy(false); }
  };

  const setPlanAction=async()=>{
    setActionBusy(true);setMsg('');
    try{const d=await af('/api/admin/set-plan',{method:'POST',body:{email,plan}});setMsg(d.message);}
    catch(e){setMsg('Error: '+e.message);}
    finally{setActionBusy(false);}
  };

  const fmt=k=>`₦${(k/100).toLocaleString('en-NG')}`;
  const pc=p=>({basic:C.teal,researcher:C.gold,university:'#8e44ad',none:C.muted}[p]||C.muted);

  if(loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'5rem' }}><Spin size={36}/></div>;
  if(err) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'5rem', color:C.red, fontWeight:600 }}>{err}</div>;

  return (
    <div style={{ minHeight:'100vh', background:C.paper, paddingTop:'5rem' }}>
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'1.5rem 1rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900 }}>Admin Dashboard</div>
            <div style={{ color:C.muted, fontSize:'.85rem', marginTop:'.2rem' }}>Platform overview and user management</div>
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:'.72rem', color:C.gold, background:C.ink, padding:'.4rem .9rem', borderRadius:2, letterSpacing:'.1em' }}>ADMIN ACCESS</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
          {[['👥','Total Users',stats.totalUsers],['✅','Active Subscribers',stats.activeUsers],['🔍','Total Checks',stats.totalChecks],['💰','Total Revenue',fmt(stats.totalRevenue)]].map(([ic,l,v])=>(
            <div key={l} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem', textAlign:'center' }}>
              <div style={{ fontSize:'1.4rem', marginBottom:'.4rem' }}>{ic}</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, color:C.teal }}>{v}</div>
              <div style={{ fontSize:'.72rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginTop:'.2rem' }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.5rem', marginBottom:'1.5rem' }}>
          <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'1rem' }}>🔧 Manually Set User Plan</div>
          <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', alignItems:'flex-end' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:C.muted, marginBottom:'.35rem' }}>User Email</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@example.com" style={{ width:'100%', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none' }}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:'.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em', color:C.muted, marginBottom:'.35rem' }}>Plan</label>
              <select value={plan} onChange={e=>setPlan(e.target.value)} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none' }}>
                <option value="basic">Basic (₦3,500)</option>
                <option value="researcher">Pro (₦10,000)</option>
                <option value="university">University (₦25,000)</option>
              </select>
            </div>
            <Btn variant="teal" onClick={setPlanAction} disabled={actionBusy||!email}>
              {actionBusy?<><Spin size={16} color={C.white}/> Saving…</>:'Set Plan'}
            </Btn>
          </div>
          {msg&&<div style={{ marginTop:'.75rem', fontSize:'.85rem', color:msg.startsWith('Error')?C.red:C.green, fontWeight:600 }}>{msg}</div>}
        </div>

        <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, marginBottom:'1.5rem' }}>
          {[['payments','Recent Payments'],['users','Recent Users'],['affiliates','Affiliates'],['ambassadors','🎖️ Ambassadors'],['email','📧 Email Users']].map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)} style={{ padding:'.75rem 1.5rem', border:'none', background:'transparent', fontFamily:"'DM Mono',monospace", fontSize:'.78rem', letterSpacing:'.05em', color:tab===v?C.teal:C.muted, borderBottom:`2px solid ${tab===v?C.gold:'transparent'}`, fontWeight:tab===v?600:400 }}>{l}</button>
          ))}
        </div>

        <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'auto' }}>
          {tab==='payments'&&(
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:C.ink }}>
                {['User','Email','Plan','Amount','Status','Date'].map(h=><th key={h} style={{ padding:'.75rem 1rem', textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:'.7rem', color:C.gold, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {stats.recentPayments.map((p,i)=>(
                  <tr key={p.reference} style={{ background:i%2===0?C.white:C.paper, borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.85rem', fontWeight:600 }}>{p.name}</td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.82rem', color:C.muted }}>{p.email}</td>
                    <td style={{ padding:'.75rem 1rem' }}><span style={{ background:pc(p.plan)+'20', color:pc(p.plan), fontSize:'.72rem', fontWeight:700, padding:'.2rem .6rem', borderRadius:20, textTransform:'uppercase', fontFamily:"'DM Mono',monospace" }}>{p.plan}</span></td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.85rem', fontWeight:700, color:C.teal }}>{fmt(p.amount)}</td>
                    <td style={{ padding:'.75rem 1rem' }}><span style={{ background:p.status==='success'?C.green+'20':C.amber+'20', color:p.status==='success'?C.green:C.amber, fontSize:'.72rem', fontWeight:700, padding:'.2rem .6rem', borderRadius:20 }}>{p.status}</span></td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.78rem', color:C.muted, whiteSpace:'nowrap' }}>{new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                  </tr>
                ))}
                {stats.recentPayments.length===0&&<tr><td colSpan={6} style={{ padding:'2rem', textAlign:'center', color:C.muted }}>No payments yet</td></tr>}
              </tbody>
            </table>
          )}
          {tab==='users'&&(
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:C.ink }}>
                {['Name','Email','Institution','Plan','Checks','Expires','Joined'].map(h=><th key={h} style={{ padding:'.75rem 1rem', textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:'.7rem', color:C.gold, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {stats.recentUsers.map((u,i)=>(
                  <tr key={u.id} style={{ background:i%2===0?C.white:C.paper, borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.85rem', fontWeight:600 }}>{u.name}</td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.82rem', color:C.muted }}>{u.email}</td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.82rem', color:C.muted }}>{u.institution||'—'}</td>
                    <td style={{ padding:'.75rem 1rem' }}><span style={{ background:pc(u.plan)+'20', color:pc(u.plan), fontSize:'.72rem', fontWeight:700, padding:'.2rem .6rem', borderRadius:20, textTransform:'uppercase', fontFamily:"'DM Mono',monospace" }}>{u.plan}</span></td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.85rem' }}>{u.checks_used}/{u.checks_limit}</td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.78rem', whiteSpace:'nowrap' }}>
                      {u.sub_expires ? (
                        <span style={{ color: new Date(u.sub_expires) < new Date() ? C.red : new Date(u.sub_expires) < new Date(Date.now() + 7*24*60*60*1000) ? C.amber : C.green, fontWeight:600 }}>
                          {new Date(u.sub_expires) < new Date() ? '❌ ' : new Date(u.sub_expires) < new Date(Date.now() + 7*24*60*60*1000) ? '⚠️ ' : '✅ '}
                          {new Date(u.sub_expires).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                        </span>
                      ) : <span style={{ color:C.muted }}>—</span>}
                    </td>
                    <td style={{ padding:'.75rem 1rem', fontSize:'.78rem', color:C.muted, whiteSpace:'nowrap' }}>{new Date(u.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab==='ambassadors'&&(
            <div style={{ padding:'1.5rem' }}>
              <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
                {[['⏳','Pending Applications', ambassadors?.pending||0, C.amber],['✅','Active Ambassadors', ambassadors?.approved||0, C.green]].map(([ic,l,v,col])=>(
                  <div key={l} style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, padding:'1.25rem 1.5rem', textAlign:'center', minWidth:160 }}>
                    <div style={{ fontSize:'1.4rem', marginBottom:'.3rem' }}>{ic}</div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.8rem', fontWeight:900, color:col }}>{v}</div>
                    <div style={{ fontSize:'.72rem', color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginTop:'.2rem' }}>{l}</div>
                  </div>
                ))}
              </div>

              <div style={{ background:C.white, border:`1.5px solid ${C.border}`, borderRadius:4, overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr style={{ background:C.ink }}>
                    {['Name','Institution','Role','Status','Referrals','Applied','Actions'].map(h=>(
                      <th key={h} style={{ padding:'.75rem 1rem', textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:'.68rem', color:C.gold, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(ambassadors?.ambassadors||[]).map((a,i)=>(
                      <tr key={a.id} style={{ background:i%2===0?C.white:C.paper, borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:'.75rem 1rem' }}>
                          <div style={{ fontWeight:600, fontSize:'.85rem' }}>{a.name}</div>
                          <div style={{ fontSize:'.75rem', color:C.muted }}>{a.email}</div>
                          {a.whatsapp && <div style={{ fontSize:'.72rem', color:C.teal }}>📱 {a.whatsapp}</div>}
                        </td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.83rem', color:C.ink, maxWidth:180 }}>{a.institution}</td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.82rem', color:C.muted, whiteSpace:'nowrap' }}>{a.role}</td>
                        <td style={{ padding:'.75rem 1rem' }}>
                          <span style={{ background: a.status==='approved'?C.green+'20':a.status==='rejected'?C.red+'20':C.amber+'20', color: a.status==='approved'?C.green:a.status==='rejected'?C.red:C.amber, fontSize:'.72rem', fontWeight:700, padding:'.25rem .65rem', borderRadius:20, fontFamily:"'DM Mono',monospace", textTransform:'uppercase' }}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.85rem', textAlign:'center', fontWeight:700 }}>{a.total_referrals||0}</td>
                        <td style={{ padding:'.75rem 1rem', fontSize:'.75rem', color:C.muted, whiteSpace:'nowrap' }}>
                          {new Date(a.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                        </td>
                        <td style={{ padding:'.75rem 1rem' }}>
                          <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
                            {a.status==='pending' && (
                              <>
                                <button onClick={async()=>{
                                  try { await af('/api/admin/ambassador/approve',{method:'POST',body:{ambassador_id:a.id}}); const d=await af('/api/admin/ambassadors'); setAmbassadors(d); }
                                  catch(e){alert(e.message);}
                                }} style={{ background:C.green, color:C.white, border:'none', padding:'.35rem .75rem', borderRadius:2, fontSize:'.75rem', fontWeight:600, cursor:'pointer' }}>
                                  ✅ Approve
                                </button>
                                <button onClick={async()=>{
                                  if(!window.confirm('Reject this application?')) return;
                                  try { await af('/api/admin/ambassador/reject',{method:'POST',body:{ambassador_id:a.id}}); const d=await af('/api/admin/ambassadors'); setAmbassadors(d); }
                                  catch(e){alert(e.message);}
                                }} style={{ background:C.red, color:C.white, border:'none', padding:'.35rem .75rem', borderRadius:2, fontSize:'.75rem', fontWeight:600, cursor:'pointer' }}>
                                  ❌ Reject
                                </button>
                              </>
                            )}
                            {a.status==='approved' && (
                              <button onClick={async()=>{
                                try { await af('/api/admin/ambassador/renew',{method:'POST',body:{ambassador_id:a.id}}); alert('Pro plan renewed for 30 days!'); }
                                catch(e){alert(e.message);}
                              }} style={{ background:C.teal, color:C.white, border:'none', padding:'.35rem .75rem', borderRadius:2, fontSize:'.75rem', fontWeight:600, cursor:'pointer' }}>
                                🔄 Renew Plan
                              </button>
                            )}
                            {a.motivation && (
                              <button onClick={()=>alert('Motivation:\n\n'+a.motivation)}
                                style={{ background:C.cream, color:C.ink, border:`1px solid ${C.border}`, padding:'.35rem .75rem', borderRadius:2, fontSize:'.75rem', cursor:'pointer' }}>
                                📝 View Note
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!ambassadors?.ambassadors||ambassadors.ambassadors.length===0)&&(
                      <tr><td colSpan={7} style={{ padding:'2rem', textAlign:'center', color:C.muted }}>No ambassador applications yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==='email'&&(

            <div style={{ padding:'1.5rem' }}>
              {/* Segment selector */}
              <div style={{ marginBottom:'1.5rem' }}>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.75rem' }}>1. Choose Recipients</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'.65rem' }}>
                  {[
                    ['all',        '👥 All Users',            emailCounts?.all        || 0],
                    ['basic',      '📦 Basic Plan',           emailCounts?.basic       || 0],
                    ['researcher', '🔬 Researcher Plan',      emailCounts?.researcher  || 0],
                    ['university', '🏛️ University Plan',      emailCounts?.university  || 0],
                    ['nosub',      '⚡ No Subscription',      emailCounts?.nosub       || 0],
                    ['expired',    '🔴 Expired Subscribers',  emailCounts?.expired     || 0],
                  ].map(([key, label, count]) => (
                    <div key={key} onClick={()=>setEmailForm(p=>({...p, segment:key}))}
                      style={{ background: emailForm.segment===key ? C.teal : C.white, border:`1.5px solid ${emailForm.segment===key ? C.teal : C.border}`, borderRadius:3, padding:'.85rem', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
                      <div style={{ fontSize:'.85rem', fontWeight:600, color: emailForm.segment===key ? C.white : C.ink }}>{label}</div>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, color: emailForm.segment===key ? C.gold : C.teal, marginTop:'.2rem' }}>{count}</div>
                      <div style={{ fontSize:'.68rem', color: emailForm.segment===key ? 'rgba(255,255,255,.6)' : C.muted }}>recipients</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Personalise toggle */}
              <div style={{ display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'1.5rem' }}>
                <div onClick={()=>setEmailForm(p=>({...p, personalise:!p.personalise}))}
                  style={{ width:40, height:22, borderRadius:11, background:emailForm.personalise?C.teal:'#ccc', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:3, left:emailForm.personalise?20:3, width:16, height:16, borderRadius:'50%', background:C.white, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
                </div>
                <div style={{ fontSize:'.85rem', color:C.ink }}>
                  <strong>{emailForm.personalise ? 'Personalised' : 'Generic'}</strong>
                  <span style={{ color:C.muted, marginLeft:'.4rem' }}>
                    {emailForm.personalise ? '— Each email opens with "Dear [Name],"' : '— No personalisation'}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div style={{ marginBottom:'1rem' }}>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.5rem' }}>2. Subject Line</div>
                <input value={emailForm.subject} onChange={e=>setEmailForm(p=>({...p, subject:e.target.value}))}
                  placeholder="e.g. New feature: AI Humaniser is now live on OriginCheck!"
                  style={{ width:'100%', background:C.white, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.7rem .9rem', fontSize:'.9rem', outline:'none', color:C.ink }}/>
              </div>

              {/* Body */}
              <div style={{ marginBottom:'1.25rem' }}>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.5rem' }}>3. Message Body</div>
                <div style={{ fontSize:'.75rem', color:C.muted, marginBottom:'.4rem' }}>Use blank lines between paragraphs. Keep it concise — 3–5 paragraphs works best.</div>
                <textarea value={emailForm.body} onChange={e=>setEmailForm(p=>({...p, body:e.target.value}))}
                  placeholder={"We are excited to announce a new feature on OriginCheck...\n\nYou can now use the AI Humaniser to rewrite AI-generated text so it sounds naturally human-written.\n\nLog in to try it today: " + (typeof window !== 'undefined' ? window.location.origin : 'https://origincheck.ng')}
                  style={{ width:'100%', background:C.cream, border:`1.5px solid ${C.border}`, borderRadius:2, padding:'.85rem', fontSize:'.88rem', outline:'none', resize:'vertical', minHeight:180, lineHeight:1.7, color:C.ink }}/>
                <div style={{ fontSize:'.72rem', color:C.muted, textAlign:'right', marginTop:'.3rem', fontFamily:"'DM Mono',monospace" }}>
                  {emailForm.body.trim().split(/\s+/).filter(Boolean).length} words
                </div>
              </div>

              {/* Preview box */}
              {emailForm.subject && emailForm.body && (
                <div style={{ background:'#f8f8ff', border:`1px solid #c8c8e8`, borderRadius:3, padding:'1rem 1.25rem', marginBottom:'1.25rem' }}>
                  <div style={{ fontSize:'.72rem', fontWeight:700, color:'#5555aa', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:'.5rem' }}>📧 Preview</div>
                  <div style={{ fontSize:'.82rem', color:C.muted, marginBottom:'.3rem' }}>From: OriginCheck &lt;noreply@origincheck.ng&gt;</div>
                  <div style={{ fontSize:'.82rem', color:C.muted, marginBottom:'.5rem' }}>Subject: {emailForm.subject}</div>
                  <div style={{ fontSize:'.85rem', color:C.ink, lineHeight:1.7, whiteSpace:'pre-wrap', borderTop:`1px solid ${C.border}`, paddingTop:'.5rem' }}>
                    {emailForm.personalise ? 'Dear [Recipient Name],\n\n' : ''}{emailForm.body}
                  </div>
                </div>
              )}

              {/* Test + Send buttons */}
              <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', alignItems:'center', marginBottom:'1rem' }}>
                <Btn variant="ghost" onClick={sendTest} disabled={testBusy||!emailForm.subject||!emailForm.body}
                  style={{ padding:'.7rem 1.25rem', fontSize:'.85rem' }}>
                  {testBusy?<><Spin size={14}/> Sending…</>:'📨 Send Test to My Email'}
                </Btn>
                <Btn variant="gold" onClick={sendEmail} disabled={emailBusy||!emailForm.subject||!emailForm.body}
                  style={{ padding:'.7rem 1.5rem', fontSize:'.88rem' }}>
                  {emailBusy
                    ? <><Spin size={14} color={C.ink}/> Sending to {emailCounts?.[emailForm.segment]||0} users…</>
                    : `📧 Send to ${emailCounts?.[emailForm.segment]||0} Users`}
                </Btn>
              </div>

              {testMsg && <div style={{ fontSize:'.85rem', color: testMsg.startsWith('✅')?C.green:C.red, fontWeight:600, marginBottom:'.75rem' }}>{testMsg}</div>}

              {/* Result */}
              {emailResult && (
                <div style={{ background: emailResult.error?'#fff0f0':'#f0fff4', border:`1.5px solid ${emailResult.error?'#ffc0c0':'#b0e0c0'}`, borderRadius:3, padding:'1.25rem', animation:'slideIn .3s ease' }}>
                  {emailResult.error ? (
                    <div style={{ color:C.red, fontWeight:600 }}>❌ {emailResult.error}</div>
                  ) : (
                    <>
                      <div style={{ fontWeight:700, color:C.green, marginBottom:'.5rem' }}>✅ Email broadcast complete!</div>
                      <div style={{ display:'flex', gap:'2rem', fontSize:'.88rem', flexWrap:'wrap' }}>
                        <span>📤 Sent: <strong style={{ color:C.green }}>{emailResult.sent}</strong></span>
                        <span>❌ Failed: <strong style={{ color: emailResult.failed>0?C.red:C.muted }}>{emailResult.failed}</strong></span>
                        <span>📊 Total: <strong>{emailResult.total}</strong></span>
                      </div>
                      {emailResult.errors?.length > 0 && (
                        <div style={{ marginTop:'.75rem', fontSize:'.78rem', color:C.red }}>
                          Failed addresses: {emailResult.errors.join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Setup notice */}
              <div style={{ marginTop:'1.5rem', background:'#fffbe8', border:`1px solid ${C.gold}`, borderRadius:3, padding:'1rem 1.25rem', fontSize:'.82rem', color:C.muted, lineHeight:1.7 }}>
                <strong style={{ color:C.ink }}>⚙️ Setup required:</strong> Add <code style={{ background:'#f0f0f0', padding:'.1rem .3rem', borderRadius:2 }}>RESEND_API_KEY</code> and <code style={{ background:'#f0f0f0', padding:'.1rem .3rem', borderRadius:2 }}>FROM_EMAIL</code> to your Render environment variables. Get a free API key at <strong>resend.com</strong> (3,000 emails/month free).
              </div>
            </div>
          )}

          {tab==='affiliates'&&(
            <div>
              {/* Payout requests */}
              {affiliates?.payoutRequests?.length>0&&(
                <div style={{ background:'#fff8e8', border:`1.5px solid ${C.gold}`, borderRadius:3, padding:'1rem 1.25rem', marginBottom:'1rem' }}>
                  <div style={{ fontWeight:700, color:C.amber, marginBottom:'.5rem' }}>⚠️ {affiliates.payoutRequests.length} Payout Request(s) Pending</div>
                  {affiliates.payoutRequests.map(r=>(
                    <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.5rem 0', borderBottom:`1px solid ${C.border}`, flexWrap:'wrap', gap:'.5rem' }}>
                      <div style={{ fontSize:'.85rem' }}><strong>{r.affiliate_name}</strong> · {r.affiliate_email} · Bank: {r.bank_name} {r.bank_account}</div>
                      <div style={{ display:'flex', gap:'.75rem', alignItems:'center' }}>
                        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', fontWeight:900, color:C.teal }}>${((r.total_commission||0)/100).toFixed(2)}</span>
                        <button onClick={async()=>{ try{ await af('/api/admin/affiliate/pay',{method:'POST',body:{affiliate_id:r.affiliate_id}}); const d=await af('/api/admin/affiliates'); setAffiliates(d); }catch(e){alert(e.message);} }}
                          style={{ background:C.green, color:C.white, border:'none', padding:'.4rem .9rem', borderRadius:2, fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
                          ✅ Mark as Paid
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* All affiliates */}
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr style={{ background:C.ink }}>
                  {['Affiliate','Email','Code','Referrals','Total Earned','Pending','Paid'].map(h=><th key={h} style={{ padding:'.7rem 1rem', textAlign:'left', fontFamily:"'DM Mono',monospace", fontSize:'.68rem', color:C.gold, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(affiliates?.affiliates||[]).map((a,i)=>(
                    <tr key={a.id} style={{ background:i%2===0?C.white:C.paper, borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', fontWeight:600 }}>{a.name}</td>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.8rem', color:C.muted }}>{a.email}</td>
                      <td style={{ padding:'.7rem 1rem' }}><span style={{ fontFamily:"'DM Mono',monospace", background:C.ink, color:C.gold, fontSize:'.75rem', padding:'.2rem .6rem', borderRadius:2 }}>{a.code}</span></td>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', fontWeight:700 }}>{a.total_referrals}</td>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', fontWeight:700, color:C.teal }}>₦{((a.total_earnings||0)/100).toLocaleString('en-NG')}</td>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', color:C.amber }}>₦{((a.pending_earnings||0)/100).toLocaleString('en-NG')}</td>
                      <td style={{ padding:'.7rem 1rem', fontSize:'.85rem', color:C.green }}>₦{((a.paid_earnings||0)/100).toLocaleString('en-NG')}</td>
                    </tr>
                  ))}
                  {(!affiliates?.affiliates||affiliates.affiliates.length===0)&&<tr><td colSpan={7} style={{ padding:'2rem', textAlign:'center', color:C.muted }}>No affiliates yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── ROUTER ────────────────────────────────────────────────
function AppInner() {
  const { user, ready } = useAuth();
  const [page, setPage] = useState('home');

  const go = p => { setPage(p); window.scrollTo(0,0); };

  // Capture affiliate referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && !params.get('payment')) {
      localStorage.setItem('oc_ref_code', ref);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Handle Paystack payment callback redirect
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const payRef = params.get('ref');

    if (!paymentStatus) return;

    // Clear query params immediately so refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);

    if (paymentStatus === 'success') {
      // Set a flag so the dashboard shows a success banner
      sessionStorage.setItem('oc_pay_success', '1');
      // Re-fetch user so the updated plan/subscription shows immediately
      const refreshUser = async () => {
        try {
          const token = localStorage.getItem('oc_tok');
          if (!token) { go('login'); return; }
          const r = await fetch(API + '/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (r.ok) {
            const d = await r.json();
            setUser(d.user);
          }
        } catch(e) { console.error('Refresh error:', e); }
      };
      refreshUser().then(() => go('dash'));
      setTimeout(() => go('dash'), 1500);
    } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
      if (user) go('subscribe');
      else go('login');
    }
  }, [ready]);

  useEffect(()=>{
    if (!ready) return;
    if (user && (page==='login'||page==='register')) go('dash');
    if (!user && (page==='dash'||page==='history'||page==='admin')) go('login');
  },[user, ready]);

  if (!ready) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.5rem', fontWeight:900, color:C.gold, marginBottom:'1rem' }}>OriginCheck</div>
        <Spin size={28}/>
      </div>
    </div>
  );

  const pages = {
    home:       <Home go={go}/>,
    login:      <Login go={go}/>,
    register:   <Register go={go}/>,
    dash:       <Dashboard go={go}/>,
    history:    <History go={go}/>,
    humanise:   <Humaniser go={go}/>,
    subscribe:  <Subscribe go={go}/>,
    admin:      <Admin go={go}/>,
    affiliate:  <Affiliate go={go}/>,
    ambassador: <Ambassador go={go}/>,
    contact:    <Contact go={go}/>,
    about:      <About go={go}/>,
    privacy:    <Privacy go={go}/>,
    terms:      <Terms go={go}/>,
  };

  return (
    <>
      <Navbar page={page} go={go}/>
      {pages[page] || pages.home}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <style>{GS}</style>
      <AppInner/>
    </AuthProvider>
  );
}

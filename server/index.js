require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Admin Auth Middleware ────────────────────────────────────
function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return next(); // no password set = no protection
  
  // Check via header
  const authHeader = req.headers['x-admin-password'];
  if (authHeader === password) return next();
  
  // Check via query param (for browser access)
  if (req.query.key === password) return next();
  
  // Check via cookie
  if (req.cookies && req.cookies.admin_key === password) return next();
  
  return res.status(401).json({ error: 'Mot de passe admin requis' });
}

// ─── API Routes ──────────────────────────────────────────────
app.use('/api', auditRoutes);

// ─── Serve report page for /report/:id ───────────────────────
app.get('/report/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'report.html'));
});

// ─── Serve admin dashboard ───────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ─── Static files ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   🚀 Alsek Audit Digital — Serveur actif ║`);
  console.log(`  ║   → http://localhost:${PORT}               ║`);
  console.log(`  ║   → Rapports: /report/:id               ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});

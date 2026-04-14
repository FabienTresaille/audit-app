const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'audits.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY,
    
    -- Company info
    company_name TEXT NOT NULL,
    company_url TEXT,
    company_sector TEXT,
    company_logo_url TEXT,
    site_age TEXT,
    
    -- Social URLs
    instagram_url TEXT,
    facebook_url TEXT,
    linkedin_url TEXT,
    tiktok_url TEXT,
    google_business_url TEXT,
    
    -- Contact
    contact_firstname TEXT,
    contact_lastname TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    contact_notes TEXT,
    
    -- Form data (advertising & marketing answers)
    form_data TEXT DEFAULT '{}',
    
    -- Analysis results (JSON)
    website_analysis TEXT DEFAULT '{}',
    instagram_analysis TEXT DEFAULT '{}',
    social_analysis TEXT DEFAULT '{}',
    
    -- Computed scores (JSON)
    scores TEXT DEFAULT '{}',
    
    -- Recommendations (JSON array)
    recommendations TEXT DEFAULT '[]',
    
    -- Status: pending | analyzing | complete | error
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );
`);

// ─── CRUD Operations ────────────────────────────────────────

function createAudit(data) {
  const stmt = db.prepare(`
    INSERT INTO audits (
      id, company_name, company_url, company_sector, site_age,
      instagram_url, facebook_url, linkedin_url, tiktok_url, google_business_url,
      contact_firstname, contact_lastname, contact_email, contact_phone, contact_notes,
      form_data, status
    ) VALUES (
      @id, @company_name, @company_url, @company_sector, @site_age,
      @instagram_url, @facebook_url, @linkedin_url, @tiktok_url, @google_business_url,
      @contact_firstname, @contact_lastname, @contact_email, @contact_phone, @contact_notes,
      @form_data, 'analyzing'
    )
  `);
  
  stmt.run({
    id: data.id,
    company_name: data.company_name || '',
    company_url: data.company_url || '',
    company_sector: data.company_sector || '',
    site_age: data.site_age || '',
    instagram_url: data.instagram_url || '',
    facebook_url: data.facebook_url || '',
    linkedin_url: data.linkedin_url || '',
    tiktok_url: data.tiktok_url || '',
    google_business_url: data.google_business_url || '',
    contact_firstname: data.contact_firstname || '',
    contact_lastname: data.contact_lastname || '',
    contact_email: data.contact_email || '',
    contact_phone: data.contact_phone || '',
    contact_notes: data.contact_notes || '',
    form_data: JSON.stringify(data.form_data || {})
  });
  
  return data.id;
}

function updateAuditAnalysis(id, field, data) {
  const allowed = ['website_analysis', 'instagram_analysis', 'social_analysis', 'scores', 'recommendations'];
  if (!allowed.includes(field)) throw new Error(`Invalid field: ${field}`);
  
  const stmt = db.prepare(`
    UPDATE audits 
    SET ${field} = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(JSON.stringify(data), id);
}

function updateAuditStatus(id, status, errorMessage = null) {
  const stmt = db.prepare(`
    UPDATE audits 
    SET status = ?, error_message = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, errorMessage, id);
}

function getAudit(id) {
  const row = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
  if (!row) return null;
  
  // Parse JSON fields
  try { row.form_data = JSON.parse(row.form_data || '{}'); } catch { row.form_data = {}; }
  try { row.website_analysis = JSON.parse(row.website_analysis || '{}'); } catch { row.website_analysis = {}; }
  try { row.instagram_analysis = JSON.parse(row.instagram_analysis || '{}'); } catch { row.instagram_analysis = {}; }
  try { row.social_analysis = JSON.parse(row.social_analysis || '{}'); } catch { row.social_analysis = {}; }
  try { row.scores = JSON.parse(row.scores || '{}'); } catch { row.scores = {}; }
  try { row.recommendations = JSON.parse(row.recommendations || '[]'); } catch { row.recommendations = []; }
  
  return row;
}

function getAllAudits() {
  const rows = db.prepare('SELECT id, company_name, company_url, company_sector, status, scores, created_at FROM audits ORDER BY created_at DESC').all();
  return rows.map(row => {
    try { row.scores = JSON.parse(row.scores || '{}'); } catch { row.scores = {}; }
    return row;
  });
}

function deleteAudit(id) {
  db.prepare('DELETE FROM audits WHERE id = ?').run(id);
}

module.exports = {
  db,
  createAudit,
  updateAuditAnalysis,
  updateAuditStatus,
  getAudit,
  getAllAudits,
  deleteAudit
};

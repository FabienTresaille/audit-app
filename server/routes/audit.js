/**
 * Audit API Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createAudit, getAudit, getAllAudits, updateAuditAnalysis, updateAuditStatus, deleteAudit } = require('../db');
const { analyzeWebsite } = require('../analyzers/website');
const { analyzeInstagram } = require('../analyzers/instagram');
const { analyzeSocial } = require('../analyzers/social');
const { computeScores, generateRecommendations, getSectorBenchmark } = require('../scoring');

const router = express.Router();

// ─── POST /api/audit — Create & launch audit ────────────────

router.post('/audit', async (req, res) => {
  try {
    const body = req.body;
    const id = uuidv4();

    // Validate required fields
    if (!body.company_name || body.company_name.trim() === '') {
      return res.status(400).json({ error: 'Le nom de l\'entreprise est requis' });
    }

    // Save audit to DB
    createAudit({
      id,
      company_name: body.company_name,
      company_url: body.company_url || '',
      company_sector: body.company_sector || 'default',
      site_age: body.site_age || '',
      instagram_url: body.instagram_url || '',
      facebook_url: body.facebook_url || '',
      linkedin_url: body.linkedin_url || '',
      tiktok_url: body.tiktok_url || '',
      google_business_url: body.google_business_url || '',
      contact_firstname: body.contact_firstname || '',
      contact_lastname: body.contact_lastname || '',
      contact_email: body.contact_email || '',
      contact_phone: body.contact_phone || '',
      contact_notes: body.contact_notes || '',
      form_data: body.form_data || {}
    });

    // Return immediately with the audit ID
    res.json({ id, status: 'analyzing', reportUrl: `/report/${id}` });

    // Run analysis in background
    runAnalysis(id, body).catch(err => {
      console.error(`[audit:${id}] Analysis failed:`, err);
      updateAuditStatus(id, 'error', err.message);
    });

  } catch (err) {
    console.error('[POST /api/audit] Error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la création de l\'audit' });
  }
});

// ─── GET /api/audit/:id — Get audit results ─────────────────

router.get('/audit/:id', (req, res) => {
  try {
    const audit = getAudit(req.params.id);
    if (!audit) {
      return res.status(404).json({ error: 'Audit non trouvé' });
    }

    // Add benchmark data
    const benchmark = getSectorBenchmark(audit.company_sector);

    res.json({
      ...audit,
      benchmark,
      agency: {
        name: process.env.AGENCY_NAME || 'Alsek',
        website: process.env.AGENCY_WEBSITE || 'https://alsek.fr',
        email: process.env.AGENCY_EMAIL || 'contact@alsek.fr',
        phone: process.env.AGENCY_PHONE || ''
      }
    });
  } catch (err) {
    console.error(`[GET /api/audit/${req.params.id}] Error:`, err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/audits — List all audits ───────────────────────

router.get('/audits', (req, res) => {
  try {
    const audits = getAllAudits();
    res.json(audits);
  } catch (err) {
    console.error('[GET /api/audits] Error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/audit/:id — Delete an audit ─────────────────

router.delete('/audit/:id', (req, res) => {
  try {
    deleteAudit(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(`[DELETE /api/audit/${req.params.id}] Error:`, err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Background Analysis Pipeline ────────────────────────────

async function runAnalysis(id, body) {
  console.log(`[audit:${id}] Starting analysis for "${body.company_name}"...`);
  const startTime = Date.now();

  // 1. Website Analysis
  let websiteResults = {};
  if (body.company_url) {
    console.log(`[audit:${id}] Analyzing website: ${body.company_url}`);
    try {
      websiteResults = await analyzeWebsite(body.company_url);
      updateAuditAnalysis(id, 'website_analysis', websiteResults);
      console.log(`[audit:${id}] Website analysis complete`);
    } catch (err) {
      console.error(`[audit:${id}] Website analysis error:`, err.message);
      websiteResults = { error: err.message, criteria: {} };
      updateAuditAnalysis(id, 'website_analysis', websiteResults);
    }
  }

  // 2. Instagram Analysis
  let instagramResults = {};
  if (body.instagram_url) {
    console.log(`[audit:${id}] Analyzing Instagram: ${body.instagram_url}`);
    try {
      const manualData = {
        followers: body.form_data?.ig_followers,
        avgLikes: body.form_data?.ig_avg_likes,
        postsPerWeek: body.form_data?.ig_posts_per_week,
        usesReels: body.form_data?.ig_uses_reels,
        usesHighlights: body.form_data?.ig_uses_highlights
      };
      instagramResults = await analyzeInstagram(body.instagram_url, manualData);
      updateAuditAnalysis(id, 'instagram_analysis', instagramResults);
      console.log(`[audit:${id}] Instagram analysis complete`);
    } catch (err) {
      console.error(`[audit:${id}] Instagram analysis error:`, err.message);
      instagramResults = { error: err.message, criteria: {} };
      updateAuditAnalysis(id, 'instagram_analysis', instagramResults);
    }
  }

  // 3. Social Media Analysis
  let socialResults = {};
  console.log(`[audit:${id}] Checking social presence...`);
  try {
    socialResults = await analyzeSocial({
      facebook: body.facebook_url,
      linkedin: body.linkedin_url,
      tiktok: body.tiktok_url,
      google_business: body.google_business_url,
      instagram: body.instagram_url
    });
    updateAuditAnalysis(id, 'social_analysis', socialResults);
    console.log(`[audit:${id}] Social analysis complete`);
  } catch (err) {
    console.error(`[audit:${id}] Social analysis error:`, err.message);
    socialResults = { error: err.message };
    updateAuditAnalysis(id, 'social_analysis', socialResults);
  }

  // 4. Compute Scores
  console.log(`[audit:${id}] Computing scores...`);
  const formData = {
    ...body.form_data,
    site_age: body.site_age
  };

  const scores = computeScores(websiteResults, instagramResults, socialResults, formData);
  updateAuditAnalysis(id, 'scores', scores);

  // 5. Generate Recommendations
  const recommendations = generateRecommendations(scores);
  updateAuditAnalysis(id, 'recommendations', recommendations);

  // 6. Mark as complete
  updateAuditStatus(id, 'complete');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[audit:${id}] ✅ Analysis complete in ${elapsed}s — Score: ${scores.global.score}/100`);
}

module.exports = router;

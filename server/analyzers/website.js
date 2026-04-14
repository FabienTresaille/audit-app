/**
 * Website Analyzer
 * Analyses automatiques du site web via Google PageSpeed API + crawl HTML
 */

const cheerio = require('cheerio');

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// ─── Main Analysis Function ─────────────────────────────────

async function analyzeWebsite(url) {
  if (!url || url.trim() === '') {
    return { error: 'no_url', message: 'Aucune URL fournie', criteria: getEmptyCriteria() };
  }

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const results = {
    url,
    criteria: {},
    raw: {}
  };

  try {
    // Run all analyses in parallel
    const [pagespeedMobile, pagespeedDesktop, htmlAnalysis, sslCheck] = await Promise.allSettled([
      fetchPageSpeed(url, 'mobile'),
      fetchPageSpeed(url, 'desktop'),
      crawlHTML(url),
      checkSSL(url)
    ]);

    // Process PageSpeed results
    const mobile = pagespeedMobile.status === 'fulfilled' ? pagespeedMobile.value : null;
    const desktop = pagespeedDesktop.status === 'fulfilled' ? pagespeedDesktop.value : null;
    const html = htmlAnalysis.status === 'fulfilled' ? htmlAnalysis.value : null;
    const ssl = sslCheck.status === 'fulfilled' ? sslCheck.value : false;

    results.raw = { mobile, desktop, html, ssl };

    // ═══ Criterion: Performance / Speed ═══
    const mobilePerf = mobile?.lighthouseResult?.categories?.performance?.score || 0;
    const desktopPerf = desktop?.lighthouseResult?.categories?.performance?.score || 0;
    const avgPerf = ((mobilePerf + desktopPerf) / 2) * 100;
    
    const loadingTime = mobile?.lighthouseResult?.audits?.['speed-index']?.numericValue || 0;
    const loadingTimeSec = (loadingTime / 1000).toFixed(1);

    results.criteria.performance = {
      score: Math.round(mapScore(avgPerf, 0, 100, 0, 5)),
      max: 5,
      value: Math.round(avgPerf),
      detail: `Score performance: ${Math.round(avgPerf)}% | Temps de chargement: ${loadingTimeSec}s`,
      loadingTime: parseFloat(loadingTimeSec),
      mobileScore: Math.round(mobilePerf * 100),
      desktopScore: Math.round(desktopPerf * 100)
    };

    // ═══ Criterion: Mobile-Friendly ═══
    const mobileSeo = mobile?.lighthouseResult?.categories?.seo?.score || 0;
    const mobileAccessibility = mobile?.lighthouseResult?.categories?.accessibility?.score || 0;
    const viewportAudit = mobile?.lighthouseResult?.audits?.viewport?.score || 0;
    const fontSizeAudit = mobile?.lighthouseResult?.audits?.['font-size']?.score || 0;
    const tapTargetsAudit = mobile?.lighthouseResult?.audits?.['tap-targets']?.score || 0;
    
    const mobileScore = ((viewportAudit + fontSizeAudit + tapTargetsAudit) / 3) * 100;

    results.criteria.mobile = {
      score: Math.round(mapScore(mobileScore, 0, 100, 0, 4)),
      max: 4,
      value: Math.round(mobileScore),
      detail: `Compatibilité mobile: ${Math.round(mobileScore)}%`,
      hasViewport: viewportAudit === 1,
      fontSizeOk: fontSizeAudit === 1,
      tapTargetsOk: tapTargetsAudit === 1
    };

    // ═══ Criterion: SSL / HTTPS ═══
    results.criteria.ssl = {
      score: ssl ? 2 : 0,
      max: 2,
      value: ssl,
      detail: ssl ? 'Certificat SSL actif (HTTPS)' : 'Pas de certificat SSL — site non sécurisé'
    };

    // ═══ Criterion: SEO Basics (from HTML crawl) ═══
    if (html) {
      const seoScore = calculateSeoScore(html);
      results.criteria.seo = {
        score: seoScore.score,
        max: 5,
        value: seoScore.percentage,
        detail: seoScore.detail,
        hasTitle: html.hasTitle,
        titleLength: html.titleLength,
        hasMetaDesc: html.hasMetaDesc,
        metaDescLength: html.metaDescLength,
        hasH1: html.hasH1,
        h1Count: html.h1Count,
        imgWithoutAlt: html.imgWithoutAlt,
        totalImages: html.totalImages
      };

      // ═══ Criterion: CTA (Calls to Action) ═══
      const ctaScore = calculateCtaScore(html);
      results.criteria.cta = {
        score: ctaScore.score,
        max: 4,
        value: ctaScore.percentage,
        detail: ctaScore.detail,
        hasForms: html.hasForms,
        formCount: html.formCount,
        ctaButtons: html.ctaButtons,
        hasPhoneLink: html.hasPhoneLink,
        hasEmailLink: html.hasEmailLink
      };

      // ═══ Criterion: Essential Pages ═══
      const pagesScore = calculatePagesScore(html);
      results.criteria.essentialPages = {
        score: pagesScore.score,
        max: 3,
        value: pagesScore.percentage,
        detail: pagesScore.detail,
        pages: html.essentialPages
      };

      // ═══ Criterion: Analytics & Tracking ═══
      const analyticsScore = calculateAnalyticsScore(html);
      results.criteria.analytics = {
        score: analyticsScore.score,
        max: 3,
        value: analyticsScore.percentage,
        detail: analyticsScore.detail,
        tools: html.analyticsTools
      };
    } else {
      // HTML crawl failed — default to 0
      results.criteria.seo = { score: 0, max: 5, value: 0, detail: 'Impossible d\'analyser le HTML du site' };
      results.criteria.cta = { score: 0, max: 4, value: 0, detail: 'Impossible d\'analyser les CTA' };
      results.criteria.essentialPages = { score: 0, max: 3, value: 0, detail: 'Impossible de vérifier les pages' };
      results.criteria.analytics = { score: 0, max: 3, value: 0, detail: 'Impossible de détecter les outils analytics' };
    }

    // ═══ Criterion: Accessibility ═══
    const a11yScore = (mobileAccessibility * 100);
    results.criteria.accessibility = {
      score: Math.round(mapScore(a11yScore, 0, 100, 0, 3)),
      max: 3,
      value: Math.round(a11yScore),
      detail: `Score accessibilité: ${Math.round(a11yScore)}%`
    };

    // ═══ Criterion: Design / Modernity (from form) — added later by scoring engine ═══
    results.criteria.design = {
      score: 0,
      max: 4,
      value: 0,
      detail: 'Évalué via le formulaire (date de refonte)'
    };

  } catch (err) {
    console.error('[website-analyzer] Error:', err.message);
    results.error = err.message;
    results.criteria = getEmptyCriteria();
  }

  // Remove raw lighthouse data to save space (keep summary only)
  delete results.raw;

  return results;
}

// ─── PageSpeed Insights API ──────────────────────────────────

async function fetchPageSpeed(url, strategy = 'mobile') {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  
  let apiUrl = `${PAGESPEED_API}?url=${encodeURIComponent(url)}&strategy=${strategy}`;
  categories.forEach(cat => { apiUrl += `&category=${cat}`; });
  if (apiKey) apiUrl += `&key=${apiKey}`;

  const response = await fetch(apiUrl, { 
    signal: AbortSignal.timeout(60000) // 60s timeout
  });
  
  if (!response.ok) {
    throw new Error(`PageSpeed API error: ${response.status}`);
  }
  
  return await response.json();
}

// ─── HTML Crawl with Cheerio ─────────────────────────────────

async function crawlHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow'
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const html = await response.text();
  const $ = cheerio.load(html);

  // Title
  const title = $('title').text().trim();
  const hasTitle = title.length > 0;
  const titleLength = title.length;

  // Meta Description
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const hasMetaDesc = metaDesc.length > 0;
  const metaDescLength = metaDesc.length;

  // H1
  const h1s = $('h1');
  const hasH1 = h1s.length > 0;
  const h1Count = h1s.length;

  // Images without alt
  const images = $('img');
  const totalImages = images.length;
  let imgWithoutAlt = 0;
  images.each((_, img) => {
    const alt = $(img).attr('alt');
    if (!alt || alt.trim() === '') imgWithoutAlt++;
  });

  // Forms & CTA buttons
  const forms = $('form');
  const hasForms = forms.length > 0;
  const formCount = forms.length;

  // Look for CTA-like buttons and links
  const ctaKeywords = ['contact', 'devis', 'réserv', 'appel', 'rdv', 'rendez-vous', 'essai', 'gratuit', 'commander', 'acheter', 'inscription', 's\'inscrire', 'commencer', 'découvrir', 'demander'];
  let ctaButtons = 0;
  $('a, button, input[type="submit"]').each((_, el) => {
    const text = ($(el).text() + ' ' + ($(el).attr('value') || '')).toLowerCase();
    if (ctaKeywords.some(kw => text.includes(kw))) ctaButtons++;
  });

  // Phone & email links
  const hasPhoneLink = $('a[href^="tel:"]').length > 0;
  const hasEmailLink = $('a[href^="mailto:"]').length > 0;

  // Essential pages detection
  const links = [];
  $('a[href]').each((_, el) => {
    links.push(($(el).attr('href') || '').toLowerCase());
  });
  const allText = links.join(' ') + ' ' + $('nav').text().toLowerCase();

  const essentialPages = {
    about: matchesAny(allText, ['a-propos', 'about', 'qui-sommes', 'notre-histoire', 'notre-agence', 'à propos', 'qui sommes']),
    contact: matchesAny(allText, ['contact', 'nous-contacter', 'nous contacter']),
    legal: matchesAny(allText, ['mentions-legales', 'mentions légales', 'legal', 'cgu', 'cgv', 'conditions']),
    privacy: matchesAny(allText, ['politique-de-confidentialite', 'privacy', 'confidentialité', 'rgpd', 'données personnelles'])
  };

  // Analytics & tracking detection
  const fullHtml = html.toLowerCase();
  const analyticsTools = {
    ga4: fullHtml.includes('gtag') || fullHtml.includes('google-analytics') || fullHtml.includes('googletagmanager'),
    gtm: fullHtml.includes('googletagmanager.com/gtm'),
    metaPixel: fullHtml.includes('connect.facebook.net') || fullHtml.includes('fbevents') || fullHtml.includes('fbq('),
    hotjar: fullHtml.includes('hotjar'),
    clarity: fullHtml.includes('clarity.ms'),
    plausible: fullHtml.includes('plausible'),
    matomo: fullHtml.includes('matomo') || fullHtml.includes('piwik')
  };

  return {
    hasTitle, titleLength, title,
    hasMetaDesc, metaDescLength,
    hasH1, h1Count,
    totalImages, imgWithoutAlt,
    hasForms, formCount, ctaButtons,
    hasPhoneLink, hasEmailLink,
    essentialPages,
    analyticsTools
  };
}

// ─── SSL Check ───────────────────────────────────────────────

async function checkSSL(url) {
  try {
    const httpsUrl = url.replace(/^http:\/\//, 'https://');
    const response = await fetch(httpsUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    });
    return response.ok || response.status < 400;
  } catch {
    return false;
  }
}

// ─── Score Calculators ───────────────────────────────────────

function calculateSeoScore(html) {
  let score = 0;
  const issues = [];

  // Title: 0-1.5 points
  if (html.hasTitle) {
    if (html.titleLength >= 30 && html.titleLength <= 60) {
      score += 1.5;
    } else {
      score += 0.75;
      issues.push(`Title tag présent mais longueur non optimale (${html.titleLength} caractères, idéal: 30-60)`);
    }
  } else {
    issues.push('Aucune balise title détectée');
  }

  // Meta Description: 0-1.5 points
  if (html.hasMetaDesc) {
    if (html.metaDescLength >= 120 && html.metaDescLength <= 160) {
      score += 1.5;
    } else {
      score += 0.75;
      issues.push(`Meta description présente mais longueur non optimale (${html.metaDescLength} caractères, idéal: 120-160)`);
    }
  } else {
    issues.push('Aucune meta description détectée');
  }

  // H1: 0-1 point
  if (html.hasH1) {
    if (html.h1Count === 1) {
      score += 1;
    } else {
      score += 0.5;
      issues.push(`${html.h1Count} balises H1 détectées (idéal: 1 seule)`);
    }
  } else {
    issues.push('Aucune balise H1 détectée');
  }

  // Images alt: 0-1 point
  if (html.totalImages > 0) {
    const altRatio = 1 - (html.imgWithoutAlt / html.totalImages);
    score += altRatio;
    if (html.imgWithoutAlt > 0) {
      issues.push(`${html.imgWithoutAlt}/${html.totalImages} images sans attribut alt`);
    }
  } else {
    score += 0.5; // No images = not ideal but not terrible
  }

  return {
    score: Math.round(Math.min(score, 5)),
    percentage: Math.round((score / 5) * 100),
    detail: issues.length > 0 ? issues.join(' | ') : 'SEO basique correctement configuré'
  };
}

function calculateCtaScore(html) {
  let score = 0;
  const issues = [];

  if (html.hasForms) {
    score += 1.5;
  } else {
    issues.push('Aucun formulaire de contact détecté');
  }

  if (html.ctaButtons >= 3) {
    score += 1.5;
  } else if (html.ctaButtons >= 1) {
    score += 0.75;
    issues.push('Peu d\'appels à l\'action (CTA) détectés');
  } else {
    issues.push('Aucun appel à l\'action (CTA) détecté');
  }

  if (html.hasPhoneLink || html.hasEmailLink) {
    score += 1;
  } else {
    issues.push('Pas de lien téléphone ou email cliquable');
  }

  return {
    score: Math.round(Math.min(score, 4)),
    percentage: Math.round((score / 4) * 100),
    detail: issues.length > 0 ? issues.join(' | ') : 'Appels à l\'action bien présents'
  };
}

function calculatePagesScore(html) {
  const pages = html.essentialPages;
  let found = 0;
  const missing = [];

  if (pages.about) found++; else missing.push('À propos');
  if (pages.contact) found++; else missing.push('Contact');
  if (pages.legal) found++; else missing.push('Mentions légales');
  if (pages.privacy) found++; else missing.push('Politique de confidentialité');

  const score = Math.round((found / 4) * 3);

  return {
    score: Math.min(score, 3),
    percentage: Math.round((found / 4) * 100),
    detail: missing.length > 0 ? `Pages manquantes: ${missing.join(', ')}` : 'Toutes les pages essentielles sont présentes'
  };
}

function calculateAnalyticsScore(html) {
  const tools = html.analyticsTools;
  let score = 0;
  const found = [];

  if (tools.ga4 || tools.gtm) { score += 1.5; found.push(tools.gtm ? 'Google Tag Manager' : 'Google Analytics'); }
  if (tools.metaPixel) { score += 1; found.push('Meta Pixel'); }
  if (tools.hotjar || tools.clarity) { score += 0.5; found.push(tools.hotjar ? 'Hotjar' : 'Microsoft Clarity'); }
  if (tools.plausible || tools.matomo) { score += 0.5; found.push(tools.plausible ? 'Plausible' : 'Matomo'); }

  return {
    score: Math.round(Math.min(score, 3)),
    percentage: Math.round((Math.min(score, 3) / 3) * 100),
    detail: found.length > 0 ? `Outils détectés: ${found.join(', ')}` : 'Aucun outil d\'analytics détecté'
  };
}

// ─── Utilities ───────────────────────────────────────────────

function mapScore(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function matchesAny(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}

function getEmptyCriteria() {
  return {
    performance: { score: 0, max: 5, value: 0, detail: 'Non analysé' },
    mobile: { score: 0, max: 4, value: 0, detail: 'Non analysé' },
    ssl: { score: 0, max: 2, value: false, detail: 'Non analysé' },
    seo: { score: 0, max: 5, value: 0, detail: 'Non analysé' },
    cta: { score: 0, max: 4, value: 0, detail: 'Non analysé' },
    essentialPages: { score: 0, max: 3, value: 0, detail: 'Non analysé' },
    analytics: { score: 0, max: 3, value: 0, detail: 'Non analysé' },
    accessibility: { score: 0, max: 3, value: 0, detail: 'Non analysé' },
    design: { score: 0, max: 4, value: 0, detail: 'Non analysé' }
  };
}

module.exports = { analyzeWebsite };

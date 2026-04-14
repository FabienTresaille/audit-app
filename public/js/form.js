/**
 * Form Wizard Logic
 * Handles multi-step navigation, validation, and form submission
 */

let currentStep = 1;
const totalSteps = 5;

// ─── Step Navigation ─────────────────────────────────────────

function nextStep() {
  if (!validateCurrentStep()) return;
  
  if (currentStep < totalSteps) {
    currentStep++;
    showStep(currentStep);
    
    // Pre-fill review on step 5
    if (currentStep === 5) buildReviewSummary();
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    showStep(currentStep);
  }
}

function showStep(step) {
  // Hide all steps
  document.querySelectorAll('.wizard-step').forEach(el => {
    el.classList.remove('active');
  });
  
  // Show target step
  const target = document.querySelector(`.wizard-step[data-step="${step}"]`);
  if (target) target.classList.add('active');
  
  // Update progress dots
  document.querySelectorAll('.wizard-progress__dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'completed');
    if (dotStep === step) dot.classList.add('active');
    else if (dotStep < step) dot.classList.add('completed');
  });
  
  // Update progress lines
  document.querySelectorAll('.wizard-progress__line').forEach(line => {
    const lineIndex = parseInt(line.dataset.line);
    line.classList.toggle('completed', lineIndex < step);
  });
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Validation ──────────────────────────────────────────────

function validateCurrentStep() {
  if (currentStep === 1) {
    const name = document.getElementById('company_name').value.trim();
    if (!name) {
      shakeInput('company_name');
      return false;
    }
  }
  return true;
}

function shakeInput(id) {
  const el = document.getElementById(id);
  el.style.borderColor = 'var(--color-danger)';
  el.style.animation = 'shake 0.5s ease';
  el.focus();
  
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.animation = '';
  }, 1000);
}

// Add shake animation
const style = document.createElement('style');
style.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }`;
document.head.appendChild(style);

// ─── Instagram Manual Section Toggle ─────────────────────────

document.getElementById('instagram_url')?.addEventListener('input', (e) => {
  const section = document.getElementById('igManualSection');
  if (section) {
    section.style.display = e.target.value.trim() ? 'block' : 'none';
  }
});

// ─── Review Summary (Step 5) ─────────────────────────────────

function buildReviewSummary() {
  const summary = document.getElementById('reviewSummary');
  const checklist = document.getElementById('analysisChecklist');
  
  const name = document.getElementById('company_name').value || '—';
  const url = document.getElementById('company_url').value || 'Non renseigné';
  const ig = document.getElementById('instagram_url').value || '';
  const fb = document.getElementById('facebook_url').value || '';
  const li = document.getElementById('linkedin_url').value || '';
  const contactName = (document.getElementById('contact_firstname').value + ' ' + document.getElementById('contact_lastname').value).trim() || 'Non renseigné';
  
  summary.innerHTML = `
    <div><strong>Entreprise :</strong> ${escapeHtml(name)}</div>
    <div><strong>Site web :</strong> ${escapeHtml(url)}</div>
    <div><strong>Instagram :</strong> ${escapeHtml(ig) || 'Non renseigné'}</div>
    <div><strong>Facebook :</strong> ${escapeHtml(fb) || 'Non renseigné'}</div>
    <div><strong>LinkedIn :</strong> ${escapeHtml(li) || 'Non renseigné'}</div>
    <div><strong>Contact :</strong> ${escapeHtml(contactName)}</div>
  `;
  
  // Analysis checklist
  const analyses = [];
  if (url && url !== 'Non renseigné') {
    analyses.push({ icon: '🌐', label: 'Analyse site web (Google PageSpeed + SEO)', active: true });
  }
  if (ig) {
    analyses.push({ icon: '📸', label: 'Analyse Instagram (Apify)', active: true });
  }
  analyses.push({ icon: '🔗', label: 'Vérification présence réseaux sociaux', active: true });
  analyses.push({ icon: '📊', label: 'Calcul des scores & recommandations', active: true });
  
  checklist.innerHTML = analyses.map(a => `
    <div style="display:flex;align-items:center;gap:var(--space-md);font-size:0.9rem;color:${a.active ? 'var(--color-success)' : 'var(--text-muted)'}">
      <span>${a.icon}</span>
      <span>${a.label}</span>
      <span style="margin-left:auto">${a.active ? '✅' : '⬜'}</span>
    </div>
  `).join('');
}

// ─── Form Submission ─────────────────────────────────────────

document.getElementById('auditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const btn = document.getElementById('launchBtn');
  btn.disabled = true;
  
  // Show loading overlay
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('active');
  
  // Rotate loading messages
  const messages = [
    { text: 'Analyse en cours...', sub: 'Connexion aux services d\'analyse...' },
    { text: 'Analyse du site web...', sub: 'Vérification via Google PageSpeed Insights...' },
    { text: 'Vérification SEO...', sub: 'Analyse des balises, structure et contenu...' },
    { text: 'Analyse d\'Instagram...', sub: 'Récupération des KPIs du profil...' },
    { text: 'Calcul des scores...', sub: 'Application de la grille d\'évaluation...' },
    { text: 'Génération du rapport...', sub: 'Compilation des résultats et recommandations...' }
  ];
  
  let msgIndex = 0;
  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    document.getElementById('loadingText').textContent = messages[msgIndex].text;
    document.getElementById('loadingSubtext').textContent = messages[msgIndex].sub;
  }, 3000);
  
  try {
    // Collect form data
    const formData = collectFormData();
    
    // Submit
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erreur serveur');
    }
    
    const result = await response.json();
    
    // Wait a moment then redirect
    document.getElementById('loadingText').textContent = 'Rapport prêt !';
    document.getElementById('loadingSubtext').textContent = 'Redirection vers le rapport...';
    
    await new Promise(r => setTimeout(r, 1500));
    
    clearInterval(msgInterval);
    window.location.href = result.reportUrl;
    
  } catch (err) {
    clearInterval(msgInterval);
    overlay.classList.remove('active');
    btn.disabled = false;
    alert('Erreur: ' + err.message);
  }
});

function collectFormData() {
  const get = (id) => document.getElementById(id)?.value?.trim() || '';
  const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const getCheck = (id) => document.getElementById(id)?.checked || false;
  
  return {
    company_name: get('company_name'),
    company_url: get('company_url'),
    company_sector: get('company_sector'),
    site_age: get('site_age'),
    instagram_url: get('instagram_url'),
    facebook_url: get('facebook_url'),
    linkedin_url: get('linkedin_url'),
    tiktok_url: get('tiktok_url'),
    google_business_url: get('google_business_url'),
    contact_firstname: get('contact_firstname'),
    contact_lastname: get('contact_lastname'),
    contact_email: get('contact_email'),
    contact_phone: get('contact_phone'),
    contact_notes: get('contact_notes'),
    form_data: {
      ads_active: getRadio('ads_active'),
      budget: get('budget'),
      conversion_tracking: get('conversion_tracking'),
      acquisition_strategy: getRadio('acquisition_strategy'),
      reviews: get('reviews'),
      visual_coherence: get('visual_coherence'),
      objective: getRadio('objective'),
      ig_followers: get('ig_followers'),
      ig_avg_likes: get('ig_avg_likes'),
      ig_posts_per_week: get('ig_posts_per_week'),
      ig_uses_reels: getCheck('ig_uses_reels'),
      ig_uses_highlights: getCheck('ig_uses_highlights'),
      ig_uses_stories: getCheck('ig_uses_stories')
    }
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

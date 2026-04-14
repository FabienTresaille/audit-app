/**
 * Report Page Logic
 * Fetches audit data, renders charts, animations and interactive elements
 */

let auditData = null;
let pollInterval = null;

// ─── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/');
  const auditId = pathParts[pathParts.length - 1];
  
  if (!auditId) {
    showError('ID d\'audit manquant dans l\'URL');
    return;
  }
  
  loadAudit(auditId);
});

async function loadAudit(id) {
  try {
    const response = await fetch(`/api/audit/${id}`);
    if (!response.ok) {
      if (response.status === 404) {
        showError('Audit non trouvé. Vérifiez le lien.');
        return;
      }
      throw new Error('Erreur serveur');
    }
    
    auditData = await response.json();
    
    if (auditData.status === 'analyzing') {
      document.querySelector('.report-loading__message').textContent = 
        'Analyse en cours, veuillez patienter...';
      
      // Poll every 3 seconds
      pollInterval = setInterval(async () => {
        const r = await fetch(`/api/audit/${id}`);
        const data = await r.json();
        if (data.status === 'complete' || data.status === 'error') {
          clearInterval(pollInterval);
          auditData = data;
          renderReport();
        }
      }, 3000);
      return;
    }
    
    renderReport();
    
  } catch (err) {
    showError('Impossible de charger le rapport: ' + err.message);
  }
}

function showError(msg) {
  document.getElementById('reportLoading').innerHTML = `
    <div style="text-align:center;padding:var(--space-3xl);">
      <div style="font-size:3rem;margin-bottom:var(--space-lg);">❌</div>
      <h2>${msg}</h2>
      <a href="/" class="btn btn-primary" style="margin-top:var(--space-xl);">Retour au formulaire</a>
    </div>
  `;
}

// ─── Main Render Function ────────────────────────────────────

function renderReport() {
  // Update page title
  document.title = `Audit Digital — ${auditData.company_name} — Alsek`;
  
  // Hide loading, show content
  document.getElementById('reportLoading').style.display = 'none';
  document.getElementById('reportContent').style.display = 'block';
  document.getElementById('reportToolbar').style.display = 'flex';
  
  // Render all sections
  renderHero();
  renderPillarsOverview();
  renderSummary();
  renderPillar1();
  renderPillar2();
  renderPillar3();
  renderBenchmark();
  renderRecommendations();
  renderCTA();
  
  // Trigger scroll animations
  setupScrollAnimations();
}

// ─── Hero Section ────────────────────────────────────────────

function renderHero() {
  const scores = auditData.scores;
  const globalScore = scores?.global?.score || 0;
  const rating = scores?.global?.rating || 'poor';
  
  // Company name
  document.getElementById('heroCompany').textContent = auditData.company_name;
  
  // Date
  const date = new Date(auditData.created_at);
  document.getElementById('heroDate').textContent = 
    `Audit réalisé le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  
  // Rating badge
  const ratingLabels = {
    excellent: { text: 'Excellent', class: 'badge-success' },
    good: { text: 'Bon', class: 'badge-info' },
    average: { text: 'À améliorer', class: 'badge-warning' },
    poor: { text: 'Critique', class: 'badge-danger' }
  };
  const ratingInfo = ratingLabels[rating] || ratingLabels.poor;
  document.getElementById('heroRatingBadge').innerHTML = 
    `<span class="badge ${ratingInfo.class}">${ratingInfo.text}</span>`;
  
  // Animated score circle
  const scoreCircle = document.getElementById('heroScoreCircle');
  scoreCircle.classList.add(`rating-${rating}`);
  
  const fill = document.getElementById('heroScoreFill');
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - globalScore / 100);
  
  fill.style.stroke = getRatingColor(rating);
  
  // Animate after a small delay
  setTimeout(() => {
    fill.style.strokeDashoffset = offset;
    animateCounter('heroScoreValue', 0, globalScore, 2000);
  }, 500);
}

// ─── Pillars Overview ────────────────────────────────────────

function renderPillarsOverview() {
  const scores = auditData.scores;
  const pillars = [scores.pillar1, scores.pillar2, scores.pillar3];
  
  const grid = document.getElementById('pillarsGrid');
  grid.innerHTML = pillars.map((pillar, i) => {
    const percentage = Math.round((pillar.total / pillar.max) * 100);
    const rating = pillar.rating;
    const circumference = 2 * Math.PI * 42;
    const offset = circumference * (1 - percentage / 100);
    
    return `
      <div class="glass-card pillar-card animate-on-scroll" style="animation-delay:${i * 0.15}s">
        <div class="pillar-card__icon">${pillar.icon}</div>
        <div class="pillar-card__title">${pillar.label}</div>
        <div class="score-circle score-circle--sm" style="margin: 0 auto;">
          <svg viewBox="0 0 100 100">
            <circle class="score-circle__bg" cx="50" cy="50" r="42"/>
            <circle class="score-circle__fill" cx="50" cy="50" r="42"
              stroke="${getRatingColor(rating)}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${circumference}"
              data-target-offset="${offset}"
              style="transition: stroke-dashoffset 1.8s cubic-bezier(0.22, 1, 0.36, 1) ${0.8 + i * 0.3}s"/>
          </svg>
          <span class="score-circle__value" data-count-to="${pillar.total}" data-count-delay="${800 + i * 300}">0</span>
        </div>
        <div class="pillar-card__score-text">
          <strong>${pillar.total}</strong> / ${pillar.max}
        </div>
      </div>
    `;
  }).join('');
  
  // Trigger pillar animations
  setTimeout(() => {
    grid.querySelectorAll('.score-circle__fill').forEach(circle => {
      circle.style.strokeDashoffset = circle.dataset.targetOffset;
    });
    grid.querySelectorAll('[data-count-to]').forEach(el => {
      const target = parseInt(el.dataset.countTo);
      const delay = parseInt(el.dataset.countDelay);
      setTimeout(() => animateCounter(el, 0, target, 1500), delay);
    });
  }, 100);
}

// ─── Executive Summary ───────────────────────────────────────

function renderSummary() {
  const scores = auditData.scores;
  const recommendations = auditData.recommendations || [];
  
  // Compute strengths, weaknesses, opportunities
  const allItems = [
    ...(scores.pillar1?.items || []),
    ...(scores.pillar2?.items || []),
    ...(scores.pillar3?.items || [])
  ];
  
  const strengths = allItems
    .filter(i => i.max > 0 && (i.score / i.max) >= 0.7)
    .sort((a, b) => (b.score / b.max) - (a.score / a.max))
    .slice(0, 4);
  
  const weaknesses = allItems
    .filter(i => i.max > 0 && (i.score / i.max) < 0.4)
    .sort((a, b) => (a.score / a.max) - (b.score / b.max))
    .slice(0, 4);
  
  const opportunities = recommendations
    .filter(r => r.priority === 'high' || r.priority === 'medium')
    .slice(0, 4);
  
  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = `
    <div class="glass-card summary-card summary-card--strengths animate-on-scroll">
      <div class="summary-card__icon">🛡️</div>
      <div class="summary-card__title">Points Forts</div>
      <ul class="summary-card__list">
        ${strengths.length > 0 
          ? strengths.map(s => `<li>${s.label} (${s.score}/${s.max})</li>`).join('') 
          : '<li>Aucun point fort majeur identifié</li>'}
      </ul>
    </div>
    
    <div class="glass-card summary-card summary-card--weaknesses animate-on-scroll" style="animation-delay:0.15s">
      <div class="summary-card__icon">⚠️</div>
      <div class="summary-card__title">Points Faibles</div>
      <ul class="summary-card__list">
        ${weaknesses.length > 0 
          ? weaknesses.map(w => `<li>${w.label} (${w.score}/${w.max})</li>`).join('') 
          : '<li>Aucune faiblesse critique</li>'}
      </ul>
    </div>
    
    <div class="glass-card summary-card summary-card--opportunities animate-on-scroll" style="animation-delay:0.3s">
      <div class="summary-card__icon">🚀</div>
      <div class="summary-card__title">Opportunités</div>
      <ul class="summary-card__list">
        ${opportunities.length > 0 
          ? opportunities.map(o => `<li>${o.title}</li>`).join('') 
          : '<li>Voir les recommandations détaillées ci-dessous</li>'}
      </ul>
    </div>
  `;
}

// ─── Pillar Detail Renderers ─────────────────────────────────

function renderPillar1() {
  const pillar = auditData.scores?.pillar1;
  if (!pillar) return;
  
  document.getElementById('pillar1Subtitle').textContent = 
    `Score: ${pillar.total}/${pillar.max} — ${getRatingLabel(pillar.rating)}`;
  
  renderCriteriaGrid('pillar1Grid', pillar.items);
}

function renderPillar2() {
  const pillar = auditData.scores?.pillar2;
  if (!pillar) return;
  
  document.getElementById('pillar2Subtitle').textContent = 
    `Score: ${pillar.total}/${pillar.max} — ${getRatingLabel(pillar.rating)}`;
  
  // Instagram profile card
  const igData = auditData.instagram_analysis;
  if (igData?.profileData || igData?.source === 'apify') {
    const profile = igData.profileData;
    const criteria = igData.criteria || {};
    
    if (profile) {
      document.getElementById('igProfileCard').style.display = 'block';
      document.getElementById('igProfileCard').innerHTML = `
        <div class="glass-card ig-profile animate-on-scroll">
          ${profile.profilePicUrl ? `<img src="${profile.profilePicUrl}" alt="Photo de profil" class="ig-profile__avatar" onerror="this.style.display='none'">` : ''}
          <div>
            <div class="ig-profile__username">@${profile.username || igData.username}</div>
            <div class="ig-profile__fullname">${profile.fullName || ''}</div>
          </div>
          ${profile.isVerified ? '<span class="badge badge-info">✓ Vérifié</span>' : ''}
          ${profile.isBusinessAccount ? '<span class="badge badge-violet">Compte Pro</span>' : ''}
        </div>
      `;
      
      // Stats grid
      document.getElementById('igStatsGrid').style.display = 'grid';
      document.getElementById('igStatsGrid').innerHTML = `
        <div class="glass-card ig-stat animate-on-scroll">
          <div class="ig-stat__value">${formatNumber(profile.followersCount || criteria.followers?.value || 0)}</div>
          <div class="ig-stat__label">Abonnés</div>
        </div>
        <div class="glass-card ig-stat animate-on-scroll" style="animation-delay:0.1s">
          <div class="ig-stat__value">${formatNumber(profile.postsCount || 0)}</div>
          <div class="ig-stat__label">Publications</div>
        </div>
        <div class="glass-card ig-stat animate-on-scroll" style="animation-delay:0.2s">
          <div class="ig-stat__value">${criteria.engagement?.value || 0}%</div>
          <div class="ig-stat__label">Engagement</div>
        </div>
        <div class="glass-card ig-stat animate-on-scroll" style="animation-delay:0.3s">
          <div class="ig-stat__value">${criteria.frequency?.value || 0}</div>
          <div class="ig-stat__label">Posts/Semaine</div>
        </div>
      `;
    }
  }
  
  renderCriteriaGrid('pillar2Grid', pillar.items);
}

function renderPillar3() {
  const pillar = auditData.scores?.pillar3;
  if (!pillar) return;
  
  document.getElementById('pillar3Subtitle').textContent = 
    `Score: ${pillar.total}/${pillar.max} — ${getRatingLabel(pillar.rating)}`;
  
  renderCriteriaGrid('pillar3Grid', pillar.items);
}

function renderCriteriaGrid(containerId, items) {
  if (!items) return;
  
  const container = document.getElementById(containerId);
  container.innerHTML = items.map((item, i) => {
    const percentage = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
    const barColor = getBarColor(percentage);
    
    return `
      <div class="glass-card criterion-card animate-on-scroll" style="animation-delay:${i * 0.08}s">
        <div class="criterion-card__header">
          <span class="criterion-card__name">${item.label}</span>
          <span class="criterion-card__score" style="color:${barColor}">${item.score}/${item.max}</span>
        </div>
        <div class="criterion-card__bar">
          <div class="criterion-card__bar-fill" 
            data-target-width="${percentage}%"
            style="background:${barColor}; width:0%"></div>
        </div>
        <div class="criterion-card__detail">${item.detail || ''}</div>
      </div>
    `;
  }).join('');
}

// ─── Benchmark ───────────────────────────────────────────────

function renderBenchmark() {
  const scores = auditData.scores;
  const benchmark = auditData.benchmark;
  if (!scores || !benchmark) return;
  
  const clientData = [
    scores.pillar1?.total || 0,
    scores.pillar2?.total || 0,
    scores.pillar3?.total || 0
  ];
  
  const benchData = [
    benchmark.website || 0,
    benchmark.content || 0,
    benchmark.ads || 0
  ];
  
  // Radar chart
  const ctx = document.getElementById('benchmarkChart');
  if (!ctx) return;
  
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Site Web', 'Contenu & Image', 'Publicité'],
      datasets: [
        {
          label: auditData.company_name,
          data: clientData,
          borderColor: '#7C3AED',
          backgroundColor: 'rgba(124, 58, 237, 0.15)',
          borderWidth: 2,
          pointBackgroundColor: '#7C3AED',
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Moyenne du secteur',
          data: benchData,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointBackgroundColor: '#F59E0B',
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 34,
          ticks: {
            display: false
          },
          grid: {
            color: 'rgba(255,255,255,0.06)'
          },
          angleLines: {
            color: 'rgba(255,255,255,0.06)'
          },
          pointLabels: {
            color: '#94A3B8',
            font: {
              family: 'Inter',
              size: 13,
              weight: 600
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#1a1a2e',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: 'Inter', weight: 600 },
          bodyFont: { family: 'Inter' }
        }
      }
    }
  });
  
  // Legend
  const legend = document.getElementById('benchmarkLegend');
  legend.innerHTML = `
    <div class="benchmark-legend__item">
      <div class="benchmark-legend__dot" style="background:#7C3AED"></div>
      <span class="benchmark-legend__label">${auditData.company_name}</span>
      <span class="benchmark-legend__value">${scores.global?.score || 0}/100</span>
    </div>
    <div class="benchmark-legend__item">
      <div class="benchmark-legend__dot" style="background:#F59E0B"></div>
      <span class="benchmark-legend__label">Moyenne du secteur</span>
      <span class="benchmark-legend__value">${benchmark.global || 0}/100</span>
    </div>
    <div style="margin-top:var(--space-lg);padding-top:var(--space-lg);border-top:1px solid var(--border-subtle);">
      <div style="font-size:0.85rem;color:var(--text-secondary);">
        ${scores.global.score > benchmark.global 
          ? `✅ Vous êtes <strong style="color:var(--color-success)">${scores.global.score - benchmark.global} points au-dessus</strong> de la moyenne de votre secteur.`
          : `⚠️ Vous êtes <strong style="color:var(--color-warning)">${benchmark.global - scores.global.score} points en dessous</strong> de la moyenne de votre secteur.`
        }
      </div>
    </div>
  `;
}

// ─── Recommendations ─────────────────────────────────────────

function renderRecommendations() {
  const recommendations = auditData.recommendations || [];
  if (recommendations.length === 0) return;
  
  const top = recommendations.slice(0, 5);
  const list = document.getElementById('recoList');
  
  list.innerHTML = top.map((rec, i) => `
    <div class="glass-card recommendation-card priority-${rec.priority} animate-on-scroll" style="animation-delay:${i * 0.12}s">
      <div class="recommendation-card__number">${String(i + 1).padStart(2, '0')}</div>
      <div class="recommendation-card__content">
        <div class="recommendation-card__header">
          <span class="recommendation-card__title">${rec.title}</span>
          <span class="badge ${rec.priority === 'high' ? 'badge-danger' : rec.priority === 'medium' ? 'badge-warning' : 'badge-info'}">
            ${rec.priority === 'high' ? '🔴 Priorité haute' : rec.priority === 'medium' ? '🟡 Priorité moyenne' : '🔵 À planifier'}
          </span>
        </div>
        <div class="recommendation-card__pillar">${rec.pillarIcon} ${rec.pillar} — ${rec.label} (${rec.currentScore}/${rec.maxScore})</div>
        <div class="recommendation-card__description">${rec.description}</div>
        <div class="recommendation-card__consequence">
          <strong>💡 Impact :</strong> ${rec.consequence}
        </div>
      </div>
    </div>
  `).join('');
}

// ─── CTA Section ─────────────────────────────────────────────

function renderCTA() {
  const agency = auditData.agency || {};
  
  const contact = document.getElementById('ctaContact');
  const items = [];
  
  if (agency.email) {
    items.push(`<a href="mailto:${agency.email}" class="cta-contact-item"><span class="cta-contact-item__icon">✉️</span> ${agency.email}</a>`);
  }
  if (agency.phone) {
    items.push(`<a href="tel:${agency.phone}" class="cta-contact-item"><span class="cta-contact-item__icon">📞</span> ${agency.phone}</a>`);
  }
  if (agency.website) {
    items.push(`<a href="${agency.website}" target="_blank" class="cta-contact-item"><span class="cta-contact-item__icon">🌐</span> ${agency.website}</a>`);
  }
  
  contact.innerHTML = items.join('');
  
  // Footer logo
  document.getElementById('footerLogo').textContent = agency.name || 'ALSEK';
}

// ─── Scroll Animations ──────────────────────────────────────

function setupScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fade-in-up');
        
        // Trigger bar fills
        entry.target.querySelectorAll('[data-target-width]').forEach(bar => {
          setTimeout(() => {
            bar.style.width = bar.dataset.targetWidth;
          }, 300);
        });
        
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
}

// ─── Utility Functions ───────────────────────────────────────

function animateCounter(element, start, end, duration) {
  const el = typeof element === 'string' ? document.getElementById(element) : element;
  if (!el) return;
  
  const range = end - start;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing: easeOutQuart
    const easedProgress = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(start + range * easedProgress);
    
    el.textContent = current;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

function getRatingColor(rating) {
  const colors = {
    excellent: '#10B981',
    good: '#3B82F6',
    average: '#F59E0B',
    poor: '#EF4444'
  };
  return colors[rating] || colors.poor;
}

function getRatingLabel(rating) {
  const labels = { excellent: 'Excellent', good: 'Bon', average: 'À améliorer', poor: 'Critique' };
  return labels[rating] || 'Non évalué';
}

function getBarColor(percentage) {
  if (percentage >= 75) return '#10B981';
  if (percentage >= 55) return '#3B82F6';
  if (percentage >= 35) return '#F59E0B';
  return '#EF4444';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ─── Share Report ────────────────────────────────────────────

async function shareReport() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    
    const btn = document.querySelector('.toolbar-btn[onclick="shareReport()"]');
    const original = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = original; }, 2000);
  } catch {
    // Fallback
    const input = document.createElement('input');
    input.value = window.location.href;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('Lien copié !');
  }
}

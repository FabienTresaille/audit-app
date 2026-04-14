/**
 * Scoring Engine
 * Computes pillar scores, global score, and generates recommendations
 */

// ─── Main Scoring Function ──────────────────────────────────

function computeScores(websiteAnalysis, instagramAnalysis, socialAnalysis, formData) {
  const scores = {
    pillar1: computePillar1(websiteAnalysis, formData),
    pillar2: computePillar2(instagramAnalysis, socialAnalysis, formData),
    pillar3: computePillar3(websiteAnalysis, socialAnalysis, formData)
  };

  scores.global = {
    score: scores.pillar1.total + scores.pillar2.total + scores.pillar3.total,
    max: 100,
    percentage: Math.round(((scores.pillar1.total + scores.pillar2.total + scores.pillar3.total) / 100) * 100)
  };

  // Determine color rating
  scores.global.rating = getRating(scores.global.percentage);
  scores.pillar1.rating = getRating((scores.pillar1.total / scores.pillar1.max) * 100);
  scores.pillar2.rating = getRating((scores.pillar2.total / scores.pillar2.max) * 100);
  scores.pillar3.rating = getRating((scores.pillar3.total / scores.pillar3.max) * 100);

  return scores;
}

// ─── Pillar 1: Site Web (/33) ────────────────────────────────

function computePillar1(website, formData) {
  const criteria = website?.criteria || {};
  
  // Design/Modernity score from form data
  let designScore = 0;
  const siteAge = formData?.site_age || '';
  if (siteAge === 'less_1_year') designScore = 4;
  else if (siteAge === '1_3_years') designScore = 2;
  else if (siteAge === 'more_3_years') designScore = 1;
  else if (siteAge === 'no_site') designScore = 0;

  // Override design score in criteria
  if (criteria.design) {
    criteria.design.score = designScore;
    criteria.design.value = designScore;
    criteria.design.detail = getDesignDetail(siteAge);
  }

  const items = [
    { key: 'performance', label: 'Performance & Vitesse', ...getCriterion(criteria.performance) },
    { key: 'mobile', label: 'Compatibilité Mobile', ...getCriterion(criteria.mobile) },
    { key: 'ssl', label: 'Sécurité SSL/HTTPS', ...getCriterion(criteria.ssl) },
    { key: 'seo', label: 'SEO Basique', ...getCriterion(criteria.seo) },
    { key: 'cta', label: 'Appels à l\'Action (CTA)', ...getCriterion(criteria.cta) },
    { key: 'essentialPages', label: 'Pages Essentielles', ...getCriterion(criteria.essentialPages) },
    { key: 'analytics', label: 'Analytics & Tracking', ...getCriterion(criteria.analytics) },
    { key: 'accessibility', label: 'Accessibilité', ...getCriterion(criteria.accessibility) },
    { key: 'design', label: 'Design & Modernité', score: designScore, max: 4, detail: getDesignDetail(siteAge) }
  ];

  const total = items.reduce((sum, item) => sum + item.score, 0);

  return {
    label: 'Site Web',
    icon: '🌐',
    total: Math.min(total, 33),
    max: 33,
    items
  };
}

// ─── Pillar 2: Contenu & Image (/33) ─────────────────────────

function computePillar2(instagram, social, formData) {
  const igCriteria = instagram?.criteria || {};
  
  // Reviews score from form data
  let reviewsScore = 0;
  const reviewsAnswer = formData?.reviews || '';
  if (reviewsAnswer === 'many') reviewsScore = 3;
  else if (reviewsAnswer === 'some') reviewsScore = 2;
  else if (reviewsAnswer === 'few') reviewsScore = 1;

  // Visual coherence from form data
  let coherenceScore = 0;
  const coherenceAnswer = parseInt(formData?.visual_coherence) || 0;
  coherenceScore = Math.round(mapScore(coherenceAnswer, 1, 5, 0, 2));

  // Multi-platform presence from social analysis
  const socialScore = social?.score || 0;
  const socialMax = social?.max || 4;

  const items = [
    { key: 'followers', label: 'Communauté Instagram', ...getCriterion(igCriteria.followers) },
    { key: 'engagement', label: 'Taux d\'Engagement', ...getCriterion(igCriteria.engagement) },
    { key: 'frequency', label: 'Fréquence de Publication', ...getCriterion(igCriteria.frequency) },
    { key: 'diversity', label: 'Diversité de Contenu', ...getCriterion(igCriteria.diversity) },
    { key: 'highlights', label: 'Utilisation des Highlights', ...getCriterion(igCriteria.highlights) },
    { key: 'bio', label: 'Bio Optimisée', ...getCriterion(igCriteria.bio) },
    { key: 'multiplatform', label: 'Présence Multi-Plateforme', score: socialScore, max: socialMax, detail: social?.detail || 'Non analysé' },
    { key: 'reviews', label: 'Avis Clients', score: reviewsScore, max: 3, detail: getReviewsDetail(reviewsAnswer) },
    { key: 'coherence', label: 'Cohérence Visuelle', score: coherenceScore, max: 2, detail: `Score cohérence: ${coherenceAnswer}/5` }
  ];

  const total = items.reduce((sum, item) => sum + item.score, 0);

  return {
    label: 'Contenu & Image',
    icon: '📸',
    total: Math.min(total, 33),
    max: 33,
    items
  };
}

// ─── Pillar 3: Publicité & Acquisition (/34) ─────────────────

function computePillar3(website, social, formData) {
  const websiteCriteria = website?.criteria || {};

  // Tracking (from website analysis)
  const analyticsData = getCriterion(websiteCriteria.analytics);
  const trackingScore = Math.round(mapScore(analyticsData.score, 0, 3, 0, 5));

  // Google Business (from social analysis)
  const gbpExists = social?.platforms?.google_business?.exists || false;
  const gbpScore = gbpExists ? 4 : 0;

  // Active advertising (from form)
  let adsScore = 0;
  const adsAnswer = formData?.ads_active || '';
  if (adsAnswer === 'yes_tracked') adsScore = 4;
  else if (adsAnswer === 'yes_no_tracking') adsScore = 2;
  else if (adsAnswer === 'no_interested') adsScore = 1;

  // Budget (from form)
  let budgetScore = 0;
  const budget = formData?.budget || '';
  if (budget === 'more_5000') budgetScore = 4;
  else if (budget === '2000_5000') budgetScore = 3;
  else if (budget === '500_2000') budgetScore = 2;
  else if (budget === 'less_500') budgetScore = 1;

  // Conversion tracking (from form)
  let conversionScore = 0;
  const convAnswer = formData?.conversion_tracking || '';
  if (convAnswer === 'yes_advanced') conversionScore = 4;
  else if (convAnswer === 'yes_basic') conversionScore = 2;
  else if (convAnswer === 'no') conversionScore = 0;

  // Acquisition strategy (from form)
  let strategyScore = 0;
  const stratAnswer = formData?.acquisition_strategy || '';
  if (stratAnswer === 'multi_channel') strategyScore = 4;
  else if (stratAnswer === 'single_channel') strategyScore = 2;
  else if (stratAnswer === 'organic_only') strategyScore = 1;

  // Sales funnel (partially from website CTA + form)
  const ctaData = getCriterion(websiteCriteria.cta);
  const funnelScore = Math.round(mapScore(ctaData.score, 0, 4, 0, 5));

  // Google Maps / Reviews (from social + form)
  let mapsScore = 0;
  if (gbpExists) {
    const reviews = formData?.reviews || '';
    if (reviews === 'many') mapsScore = 4;
    else if (reviews === 'some') mapsScore = 3;
    else mapsScore = 2; // At least has GBP
  }

  const items = [
    { key: 'tracking', label: 'Tracking & Analytics', score: trackingScore, max: 5, detail: analyticsData.detail },
    { key: 'google_business', label: 'Google Business Profile', score: gbpScore, max: 4, detail: gbpExists ? 'Google Business Profile détecté' : 'Pas de Google Business Profile détecté' },
    { key: 'ads_active', label: 'Publicité Active', score: adsScore, max: 4, detail: getAdsDetail(adsAnswer) },
    { key: 'budget', label: 'Budget Marketing', score: budgetScore, max: 4, detail: getBudgetDetail(budget) },
    { key: 'conversions', label: 'Suivi des Conversions', score: conversionScore, max: 4, detail: getConversionDetail(convAnswer) },
    { key: 'strategy', label: 'Stratégie d\'Acquisition', score: strategyScore, max: 4, detail: getStrategyDetail(stratAnswer) },
    { key: 'funnel', label: 'Tunnel de Vente', score: funnelScore, max: 5, detail: `Score CTA/Tunnel: ${ctaData.score}/${ctaData.max}` },
    { key: 'maps_reviews', label: 'Google Maps & Avis', score: mapsScore, max: 4, detail: mapsScore > 0 ? 'Présence Google Maps active' : 'Pas de présence Google Maps' }
  ];

  const total = items.reduce((sum, item) => sum + item.score, 0);

  return {
    label: 'Publicité & Acquisition',
    icon: '📢',
    total: Math.min(total, 34),
    max: 34,
    items
  };
}

// ─── Generate Recommendations ────────────────────────────────

function generateRecommendations(scores) {
  const recommendations = [];

  // Collect all criteria with low scores
  const allItems = [
    ...scores.pillar1.items.map(i => ({ ...i, pillar: 'Site Web', pillarIcon: '🌐' })),
    ...scores.pillar2.items.map(i => ({ ...i, pillar: 'Contenu & Image', pillarIcon: '📸' })),
    ...scores.pillar3.items.map(i => ({ ...i, pillar: 'Publicité & Acquisition', pillarIcon: '📢' }))
  ];

  // Sort by impact (highest max with lowest score ratio = most impactful)
  const sortedItems = allItems
    .map(item => ({
      ...item,
      ratio: item.max > 0 ? item.score / item.max : 1,
      impact: item.max * (1 - (item.max > 0 ? item.score / item.max : 1))
    }))
    .filter(item => item.ratio < 0.7)
    .sort((a, b) => b.impact - a.impact);

  for (const item of sortedItems) {
    const rec = getRecommendation(item.key, item);
    if (rec) {
      recommendations.push({
        key: item.key,
        pillar: item.pillar,
        pillarIcon: item.pillarIcon,
        label: item.label,
        currentScore: item.score,
        maxScore: item.max,
        impact: Math.round(item.impact),
        priority: item.impact >= 3 ? 'high' : item.impact >= 1.5 ? 'medium' : 'low',
        title: rec.title,
        description: rec.description,
        consequence: rec.consequence
      });
    }
  }

  return recommendations.slice(0, 10); // Max 10 recommendations
}

// ─── Recommendation Templates ────────────────────────────────

function getRecommendation(key, item) {
  const templates = {
    performance: {
      title: 'Optimiser la vitesse de chargement',
      description: 'Votre site est lent à charger, ce qui impacte directement votre taux de conversion et votre référencement Google.',
      consequence: 'Un site qui met plus de 3 secondes à charger perd jusqu\'à 53% de ses visiteurs mobiles.'
    },
    mobile: {
      title: 'Rendre votre site 100% mobile-friendly',
      description: 'Votre site n\'est pas optimalement adapté aux smartphones, alors que plus de 60% du trafic web est mobile.',
      consequence: 'Google pénalise les sites non responsive dans ses résultats de recherche.'
    },
    ssl: {
      title: 'Installer un certificat SSL (HTTPS)',
      description: 'Votre site n\'est pas sécurisé par un certificat SSL, ce qui affiche un avertissement "Non sécurisé" aux visiteurs.',
      consequence: 'Les navigateurs modernes bloquent les formulaires sur les sites non HTTPS, vous perdez la confiance de vos visiteurs.'
    },
    seo: {
      title: 'Optimiser les bases du référencement naturel',
      description: 'Des éléments SEO essentiels sont manquants ou mal configurés sur votre site.',
      consequence: 'Sans les fondamentaux SEO, votre site est quasiment invisible sur Google pour vos prospects.'
    },
    cta: {
      title: 'Ajouter des appels à l\'action efficaces',
      description: 'Votre site manque d\'appels à l\'action clairs pour convertir vos visiteurs en prospects.',
      consequence: 'Sans CTA, vos visiteurs repartent sans agir — vous perdez des opportunités commerciales chaque jour.'
    },
    essentialPages: {
      title: 'Créer les pages essentielles manquantes',
      description: 'Certaines pages clés sont absentes de votre site (À propos, Contact, Mentions légales...).',
      consequence: 'Ces pages renforcent la confiance et sont obligatoires légalement (mentions légales, politique de confidentialité).'
    },
    analytics: {
      title: 'Installer des outils de suivi analytics',
      description: 'Aucun outil d\'analytics n\'est détecté sur votre site — vous naviguez à l\'aveugle.',
      consequence: 'Sans données de trafic, il est impossible de mesurer l\'efficacité de vos actions marketing.'
    },
    design: {
      title: 'Moderniser le design de votre site',
      description: 'Votre site a plus de 3 ans et son design peut paraître daté face à la concurrence.',
      consequence: 'Un design obsolète fait perdre en crédibilité et réduit la confiance des visiteurs.'
    },
    engagement: {
      title: 'Augmenter l\'engagement sur Instagram',
      description: 'Votre taux d\'engagement est en dessous des moyennes du marché.',
      consequence: 'Un faible engagement réduit votre visibilité dans l\'algorithme Instagram et limite votre portée organique.'
    },
    frequency: {
      title: 'Publier plus régulièrement sur Instagram',
      description: 'Votre fréquence de publication est insuffisante pour maintenir l\'attention de votre audience.',
      consequence: 'L\'algorithme favorise les comptes qui publient régulièrement — la régularité est la clé de la croissance.'
    },
    diversity: {
      title: 'Diversifier vos formats de contenu',
      description: 'Vous n\'exploitez pas tous les formats disponibles (Reels, Carrousels, Stories, Photos).',
      consequence: 'Les Reels génèrent en moyenne 2x plus de portée que les photos classiques.'
    },
    highlights: {
      title: 'Configurer des Highlights Instagram',
      description: 'Vos Stories à la une ne sont pas configurées, vous perdez une vitrine permanente.',
      consequence: 'Les Highlights servent de "page d\'accueil" pour les nouveaux visiteurs de votre profil.'
    },
    bio: {
      title: 'Optimiser votre bio Instagram',
      description: 'Votre biographie Instagram n\'est pas optimisée pour convertir (manque de CTA, lien, mots-clés...).',
      consequence: 'La bio est la première chose que voit un visiteur — elle doit vendre en 3 secondes.'
    },
    tracking: {
      title: 'Mettre en place un tracking complet',
      description: 'Vous ne mesurez pas correctement le parcours de vos visiteurs et vos conversions.',
      consequence: 'Sans tracking, chaque euro dépensé en publicité est un pari — pas un investissement.'
    },
    google_business: {
      title: 'Créer votre fiche Google Business',
      description: 'Vous n\'avez pas de fiche Google Business, vous êtes invisible en recherche locale.',
      consequence: 'Les entreprises avec une fiche Google ont 70% plus de chances d\'attirer des visites physiques.'
    },
    ads_active: {
      title: 'Lancer des campagnes publicitaires ciblées',
      description: 'Vous ne faites pas de publicité en ligne, vous comptez uniquement sur le trafic organique.',
      consequence: 'La portée organique seule ne suffit plus — la publicité permet d\'accélérer significativement la croissance.'
    },
    budget: {
      title: 'Ajuster votre budget marketing',
      description: 'Votre budget marketing est en dessous du seuil d\'efficacité pour votre secteur.',
      consequence: 'Un budget trop faible dilue vos efforts et ne génère pas assez de volume pour optimiser les campagnes.'
    },
    conversions: {
      title: 'Configurer le suivi des conversions',
      description: 'Vous ne suivez pas vos conversions, impossible de calculer votre retour sur investissement.',
      consequence: 'Sans suivi des conversions, il est impossible d\'optimiser vos campagnes et de réduire votre coût par lead.'
    },
    strategy: {
      title: 'Diversifier votre stratégie d\'acquisition',
      description: 'Votre stratégie d\'acquisition repose sur un seul canal, ce qui vous rend vulnérable.',
      consequence: 'Une stratégie multi-canal réduit les risques et multiplie les points de contact avec vos prospects.'
    },
    funnel: {
      title: 'Optimiser votre tunnel de vente',
      description: 'Le parcours de conversion sur votre site n\'est pas optimisé — les visiteurs se perdent.',
      consequence: 'Chaque étape manquante dans votre tunnel peut faire chuter votre taux de conversion de 20 à 40%.'
    },
    maps_reviews: {
      title: 'Collecter plus d\'avis clients',
      description: 'Vous n\'avez pas assez d\'avis clients visibles, ce qui freine la décision d\'achat.',
      consequence: '93% des consommateurs lisent les avis en ligne avant d\'acheter — c\'est un levier de conversion majeur.'
    },
    multiplatform: {
      title: 'Étendre votre présence sur les réseaux sociaux',
      description: 'Vous n\'êtes pas présent sur suffisamment de plateformes pour toucher toute votre audience.',
      consequence: 'Chaque plateforme supplémentaire ouvre un nouveau canal d\'acquisition de clients potentiels.'
    },
    followers: {
      title: 'Développer votre communauté Instagram',
      description: 'Votre nombre d\'abonnés est encore modeste pour votre secteur.',
      consequence: 'Une communauté plus large amplifie la portée de chacune de vos publications.'
    }
  };

  return templates[key] || {
    title: `Améliorer : ${item.label}`,
    description: `Ce critère obtient un score de ${item.score}/${item.max}, indiquant une marge d'amélioration significative.`,
    consequence: 'Une amélioration ici aurait un impact positif sur votre présence digitale globale.'
  };
}

// ─── Benchmark Data (sector averages) ────────────────────────

function getSectorBenchmark(sector) {
  const benchmarks = {
    'restaurant': { website: 22, content: 20, ads: 18, global: 60 },
    'ecommerce': { website: 26, content: 22, ads: 24, global: 72 },
    'services': { website: 20, content: 16, ads: 16, global: 52 },
    'immobilier': { website: 24, content: 19, ads: 22, global: 65 },
    'sante': { website: 22, content: 14, ads: 18, global: 54 },
    'beaute': { website: 20, content: 24, ads: 20, global: 64 },
    'formation': { website: 23, content: 21, ads: 22, global: 66 },
    'artisan': { website: 16, content: 12, ads: 10, global: 38 },
    'tech': { website: 28, content: 22, ads: 26, global: 76 },
    'default': { website: 21, content: 18, ads: 18, global: 57 }
  };

  return benchmarks[sector] || benchmarks['default'];
}

// ─── Helpers ─────────────────────────────────────────────────

function getCriterion(criterion) {
  if (!criterion) return { score: 0, max: 0, detail: 'Non analysé' };
  return {
    score: criterion.score || 0,
    max: criterion.max || 0,
    detail: criterion.detail || '',
    ...criterion
  };
}

function getRating(percentage) {
  if (percentage >= 75) return 'excellent';
  if (percentage >= 55) return 'good';
  if (percentage >= 35) return 'average';
  return 'poor';
}

function mapScore(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function getDesignDetail(siteAge) {
  const details = {
    'less_1_year': 'Site créé/refondu il y a moins d\'1 an — design actualisé',
    '1_3_years': 'Site créé/refondu il y a 1 à 3 ans — commence à dater',
    'more_3_years': 'Site créé/refondu il y a plus de 3 ans — refonte recommandée',
    'no_site': 'Aucun site web — une présence en ligne est indispensable'
  };
  return details[siteAge] || 'Information non renseignée';
}

function getReviewsDetail(answer) {
  const details = {
    'many': 'Nombreux avis clients visibles',
    'some': 'Quelques avis clients visibles',
    'few': 'Très peu d\'avis clients',
    'none': 'Aucun avis client visible'
  };
  return details[answer] || 'Non renseigné';
}

function getAdsDetail(answer) {
  const details = {
    'yes_tracked': 'Publicité active avec suivi des performances',
    'yes_no_tracking': 'Publicité active mais sans vrai suivi',
    'no_interested': 'Pas de publicité mais intérêt déclaré',
    'no': 'Pas de publicité en ligne'
  };
  return details[answer] || 'Non renseigné';
}

function getBudgetDetail(budget) {
  const details = {
    'less_500': 'Budget < 500€/mois',
    '500_2000': 'Budget 500€ — 2 000€/mois',
    '2000_5000': 'Budget 2 000€ — 5 000€/mois',
    'more_5000': 'Budget > 5 000€/mois',
    'none': 'Aucun budget alloué'
  };
  return details[budget] || 'Non renseigné';
}

function getConversionDetail(answer) {
  const details = {
    'yes_advanced': 'Suivi avancé des conversions (événements, valeurs)',
    'yes_basic': 'Suivi basique des conversions',
    'no': 'Pas de suivi des conversions'
  };
  return details[answer] || 'Non renseigné';
}

function getStrategyDetail(answer) {
  const details = {
    'multi_channel': 'Stratégie multi-canal (SEO + Ads + Social...)',
    'single_channel': 'Un seul canal d\'acquisition',
    'organic_only': 'Uniquement organique (pas de paid)',
    'none': 'Pas de stratégie d\'acquisition définie'
  };
  return details[answer] || 'Non renseigné';
}

module.exports = { computeScores, generateRecommendations, getSectorBenchmark };

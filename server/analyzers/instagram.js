/**
 * Instagram Analyzer
 * Uses Apify Instagram Profile Scraper to extract and analyze profile KPIs
 */

const { ApifyClient } = require('apify-client');

// ─── Main Analysis Function ─────────────────────────────────

async function analyzeInstagram(instagramUrl, manualData = {}) {
  if (!instagramUrl || instagramUrl.trim() === '') {
    return { error: 'no_url', message: 'Aucun compte Instagram fourni', criteria: getEmptyCriteria() };
  }

  const username = extractUsername(instagramUrl);
  if (!username) {
    return { error: 'invalid_url', message: 'URL Instagram invalide', criteria: getEmptyCriteria() };
  }

  const results = {
    username,
    url: `https://www.instagram.com/${username}/`,
    profileData: null,
    criteria: {}
  };

  // Try Apify first, fallback to manual data
  const apiToken = process.env.APIFY_API_TOKEN;
  let profileData = null;

  if (apiToken) {
    try {
      profileData = await scrapeWithApify(username, apiToken);
      results.profileData = profileData;
    } catch (err) {
      console.error('[instagram-analyzer] Apify error:', err.message);
    }
  }

  // Compute criteria from Apify data or manual fallback
  if (profileData) {
    results.criteria = computeCriteriaFromApify(profileData);
    results.source = 'apify';
  } else if (Object.keys(manualData).length > 0) {
    results.criteria = computeCriteriaFromManual(manualData);
    results.source = 'manual';
  } else {
    results.criteria = getEmptyCriteria();
    results.source = 'none';
    results.error = 'Impossible d\'analyser Instagram (pas de token Apify et pas de données manuelles)';
  }

  return results;
}

// ─── Apify Scraping ──────────────────────────────────────────

async function scrapeWithApify(username, token) {
  const client = new ApifyClient({ token });

  console.log(`[instagram-analyzer] Launching Apify scraper for @${username}...`);

  const run = await client.actor('apify/instagram-profile-scraper').call(
    {
      usernames: [username],
      resultsLimit: 30 // Get last 30 posts for analysis
    },
    {
      timeout: 120, // 2 min timeout
      memory: 512
    }
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (!items || items.length === 0) {
    throw new Error('No data returned from Apify');
  }

  const profile = items[0];

  // Extract and structure the data
  return {
    username: profile.username,
    fullName: profile.fullName || '',
    biography: profile.biography || '',
    followersCount: profile.followersCount || 0,
    followsCount: profile.followsCount || 0,
    postsCount: profile.postsCount || 0,
    isVerified: profile.isVerified || false,
    isBusinessAccount: profile.isBusinessAccount || false,
    profilePicUrl: profile.profilePicUrl || '',
    externalUrl: profile.externalUrl || '',
    highlightReelCount: profile.highlightReelCount || 0,
    latestPosts: (profile.latestPosts || []).map(post => ({
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      timestamp: post.timestamp,
      type: post.type || 'Image', // Image, Video, Sidecar
      caption: (post.caption || '').substring(0, 200)
    }))
  };
}

// ─── Compute Criteria from Apify Data ────────────────────────

function computeCriteriaFromApify(data) {
  const criteria = {};

  // ═══ Followers ═══
  const followers = data.followersCount;
  let followersScore = 0;
  if (followers >= 10000) followersScore = 3;
  else if (followers >= 5000) followersScore = 2.5;
  else if (followers >= 1000) followersScore = 2;
  else if (followers >= 500) followersScore = 1.5;
  else if (followers >= 100) followersScore = 1;
  else followersScore = 0.5;

  criteria.followers = {
    score: Math.round(followersScore),
    max: 3,
    value: followers,
    detail: `${formatNumber(followers)} abonnés`
  };

  // ═══ Engagement Rate ═══
  let avgLikes = 0, avgComments = 0, engagementRate = 0;
  if (data.latestPosts.length > 0 && followers > 0) {
    const totalLikes = data.latestPosts.reduce((sum, p) => sum + p.likesCount, 0);
    const totalComments = data.latestPosts.reduce((sum, p) => sum + p.commentsCount, 0);
    avgLikes = Math.round(totalLikes / data.latestPosts.length);
    avgComments = Math.round(totalComments / data.latestPosts.length);
    engagementRate = ((avgLikes + avgComments) / followers) * 100;
  }

  let engScore = 0;
  if (engagementRate >= 6) engScore = 5;
  else if (engagementRate >= 3) engScore = 4;
  else if (engagementRate >= 2) engScore = 3;
  else if (engagementRate >= 1) engScore = 2;
  else if (engagementRate > 0) engScore = 1;

  criteria.engagement = {
    score: engScore,
    max: 5,
    value: parseFloat(engagementRate.toFixed(2)),
    detail: `Taux d'engagement: ${engagementRate.toFixed(2)}% | Likes moyens: ${formatNumber(avgLikes)} | Commentaires moyens: ${avgComments}`,
    avgLikes,
    avgComments
  };

  // ═══ Posting Frequency ═══
  let postsPerWeek = 0;
  if (data.latestPosts.length >= 2) {
    const timestamps = data.latestPosts
      .map(p => new Date(p.timestamp).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => b - a);

    if (timestamps.length >= 2) {
      const spanDays = (timestamps[0] - timestamps[timestamps.length - 1]) / (1000 * 60 * 60 * 24);
      if (spanDays > 0) {
        postsPerWeek = (timestamps.length / spanDays) * 7;
      }
    }
  }

  let freqScore = 0;
  if (postsPerWeek >= 5) freqScore = 4;
  else if (postsPerWeek >= 3) freqScore = 3;
  else if (postsPerWeek >= 1) freqScore = 2;
  else if (postsPerWeek > 0) freqScore = 1;

  criteria.frequency = {
    score: freqScore,
    max: 4,
    value: parseFloat(postsPerWeek.toFixed(1)),
    detail: `${postsPerWeek.toFixed(1)} publications par semaine`
  };

  // ═══ Content Diversity ═══
  const types = { Image: 0, Video: 0, Sidecar: 0 };
  data.latestPosts.forEach(p => {
    const t = p.type || 'Image';
    if (types[t] !== undefined) types[t]++;
  });
  const totalPosts = data.latestPosts.length || 1;
  const diversityTypes = Object.values(types).filter(v => v > 0).length;
  
  let divScore = 0;
  if (diversityTypes >= 3) divScore = 4;
  else if (diversityTypes === 2) divScore = 2.5;
  else divScore = 1;

  const videoRatio = Math.round((types.Video / totalPosts) * 100);
  const carouselRatio = Math.round((types.Sidecar / totalPosts) * 100);

  criteria.diversity = {
    score: Math.round(divScore),
    max: 4,
    value: diversityTypes,
    detail: `${diversityTypes} types de contenu utilisés | ${videoRatio}% vidéos, ${carouselRatio}% carrousels`,
    breakdown: types
  };

  // ═══ Highlights ═══
  const hasHighlights = data.highlightReelCount > 0;
  criteria.highlights = {
    score: hasHighlights ? 2 : 0,
    max: 2,
    value: data.highlightReelCount,
    detail: hasHighlights ? `${data.highlightReelCount} highlights épinglés` : 'Aucun highlight configuré'
  };

  // ═══ Bio Optimization ═══
  const bio = (data.biography || '').toLowerCase();
  let bioScore = 0;
  const bioChecks = {
    hasLink: !!data.externalUrl,
    hasEmoji: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u.test(data.biography),
    hasCta: ['contact', 'réserv', 'lien', 'link', 'dm', 'devis', 'gratuit', 'offre', '👇', '⬇'].some(kw => bio.includes(kw)),
    hasKeywords: bio.length > 20,
    isBusinessAccount: data.isBusinessAccount
  };

  if (bioChecks.hasLink) bioScore += 1;
  if (bioChecks.hasCta) bioScore += 0.75;
  if (bioChecks.hasKeywords) bioScore += 0.5;
  if (bioChecks.isBusinessAccount) bioScore += 0.75;

  criteria.bio = {
    score: Math.round(Math.min(bioScore, 3)),
    max: 3,
    value: Math.round((bioScore / 3) * 100),
    detail: `Bio: ${data.biography.substring(0, 100)}${data.biography.length > 100 ? '...' : ''}`,
    checks: bioChecks,
    externalUrl: data.externalUrl,
    isBusinessAccount: data.isBusinessAccount
  };

  // ═══ Profile Pic ═══ (bonus, not scored heavily)
  criteria.profilePic = {
    url: data.profilePicUrl,
    fullName: data.fullName
  };

  return criteria;
}

// ─── Compute Criteria from Manual Data ───────────────────────

function computeCriteriaFromManual(data) {
  const criteria = {};
  const followers = parseInt(data.followers) || 0;
  const avgLikes = parseInt(data.avgLikes) || 0;
  const postsPerWeek = parseFloat(data.postsPerWeek) || 0;
  const engagementRate = followers > 0 ? ((avgLikes) / followers) * 100 : 0;

  criteria.followers = {
    score: followers >= 10000 ? 3 : followers >= 1000 ? 2 : followers >= 100 ? 1 : 0,
    max: 3,
    value: followers,
    detail: `${formatNumber(followers)} abonnés (donnée manuelle)`
  };

  criteria.engagement = {
    score: engagementRate >= 3 ? 5 : engagementRate >= 2 ? 3 : engagementRate >= 1 ? 2 : 1,
    max: 5,
    value: parseFloat(engagementRate.toFixed(2)),
    detail: `Taux d'engagement estimé: ${engagementRate.toFixed(2)}%`,
    avgLikes,
    avgComments: 0
  };

  criteria.frequency = {
    score: postsPerWeek >= 3 ? 4 : postsPerWeek >= 1 ? 2 : 1,
    max: 4,
    value: postsPerWeek,
    detail: `${postsPerWeek} publications/semaine (donnée manuelle)`
  };

  criteria.diversity = {
    score: data.usesReels ? 3 : 1,
    max: 4,
    value: data.usesReels ? 2 : 1,
    detail: data.usesReels ? 'Utilise les Reels' : 'Pas d\'utilisation des Reels signalée'
  };

  criteria.highlights = {
    score: data.usesHighlights ? 2 : 0,
    max: 2,
    value: data.usesHighlights ? 1 : 0,
    detail: data.usesHighlights ? 'Highlights utilisés' : 'Highlights non utilisés'
  };

  criteria.bio = {
    score: 1, // Can't assess properly from manual data
    max: 3,
    value: 33,
    detail: 'Bio non analysée (données manuelles)'
  };

  return criteria;
}

// ─── Utilities ───────────────────────────────────────────────

function extractUsername(input) {
  if (!input) return null;
  input = input.trim();

  // Direct username
  if (/^[a-zA-Z0-9._]+$/.test(input)) return input;

  // URL patterns
  const match = input.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  return match ? match[1] : null;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function getEmptyCriteria() {
  return {
    followers: { score: 0, max: 3, value: 0, detail: 'Non analysé' },
    engagement: { score: 0, max: 5, value: 0, detail: 'Non analysé' },
    frequency: { score: 0, max: 4, value: 0, detail: 'Non analysé' },
    diversity: { score: 0, max: 4, value: 0, detail: 'Non analysé' },
    highlights: { score: 0, max: 2, value: 0, detail: 'Non analysé' },
    bio: { score: 0, max: 3, value: 0, detail: 'Non analysé' }
  };
}

module.exports = { analyzeInstagram };

/**
 * Social Media Analyzer
 * Quick checks for presence on Facebook, LinkedIn, TikTok, Google Business
 */

// ─── Main Analysis Function ─────────────────────────────────

async function analyzeSocial(urls) {
  const results = {
    platforms: {},
    totalPresence: 0,
    maxPresence: 5
  };

  const checks = await Promise.allSettled([
    checkPlatform('facebook', urls.facebook),
    checkPlatform('linkedin', urls.linkedin),
    checkPlatform('tiktok', urls.tiktok),
    checkPlatform('google_business', urls.google_business),
    checkPlatform('instagram', urls.instagram)
  ]);

  const platformNames = ['facebook', 'linkedin', 'tiktok', 'google_business', 'instagram'];

  checks.forEach((result, index) => {
    const name = platformNames[index];
    if (result.status === 'fulfilled') {
      results.platforms[name] = result.value;
      if (result.value.exists) results.totalPresence++;
    } else {
      results.platforms[name] = { 
        exists: false, 
        url: urls[name] || '', 
        error: result.reason?.message 
      };
    }
  });

  // Score: presence across multiple platforms
  let presenceScore = 0;
  if (results.totalPresence >= 4) presenceScore = 4;
  else if (results.totalPresence >= 3) presenceScore = 3;
  else if (results.totalPresence >= 2) presenceScore = 2;
  else if (results.totalPresence >= 1) presenceScore = 1;

  results.score = presenceScore;
  results.max = 4;
  results.detail = `Présent sur ${results.totalPresence}/5 plateformes`;

  // Individual platform details
  const presentPlatforms = [];
  const missingPlatforms = [];
  
  const labels = {
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    google_business: 'Google Business Profile',
    instagram: 'Instagram'
  };

  for (const [key, data] of Object.entries(results.platforms)) {
    if (data.exists) {
      presentPlatforms.push(labels[key] || key);
    } else if (urls[key]) {
      missingPlatforms.push(labels[key] || key);
    }
  }

  results.presentPlatforms = presentPlatforms;
  results.missingPlatforms = missingPlatforms;

  return results;
}

// ─── Platform Check ──────────────────────────────────────────

async function checkPlatform(platform, url) {
  if (!url || url.trim() === '') {
    return { exists: false, url: '', provided: false };
  }

  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    });

    // Most social platforms return 200 for existing profiles
    // and redirect or 404 for non-existing ones
    const exists = response.ok || (response.status >= 300 && response.status < 400);

    return {
      exists,
      url,
      provided: true,
      statusCode: response.status
    };
  } catch (err) {
    // Network errors might mean the URL is wrong, but could also be blocking
    // If an URL was provided, give benefit of the doubt
    return {
      exists: true, // Assume exists if URL was provided
      url,
      provided: true,
      error: err.message,
      assumed: true
    };
  }
}

module.exports = { analyzeSocial };

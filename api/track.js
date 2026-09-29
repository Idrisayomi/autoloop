const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.error('Missing META_PIXEL_ID or META_ACCESS_TOKEN environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { event_name, event_id, event_source_url, fbp, fbc, custom_data, email, external_id } = req.body;

    if (!event_name || !event_id) {
      return res.status(400).json({ error: 'event_name and event_id are required' });
    }

    // --- Build user_data from request headers ---
    const clientIp =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress;

    const userAgent = req.headers['user-agent'];

    const userData = {};
    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    // Hash and include email if provided (huge EMQ boost for Purchase events)
    if (email && email.trim()) {
      userData.em = [
        crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
      ];
    }

    // Persistent external_id from browser (consistent across sessions)
    if (external_id) {
      userData.external_id = [
        crypto.createHash('sha256').update(external_id).digest('hex')
      ];
    } else if (clientIp && userAgent) {
      // Fallback: hash IP + UA
      userData.external_id = [
        crypto.createHash('sha256').update(clientIp + userAgent).digest('hex')
      ];
    }

    // --- Geo data from Vercel headers (auto-detected, no user input needed) ---
    const country = req.headers['x-vercel-ip-country'];       // e.g. "NG"
    const city = req.headers['x-vercel-ip-city'];              // e.g. "Lagos"
    const region = req.headers['x-vercel-ip-country-region'];  // e.g. "LA"

    if (country) {
      userData.country = [
        crypto.createHash('sha256').update(country.toLowerCase().trim()).digest('hex')
      ];
    }
    if (city) {
      userData.ct = [
        crypto.createHash('sha256').update(city.toLowerCase().trim().replace(/\s/g, '')).digest('hex')
      ];
    }
    if (region) {
      userData.st = [
        crypto.createHash('sha256').update(region.toLowerCase().trim()).digest('hex')
      ];
    }

    // --- Build event payload ---
    const eventData = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url: event_source_url || '',
      action_source: 'website',
      user_data: userData,
    };

    if (custom_data && Object.keys(custom_data).length > 0) {
      eventData.custom_data = custom_data;
    }

    const payload = {
      data: [eventData],
      // Uncomment the line below with your test code to verify in Meta Events Manager
      // test_event_code: 'TEST77594',
    };

    // --- Send to Meta Conversions API ---
    const metaUrl = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta CAPI error:', JSON.stringify(result));
      return res.status(response.status).json(result);
    }

    return res.status(200).json({ success: true, ...result });

  } catch (error) {
    console.error('CAPI handler error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

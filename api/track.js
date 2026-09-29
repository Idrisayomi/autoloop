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
    const { event_name, event_id, event_source_url, fbp, fbc, custom_data, email } = req.body;

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

    // Generate a hashed external_id from IP + UA for consistent user matching
    // (not PII — just a stable pseudonymous identifier for this visitor)
    if (clientIp && userAgent) {
      userData.external_id = [
        crypto.createHash('sha256').update(clientIp + userAgent).digest('hex')
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

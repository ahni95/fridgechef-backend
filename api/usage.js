const { getUsage } = require('../src/usageStore');
const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '3');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const deviceId = req.headers['x-device-id'];
  const appSecret = req.headers['x-app-secret'];

  if (!deviceId || appSecret !== process.env.APP_SECRET)
    return res.status(401).json({ error: 'Non autorisé' });

  const used = getUsage(deviceId);
  res.json({ used, remaining: Math.max(0, FREE_DAILY_LIMIT - used), limit: FREE_DAILY_LIMIT });
};

// Stockage en mémoire des quotas journaliers.
// En production, remplacez par Redis ou une base de données.
const usageMap = new Map();

function getTodayKey(deviceId) {
  const today = new Date().toISOString().split('T')[0];
  return `${deviceId}:${today}`;
}

function getUsage(deviceId) {
  return usageMap.get(getTodayKey(deviceId)) || 0;
}

function incrementUsage(deviceId) {
  const key = getTodayKey(deviceId);
  const current = usageMap.get(key) || 0;
  usageMap.set(key, current + 1);
  // Nettoyage des entrées d'hier pour éviter les fuites mémoire
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  for (const k of usageMap.keys()) {
    if (k.includes(yesterday)) usageMap.delete(k);
  }
  return current + 1;
}

module.exports = { getUsage, incrementUsage };

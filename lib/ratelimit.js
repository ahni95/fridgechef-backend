// Limite quotidienne par appareil, stockee dans Upstash Redis (REST API).
// Si Upstash n'est pas configure, on laisse passer (fail-open) avec un avertissement,
// pour ne pas bloquer le developpement local.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "3", 10);
// Marge de securite meme pour les abonnes Premium (anti-abus / bots).
const PREMIUM_DAILY_LIMIT = parseInt(process.env.PREMIUM_DAILY_LIMIT || "30", 10);

function todayKey(deviceId) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `fc:usage:${deviceId}:${date}`;
}

async function redisCommand(command) {
  const resp = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REDIS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!resp.ok) {
    throw new Error(`Upstash a renvoye ${resp.status}`);
  }
  const data = await resp.json();
  return data.result;
}

/**
 * Lit le nombre d'utilisations du jour sans l'incrementer.
 * @returns {Promise<{used:number, limit:number, remaining:number, premium:boolean, enforced:boolean}>}
 */
export async function checkUsage(deviceId, isPremium) {
  const limit = isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (!REDIS_URL || !REDIS_TOKEN) {
    // Pas de stockage configure : on ne peut pas compter -> on laisse passer.
    console.warn("[ratelimit] Upstash non configure : limite non appliquee.");
    return { used: 0, limit, remaining: limit, premium: isPremium, enforced: false };
  }

  const key = todayKey(deviceId);
  const current = parseInt((await redisCommand(["GET", key])) || "0", 10);
  return {
    used: current,
    limit,
    remaining: Math.max(0, limit - current),
    premium: isPremium,
    enforced: true,
  };
}

/**
 * Incremente le compteur du jour apres une generation reussie.
 * Pose une expiration de 2 jours pour nettoyer automatiquement.
 */
export async function recordUsage(deviceId) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  const key = todayKey(deviceId);
  const count = await redisCommand(["INCR", key]);
  if (count === 1) {
    // Premiere utilisation du jour : pose l'expiration (172800 s = 2 jours).
    await redisCommand(["EXPIRE", key, "172800"]);
  }
}

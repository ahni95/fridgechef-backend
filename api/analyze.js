// Endpoint principal : POST /api/analyze
// Recoit jusqu'a 4 photos, detecte les ingredients et genere des recettes.

import { generateRecipes } from "../lib/gemini.js";
import { checkUsage, recordUsage } from "../lib/ratelimit.js";
import { verifyPremium } from "../lib/premium.js";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // ~4 Mo par image en base64

function send(res, status, payload) {
  res.status(status).setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, { error: "method_not_allowed" });
  }

  // 1. Authentification app <-> backend.
  const appSecret = process.env.APP_SECRET;
  if (appSecret) {
    const provided = req.headers["x-app-secret"];
    if (provided !== appSecret) {
      return send(res, 401, { error: "unauthorized" });
    }
  }

  // 2. Lecture et validation du corps.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, { error: "invalid_json" });
    }
  }
  if (!body || typeof body !== "object") {
    return send(res, 400, { error: "invalid_body" });
  }

  const { deviceId, images, language, purchaseToken, productId, packageName } = body;

  if (!deviceId || typeof deviceId !== "string") {
    return send(res, 400, { error: "missing_device_id" });
  }
  if (!Array.isArray(images) || images.length === 0) {
    return send(res, 400, { error: "no_images" });
  }
  if (images.length > MAX_IMAGES) {
    return send(res, 400, { error: "too_many_images", max: MAX_IMAGES });
  }
  for (const img of images) {
    if (typeof img !== "string" || img.length === 0) {
      return send(res, 400, { error: "invalid_image" });
    }
    // Longueur base64 approximative -> taille en octets.
    if ((img.length * 3) / 4 > MAX_IMAGE_BYTES) {
      return send(res, 400, { error: "image_too_large", maxBytes: MAX_IMAGE_BYTES });
    }
  }

  try {
    // 3. Statut Premium (false tant que Google Play n'est pas configure).
    const isPremium = await verifyPremium({ purchaseToken, productId, packageName });

    // 4. Verification du quota quotidien.
    const usage = await checkUsage(deviceId, isPremium);
    if (usage.enforced && usage.remaining <= 0) {
      return send(res, 429, {
        error: "daily_limit_reached",
        usage,
      });
    }

    // 5. Generation des recettes via Gemini.
    const result = await generateRecipes(images, { language, recipeCount: 3 });

    // 6. On ne decompte que si une vraie recette a ete produite.
    if (result.recipes.length > 0) {
      await recordUsage(deviceId);
    }

    const after = {
      used: usage.used + (result.recipes.length > 0 ? 1 : 0),
      limit: usage.limit,
      remaining: Math.max(
        0,
        usage.limit - (usage.used + (result.recipes.length > 0 ? 1 : 0))
      ),
      premium: usage.premium,
      enforced: usage.enforced,
    };

    return send(res, 200, {
      detectedIngredients: result.detectedIngredients,
      recipes: result.recipes,
      usage: after,
    });
  } catch (err) {
    console.error("[analyze] erreur:", err);
    if (err.code === "config") {
      return send(res, 500, { error: "server_misconfigured" });
    }
    if (err.code === "gemini" || err.code === "gemini_empty" || err.code === "parse") {
      return send(res, 502, { error: "ai_error", detail: err.message });
    }
    return send(res, 500, { error: "internal_error" });
  }
}

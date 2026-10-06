// Appel a l'API Gemini pour detecter les ingredients et generer des recettes.
// Utilise fetch natif (Node 18+) : aucune dependance npm.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Schema de sortie : on force Gemini a renvoyer un JSON parsable sans surprise.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    detectedIngredients: {
      type: "array",
      items: { type: "string" },
    },
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          cookingTimeMinutes: { type: "integer" },
          difficulty: { type: "string" }, // facile | moyen | difficile
          servings: { type: "integer" },
          ingredients: {
            type: "array",
            items: { type: "string" },
          },
          steps: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title", "ingredients", "steps"],
      },
    },
  },
  required: ["detectedIngredients", "recipes"],
};

function buildPrompt(language, recipeCount) {
  const lang = language === "en" ? "anglais" : language === "ar" ? "arabe" : "francais";
  return [
    `Tu es un chef cuisinier. Regarde la ou les photos d'un refrigerateur / de produits alimentaires.`,
    `1. Identifie precisement les ingredients visibles.`,
    `2. Propose ${recipeCount} recettes realistes utilisant principalement ces ingredients.`,
    `Pour chaque recette : un titre, une courte description, le temps de cuisson en minutes,`,
    `la difficulte (facile, moyen ou difficile), le nombre de portions, la liste des ingredients`,
    `avec quantites, et les etapes claires et numerotables.`,
    `Reponds entierement en ${lang}.`,
    `Si aucun aliment n'est visible, renvoie detectedIngredients vide et recipes vide.`,
  ].join(" ");
}

/**
 * @param {string[]} images  tableau de chaines base64 (sans prefixe data:)
 * @param {object} opts  { language, recipeCount }
 * @returns {Promise<{detectedIngredients: string[], recipes: object[]}>}
 */
export async function generateRecipes(images, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY manquante");
    err.code = "config";
    throw err;
  }

  const language = opts.language || "fr";
  const recipeCount = opts.recipeCount || 3;

  const parts = [{ text: buildPrompt(language, recipeCount) }];
  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: img,
      },
    });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Desactive le "thinking" pour reduire le cout (tokens de sortie).
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const url = `${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Gemini a renvoye ${resp.status}: ${text.slice(0, 500)}`);
    err.code = "gemini";
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();

  // Verifie un eventuel blocage de securite.
  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason || "aucune reponse";
    const err = new Error(`Gemini n'a pas renvoye de recette (${reason})`);
    err.code = "gemini_empty";
    throw err;
  }

  const rawText = candidate.content?.parts?.map((p) => p.text).join("") || "";
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const err = new Error("Reponse Gemini non parsable en JSON");
    err.code = "parse";
    throw err;
  }

  return {
    detectedIngredients: Array.isArray(parsed.detectedIngredients)
      ? parsed.detectedIngredients
      : [],
    recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
  };
}

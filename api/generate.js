const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getUsage, incrementUsage } = require('../src/usageStore');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '3');

const RECIPE_PROMPT = `Analyse ces photos de réfrigérateur ou d'ingrédients et génère UNE recette délicieuse.

Réponds EXACTEMENT dans ce format :
TITRE: [nom de la recette]
DESCRIPTION: [courte description appétissante en 1 phrase]
TEMPS: [temps de préparation, ex: 25 min]
DIFFICULTÉ: [Facile, Moyen, ou Difficile]

INGRÉDIENTS:
- [ingrédient 1 avec quantité]
- [ingrédient 2 avec quantité]

ÉTAPES:
1. [étape 1]
2. [étape 2]

Utilise uniquement les ingrédients visibles dans les photos. Réponds en français.`;

function parseRecipe(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let title = '', description = '', prepTime = '30 min', difficulty = 'Facile';
  const ingredients = [], steps = [];
  let section = '';
  for (const line of lines) {
    if (line.toLowerCase().startsWith('titre:')) { title = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('description:')) { description = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('temps:')) { prepTime = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('difficulté:') || line.toLowerCase().startsWith('difficulte:')) { difficulty = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.match(/ingrédients?:/i)) { section = 'ingredients'; continue; }
    if (line.match(/étapes?:|préparation:|instructions?:/i)) { section = 'steps'; continue; }
    if ((line.startsWith('-') || line.startsWith('•')) && section === 'ingredients') ingredients.push(line.replace(/^[-•]\s*/, ''));
    else if (line.match(/^\d+\./) && section === 'steps') steps.push(line.replace(/^\d+\.\s*/, ''));
  }
  return {
    title: title || 'Recette FridgeChef',
    description: description || 'Recette générée par IA',
    prepTime, difficulty,
    ingredients: ingredients.length ? ingredients : ['Voir la recette complète'],
    steps: steps.length ? steps : [rawText]
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const deviceId = req.headers['x-device-id'] || 'anonymous';
  const isPremium = req.headers['x-is-premium'] === 'true';

  const { images, mediaType = 'image/jpeg' } = req.body || {};
  const imageList = images || (req.body?.imageBase64 ? [{ data: req.body.imageBase64, mediaType: req.body.mediaType || mediaType }] : null);
  if (!imageList || imageList.length === 0) return res.status(400).json({ error: 'Image(s) manquante(s)' });
  if (imageList.length > 4) return res.status(400).json({ error: 'Maximum 4 images' });

  if (!isPremium) {
    const usage = getUsage(deviceId);
    if (usage >= FREE_DAILY_LIMIT) {
      return res.status(429).json({ error: 'limit_reached', message: `Limite de ${FREE_DAILY_LIMIT} recettes/jour atteinte. Passez à Premium !`, remaining: 0 });
    }
  }

  try {
    const imageParts = imageList.map(img => ({
      inlineData: {
        data: img.data,
        mimeType: img.mediaType || 'image/jpeg'
      }
    }));

    const result = await model.generateContent([...imageParts, RECIPE_PROMPT]);
    const rawText = result.response.text();

    const recipe = parseRecipe(rawText);
    if (!isPremium) incrementUsage(deviceId);
    const remaining = isPremium ? 999 : Math.max(0, FREE_DAILY_LIMIT - getUsage(deviceId));

    res.json({ success: true, recipe, remaining });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
};

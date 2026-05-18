const Anthropic = require('@anthropic-ai/sdk');
const { getUsage, incrementUsage } = require('../src/usageStore');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '3');
const APP_SECRET = process.env.APP_SECRET || 'fridgechef2026';

const RECIPE_PROMPT = `Analyse cette photo de réfrigérateur ou d'ingrédients et génère UNE recette délicieuse.

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

Utilise uniquement les ingrédients visibles dans la photo. Réponds en français.`;

function parseRecipe(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let title = '', description = '', prepTime = '30 min', difficulty = 'Facile';
  const ingredients = [], steps = [];
  let section = '';

  for (const line of lines) {
    if (line.toLowerCase().startsWith('titre:')) { title = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('description:')) { description = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('temps:')) { prepTime = line.split(':').slice(1).join(':').trim(); continue; }
    if (line.toLowerCase().startsWith('difficulté:') || line.toLowerCase().startsWith('difficulte:')) {
      difficulty = line.split(':').slice(1).join(':').trim(); continue;
    }
    if (line.match(/ingrédients?:/i)) { section = 'ingredients'; continue; }
    if (line.match(/étapes?:|préparation:|instructions?:/i)) { section = 'steps'; continue; }
    if ((line.startsWith('-') || line.startsWith('•')) && section === 'ingredients')
      ingredients.push(line.replace(/^[-•]\s*/, ''));
    else if (line.match(/^\d+\./) && section === 'steps')
      steps.push(line.replace(/^\d+\.\s*/, ''));
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
  const appSecret = req.headers['x-app-secret'] || '';

  // Vérification du secret
  if (appSecret !== APP_SECRET) {
    console.error(`Secret mismatch — reçu: "${appSecret}", attendu: "${APP_SECRET}"`);
    return res.status(401).json({ error: 'Non autorisé', hint: 'Secret invalide' });
  }

  const { imageBase64, mediaType = 'image/jpeg' } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Image manquante' });

  if (!isPremium) {
    const usage = getUsage(deviceId);
    if (usage >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        error: 'limit_reached',
        message: `Limite de ${FREE_DAILY_LIMIT} recettes/jour atteinte. Passez à Premium !`,
        remaining: 0
      });
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: RECIPE_PROMPT }
        ]
      }]
    });

    const rawText = response.content[0]?.text || '';
    const recipe = parseRecipe(rawText);
    if (!isPremium) incrementUsage(deviceId);
    const remaining = isPremium ? 999 : Math.max(0, FREE_DAILY_LIMIT - getUsage(deviceId));

    res.json({ success: true, recipe, remaining });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
};

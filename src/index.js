require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const recipeRoute = require('./recipeRoute');

const app = express();
const PORT = process.env.PORT || 3000;

// Sécurité
app.use(helmet());
app.use(cors({ origin: false })); // Pas de CORS browser — app mobile uniquement

// Limite globale : 100 requêtes / 15 min par IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes' }
}));

app.use(express.json({ limit: '15mb' }));

// Routes
app.use('/api', recipeRoute);

app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Vérification au démarrage
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERREUR: ANTHROPIC_API_KEY manquante dans .env');
  process.exit(1);
}
if (!process.env.APP_SECRET) {
  console.error('ERREUR: APP_SECRET manquante dans .env');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`FridgeChef Backend démarré sur le port ${PORT}`);
  console.log(`Limite gratuite : ${process.env.FREE_DAILY_LIMIT || 3} recettes/jour`);
});

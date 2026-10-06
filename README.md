# FridgeChef AI - Backend

Backend serverless (Vercel) qui detecte les ingredients sur des photos de frigo
et genere des recettes via **Gemini 3.1 Flash-Lite**.

Modele economique : **3 recettes gratuites par jour**, puis abonnement Premium (2,99 EUR/mois).

## Architecture

```
api/
  analyze.js    POST  -> detecte ingredients + genere 3 recettes
  health.js     GET   -> etat du service et config
lib/
  gemini.js     appel API Gemini (JSON structure garanti)
  ratelimit.js  limite quotidienne par appareil (Upstash Redis)
  premium.js    verification Premium Google Play (desactivee par defaut)
```

Aucune dependance npm : tout utilise `fetch` natif (Node 18+).

## API

### POST /api/analyze

En-tetes :
- `content-type: application/json`
- `x-app-secret: <APP_SECRET>` (si APP_SECRET est defini)

Corps :
```json
{
  "deviceId": "uuid-de-l-appareil",
  "images": ["<base64 sans prefixe data:>", "..."],
  "language": "fr",
  "purchaseToken": "optionnel (Premium)",
  "productId": "optionnel"
}
```

Reponse 200 :
```json
{
  "detectedIngredients": ["oeufs", "tomates", "fromage"],
  "recipes": [
    {
      "title": "Omelette aux tomates",
      "description": "...",
      "cookingTimeMinutes": 15,
      "difficulty": "facile",
      "servings": 2,
      "ingredients": ["3 oeufs", "2 tomates", "..."],
      "steps": ["Battre les oeufs", "..."]
    }
  ],
  "usage": { "used": 1, "limit": 3, "remaining": 2, "premium": false, "enforced": true }
}
```

Erreurs : `401 unauthorized`, `400 no_images` / `too_many_images` / `image_too_large`,
`429 daily_limit_reached`, `502 ai_error`, `500 server_misconfigured`.

## Variables d'environnement

Voir `.env.example`. Les essentielles :

| Variable | Role | Obligatoire |
|---|---|---|
| `GEMINI_API_KEY` | Cle Gemini (aistudio.google.com/apikey) | Oui |
| `APP_SECRET` | Secret app <-> backend | Oui (prod) |
| `FREE_DAILY_LIMIT` | Recettes gratuites/jour (defaut 3) | Non |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Compteur quotidien | Oui (pour appliquer la limite) |

Sans Upstash, le backend fonctionne mais **n'applique pas** la limite (fail-open, utile en dev).

## Deploiement sur Vercel

1. Pousser ce dossier sur un depot Git.
2. Importer le projet dans Vercel.
3. Ajouter l'integration **Upstash Redis** (Storage) -> cree automatiquement les deux variables Upstash.
4. Renseigner `GEMINI_API_KEY`, `APP_SECRET`, `FREE_DAILY_LIMIT=3` dans les variables d'environnement.
5. Deployer, puis tester `GET /api/health`.

## Test rapide

```bash
curl -X POST https://<ton-projet>.vercel.app/api/analyze \
  -H "content-type: application/json" \
  -H "x-app-secret: <APP_SECRET>" \
  -d '{"deviceId":"test-123","images":["<base64>"],"language":"fr"}'
```

## Premium (a faire plus tard)

`lib/premium.js` renvoie toujours `false` pour l'instant : la limite gratuite
s'applique a tout le monde. Pour activer le Premium, il faut configurer un compte
de service Google Play et implementer `purchases.subscriptionsv2.get`. On ne fait
jamais confiance a un simple drapeau envoye par l'app (falsifiable).

## Cout estime

Avec Gemini 3.1 Flash-Lite : ~0,003 $ par analyse (4 photos + 3 recettes).
Un utilisateur gratuit a fond coute au max ~0,27 $/mois ; un abonne rapporte ~2 EUR net.
Pense a fixer un plafond de depenses dans Google Cloud (ex. 10 $/mois).

// Verification du statut Premium via Google Play Billing.
//
// IMPORTANT : tant que la verification Google Play n'est pas configuree,
// cette fonction renvoie toujours false. Autrement dit, la limite gratuite
// (3 recettes/jour) s'applique a tout le monde. C'est le comportement SUR :
// on ne fait jamais confiance a un simple drapeau envoye par l'app, qui serait
// facile a falsifier.
//
// Pour activer le Premium reellement, il faudra :
//   1. Creer un compte de service Google Cloud avec acces a la Google Play
//      Developer API, et le lier a la Play Console.
//   2. Stocker ses identifiants dans une variable d'environnement
//      (ex. GOOGLE_PLAY_SERVICE_ACCOUNT, un JSON).
//   3. Appeler l'endpoint purchases.subscriptionsv2.get pour verifier que le
//      purchaseToken est valide et l'abonnement actif.
//
// La structure ci-dessous est prete a accueillir cette logique.

/**
 * @param {object} params { purchaseToken, productId, packageName }
 * @returns {Promise<boolean>} true si l'abonnement est verifie et actif
 */
export async function verifyPremium({ purchaseToken } = {}) {
  if (!purchaseToken) return false;

  const configured = !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!configured) {
    console.warn(
      "[premium] Verification Google Play non configuree : Premium ignore pour le moment."
    );
    return false;
  }

  // TODO : implementer l'appel a purchases.subscriptionsv2.get.
  // Pour l'instant, meme configure, on reste prudent et on renvoie false
  // jusqu'a ce que la verification soit reellement codee et testee.
  return false;
}

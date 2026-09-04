const fs = require('fs');
const path = require('path');

/**
 * Reglages par defaut de Shoulder Surfing Reloaded, poses au premier lancement.
 *
 * Deux choix qui ne sont pas ceux du mod :
 *  - `max_offset_z = 15` : le mod plafonne le recul a 5 blocs, a peine plus que le F5 vanilla,
 *    ce qui ne suffit pas pour voir un navire ou une monture en entier ;
 *  - `replace_default_perspective = true` : sinon la vue du mod s'AJOUTE au cycle de F5 et il
 *    faut trois appuis pour l'atteindre ;
 *  - `adjust_player_transparency = false` : le mod estompe le joueur quand la vue est obstruee,
 *    mais avec Iris et un shader ce rendu ne passe pas et le corps devient carrement invisible.
 *
 * Le fichier complet n'est pas ecrit : le mod remplit lui-meme les cles manquantes au premier
 * demarrage. On ne touche a rien si le joueur a deja son fichier - ses reglages priment.
 */
const DEFAULT_CONFIG = `[camera]

	[camera.offset]
		offset_z = 6.0

		[camera.offset.max]
			max_offset_z = 15.0

[player]
	adjust_player_transparency = false

[perspective]
	default_perspective = "SHOULDER_SURFING"
	replace_default_perspective = true
`;

function ensureShoulderSurfingDefault(gameDir) {
  const configDir = path.join(gameDir, 'config');
  const configFile = path.join(configDir, 'shouldersurfing-client.toml');

  // Ne jamais ecraser le choix d'un joueur apres sa premiere configuration.
  if (fs.existsSync(configFile)) return false;

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, DEFAULT_CONFIG, 'utf8');
  return true;
}

module.exports = {
  DEFAULT_CONFIG,
  ensureShoulderSurfingDefault
};

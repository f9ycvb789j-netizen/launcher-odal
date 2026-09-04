# OdalPaper Launcher

Copie du launcher Odal (`launcher-odal-propre/`, Forge 1.20.1) adaptée au **serveur Paper
1.21.4 d'essai** (`7022.mystrator.com:27424`). L'autre launcher n'est pas touché : les deux
s'installent côte à côte chez un joueur (dossier de jeu `.odalpaper`, appId
`gg.odal.odalpaper`, fichier de mise à jour `version-odalpaper.json` sur le site).

## Ce qui change

| | Odal Launcher (Forge) | OdalPaper Launcher |
|---|---|---|
| Serveur | `odal.minesr.com:25565` | `7022.mystrator.com:27424` |
| Minecraft / loader | 1.20.1 / Forge 47.4.18 | 1.21.4 / **NeoForge 21.4.157** |
| Java | 17 (Temurin) | **21** (Temurin, vérifié par `-version`) |
| Dossier de jeu | `%APPDATA%\.odal` | `%APPDATA%\.odalpaper` |
| Mods | 34 (gameplay + interface) | **28, client seulement** |
| Mods maison épinglés | GUI + compagnon (SHA-256) | islandfactionsgui 2.0.0 + odalcompanion 1.0.0 (`REQUIRED_MODS`) |

NeoForge est installé par MCLC via ForgeWrapper 1.6.0 (option `forge:` avec l'installateur
NeoForge) : vérifié le 27/08/2026, le jeu atteint l'écran titre en ~90 s au premier lancement.

## Mods client (mods-pack/, NeoForge 1.21.4)

CustomSkinLoader 14.27-ForgeV3 (la 15.0.1 « Universal » plante sur NeoForge 1.21.4),
Distant Horizons 3.2.0, Forgematica 0.4.4 + MaFgLib (remplace Litematica), GeckoLib 4.8.5,
JEI 20.0.0.4, Iris 1.8.8 (remplace Oculus), Sodium 0.6.13 (remplace Embeddium),
playerAnimator 2.0.5, Simple Voice Chat 2.6.22, Xaero Minimap 26.4.2 + World Map 1.45.0,
YACL 3.8.2.

### Packs de ressources livrés (resourcepacks-pack/)

`FreshAnimations_v1.10.4.zip`, `HyperPunchy-v2.5+.zip` et **`OdalAnimations.zip`** (29/08).

Ce dernier porte les textures animées complètes des objets Ragnarok (jusqu'à 30 images :
marteau de Thor, épée de Loki, casques). Nexo refuse d'héberger toute texture de plus de
512 px et ne fait pas d'exception pour les bandes d'animation ; ces neuf fichiers ont donc
été **retirés du pack serveur** et sont fournis par le launcher. Le pack serveur étant
prioritaire côté client, c'est le seul montage possible — mais cela veut dire qu'un joueur
qui se connecterait sans ce launcher verrait ces six objets sans texture. Les bandes
d'origine sont conservées dans `paper/packs-recus/ragnarok-relics/`.

Confort (27/08, tous sans canal réseau obligatoire) : Not Enough Animations, Entity Model/Texture
Features + pack **Fresh Animations** (resourcepacks-pack/, activé par `resource-packs.js`), 3D Skin
Layers, Wavey Capes, Chat Heads, Particle Rain, Shoulder Surfing Reloaded 4.12.0, First Person Model, Smooth Swapping, AmbientSounds (+ CreativeCore).
**Better Third Person retiré le 29/08**, remplacé par **Shoulder Surfing Reloaded** : BTP ne gère que
la rotation de la caméra, pas sa distance, et le dézoom manquait pour piloter un navire. Shoulder
Surfing déclare d'ailleurs `betterthirdperson`, `camerautils`, `nimble` et `customcameraview` comme
incompatibles — les garder ensemble se serait mal passé. Jar d'origine conservé dans
`paper/notes/anciens-mods/`.

Camera Overhaul retiré le 27/08 : ses rotations de caméra combinées au TAA des shaders
(Complementary) laissent des traînées sur tout le rendu. **GeckoLib est exclu** : sa version NeoForge enregistre un canal réseau obligatoire et NeoForge
refuse alors tout serveur non-NeoForge (« not running NeoForge… ») — plus rien n'en a besoin.

Retirés (gameplay ou serveur, remplacés par des plugins Paper / MythicMobs) : TaCZ et
JagTaCZArmor, Alex's Mobs + Citadel, SimpleOres/Netherrocks/SimpleCoreLib, Immersive
Aircraft, Small Ships, Dawn of Time Builder, Easy NPC, yo_hooks, bucketlib, architectury,
Punchy + HyperPunchy (pas de 1.21.4), OdalAirways, OdalDrapeau, OdalMaquette,
OdalTaCZSchematics. « ModelEngine Client Optimization » 1.1.0 exige 1.21.11+ : à reprendre
quand une build 1.21.4 existera.

**Mods maison** : portés le 27/08 dans `paper/mods-neoforge/` (IslandFactionsGUI 2.0.0, OdalCompanion 1.0.0 client) et épinglés dans `REQUIRED_MODS`. Après recompilation d'un jar : le copier dans `mods-pack/`, mettre à jour son SHA-256 dans `main.js`, puis **relancer le launcher** (les empreintes sont lues au démarrage).

## Utiliser

- `Lancer.bat` : test local (Electron).
- `node test-packaging.js` : garde-fou avant publication (manifeste = pack, aucun mod
  1.20.1/serveur, dossier `.odalpaper`, mods épinglés présents et conformes).
- `Publier.bat` : push → CI GitHub (`.github/workflows/build.yml`), dépôt **à créer**
  (`launcher-odalpaper`) ; puis publier `version-odalpaper.json` sur odalmc.fr.
  Ne rien publier sans feu vert.

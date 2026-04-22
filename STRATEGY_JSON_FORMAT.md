# Référence du format JSON — stratégies PMX-CORTEX

> Document de référence du format JSON utilisé pour :
> - La stratégie (`strategyPMX0.json` — **un seul fichier côté bleu**)
> - La définition de la table (`table.json`)
> - L'initialisation du robot (`initBig.json`, `initSmall.json`)
>
> **Convention PMX single-color** : la stratégie est écrite uniquement pour le
> côté bleu (`color0`). Le miroir couleur est appliqué automatiquement par
> l'Asserv C++ (`changeMatchX`, `changeMatchAngleRad`) quand le robot est jaune.
> Pas de fichier `strategyBig3000.json`.
>
> Pour la motivation et l'architecture, voir [STRATEGY_JSON_EXECUTION.md](STRATEGY_JSON_EXECUTION.md).

> **Format de référence = EsialRobotik Ia-Python 2026** (format *structuré*
> avec `type`/`subtype` explicites, au lieu du vieux format `command#args`
> de PrincessViewer).
> Réf. : https://github.com/EsialRobotik/Ia-Python
>
> **Nommage des subtypes = calqué 1:1 sur les méthodes `Navigator` C++**
> (camelCase → UPPER_SNAKE_CASE), pour traçabilité directe code ↔ JSON.

---

## 1. Conventions générales

### Unités

- **Distances** : millimètres (mm)
- **Angles (JSON)** : **degrés** (lisibilité humaine) — convertis en rad par le runner C++
- **Temps** : millisecondes (ms)

### Système de coordonnées PMX

- `X` horizontal : 0 → 3000 mm
- `Y` vertical : 0 → 2000 mm, 0 en bas
- Origine (0, 0) : coin bas-gauche

### Couleurs

- `color0` = bleu = **couleur primaire** : c'est dans ce repère qu'on écrit la stratégie
- `color3000` = jaune = **couleur miroir** : positions calculées automatiquement par l'Asserv
  à partir de color0 via `x → 3000 - x` et `theta → π - theta`

On n'écrit **jamais** la stratégie en coordonnées jaunes. Le C++ s'en occupe.

### Position initiale du robot

**Il n'y a pas de task `start` dans la stratégie.** La pose initiale est
définie dans un fichier séparé `initBig.json` (voir §6), chargée au démarrage
par le runner et par le simulateur. La stratégie commence directement avec
la première vraie task.

---

## 2. Format `strategyPMX0.json` — STRUCTURE

### 2.1 Vue d'ensemble

Array d'**instructions**. Chaque instruction contient une liste ordonnée de
**tasks** exécutées séquentiellement.

```json
[
  {
    "id": 1,
    "desc": "Ramassage caisse centre",
    "tasks": [
      { "type": "MOVEMENT", "subtype": "PATH_TO", "position_x": 1500, "position_y": 1000 },
      { "type": "MOVEMENT", "subtype": "FACE_TO", "position_x": 1500, "position_y": 800 },
      { "type": "MANIPULATION", "action_id": "ouvrir_pinces", "timeout": 2000 },
      { "type": "MOVEMENT", "subtype": "LINE", "dist": 100 },
      { "type": "MANIPULATION", "action_id": "fermer_pinces", "timeout": 2000 },
      { "type": "MOVEMENT", "subtype": "LINE", "dist": -150 }
    ]
  }
]
```

### 2.2 Champs d'une instruction

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `tasks` | array | **oui** | Liste ordonnée des tasks |
| `id` | int | recommandé | Identifiant unique (logs, debug) |
| `desc` | string | recommandé | Description humaine |
| `points` | int | optionnel | Points attendus si succès (pour la couche décision) |
| `priority` | int/float | optionnel | Priorité (plus élevé = choisi en premier) |
| `estimatedDurationSec` | float | optionnel | Durée estimée pour gestion du temps restant |
| `needed_flag` | string | optionnel | Instruction skippée si ce flag n'est pas actif |
| `action_flag` | string | optionnel | Flag levé après succès de l'instruction |
| `clear_flags` | array<string> | optionnel | Flags à effacer après succès |

Voir §3 pour la sémantique des flags.

### 2.3 Champs d'une task

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `type` | string | **oui** | `MOVEMENT`, `MANIPULATION`, `ELEMENT`, `SPEED`, `WAIT` |
| `subtype` | string | obligatoire si `type=MOVEMENT` ou `type=ELEMENT` | Voir §2.4-§2.8 |
| `desc` | string | optionnel | Description humaine (affichée dans simu) |
| `timeout` | int | optionnel | Timeout max en ms (-1 = pas de timeout, défaut -1) |
| `needed_flag` | string | optionnel | Task skippée si ce flag n'est pas actif |

Les autres champs dépendent du couple `(type, subtype)`.

### 2.4 MOVEMENT — Primitives (13)

Les noms sont calqués sur les méthodes `Navigator` C++
(cf. [Navigator.cpp](../src/common/navigator/Navigator.cpp)).

| Subtype | Champs JSON | Navigator C++ | Simu (couleur) |
|---|---|---|---|
| `LINE` | `dist` (mm, signé) | `line(dist)` | bleu si ≥0, orange si <0 |
| `GO_TO` | `position_x`, `position_y` | `goTo(x,y)` | cyan |
| `GO_BACK_TO` | `position_x`, `position_y` | `goBackTo(x,y)` | cyan pointillé |
| `MOVE_FORWARD_TO` | `position_x`, `position_y` | `moveForwardTo(x,y)` | bleu clair |
| `MOVE_BACKWARD_TO` | `position_x`, `position_y` | `moveBackwardTo(x,y)` | orange clair |
| `ROTATE_DEG` | `angle_deg` (relatif) | `rotateDeg(deg)` | pas de trait |
| `ROTATE_ABS_DEG` | `angle_deg` (absolu) | `rotateAbsDeg(deg)` | pas de trait |
| `FACE_TO` | `position_x`, `position_y` | `faceTo(x,y)` | pas de trait |
| `FACE_BACK_TO` | `position_x`, `position_y` | `faceBackTo(x,y)` | pas de trait |
| `ORBITAL_TURN_DEG` | `angle_deg`, `forward` (bool), `turn_right` (bool) | `orbitalTurnDeg(deg, fwd, right)` | arc orbital |
| `PATH_TO` | `position_x`, `position_y` | `pathTo(x,y)` | **rose (A*)** |
| `PATH_BACK_TO` | `position_x`, `position_y` | `pathBackTo(x,y)` | rose pointillé |
| `MANUAL_PATH` | `waypoints: [[x,y], ...]` | `manualPath(wps)` | rose polyligne |

### 2.5 MOVEMENT — Composites (12)

Enchaîne un déplacement suivi d'une rotation, **abort si le déplacement échoue**
(la rotation n'est pas tentée).

| Subtype | Champs JSON | Navigator C++ |
|---|---|---|
| `GO_TO_AND_ROTATE_ABS_DEG` | `position_x`, `position_y`, `final_angle_deg` | `goToAndRotateAbsDeg(x,y,θ)` |
| `GO_TO_AND_ROTATE_REL_DEG` | `position_x`, `position_y`, `rotate_rel_deg` | `goToAndRotateRelDeg(x,y,deg)` |
| `GO_TO_AND_FACE_TO` | `position_x`, `position_y`, `face_x`, `face_y` | `goToAndFaceTo(x,y,fx,fy)` |
| `GO_TO_AND_FACE_BACK_TO` | `position_x`, `position_y`, `face_x`, `face_y` | `goToAndFaceBackTo(x,y,fx,fy)` |
| `MOVE_FORWARD_TO_AND_ROTATE_ABS_DEG` | idem GO_TO_AND_ROTATE_ABS_DEG | `moveForwardToAndRotateAbsDeg(...)` |
| `MOVE_FORWARD_TO_AND_ROTATE_REL_DEG` | idem GO_TO_AND_ROTATE_REL_DEG | `moveForwardToAndRotateRelDeg(...)` |
| `MOVE_FORWARD_TO_AND_FACE_TO` | idem GO_TO_AND_FACE_TO | `moveForwardToAndFaceTo(...)` |
| `MOVE_FORWARD_TO_AND_FACE_BACK_TO` | idem GO_TO_AND_FACE_BACK_TO | `moveForwardToAndFaceBackTo(...)` |
| `PATH_TO_AND_ROTATE_ABS_DEG` | idem GO_TO_AND_ROTATE_ABS_DEG | `pathToAndRotateAbsDeg(...)` |
| `PATH_TO_AND_ROTATE_REL_DEG` | idem GO_TO_AND_ROTATE_REL_DEG | `pathToAndRotateRelDeg(...)` |
| `PATH_TO_AND_FACE_TO` | idem GO_TO_AND_FACE_TO | `pathToAndFaceTo(...)` |
| `PATH_TO_AND_FACE_BACK_TO` | idem GO_TO_AND_FACE_BACK_TO | `pathToAndFaceBackTo(...)` |

### 2.6 MANIPULATION

Actionneurs (pinces, servos, pompes, etc.). **Pas de `subtype`.**

```json
{ "type": "MANIPULATION", "action_id": "ouvrir_pinces", "timeout": 2000 }
```

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `action_id` | string | **oui** | Nom appelé via `ActionRegistry::call(action_id)` |
| `timeout` | int | optionnel | Timeout max en ms (défaut -1) |

### 2.7 ELEMENT

Gestion dynamique des zones (obstacles activables/désactivables au match).

```json
{ "type": "ELEMENT", "subtype": "DELETE_ZONE", "item_id": "caisse_centre" }
{ "type": "ELEMENT", "subtype": "ADD_ZONE",    "item_id": "caisse_centre" }
```

| Subtype | Effet |
|---|---|
| `DELETE_ZONE` | Masque la zone `item_id` (plus d'obstacle pour le pathfinding) |
| `ADD_ZONE` | Réactive la zone `item_id` |

| Champ | Obligatoire | Description |
|---|---|---|
| `item_id` | **oui** | Id de la zone, doit exister dans `table.json` |

### 2.8 SPEED

Change la vitesse max de l'asserv.

```json
{ "type": "SPEED", "subtype": "SET_SPEED", "speed_percent": 50 }
```

| Subtype | Champ | Description |
|---|---|---|
| `SET_SPEED` | `speed_percent` (0..100) | `Asserv::setMaxSpeed(N, N)` |

### 2.9 WAIT

Pause temporelle. **Pas de `subtype`.**

```json
{ "type": "WAIT", "duration_ms": 500 }
```

| Champ | Description |
|---|---|
| `duration_ms` | Pause en ms, `sleep_for(duration_ms)` |

---

## 3. Flags et conditions

### 3.1 Principe

Un **flag** est un booléen nommé, géré par un `FlagManager` côté C++. Utilisé
pour conditionner l'exécution d'une instruction/task selon un état (ex:
« caisse prise », « caméra a vu l'aruco »).

### 3.2 Au niveau d'une instruction

| Champ | Effet |
|---|---|
| `needed_flag: "X"` | Skip l'instruction si flag `X` non actif |
| `action_flag: "Y"` | Lève le flag `Y` après succès de toute l'instruction |
| `clear_flags: ["A", "B"]` | Efface les flags `A` et `B` après succès |

### 3.3 Au niveau d'une task

| Champ | Effet |
|---|---|
| `needed_flag: "X"` | Skip la task (pas toute l'instruction) si flag `X` non actif |

### 3.4 Flags système (levés automatiquement)

Certains flags sont levés par le runner :
- `task_success_N` : flag levé quand la task N d'une instruction réussit
- `instruction_success_N` : flag levé quand l'instruction N réussit

*(Détails d'implémentation à définir en Phase 2 runner C++.)*

---

## 4. Exemple complet

```json
[
  {
    "id": 1,
    "desc": "Sortie zone départ",
    "tasks": [
      { "type": "ELEMENT", "subtype": "DELETE_ZONE", "item_id": "depart_bleu" },
      { "type": "MOVEMENT", "subtype": "GO_TO", "position_x": 300, "position_y": 500 }
    ]
  },
  {
    "id": 2,
    "desc": "Prise caisse centre 1",
    "points": 15,
    "priority": 50,
    "estimatedDurationSec": 12,
    "action_flag": "caisse_centre_1_done",
    "clear_flags": ["caisse_centre_1_zone"],
    "tasks": [
      { "type": "MOVEMENT", "subtype": "PATH_TO",
        "position_x": 1500, "position_y": 1000, "desc": "Approche caisse" },
      { "type": "MOVEMENT", "subtype": "FACE_TO",
        "position_x": 1500, "position_y": 800, "desc": "Orientation vers caisse" },
      { "type": "MANIPULATION", "action_id": "ouvrir_pinces", "timeout": 2000 },
      { "type": "SPEED", "subtype": "SET_SPEED", "speed_percent": 50 },
      { "type": "MOVEMENT", "subtype": "LINE", "dist": 100, "desc": "Contact" },
      { "type": "MANIPULATION", "action_id": "fermer_pinces", "timeout": 2000 },
      { "type": "ELEMENT", "subtype": "DELETE_ZONE", "item_id": "caisse_centre_1" },
      { "type": "MOVEMENT", "subtype": "LINE", "dist": -150, "desc": "Recul" },
      { "type": "SPEED", "subtype": "SET_SPEED", "speed_percent": 100 }
    ]
  },
  {
    "id": 3,
    "desc": "Retour zone fin",
    "points": 20,
    "priority": 200,
    "estimatedDurationSec": 8,
    "needed_flag": "caisse_centre_1_done",
    "tasks": [
      { "type": "MOVEMENT", "subtype": "PATH_TO", "position_x": 300, "position_y": 1800 }
    ]
  }
]
```

> Un seul fichier `strategyPMX0.json`, coordonnées bleues — l'Asserv applique
> le mirror jaune automatiquement au match.

---

## 5. Format `table.json` (définition de la table)

### 5.1 Structure globale

```json
{
  "sizeX": 3000,
  "sizeY": 2000,
  "color0": "bleu",
  "color3000": "jaune",
  "marge": 0,
  "forbiddenZones": [ /* obstacles fixes */ ],
  "dynamicZones":   [ /* zones activables/désactivables */ ],
  "detectionIgnoreZone": [ /* zones où la détection est ignorée */ ]
}
```

### 5.2 Champs racine

| Champ | Type | Description |
|---|---|---|
| `sizeX` | int | Largeur table en mm (typiquement 3000) |
| `sizeY` | int | Hauteur table en mm (typiquement 2000) |
| `color0` | string | Nom de la couleur côté X=0 (ex: `"bleu"`) |
| `color3000` | string | Nom de la couleur côté X=3000 (ex: `"jaune"`) |
| `marge` | int | Margin de sécurité en mm, dessinée en overlay autour des zones (défaut 180) |
| `forbiddenZones` | array | Zones interdites fixes (bordures, grenier, zones de départ adverses) |
| `dynamicZones` | array | Zones activables pendant le match (caisses, garde-mangers) |
| `detectionIgnoreZone` | array | Zones où les capteurs ignorent la détection adversaire |

### 5.3 Format d'une zone

```json
{
  "id": "identifiant_unique",
  "forme": "polygone" | "cercle",
  "desc": "Description humaine",
  "type": "all" | "bleu" | "jaune",
  "active": true | false,
  "points": [ {"x": 0, "y": 0}, {"x": 100, "y": 0}, ... ],
  "centre": {"x": 500, "y": 500},
  "rayon": 120
}
```

### 5.4 Champs d'une zone

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | string | **oui** | Identifiant unique, utilisé dans `ELEMENT / ADD_ZONE / DELETE_ZONE` |
| `forme` | string | **oui** | `"polygone"` ou `"cercle"` |
| `desc` | string | recommandé | Description humaine (tooltip possible) |
| `type` | string | optionnel | `"all"`, `"bleu"`, `"jaune"` — filtre selon couleur du robot |
| `active` | bool | optionnel | État initial (défaut `true`) |
| `points` | array | si polygone | Liste de `{x, y}`, 3 points pour triangle, 4 pour rectangle |
| `centre` | object | si cercle | `{x, y}` du centre |
| `rayon` | int | si cercle | Rayon en mm |

### 5.5 Génération automatique

`table.json` est généré par le code C++ via `ZoneJsonExporter` :

```bash
cd build-simu-debug/bin && echo "m" | ./bot-opos6ul /e /d /k
# (BLEU par défaut ; /y pour exporter cote JAUNE)
```

Cf. [robot/src/common/ia/ZoneJsonExporter.cpp](../src/common/ia/ZoneJsonExporter.cpp).

---

## 6. Format `initBig.json` (position initiale robot)

Position du robot au début du match — chargée par le simulateur ET (à terme)
par le runner C++ pour faire `Asserv::setPosAndColor()`.

```json
{
  "x": 300,
  "y": 300,
  "theta": 1.5707963267948966,
  "regX": 0,
  "regY": 0
}
```

### Champs

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `x` | int | **oui** | Position X en mm (convention PMX, bleu) |
| `y` | int | **oui** | Position Y en mm (convention PMX, bleu) |
| `theta` | float | **oui** | Orientation en **radians** (0 = +X, π/2 = +Y) — cohérent avec Esial et le C++ |
| `regX` | int | optionnel | Centre de rotation dans le PNG (pour affichage simu) |
| `regY` | int | optionnel | idem |

> Note : `theta` est en **radians** ici (pas `angle_deg`), car `initBig.json`
> est hérité du format Esial original et utilisé par le simulateur.

---

## 7. Format `currentYear.js` (config du simulateur)

Fichier JS qui pointe vers les ressources de l'année en cours.

```javascript
var currentYear = 2026;
var rotateTable = false;                                  // true pour orientation portrait
var bigRobot = null;                                      // null = robot dessiné en code (drawPmxRobot)
                                                          // sinon : `resources/${currentYear}/robot.png`
var smallRobot = null;                                    // idem pour le PAMI
var table = `resources/${currentYear}/table.png`;         // image de fond
```

---

## 8. Bonnes pratiques

### Rédaction d'une stratégie

1. **Pas de task `start`** — la pose initiale est dans `initBig.json`, la stratégie commence directement avec la première vraie action.
2. **Libérer la zone de départ** dès la première instruction avec un `ELEMENT / DELETE_ZONE / item_id: "depart_bleu"`, sinon le pathfinding bloque.
3. **Angles en degrés** dans les champs `angle_deg`, `final_angle_deg`, `rotate_rel_deg` : plus lisible, le runner C++ convertit en radians.
4. **Angles fréquents** : 0 (vers +X), 90 (vers +Y), 180 (vers -X), -90 (vers -Y).
5. **`LINE` avec `dist` négatif = recul** : `{"subtype": "LINE", "dist": -150}`.
6. **`desc` sur chaque task** : fortement recommandé pour le debug dans le simulateur et les logs C++.

### Miroir couleur (géré automatiquement)

**La stratégie est écrite en coordonnées bleues uniquement.** Quand le robot
joue en jaune au match, l'Asserv applique :
- `x → 3000 - x` (via `Robot::changeMatchX()`)
- `theta → π - theta` (via `Robot::changeMatchAngleRad()`)

Tu n'as **rien à faire** pour gérer le jaune dans ta stratégie — c'est
transparent. Un seul fichier `strategyPMX0.json` pour les deux couleurs.

### Noms de zones cohérents

Pour que `ELEMENT / DELETE_ZONE / item_id` fonctionne, `item_id` doit exister
dans `table.json`. Conventions :
- `depart_bleu`, `depart_jaune`, `grenier` — zones fixes
- `caisse_<couleur>_<num>`, `garde_manger_<couleur>_<num>` — zones dynamiques
- `plante_<num>`, `pot_<num>` — éléments de jeu spécifiques

### Combinaison de `needed_flag`

Si `needed_flag` est défini à la fois sur une instruction ET sur une task
interne, **les deux doivent être vrais** (ET logique) pour que la task
s'exécute.

### Debug

- `desc` s'affiche dans le panneau "Exécution" du simulateur.
- `id` et `desc` des instructions apparaissent dans les logs C++.
- Pour désactiver temporairement une instruction, mettre `priority: -1` ou `needed_flag: "jamais_levé"`.

---

## 9. Limitations connues

1. **Pas de boucle / répétition** : pour répéter une action N fois, il faut N tasks en dur.
2. **Pas de variables** : les positions sont en dur dans le JSON. Pas de référence symbolique (ex: `"position": "@caisse_3_center"`).
3. **Arguments limités pour `MANIPULATION`** : un seul `action_id`, pas de paramètres nested. À ajouter si besoin (ex: `action_args: {...}`).
4. **Pas de retry automatique** au niveau JSON : gestion des échecs via flags + `needed_flag`.
5. **Le parser C++ et le runner n'existent pas encore** (Phase 2).
6. **Simulateur et runner implémentent à ce jour seulement un sous-ensemble des subtypes** — voir [STRATEGY_JSON_EXECUTION.md](STRATEGY_JSON_EXECUTION.md) pour l'état exact.

---

## 10. Évolutions futures possibles

- **`theta` explicite dans `position_x/y`** : ajouter `position_theta_deg` quand la task doit imposer une orientation finale sans recourir aux composites.
- **Boucles** : `{"type": "LOOP", "count": N, "tasks": [...]}` pour répéter.
- **Variables / références symboliques** : `{"position_ref": "@caisse_centre"}` résolu par `table.json`.
- **Macros / sous-routines** : `{"type": "MACRO", "name": "..."}` avec définition à part.
- **Timeouts adaptatifs** : calcul automatique selon distance.
- **Préconditions temporelles** : `min_time_remaining_sec`, `max_time_remaining_sec` sur instruction.

Ces évolutions ne sont pas urgentes tant que le format de base n'est pas stable et éprouvé.

---

## 11. Références

- [STRATEGY_JSON_EXECUTION.md](STRATEGY_JSON_EXECUTION.md) — architecture + runner C++
- [STRATEGY_RESEARCH.md](STRATEGY_RESEARCH.md) — recherche initiale sur les approches
- [simulator/javascript/visualisator.js](../../simulator/javascript/visualisator.js) — implémentation JS du parser (fonction `playSimulatorInstruction`)
- [EsialRobotik/Ia-Python](https://github.com/EsialRobotik/Ia-Python) — format de référence 2026 (Python)
- [robot/src/common/navigator/Navigator.cpp](../src/common/navigator/Navigator.cpp) — API navigation C++ (référence pour les 13+12 subtypes MOVEMENT)

---

## 12. Annexe — Extensions PMX (non prioritaires)

Fonctionnalités non présentes chez EsialRobotik Ia-Python, à n'ajouter que
quand un besoin concret l'exige.

### 12.1 Préconditions supplémentaires

| Champ | Endroit | Raison possible |
|---|---|---|
| `min_time_remaining_sec` | instruction | Ne pas lancer si plus assez de temps |
| `max_time_remaining_sec` | instruction | Forcer un objectif (ex: retour zone fin) si temps court |
| `forbidden_flag` | instruction ou task | Inverse de `needed_flag` : skip si flag **actif** |
| `near_position` | instruction | `{x, y, distance}` : ne lancer que si robot proche |

### 12.2 Gestion de flags explicite

| Nouveau type | Raison possible |
|---|---|
| `type: "FLAG", subtype: "SET", item_id: "X"` | Lever un flag sans action |
| `type: "FLAG", subtype: "CLEAR", item_id: "X"` | Effacer un flag unique |

### 12.3 Règle d'utilisation

- Se tenir au format Esial Ia-Python tant qu'on peut
- Si un besoin concret émerge (ex: « je veux forcer le retour zone fin à 80s »),
  implémenter **l'extension associée à ce moment-là**, pas avant
- Documenter chaque extension ajoutée ici et dans [STRATEGY_JSON_EXECUTION.md](STRATEGY_JSON_EXECUTION.md)

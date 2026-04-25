# Simulateur PMX-CORTEX

Outil 2D (HTML/JS) pour **construire, visualiser et tester** les stratégies du
robot PMX pour la Coupe de France de Robotique 2026. Fork de
[EsialRobotik/Simulateur](https://github.com/EsialRobotik/Simulateur)
(ex-PrincessViewer) adapté aux besoins PM-ROBOTIX.

Le JSON produit est directement consommé par le runner C++ (OPOS6UL)
`StrategyJsonRunner` via la CLI `/s <name>` (ex: `/s PMX0` → `strategyPMX0.json`).

---

## Lancer le simulateur

Le simulateur est 100% statique (HTML + JS + CSS). Un serveur HTTP local suffit.

### Option 1 — Python http.server (CLI)

```bash
cd simulator
python3 -m http.server 8080
```

Puis ouvrir <http://localhost:8080> dans un navigateur.

### Option 2 — VSCode + extension Live Server (recommandé pour le dev)

Installer l'extension **Live Server** (`ritwickdey.LiveServer`) dans VSCode.
Ensuite :

1. Ouvrir le workspace `pmx.code-workspace` (le dossier `simulator/` y est
   déjà référencé)
2. Clic droit sur `simulator/index.html` → **Open with Live Server**
   (ou bouton **Go Live** en bas à droite de la statusbar)

Le navigateur s'ouvre automatiquement et **recharge la page à chaque save**
(HTML / CSS / JS modifiés dans le submodule). Port par défaut : 5500.

Le workspace configure déjà `liveServer.settings.multiRootWorkspaceName`
pour que l'extension cible le bon dossier en mode multi-root.

---

## Layout de l'interface

```
┌──────────┬──┬───────────────────────────────┬──┬──────────┐
│          │  │                               │  │          │
│ log      │log│         terrain              │cmd│  editeur │
│ PMX      │btn│         (3000x2000)          │pal│ strategie│
│          │  │                               │+ed│          │
│ (toggle) │  │                               │it │ (toggle) │
│          │  ├───────────────────────────────┤btn│          │
│          │  │ Fit / Config visuelle / Live  │   │          │
│          │  │ / Deplacement / Strategies    │   │          │
└──────────┴──┴───────────────────────────────┴──┴──────────┘
```

- **Log PMX** (gauche, toggle) : logs de playback (tasks exécutées, messages
  d'info). Redimensionnable. Boutons A- / A+ pour la taille du texte.
- **Terrain** (centre) : canvas 3000×2000 (1 px = 1 mm). Aspect 3:2 préservé.
  Slider zoom 20–100% ou bouton **Fit** pour ajuster à la fenêtre. Fond
  transparent (l'image de la table apparaît à 35% d'opacité).
- **Colonne palette + édition** (droite) : une barre verticale compacte
  (~62 px) contenant la **palette de commandes** (31 boutons en 3 groupes)
  et le **bouton vert "édition"** en bas qui ouvre/ferme le panneau latéral.
- **Éditeur de stratégie** (droite, toggle) : panneau complet d'édition,
  redimensionnable via bord gauche.
- **Barre du bas** (dépliable) :
  - *Config visuelle* : Table / Quadrillage / Zones / Zoom (4 colonnes
    bouton + slider + % empilés verticalement)
  - *Live* : WebSocket vers le robot (log en direct)
  - *Déplacement* : téléporter le robot à X/Y/θ arbitraires
  - *Stratégies* : LOAD fichier / preconfigs + BLEU/JAUNE/Suivant/Auto +
    slider vitesse

---

## Stratégies

### Fichiers

Dans `resources/2026/` :

- `strategyPMX0.json` + `initPMX0.json` : stratégie PMX0 (bleu) par défaut
- `strategyPMX1.json` + `initPMX1.json` : variante PMX1 (optionnelle)
- `strategyEXEMPLE0.json` : démo couvrant tous les subtypes
- `table.json` : zones interdites et dynamiques (généré par
  `ZoneJsonExporter` côté C++)

### Sources de chargement

| Bouton | Effet |
|---|---|
| `✨ CREATE` | Nouvelle stratégie vide + mode édition |
| `📂 LOAD strat` | Charge un fichier `strategyXxx.json` (picker) |
| `📂 LOAD init` | Charge un fichier `initXxx.json` (pose initiale) |
| `📦 LOAD PMX0 / INIT0` | Charge `strategyPMX0.json` + `initPMX0.json` |
| `📦 LOAD PMX1 / INIT1` | Idem PMX1 |
| `📦 LOAD EXEMPLE0` | Démo complète couvrant tous les subtypes |

Toutes ces sources écrivent dans `window.editor.strategy`. Les boutons
`BLEU` / `JAUNE` jouent ce slot quelle que soit son origine, y compris les
modifications apportées dans l'éditeur.

### Exécution

| Bouton | Effet |
|---|---|
| `BLEU` | Charge la strat courante dans le moteur de playback (couleur bleue, sans miroir) et prépare Suivant/Auto |
| `JAUNE` | Idem en miroir (`x → 3000-x`, `θ → π-θ`), mêmes conventions que l'Asserv C++ (`Robot::changeMatchX/Angle`) |
| `⏭ Suivant` | Joue UNE tâche puis s'arrête (arrête aussi Auto si actif) |
| `▶ Auto` / `⏸ Pause` | Toggle lecture continue (la tâche courante finit naturellement au Pause) |
| `🖌 Dessiner strat` | Dessine l'aperçu complet des trajectoires (sans animation), live update si on édite |
| `📦 Groupe` | Affiche un encadré coloré autour des tâches de chaque instruction, avec son nom en label |
| **Slider vitesse** | 0.25x → 4x. Divise `moveTime`/`rotationTime`/WAIT par le facteur |

> **Important** — après un `CREATE` + ajouts de tâches, **il faut cliquer
> BLEU** (ou JAUNE) pour charger la nouvelle stratégie dans le moteur de
> playback. Tant qu'on n'a pas cliqué, Suivant/Auto sont désactivés (ils
> ne peuvent pas jouer une strat "fantôme"). Idem après un LOAD qui fait
> ça automatiquement en bleu.

---

## Palette de commandes (barre verticale verte)

La palette contient **31 commandes** réparties en 3 groupes. Les boutons
sont compacts (~22 px de haut), labels courts, largeur uniforme.

### Groupe 1 — Non‑pos (ajout immédiat, pas de clic canvas)

Clic bouton = ajout immédiat d'une task avec valeurs par défaut (flash vert
~150ms). L'utilisateur peut ensuite éditer les champs dans le panneau du bas.

| Bouton | Task créée |
|---|---|
| `MANIP` | `MANIPULATION action_id="a_definir" timeout=2000` |
| `WAIT` | `WAIT duration_ms=500` |
| `SPEED` | `SPEED SET_SPEED speed_percent=50` |
| `+ZON` | `ELEMENT ADD_ZONE item_id="a_definir"` |
| `-ZON` | `ELEMENT DELETE_ZONE item_id="a_definir"` |

### Groupe 2 — Clic canvas (sticky : 1 clic fournit la valeur)

Clic bouton = active la commande (bouton vert). Le curseur devient un
crosshair. Chaque clic sur le canvas crée une task. Ré-clic sur le bouton
actif = désactive.

| Bouton | Effet d'un clic canvas |
|---|---|
| `LINE` | `dist` = projection signée du clic sur le heading courant (forward > 0, backward < 0), arrondi au mm |
| `ROT` | `ROTATE_DEG angle_deg` = delta vers le point cliqué, normalisé [-180°, +180°] |
| `ROTa` | `ROTATE_ABS_DEG angle_deg` = heading absolu vers le point cliqué |
| `ORB` | `ORBITAL_TURN_DEG angle_deg=|delta|, turn_right` = CW si delta < 0, `forward=true` |
| `INIT` | Déplace la pose initiale du robot (pas une task) |
| `GO` | `GO_TO position_x/y` |
| `PATH` | `PATH_TO position_x/y` (pathfinding A*) |
| `FWD` | `MOVE_FORWARD_TO position_x/y` |
| `BWD` | `MOVE_BACKWARD_TO position_x/y` |
| `GO<` | `GO_BACK_TO position_x/y` |
| `PATH<` | `PATH_BACK_TO position_x/y` |
| `FACE` | `FACE_TO position_x/y` |
| `FACE<` | `FACE_BACK_TO position_x/y` |
| `MPATH` | `MANUAL_PATH` — mode interactif : clic-gauche = +waypoint, clic-droit = finalise |

**Pose de référence** : `window.editor._lastPose` (pose simulée finale
après toutes les tâches, recalculée à chaque `editorRenderLayer`). Permet
d'enchaîner plusieurs clics de suite (LINE → LINE → LINE chaîne depuis
la nouvelle pose après chaque task).

### Groupe 3 — Composites (2-clics : dest + point à regarder)

Tous les composites `*_AND_*` utilisent le même UX en **2 clics** :

- **1er clic canvas** = destination (`position_x`, `position_y`), pastille
  cyan "dest" affichée
- **2e clic canvas** = point à regarder après arrivée, le champ stocké
  dépend du suffixe du composite :
  - `_AND_FACE_TO` / `_AND_FACE_BACK_TO` → `face_x`, `face_y` (coords brutes)
  - `_AND_ROTATE_ABS_DEG` → `final_angle_deg` = atan2(click2 - dest)
  - `_AND_ROTATE_REL_DEG` → `rotate_rel_deg` = desired_final_heading − arrival_heading

Pour REL, le heading d'arrivée est calculé depuis la pose capturée au
moment du 1er clic.

| Bouton | Composite |
|---|---|
| `GO+Ra` / `GO+Rr` / `GO+F` / `GO+F<` | `GO_TO_AND_*` |
| `F+Ra` / `F+Rr` / `F+F` / `F+F<` | `MOVE_FORWARD_TO_AND_*` |
| `P+Ra` / `P+Rr` / `P+F` / `P+F<` | `PATH_TO_AND_*` |

Le label actif (en bas de la palette) affiche l'état :
`GO+Ra → clic DEST` puis `GO+Ra → clic ANGLE` (ou `clic FACE` pour `_AND_FACE_*`).

---

## Clic-droit canvas

- Sur une **zone** (obstacle / item de table) : menu contextuel
  `DELETE_ZONE` / `ADD_ZONE`
- En **mode MPATH** (construction MANUAL_PATH) : finalise le path et crée
  la task

---

## Éditeur de stratégie (panneau latéral)

Le panneau éditeur est découpé en 3 zones (split scroll) :

- **Haut fixe** : Nom strat, export JSON, pose initiale, Snap (radios)
- **Milieu scrollable** : liste des instructions / tâches (réordonner ⬆⬇,
  supprimer 🗑)
- **Bas fixe** : formulaire d'édition de la tâche sélectionnée

### Ligne SETPOS (avant tirette)

La première ligne (pinned, fond gris pointillé) **🔒 SETPOS (avant
tirette)** contient les tasks jouées **avant** la tirette / chrono start
(simule la séquence `setPos()` du robot C++ : avance d'X mm, calage,
etc.).

- Sélectionner la ligne ou une de ses tasks pour que la palette y ajoute
  des tasks (LINE, ROT, FACE_TO…)
- Tasks éditables/réordonnables/supprimables comme dans une instruction
  match
- Persistées dans `init<Name>.json` sous la clé `setpos_tasks` (rétro-
  compat : si absente, défaut `[]`)
- Au playback BLEU/JAUNE, jouées **avant** la première instruction
  match, en couleur grise distincte

### Workflow d'édition

1. Cliquer `✨ CREATE` → panneau éditeur s'ouvre avec une strat vide, mode
   édition actif
2. (facultatif) cliquer `+ Nouvelle instruction` pour créer une nouvelle
   instruction (sinon la première est créée automatiquement)
3. Cliquer un bouton de la palette :
   - **Non-pos** → task ajoutée immédiatement
   - **Clic canvas** → cliquer sur le terrain pour poser la tâche
   - **Composite** → 2 clics sur le terrain (dest + angle/face)
4. Sélectionner une tâche dans la liste → panneau du bas affiche son
   formulaire ; modifier un champ met à jour le canvas en temps réel
5. **Insertion précise** : quand une tâche est sélectionnée, les
   suivantes s'insèrent **juste après** (pas à la fin)
6. **Cliquer l'en-tête d'une instruction** (zone verte) la sélectionne
   comme courante. Pratique pour ajouter des tâches à une instruction
   vide ou existante
7. Quand c'est prêt, cliquer `BLEU` (ou `JAUNE`) pour charger dans le
   moteur et tester avec `⏭ Suivant` / `▶ Auto` / slider vitesse

### Snap (radios dans le panneau)

`0 / 10 / 50 / 100 mm` — arrondit les coordonnées du clic canvas au
multiple choisi. Quand Snap = 0, les coords sont arrondies à 2 décimales
(précision mm).

### Arrondis automatiques

| Champ | Arrondi |
|---|---|
| `position_x`, `position_y`, `face_x`, `face_y` | 2 décimales (mm) |
| `angle_deg`, `final_angle_deg`, `rotate_rel_deg` | 2 décimales (°) |
| `dist` (LINE) | entier (mm) |
| `timeout`, `duration_ms`, `speed_percent` | entier |
| Pose initiale `x`, `y`, `theta°` | 2 décimales |

### Labels d'angles (explicites dans les forms)

- `ROTATE_DEG` → `angle_deg (° RELATIF, +=CCW / -=CW)`
- `ROTATE_ABS_DEG` → `angle_deg (° ABSOLU, heading cible)`
- `ORBITAL_TURN_DEG` → `angle_deg (° RELATIF, arc pivot)`
- `_AND_ROTATE_ABS_DEG` → `final_angle_deg (° ABSOLU, heading final)`
- `_AND_ROTATE_REL_DEG` → `rotate_rel_deg (° RELATIF, delta post-arrivée)`

### Sauvegarde

1. Taper un nom court dans **Nom strat** (ex: `PMX0`, `PMX2`, `Match26`)
2. Cliquer `Exporter strat JSON` → télécharge `strategy<Nom>.json`
3. Cliquer `Exporter init` → télécharge `init<Nom>.json`
4. Déplacer les 2 fichiers dans `simulator/resources/2026/`
5. Pour un nouveau préconfig (ex: PMX2), ajouter une ligne dans
   `index.html` :
   ```html
   <button onclick="editorLoadPreconfig('PMX2')">📦 LOAD PMX2 / INIT2</button>
   ```

Le point `●` rouge devant le nom de la strat signale des modifications
non exportées ; il disparaît après `Exporter strat JSON` ou un nouveau LOAD.

### Champs optionnels d'instruction (Meta)

Chaque instruction peut déplier une section `▶ Meta` qui expose les
champs optionnels du format spec (§2.2) :

- `points` (int) — points attendus si l'instruction réussit
- `priority` (int/float) — priorité (plus élevé = choisi en premier)
- `EDSec` = `estimatedDurationSec` (float) — durée estimée en secondes
- `needed_flag` (string) — l'instruction est skippée si ce flag n'est
  pas actif
- `action_flag` (string) — ce flag est levé après succès
- `clear_flags` (string, séparés par virgule) — flags à effacer après
  succès

Les champs laissés vides ne sont pas inclus dans le JSON exporté.

### Champs optionnels de task

Chaque tâche expose aussi :

- `timeout` (int, ms, -1 = aucun)
- `needed_flag` (string) — la task est skippée si ce flag n'est pas
  actif (ET logique avec le `needed_flag` de l'instruction si les deux
  sont définis)
- `desc` (string) — libellé affiché dans le panneau d'exécution

---

## Convention de couleurs

### Traces de déplacement

| Couleur | Subtypes |
|---|---|
| 🟦 bleu dodger | `LINE ≥ 0` |
| 🟧 orange | `LINE < 0` |
| 🩵 cyan | `GO_TO` / `GO_BACK_TO` |
| 🟦 bleu clair | `MOVE_FORWARD_TO` |
| 🟧 orange clair | `MOVE_BACKWARD_TO` |
| 🩷 rose | `PATH_TO` / `PATH_BACK_TO` / `MANUAL_PATH` + composites `PATH_TO_AND_*` |
| 🟪 violet (arc) | `ORBITAL_TURN_DEG` (arc autour de la roue pivot) |

### Rotations (secteurs pleins)

Deux couleurs pour distinguer relatif vs absolu :

| Couleur | Contextes |
|---|---|
| 🟪 **violet** = ABSOLU | `FACE_TO`, `FACE_BACK_TO`, `ROTATE_ABS_DEG`, alignements de heading pré-mouvement, composites `_AND_ROTATE_ABS_DEG`, `_AND_FACE_*` |
| 🟧 **orange** = RELATIF | `ROTATE_DEG`, composites `_AND_ROTATE_REL_DEG` |

### Style du trait

- Trait plein → mouvement vers l'avant
- Trait pointillé → mouvement vers l'arrière (`GO_BACK_TO`, `PATH_BACK_TO`,
  `MOVE_BACKWARD_TO`, `LINE < 0`, `FACE_BACK_TO`, `ORBITAL forward:false`)

### Badges tasks non-géométriques

Pastilles rondes jaunes avec lettre :
`M` = MANIPULATION, `W` = WAIT, `S` = SPEED, `E` = ELEMENT (ADD/DELETE_ZONE).

### Preview MANUAL_PATH en construction

Polyline rose pointillée + pastilles numérotées 1, 2, 3… à chaque waypoint
accumulé (avant le clic-droit de finalisation).

### Preview composite 2-clics

Pastille cyan "dest" affichée au 1er clic tant qu'on attend le 2e.

---

## Format des fichiers de stratégie

Cf. [STRATEGY_JSON_FORMAT.md](STRATEGY_JSON_FORMAT.md) pour la référence
complète (instructions, tasks, subtypes, flags). Note : ce fichier est
une copie du maître `robot/md/STRATEGY_JSON_FORMAT.md` (parent repo) —
en cas de divergence, la version parent fait foi.

Le simulateur implémente l'intégralité des subtypes MOVEMENT (13 primitives
+ 12 composites) ainsi que MANIPULATION (stub — juste logué), ELEMENT
(ADD_ZONE / DELETE_ZONE), SPEED, WAIT.

Le système de **flags** (`needed_flag` / `action_flag` / `clear_flags`)
est accepté dans les fichiers JSON mais **pas encore interprété côté
simulateur** (il est géré par le runner C++ — cf.
[STRATEGY_JSON_ROADMAP.md](../robot/md/STRATEGY_JSON_ROADMAP.md)).
L'éditeur permet de les saisir dès aujourd'hui pour construire le JSON
complet, prêt pour le runner.

### EXEMPLE0 — démo visuelle

`LOAD EXEMPLE0` charge une démo organisée en 7 groupes géographiques
(Sortie / Devant / Droite / Haut droite / Haut gauche / Gauche / Retour).
Utile pour tester le bouton `📦 Groupe` qui dessine un encadré coloré
autour de chaque groupe. Le groupe "Devant" contient une S-curve
(2 orbitaux successifs en sens opposé) pour démonstration.

---

## Mode Live (WebSocket)

Le bouton `Connecter WebSocket` connecte à `ws://192.168.42.103:4269`
(IP hardcodée du robot OPOS6UL) et affiche les messages `[Asserv]`,
`INFO` et `[UltraSoundManager]` en temps réel (déplacements + détections).

---

## Intégration avec le runner C++

Le JSON produit par l'éditeur est directement exécuté par le runner
`StrategyJsonRunner` côté OPOS6UL :

```bash
# Sur le robot, dans le répertoire de l'exécutable :
./PMX /s PMX0    # charge strategyPMX0.json et joue
./PMX            # fallback: stratégie hardcode
```

Les tâches `MANIPULATION` sont dispatchées via `ActionRegistry` vers les
méthodes `robot.actions().ax12_*()`.

---

## Dépendances

- [CreateJS](https://createjs.com) (EaselJS + TweenJS) pour le canvas et
  les animations
- jQuery (chargement JSON)
- [geometric.js](https://github.com/HarryStevens/geometric) pour les tests
  point-in-polygon (zones)

Toutes les libs sont embarquées dans `libs/` (aucune dépendance externe au
runtime).

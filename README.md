# Simulateur PMX-CORTEX

Outil 2D (HTML/JS) pour **construire, visualiser et tester** les stratégies du
robot PMX pour la Coupe de France de Robotique 2026. Fork de
[EsialRobotik/Simulateur](https://github.com/EsialRobotik/Simulateur)
(ex-PrincessViewer) adapté aux besoins PM-ROBOTIX.

## Lancer le simulateur

Le simulateur est 100% statique (HTML + JS + CSS). Un serveur HTTP local suffit :

```bash
cd simulator
python3 -m http.server 8080
```

Puis ouvrir <http://localhost:8080> dans un navigateur.

## Layout de l'interface

```
┌──────────┬──┬───────────────────────────────┬──┬──────────┐
│          │  │                               │  │          │
│ log      │log│         terrain              │ed│  editeur │
│ PMX      │btn│         (3000x2000)          │it│ strategie│
│          │  │                               │bt│          │
│ (toggle) │  │                               │n │ (toggle) │
│          │  ├───────────────────────────────┤  │          │
│          │  │ Fit / Config visuelle / Live  │  │          │
│          │  │ / Deplacement / Strategies    │  │          │
└──────────┴──┴───────────────────────────────┴──┴──────────┘
```

- **Log PMX** (gauche, toggle) : affichage des logs de playback (tasks
  exécutées, messages d'info). Redimensionnable (bord droit + coin bas-droit).
  Boutons A- / A+ pour la taille du texte.
- **Terrain** (centre) : canvas 3000×2000 (1 px = 1 mm). Aspect 3:2 préservé.
  Slider zoom 20-100% ou bouton **Fit** pour ajuster à la fenêtre.
- **Editeur de stratégie** (droite, toggle) : panneau complet d'édition
  (voir ci-dessous). Redimensionnable via bord gauche + coin.
- **Barre du bas** (dépliable) :
  - *Configuration visuelle* : toggles Table/Quadrillage/Zones + sliders
    d'opacité + Zoom
  - *Live* : WebSocket vers le robot (log en direct)
  - *Déplacement* : téléporter le robot à X/Y/θ arbitraires
  - *Stratégies* : LOAD fichier / preconfigs + BLEU/JAUNE/Suivant/Auto

## Stratégies

Toutes les stratégies utilisent le format JSON documenté dans
[robot/md/STRATEGY_JSON_FORMAT.md](../robot/md/STRATEGY_JSON_FORMAT.md).

### Fichiers

Dans `resources/2026/` :

- `strategyPMX0.json` + `initPMX0.json` : stratégie par défaut PMX0 (bleu)
- `strategyPMX1.json` + `initPMX1.json` : variante PMX1 (optionnelle)
- `strategyTEST0.json` : exemple de test
- `table.json` : zones interdites et dynamiques (généré par `ZoneJsonExporter`
  côté C++)

### Sources de chargement

| Bouton | Effet |
|---|---|
| `✨ CREATE` | Nouvelle stratégie vide + active le mode édition |
| `📂 LOAD strat` | Charge un fichier `strategyXxx.json` (picker) |
| `📂 LOAD init` | Charge un fichier `initXxx.json` (pose initiale) |
| `📦 LOAD PMX0 / INIT0` | Charge les fichiers de préconfig PMX0 du disque |
| `📦 LOAD PMX1 / INIT1` | Idem pour PMX1 (préconfig) |

Toutes ces sources écrivent dans le même slot (`window.editor.strategy`).
Les boutons `BLEU` / `JAUNE` jouent ce slot quel que soit son origine, y
compris les modifications apportées dans l'éditeur.

### Exécution

- `BLEU` : joue en couleur bleue (config native des fichiers)
- `JAUNE` : joue en miroir (`x → 3000 - x`, `θ → π - θ`), mêmes conventions
  que l'Asserv C++ (`Robot::changeMatchX/Angle`)
- `⏭ Suivant` : joue UNE tâche puis s'arrête (arrête aussi Auto si actif)
- `▶ Auto` / `⏸ Pause` : toggle lecture en continu (la tâche courante finit
  naturellement si Pause)
- `🖌 Dessiner strat` : dessine l'aperçu complet des trajectoires d'un seul
  coup (sans animation), live update si on édite

## Éditeur de stratégie

Le panneau éditeur est découpé en 3 zones (split scroll) :

- **Haut fixe** : Nom strat, export, pose initiale, prochain clic, ajouter
  tâche
- **Milieu scrollable** : liste des instructions / tâches (drag, ⬆⬇, 🗑)
- **Bas fixe** : édition de la tâche sélectionnée

### Création d'une trajectoire

1. Cliquer `✨ CREATE` → panneau éditeur s'ouvre avec une strat vide
2. (facultatif) cliquer `+ Nouvelle instruction` (sinon la première est créée
   automatiquement)
3. Choisir le type dans **Prochain clic =** puis cliquer sur le canvas →
   une tâche est ajoutée à chaque clic. Options :
   - `POSE_INIT` : modifie la pose initiale du robot (pas une task)
   - `GO_TO` : déplacement direct ligne droite vers le point
   - `PATH_TO` : déplacement avec pathfinding A\* (évite les zones)
   - `MOVE_FORWARD_TO` : avance vers le point
   - `MOVE_BACKWARD_TO` : recule vers le point
   - `FACE_TO` : rotation sur place pour faire face au point

   **Snap** (0 / 10 / 50 / 100 mm) : arrondit les coordonnées au multiple
   choisi (utile pour placer sur une grille).
4. Pour une tâche non-géométrique : bouton `+ LINE`, `+ ROTATE rel`,
   `+ ROTATE abs`, `+ MANIPULATION`, `+ WAIT`, `+ SPEED`, `+ DELETE_ZONE`,
   `+ ADD_ZONE`
5. Clic-droit sur une zone du canvas → menu contextuel DELETE_ZONE / ADD_ZONE
6. Sélectionner une tâche dans la liste → le panneau du bas affiche son
   formulaire d'édition ; modifier un champ met à jour le canvas en temps
   réel
7. **Insertion précise** : quand une tâche est sélectionnée, les suivantes
   (clic canvas, `+ LINE`…) s'insèrent JUSTE APRÈS (pas à la fin)

### Sauvegarde

1. Taper un nom court dans **Nom strat** (ex: `PMX0`, `PMX2`, `Match26`)
2. Cliquer `Exporter strat JSON` → télécharge `strategy<Nom>.json`
3. Cliquer `Exporter init` → télécharge `init<Nom>.json`
4. Déplacer les 2 fichiers dans `simulator/resources/2026/`
5. Pour un nouveau préconfig (ex: PMX2), ajouter une ligne dans `index.html` :
   ```html
   <button onclick="editorLoadPreconfig('PMX2')">📦 LOAD PMX2 / INIT2</button>
   ```

Le point `●` rouge devant le nom de la strat signale des modifications non
exportées ; il disparaît après `Exporter strat JSON` ou un nouveau LOAD.

### Convention de couleurs (traits)

Les traits dessinés suivent la spec
[STRATEGY_JSON_FORMAT.md §2.4](../robot/md/STRATEGY_JSON_FORMAT.md) :

- `LINE ≥ 0` : bleu
- `LINE < 0` : orange
- `GO_TO` / `GO_BACK_TO` : cyan (pointillé pour BACK)
- `MOVE_FORWARD_TO` : bleu clair
- `MOVE_BACKWARD_TO` : orange clair
- `PATH_TO` / `PATH_BACK_TO` / `MANUAL_PATH` : rose
- `FACE_TO` / `ROTATE_*` : pas de trait (rotation sur place)

Pastilles pour les tasks non-géométriques : `M` (manipulation), `W` (wait),
`S` (speed), `E` (element).

## Format des fichiers de stratégie

Cf. [robot/md/STRATEGY_JSON_FORMAT.md](../robot/md/STRATEGY_JSON_FORMAT.md)
pour la référence complète (instructions, tasks, subtypes, flags).

Le simulateur implémente l'intégralité des subtypes MOVEMENT (13 primitives
+ 12 composites) ainsi que MANIPULATION (stub), ELEMENT (ADD/DELETE_ZONE),
SPEED, WAIT.

## Mode Live (WebSocket)

Le bouton `Connecter WebSocket` connecte à `ws://192.168.42.103:4269` (ip
hardcodée du robot OPOS6UL) et affiche les messages `[Asserv]`, `INFO` et
`[UltraSoundManager]` en temps réel (déplacements + détections).

## Dépendances

- [CreateJS](https://createjs.com) (EaselJS + TweenJS) pour le canvas et
  les animations
- jQuery (chargement JSON)
- [geometric.js](https://github.com/HarryStevens/geometric) pour les tests
  point-in-polygon (zones)

Toutes les libs sont embarquées dans `libs/` (aucune dépendance externe au
runtime).

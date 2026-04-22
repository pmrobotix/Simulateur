// ============================================================================
// Editeur de strategie PMX-CORTEX
// ---------------------------------------------------------------------------
// Mode edition qui permet de construire un strategyPMX0.json par clics canvas
// et formulaires lateraux.
//
// Format JSON produit : voir robot/md/STRATEGY_JSON_FORMAT.md
// ============================================================================

window.editor = {
    mode: 'view',                 // 'view' | 'edit'
    activeCommand: null,          // {cmd: 'PATH_TO', type: 'pos'} | {cmd:'LINE', type:'nonpos'} | null
    // MANUAL_PATH en construction : null = pas en mode build, [] = en mode build
    // (left-click canvas = +waypoint, right-click canvas = finalize)
    manualPathBuffer: null,
    // Tous les composites *_AND_* : construction 2-clics (1er=dest, 2e=point a regarder)
    // null = pas en mode, {dest:{x,y}, from:{x,y,theta}} = 1er clic fait
    composite2ndBuffer: null,
    // Pose simulee a la fin de la strategie (mise a jour dans editorRenderLayer)
    _lastPose: null,
    snapMm: 0,                    // 0 | 10 | 50 | 100
    strategy: {
        name: 'PMX0',             // nom court ; exports : strategy<nom>.json + init<nom>.json
        instructions: []          // [{ id, desc, tasks: [...] }, ...] — état partagé édition/lecture
    },
    initialPose: { x: 300, y: 300, theta: Math.PI / 2 },
    selectedTaskRef: null,        // { iInstr, iTask } ; iTask peut etre null pour "instruction seule selectionnee"
    _layer: null,                 // createjs.Container pour le rendu edition
    // Nom du fichier utilisateur charge (juste pour l'affichage ; le contenu
    // est dans `strategy.instructions` ci-dessus)
    loadedStratFileName: null,
    // true = modifie depuis le dernier load/export (indicateur ●)
    dirty: false,
    // true = editor layer toujours visible (bouton "Dessiner strat")
    previewAlways: false,
    // true = dessine un encadre autour des taches de chaque instruction
    showInstrBounds: false
};

function editorMarkDirty() {
    if (!window.editor.dirty) {
        window.editor.dirty = true;
        editorUpdateLoadedSlotUi();
    }
}
function editorClearDirty() {
    if (window.editor.dirty) {
        window.editor.dirty = false;
        editorUpdateLoadedSlotUi();
    }
}

/**
 * Point d'entree appele depuis visualisator.js::initComplete() une fois le
 * stage createjs pret.
 * @param init Pose initiale lue depuis initBig.json (utilisee comme defaut).
 */
function editorInit(init) {
    if (init && typeof init.x === 'number') {
        window.editor.initialPose = {
            x: init.x,
            y: init.y,
            theta: init.theta
        };
        editorRefreshInitialPoseInputs();
    }
    // Layer createjs dediee au rendu edition (au-dessus du robot)
    if (typeof stage !== 'undefined' && stage) {
        window.editor._layer = new createjs.Container();
        stage.addChild(window.editor._layer);
    }
    editorBindUi();
    editorApplyMode();
    editorRenderLayer();
    // Poignees de resize : log cote droit, editeur cote gauche (symetrique)
    setupSideResizer('logColumn', 'right');
    setupSideResizer('editorSidePanel', 'left');
}

/**
 * Installe une poignee de redimensionnement sur tout le bord gauche ou droit
 * d'un element, qui modifie sa largeur par drag horizontal.
 */
function setupSideResizer(columnId, edge) {
    var col = document.getElementById(columnId);
    if (!col) return;
    var handle = document.createElement('div');
    handle.className = 'sideResizer edge-' + edge;
    col.appendChild(handle);
    var sign = (edge === 'left') ? -1 : 1;

    handle.addEventListener('mousedown', function (e) {
        var startX = e.clientX;
        var startW = col.offsetWidth;
        document.body.style.userSelect = 'none';
        function onMove(ev) {
            var delta = sign * (ev.clientX - startX);
            var newW = Math.max(250, startW + delta);
            col.style.width = newW + 'px';
        }
        function onUp() {
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
}

/**
 * Branche les handlers DOM du panneau editeur (boutons, inputs).
 */
function editorBindUi() {
    var toggleBtn = document.getElementById('editorToggleMode');
    if (toggleBtn) toggleBtn.addEventListener('click', editorToggleMode);

    var nameInput = document.getElementById('editorStratName');
    if (nameInput) {
        nameInput.value = window.editor.strategy.name;
        nameInput.addEventListener('input', function () {
            window.editor.strategy.name = this.value || 'PMX0';
        });
    }

    // Inputs pose initiale
    ['editorInitX', 'editorInitY', 'editorInitTheta'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', editorOnInitialPoseInputChange);
    });

    // Palette de commandes (boutons dans la colonne verticale verte)
    document.querySelectorAll('.cmdBtn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            editorOnCmdPaletteClick(btn);
        });
    });

    // Radios snap
    document.querySelectorAll('input[name="editorSnap"]').forEach(function (r) {
        r.addEventListener('change', function () {
            if (this.checked) window.editor.snapMm = parseInt(this.value, 10) || 0;
        });
    });

    // Clic canvas via createjs (stageX/stageY sont deja en coord canvas)
    if (typeof stage !== 'undefined' && stage) {
        stage.on('stagemousedown', editorOnCanvasMouseDown);
    }

    // Clic-droit canvas = menu contextuel zones (etape 7)
    var canvas = document.getElementById('canvas');
    if (canvas) canvas.addEventListener('contextmenu', editorOnCanvasContextMenu);
    // Clic ailleurs => fermer le menu contextuel eventuel
    document.addEventListener('click', function (e) {
        var menu = document.getElementById('editorContextMenu');
        if (menu && !menu.contains(e.target)) editorHideContextMenu();
    });

    // Bouton "+ Nouvelle instruction"
    var addBtn = document.getElementById('editorAddInstruction');
    if (addBtn) addBtn.addEventListener('click', editorAddInstruction);

    // Slot "Strat chargée" : file pickers pour charger strat et initPMX
    var loadStratBtn = document.getElementById('loadStratFileBtn');
    var loadStratFile = document.getElementById('loadStratFile');
    if (loadStratBtn && loadStratFile) {
        loadStratBtn.addEventListener('click', function () { loadStratFile.click(); });
        loadStratFile.addEventListener('change', editorOnLoadStratFile);
    }
    var loadInitBtn = document.getElementById('loadInitFileBtn');
    var loadInitFile = document.getElementById('loadInitFile');
    if (loadInitBtn && loadInitFile) {
        loadInitBtn.addEventListener('click', function () { loadInitFile.click(); });
        loadInitFile.addEventListener('change', editorOnLoadInitFile);
    }
    editorUpdateLoadedSlotUi();

    // Toggle colonne log
    var toggleLog = document.getElementById('toggleLogColumn');
    if (toggleLog) toggleLog.addEventListener('click', editorToggleLogColumn);

    // Export JSON (l'import se fait maintenant via le bloc "Stratégies")
    var exportBtn = document.getElementById('editorExport');
    if (exportBtn) exportBtn.addEventListener('click', editorExportStrategy);
    var exportInitBtn = document.getElementById('editorExportInit');
    if (exportInitBtn) exportInitBtn.addEventListener('click', editorExportInit);

    editorRenderInstructionsList();
}

/**
 * Clic sur un bouton de la palette commandes (.cmdBtn).
 * - type "nonpos" : ajoute immediatement une task avec valeurs par defaut
 * - type "pos"    : sticky -> prochain clic canvas cree la task a l'endroit cliqué.
 *   Re-clic sur un bouton déjà actif = désactive.
 */
function editorOnCmdPaletteClick(btn) {
    var cmd = btn.dataset.cmd;
    var isPos = btn.classList.contains('pos');
    // S'assurer que le mode edition est actif pour que les clics canvas soient pris
    if (window.editor.mode !== 'edit') {
        window.editor.mode = 'edit';
        editorApplyMode();
    }
    if (!isPos) {
        // Ajout immediat, pas de sticky
        editorAddNonClickTask(cmd);
        // Flash visuel
        btn.classList.add('active');
        setTimeout(function () { btn.classList.remove('active'); }, 150);
        return;
    }
    // Pos : toggle sticky
    var cur = window.editor.activeCommand;
    if (cur && cur.cmd === cmd) {
        // Desactivation : annule tout build en cours
        window.editor.manualPathBuffer = null;
        window.editor.composite2ndBuffer = null;
        window.editor.activeCommand = null;
        editorRenderLayer();
    } else {
        // Nouvelle cmd : reset des buffers des autres modes
        window.editor.manualPathBuffer = null;
        window.editor.composite2ndBuffer = null;
        window.editor.activeCommand = { cmd: cmd, type: 'pos' };
        if (cmd === 'MANUAL_PATH') {
            window.editor.manualPathBuffer = [];
        }
        editorRenderLayer();
    }
    editorRefreshActiveCmdUi();
}

/**
 * Met a jour le rendu visuel (bouton actif + label) de la palette.
 */
function editorRefreshActiveCmdUi() {
    var active = window.editor.activeCommand;
    document.querySelectorAll('.cmdBtn.pos').forEach(function (b) {
        if (active && b.dataset.cmd === active.cmd) b.classList.add('active');
        else b.classList.remove('active');
    });
    var lbl = document.getElementById('editorActiveCmdLabel');
    if (lbl) {
        if (active && active.cmd === 'MANUAL_PATH') {
            var n = (window.editor.manualPathBuffer || []).length;
            lbl.textContent = 'MPATH (' + n + ' wp) clic-droit=fin';
        } else if (active && editorIsFace2Click(active.cmd)) {
            var step2Label = /_AND_(FACE_TO|FACE_BACK_TO)$/.test(active.cmd)
                ? 'clic FACE' : 'clic ANGLE';
            lbl.textContent = active.cmd + (window.editor.composite2ndBuffer
                ? ' → ' + step2Label : ' → clic DEST');
        } else {
            lbl.textContent = active ? active.cmd : '(aucune)';
        }
    }
    var canvas = document.getElementById('canvas');
    if (canvas && window.editor.mode === 'edit') {
        canvas.style.cursor = active ? 'crosshair' : 'pointer';
    }
}

function editorToggleMode() {
    window.editor.mode = (window.editor.mode === 'edit') ? 'view' : 'edit';
    editorApplyMode();
}

/**
 * Applique visuellement le mode courant : label bouton + affichage panneau +
 * curseur canvas.
 */
function editorApplyMode() {
    var isEdit = (window.editor.mode === 'edit');
    var toggleBtn = document.getElementById('editorToggleMode');
    var sidePanel = document.getElementById('editorSidePanel');
    var canvas = document.getElementById('canvas');

    if (toggleBtn) {
        toggleBtn.textContent = isEdit ? 'édition ◂' : 'édition ▸';
        toggleBtn.classList.toggle('active', isEdit);
    }
    if (sidePanel) sidePanel.style.display = isEdit ? 'flex' : 'none';
    if (canvas) {
        canvas.style.cursor = isEdit
            ? (window.editor.activeCommand ? 'crosshair' : 'pointer')
            : 'pointer';
    }
    if (!isEdit) {
        // Reset activeCommand + buffers quand on quitte l'edition
        window.editor.activeCommand = null;
        window.editor.manualPathBuffer = null;
        window.editor.composite2ndBuffer = null;
        editorRefreshActiveCmdUi();
    }

    // Layer editeur visible si edit mode OU si "Dessiner strat" actif
    if (window.editor._layer) {
        window.editor._layer.visible = isEdit || window.editor.previewAlways;
        if (typeof stage !== 'undefined' && stage) stage.update();
    }
    if (!isEdit) editorHideContextMenu();
}

/**
 * Toggle "Dessiner strat" : affiche la layer editeur (apercu complet) meme
 * en mode view. En edit mode la layer est toujours visible.
 */
function editorToggleDrawStrat() {
    window.editor.previewAlways = !window.editor.previewAlways;
    var btn = document.getElementById('drawStratBtn');
    if (btn) {
        btn.textContent = window.editor.previewAlways ? '🖌 Effacer apercu' : '🖌 Dessiner strat';
        btn.style.backgroundColor = window.editor.previewAlways ? '#4caf50' : '';
        btn.style.color = window.editor.previewAlways ? 'white' : '';
    }
    editorApplyMode();
    editorRenderLayer();
}

/**
 * Toggle affichage des encadres autour des taches de chaque instruction.
 */
function editorToggleInstrBounds() {
    window.editor.showInstrBounds = !window.editor.showInstrBounds;
    var btn = document.getElementById('btnInstrBounds');
    if (btn) {
        btn.style.backgroundColor = window.editor.showInstrBounds ? '#4caf50' : '';
        btn.style.color = window.editor.showInstrBounds ? 'white' : '';
    }
    editorRenderLayer();
}

/**
 * Rafraichit les inputs x/y/theta de la pose initiale depuis le state.
 */
function editorRefreshInitialPoseInputs() {
    var ix = document.getElementById('editorInitX');
    var iy = document.getElementById('editorInitY');
    var ith = document.getElementById('editorInitTheta');
    var p = window.editor.initialPose;
    if (ix) ix.value = Math.round(p.x);
    if (iy) iy.value = Math.round(p.y);
    if (ith) ith.value = Math.round(p.theta * 180 / Math.PI);
}

/**
 * Lu lors de la modification d'un input x/y/theta : met a jour le state et
 * teleporte le robot sans animation.
 */
function editorOnInitialPoseInputChange() {
    var ix = document.getElementById('editorInitX');
    var iy = document.getElementById('editorInitY');
    var ith = document.getElementById('editorInitTheta');
    var p = window.editor.initialPose;
    if (ix) p.x = editorRound2(parseFloat(ix.value) || 0);
    if (iy) p.y = editorRound2(parseFloat(iy.value) || 0);
    if (ith) p.theta = (editorRound2(parseFloat(ith.value) || 0)) * Math.PI / 180;
    editorMarkDirty();
    editorUpdateRobotFromInitialPose();
    editorRenderLayer();
}

/**
 * Teleporte la forme createjs `pmx` a la pose initiale du state (sans tween).
 */
function editorUpdateRobotFromInitialPose() {
    if (typeof pmx === 'undefined' || !pmx) return;
    var p = window.editor.initialPose;
    pmx.x = toCanvasX(p.x);
    pmx.y = toCanvasY(p.y);
    pmx.rotation = toCanvasRotationDeg(p.theta);
    if (typeof stage !== 'undefined' && stage) stage.update();
}

/**
 * Snap a la grille active (0 = pas de snap).
 */
/**
 * Arrondit un nombre a 2 chiffres apres la virgule (evite les decimales
 * parasites de Math.round(x/s)*s et les coords brutes du canvas).
 */
function editorRound2(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    return Math.round(v * 100) / 100;
}
function editorSnap(v) {
    var s = window.editor.snapMm;
    return s > 0 ? Math.round(v / s) * s : editorRound2(v);
}

/**
 * Handler createjs : un clic canvas en mode edition dispatche selon la
 * commande sticky active de la palette (activeCommand).
 */
function editorOnCanvasMouseDown(evt) {
    if (window.editor.mode !== 'edit') return;
    // stageX/stageY sont en coord canvas (scale auto par createjs)
    var pmxX = editorSnap(evt.stageX);
    var pmxY = editorSnap(TABLE_HEIGHT - evt.stageY);
    // Bornage dans la table
    pmxX = Math.max(0, Math.min(TABLE_WIDTH, pmxX));
    pmxY = Math.max(0, Math.min(TABLE_HEIGHT, pmxY));
    editorHandleCanvasClick(pmxX, pmxY);
}

/**
 * Dispatch du clic canvas selon la commande sticky active (palette verticale).
 */
function editorHandleCanvasClick(pmxX, pmxY) {
    var active = window.editor.activeCommand;
    if (!active) return;
    var cmd = active.cmd;
    if (cmd === 'POSE_INIT') {
        window.editor.initialPose.x = pmxX;
        window.editor.initialPose.y = pmxY;
        editorMarkDirty();
        editorRefreshInitialPoseInputs();
        editorUpdateRobotFromInitialPose();
        editorRenderLayer();
        return;
    }
    if (cmd === 'MANUAL_PATH') {
        // Ajoute un waypoint au buffer en cours (le task est cree au clic-droit)
        if (!window.editor.manualPathBuffer) window.editor.manualPathBuffer = [];
        window.editor.manualPathBuffer.push([pmxX, pmxY]);
        editorRefreshActiveCmdUi();
        editorRenderLayer();
        return;
    }
    // LINE / ROTATE_DEG / ROTATE_ABS_DEG / ORBITAL_TURN_DEG : un clic suffit,
    // la valeur est deduite de la pose simulee courante et du point clique.
    if (cmd === 'LINE' || cmd === 'ROTATE_DEG' || cmd === 'ROTATE_ABS_DEG'
            || cmd === 'ORBITAL_TURN_DEG') {
        var fromP = window.editor._lastPose
            || { x: window.editor.initialPose.x, y: window.editor.initialPose.y,
                 theta: window.editor.initialPose.theta };
        var dx = pmxX - fromP.x, dy = pmxY - fromP.y;
        if (cmd === 'LINE') {
            // Projection signee sur le heading courant (forward > 0, backward < 0)
            var proj = dx * Math.cos(fromP.theta) + dy * Math.sin(fromP.theta);
            var dist = Math.round(proj);
            editorAppendTask({
                type: 'MOVEMENT', subtype: 'LINE', dist: dist,
                desc: 'LINE dist=' + dist
            });
            return;
        }
        var desired = Math.atan2(dy, dx);
        if (cmd === 'ROTATE_ABS_DEG') {
            var absDeg = editorRound2(desired * 180 / Math.PI);
            editorAppendTask({
                type: 'MOVEMENT', subtype: 'ROTATE_ABS_DEG', angle_deg: absDeg,
                desc: 'ROTATE abs ' + absDeg + '°'
            });
            return;
        }
        // ROTATE_DEG / ORBITAL : delta relatif [-180,180]
        var dRad = desired - fromP.theta;
        while (dRad > Math.PI) dRad -= 2 * Math.PI;
        while (dRad < -Math.PI) dRad += 2 * Math.PI;
        if (cmd === 'ROTATE_DEG') {
            var relDeg = editorRound2(dRad * 180 / Math.PI);
            editorAppendTask({
                type: 'MOVEMENT', subtype: 'ROTATE_DEG', angle_deg: relDeg,
                desc: 'ROTATE rel ' + relDeg + '°'
            });
            return;
        }
        // ORBITAL_TURN_DEG : amplitude + sens deduit (turn_right = delta < 0 = CW)
        var orbDeg = editorRound2(Math.abs(dRad * 180 / Math.PI));
        var turnRight = (dRad < 0);
        editorAppendTask({
            type: 'MOVEMENT', subtype: 'ORBITAL_TURN_DEG',
            angle_deg: orbDeg, forward: true, turn_right: turnRight,
            desc: 'ORBITAL ' + orbDeg + '° ' + (turnRight ? 'droite' : 'gauche') + ' fwd'
        });
        return;
    }
    if (editorIsFace2Click(cmd)) {
        // Construction 2-clics : 1er clic = dest, 2e clic = point a regarder
        var buf1 = window.editor.composite2ndBuffer;
        if (!buf1) {
            // Capture la pose simulee actuelle pour pouvoir calculer l'arrival heading
            var from = window.editor._lastPose
                || { x: window.editor.initialPose.x, y: window.editor.initialPose.y,
                     theta: window.editor.initialPose.theta };
            window.editor.composite2ndBuffer = {
                dest: { x: pmxX, y: pmxY },
                from: { x: from.x, y: from.y, theta: from.theta }
            };
            editorRefreshActiveCmdUi();
            editorRenderLayer();
            return;
        }
        // 2e clic : finalise la task selon le suffixe du composite
        var dest = buf1.dest, from = buf1.from;
        var t = {
            type: 'MOVEMENT', subtype: cmd,
            position_x: dest.x, position_y: dest.y
        };
        if (/_AND_FACE_TO$|_AND_FACE_BACK_TO$/.test(cmd)) {
            t.face_x = pmxX;
            t.face_y = pmxY;
            t.desc = cmd + ' dest=(' + dest.x + ',' + dest.y
                + ') face=(' + pmxX + ',' + pmxY + ')';
        } else if (/_AND_ROTATE_ABS_DEG$/.test(cmd)) {
            var absDeg = Math.atan2(pmxY - dest.y, pmxX - dest.x) * 180 / Math.PI;
            t.final_angle_deg = editorRound2(absDeg);
            t.desc = cmd + ' dest=(' + dest.x + ',' + dest.y
                + ') final=' + t.final_angle_deg + '°';
        } else if (/_AND_ROTATE_REL_DEG$/.test(cmd)) {
            var arrival = Math.atan2(dest.y - from.y, dest.x - from.x);
            var desired = Math.atan2(pmxY - dest.y, pmxX - dest.x);
            var relRad = desired - arrival;
            while (relRad > Math.PI) relRad -= 2 * Math.PI;
            while (relRad < -Math.PI) relRad += 2 * Math.PI;
            t.rotate_rel_deg = editorRound2(relRad * 180 / Math.PI);
            t.desc = cmd + ' dest=(' + dest.x + ',' + dest.y
                + ') rel=' + t.rotate_rel_deg + '°';
        }
        window.editor.composite2ndBuffer = null;
        editorAppendTask(t);
        editorRefreshActiveCmdUi();
        return;
    }
    // Toutes les autres positionnelles (primitives + composites) :
    // delègue a editorAddNonClickTask avec coords overridees.
    editorAddNonClickTask(cmd, pmxX, pmxY);
}

/**
 * Indique si une commande est un composite *_AND_* (construction 2-clics :
 * 1er = destination du mouvement, 2e = point a regarder apres arrivee).
 * Couvre tous les _AND_FACE_TO / _AND_FACE_BACK_TO / _AND_ROTATE_ABS_DEG /
 * _AND_ROTATE_REL_DEG.
 */
function editorIsFace2Click(cmd) {
    return /_AND_(FACE_TO|FACE_BACK_TO|ROTATE_ABS_DEG|ROTATE_REL_DEG)$/.test(cmd || '');
}

/**
 * Finalise le MANUAL_PATH en cours de construction : cree la task avec les
 * waypoints accumules et vide le buffer.
 */
function editorFinalizeManualPath() {
    var buf = window.editor.manualPathBuffer;
    if (!buf || buf.length === 0) {
        window.editor.manualPathBuffer = null;
        editorRenderLayer();
        return;
    }
    var t = {
        type: 'MOVEMENT',
        subtype: 'MANUAL_PATH',
        waypoints: buf.slice(),
        desc: 'MANUAL_PATH (' + buf.length + ' wp)'
    };
    window.editor.manualPathBuffer = null;
    // On sort du mode MANUAL_PATH une fois finalise
    window.editor.activeCommand = null;
    editorAppendTask(t);
    editorRefreshActiveCmdUi();
}

// ============================================================================
// Gestion des instructions
// ============================================================================

/**
 * Cree une nouvelle instruction vide et la selectionne (iTask: null).
 */
function editorAddInstruction() {
    var s = window.editor.strategy;
    var nextId = s.instructions.reduce(function (m, i) {
        return Math.max(m, i.id || 0);
    }, 0) + 1;
    s.instructions.push({
        id: nextId,
        desc: 'Instruction ' + nextId,
        tasks: []
    });
    window.editor.selectedTaskRef = { iInstr: s.instructions.length - 1, iTask: null };
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Ajoute une task a l'instruction courante.
 */
function editorAppendTask(task) {
    var s = window.editor.strategy;
    var sel = window.editor.selectedTaskRef;
    if (sel && sel.iInstr != null) {
        var instr = s.instructions[sel.iInstr];
        if (instr && Array.isArray(instr.tasks)) {
            if (sel.iTask != null) {
                // Task selectionnee : insertion APRES
                instr.tasks.splice(sel.iTask + 1, 0, task);
                window.editor.selectedTaskRef = { iInstr: sel.iInstr, iTask: sel.iTask + 1 };
            } else {
                // Instruction seule selectionnee : append a la fin de cette instruction
                instr.tasks.push(task);
                window.editor.selectedTaskRef = { iInstr: sel.iInstr, iTask: instr.tasks.length - 1 };
            }
            editorMarkDirty();
            editorRenderInstructionsList();
            return;
        }
    }
    // Aucune selection : append a la derniere instruction (cree une si aucune)
    if (s.instructions.length === 0) {
        editorAddInstruction();
    }
    var lastIdx = s.instructions.length - 1;
    var lastInstr = s.instructions[lastIdx];
    lastInstr.tasks.push(task);
    window.editor.selectedTaskRef = { iInstr: lastIdx, iTask: lastInstr.tasks.length - 1 };
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Ajoute une task non-clic avec des valeurs par defaut. L'utilisateur les edite
 * ensuite dans le form d'edition (ouvert automatiquement via selection).
 */
function editorAddNonClickTask(kind, overrideX, overrideY) {
    var defX, defY;
    if (typeof overrideX === 'number' && typeof overrideY === 'number') {
        // Valeurs deja passees par editorSnap : conserve la precision 2 decimales
        defX = editorRound2(overrideX);
        defY = editorRound2(overrideY);
    } else {
        // Default position: playback pose si defini, sinon 500,500
        var p = (typeof playbackPose !== 'undefined' && playbackPose)
            ? playbackPose
            : (window.editor.initialPose || { x: 500, y: 500, theta: Math.PI / 2 });
        defX = editorRound2(p.x || 500);
        defY = editorRound2(p.y || 500);
    }
    var t;
    switch (kind) {
        // Non-geometrique
        case 'LINE':
            t = { type: 'MOVEMENT', subtype: 'LINE', dist: 100, desc: 'LINE dist=100' }; break;
        case 'ROTATE_DEG':
            t = { type: 'MOVEMENT', subtype: 'ROTATE_DEG', angle_deg: 90, desc: 'ROTATE rel +90°' }; break;
        case 'ROTATE_ABS_DEG':
            t = { type: 'MOVEMENT', subtype: 'ROTATE_ABS_DEG', angle_deg: 0, desc: 'ROTATE abs 0°' }; break;
        case 'MANIPULATION':
            t = { type: 'MANIPULATION', action_id: 'a_definir', timeout: 2000, desc: 'MANIPULATION a_definir' }; break;
        case 'WAIT':
            t = { type: 'WAIT', duration_ms: 500, desc: 'WAIT 500ms' }; break;
        case 'SPEED':
            t = { type: 'SPEED', subtype: 'SET_SPEED', speed_percent: 50, desc: 'SPEED 50%' }; break;
        case 'ELEMENT_DELETE':
            t = { type: 'ELEMENT', subtype: 'DELETE_ZONE', item_id: 'a_definir', desc: 'DELETE_ZONE a_definir' }; break;
        case 'ELEMENT_ADD':
            t = { type: 'ELEMENT', subtype: 'ADD_ZONE', item_id: 'a_definir', desc: 'ADD_ZONE a_definir' }; break;

        // Primitives MOVEMENT positionnelles
        case 'GO_TO':
        case 'PATH_TO':
        case 'MOVE_FORWARD_TO':
        case 'MOVE_BACKWARD_TO':
        case 'GO_BACK_TO':
        case 'PATH_BACK_TO':
        case 'FACE_TO':
        case 'FACE_BACK_TO':
            t = { type: 'MOVEMENT', subtype: kind, position_x: defX, position_y: defY,
                  desc: kind + ' (' + defX + ',' + defY + ')' };
            break;

        // Autres primitives
        case 'ORBITAL_TURN_DEG':
            t = { type: 'MOVEMENT', subtype: 'ORBITAL_TURN_DEG', angle_deg: 45,
                  forward: true, turn_right: false, desc: 'ORBITAL 45° gauche forward' };
            break;
        case 'MANUAL_PATH':
            // Default si appele via editorAddNonClickTask (fallback). L'usage
            // normal passe par le mode build interactif (clic-gauche = +wp,
            // clic-droit = fin) declenche depuis la palette.
            t = { type: 'MOVEMENT', subtype: 'MANUAL_PATH',
                  waypoints: [[defX, defY]],
                  desc: 'MANUAL_PATH (1 wp)' };
            break;

        // Composites : dest + complement
        case 'GO_TO_AND_ROTATE_ABS_DEG':
        case 'MOVE_FORWARD_TO_AND_ROTATE_ABS_DEG':
        case 'PATH_TO_AND_ROTATE_ABS_DEG':
            t = { type: 'MOVEMENT', subtype: kind, position_x: defX, position_y: defY,
                  final_angle_deg: 0, desc: kind };
            break;
        case 'GO_TO_AND_ROTATE_REL_DEG':
        case 'MOVE_FORWARD_TO_AND_ROTATE_REL_DEG':
        case 'PATH_TO_AND_ROTATE_REL_DEG':
            t = { type: 'MOVEMENT', subtype: kind, position_x: defX, position_y: defY,
                  rotate_rel_deg: 0, desc: kind };
            break;
        case 'GO_TO_AND_FACE_TO':
        case 'MOVE_FORWARD_TO_AND_FACE_TO':
        case 'PATH_TO_AND_FACE_TO':
        case 'GO_TO_AND_FACE_BACK_TO':
        case 'MOVE_FORWARD_TO_AND_FACE_BACK_TO':
        case 'PATH_TO_AND_FACE_BACK_TO':
            t = { type: 'MOVEMENT', subtype: kind, position_x: defX, position_y: defY,
                  face_x: defX + 200, face_y: defY, desc: kind };
            break;

        default:
            return;
    }
    editorAppendTask(t);
}

/**
 * Selectionne une instruction (sans task interne). iTask = null.
 */
function editorSetCurrentInstruction(idx) {
    window.editor.selectedTaskRef = { iInstr: idx, iTask: null };
    editorRenderInstructionsList();
}

// ============================================================================
// Rendu
// ============================================================================

/**
 * Reconstruit le DOM de la liste des instructions / tasks.
 */
function editorRenderInstructionsList() {
    var container = document.getElementById('editorInstructionsList');
    if (!container) return;
    var s = window.editor.strategy;
    if (s.instructions.length === 0) {
        container.innerHTML = '<em>(aucune instruction)</em>';
        editorRenderEditPanel();
        editorRenderLayer();
        return;
    }
    var sel = window.editor.selectedTaskRef;
    var html = '';
    s.instructions.forEach(function (instr, iInstr) {
        var isSelInstr = sel && sel.iInstr === iInstr;
        var borderColor = isSelInstr ? '#4caf50' : '#999';
        var borderWidth = isSelInstr ? '3px' : '1px';
        var bgColor = isSelInstr ? '#f1fff1' : 'transparent';
        html += '<div class="editorInstruction" style="margin-top:2px; border:' + borderWidth + ' solid ' + borderColor + '; padding:4px; background:' + bgColor + ';" data-instr-header="' + iInstr + '">';
        html += '<div style="font-weight:bold; cursor:pointer;" title="Cliquer pour selectionner cette instruction (les prochaines tasks y seront ajoutees)">';
        html += '#' + (instr.id || (iInstr + 1)) + ' ';
        html += '<input type="text" data-instr-desc="' + iInstr + '" value="' + editorEscapeAttr(instr.desc || '') + '" style="width:280px; font-size:20px;"/>';
        // Controles instruction
        html += ' <button type="button" style="font-size:18px;" data-move-instr-up="' + iInstr + '" title="Monter">&#9650;</button>';
        html += ' <button type="button" style="font-size:18px;" data-move-instr-down="' + iInstr + '" title="Descendre">&#9660;</button>';
        html += ' <button type="button" style="font-size:18px;" data-delete-instr="' + iInstr + '" title="Supprimer l\'instruction">&#128465;</button>';
        html += '</div>';

        // Champs optionnels (format JSON §2.2 : points, priority, estimatedDurationSec, flags)
        html += '<details style="margin:2px 0 2px 8px; font-size:13px;">';
        html += '<summary style="cursor:pointer; color:#666;">Meta (points/priority/flags)</summary>';
        html += '<div style="padding:2px 6px; display:flex; flex-wrap:wrap; gap:4px 8px;">';
        html += '<label title="Points attendus si succes">points: <input type="number" style="width:60px;" data-instr-meta="points:' + iInstr + '" value="' + editorEscapeAttr(instr.points != null ? instr.points : '') + '"/></label>';
        html += '<label title="Priorite (plus eleve = choisi en premier)">priority: <input type="number" style="width:60px;" data-instr-meta="priority:' + iInstr + '" value="' + editorEscapeAttr(instr.priority != null ? instr.priority : '') + '"/></label>';
        html += '<label title="estimatedDurationSec : duree estimee en secondes (pour gestion du temps restant)">EDSec: <input type="number" step="0.5" style="width:60px;" data-instr-meta="estimatedDurationSec:' + iInstr + '" value="' + editorEscapeAttr(instr.estimatedDurationSec != null ? instr.estimatedDurationSec : '') + '"/></label>';
        html += '<label title="Flag requis pour que l\'instruction s\'execute (skip sinon)">needed_flag: <input type="text" style="width:120px;" data-instr-meta="needed_flag:' + iInstr + '" value="' + editorEscapeAttr(instr.needed_flag || '') + '"/></label>';
        html += '<label title="Flag leve apres succes de l\'instruction">action_flag: <input type="text" style="width:120px;" data-instr-meta="action_flag:' + iInstr + '" value="' + editorEscapeAttr(instr.action_flag || '') + '"/></label>';
        html += '<label title="Flags a effacer apres succes (separes par virgule)">clear_flags: <input type="text" style="width:160px;" data-instr-meta="clear_flags:' + iInstr + '" value="' + editorEscapeAttr(Array.isArray(instr.clear_flags) ? instr.clear_flags.join(',') : '') + '"/></label>';
        html += '</div></details>';

        html += '<ul style="margin:2px 0 0 20px;">';
        instr.tasks.forEach(function (task, iTask) {
            var isSel = sel && sel.iInstr === iInstr && sel.iTask === iTask;
            html += '<li class="editorTaskItem' + (isSel ? ' selected' : '') + '"';
            html += ' data-sel-instr="' + iInstr + '" data-sel-task="' + iTask + '">';
            html += '<span>' + editorEscapeHtml(editorTaskOneLine(task)) + '</span>';
            html += ' <button type="button" style="font-size:16px;" data-move-task-up="' + iInstr + ':' + iTask + '" title="Monter">&#9650;</button>';
            html += ' <button type="button" style="font-size:16px;" data-move-task-down="' + iInstr + ':' + iTask + '" title="Descendre">&#9660;</button>';
            html += ' <button type="button" style="font-size:16px;" data-delete-task="' + iInstr + ':' + iTask + '" title="Supprimer">&#128465;</button>';
            html += '</li>';
        });
        html += '</ul>';
        html += '</div>';
    });
    container.innerHTML = html;

    // Branche les boutons "choisir"
    container.querySelectorAll('[data-set-current]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            editorSetCurrentInstruction(parseInt(this.dataset.setCurrent, 10));
        });
    });

    // Clic sur l'en-tete d'une instruction : la marque comme courante. Ignore
    // les clics sur input / button / summary et tout ce qui est dans un details
    // (meta fields) ou dans la liste des tasks (qui ont leurs propres handlers).
    container.querySelectorAll('[data-instr-header]').forEach(function (el) {
        el.addEventListener('click', function (ev) {
            var tag = ev.target.tagName;
            if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'LABEL') return;
            if (ev.target.closest && ev.target.closest('details')) return;
            if (ev.target.closest && ev.target.closest('.editorTaskItem')) return;
            editorSetCurrentInstruction(parseInt(this.dataset.instrHeader, 10));
        });
    });

    // Edition inline du desc d'une instruction
    container.querySelectorAll('[data-instr-desc]').forEach(function (inp) {
        inp.addEventListener('input', function () {
            var i = parseInt(this.dataset.instrDesc, 10);
            if (!isNaN(i) && window.editor.strategy.instructions[i]) {
                window.editor.strategy.instructions[i].desc = this.value;
                editorMarkDirty();
            }
        });
    });

    // Edition des champs meta d'une instruction (points, priority, flags)
    container.querySelectorAll('[data-instr-meta]').forEach(function (inp) {
        inp.addEventListener('input', function () {
            var parts = this.dataset.instrMeta.split(':');
            var field = parts[0];
            var i = parseInt(parts[1], 10);
            var instr = window.editor.strategy.instructions[i];
            if (!instr) return;
            var val = this.value;
            if (field === 'points' || field === 'priority' || field === 'estimatedDurationSec') {
                if (val === '') { delete instr[field]; }
                else { var n = parseFloat(val); instr[field] = isNaN(n) ? val : n; }
            } else if (field === 'clear_flags') {
                if (val.trim() === '') { delete instr[field]; }
                else { instr[field] = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
            } else {
                // needed_flag, action_flag
                if (val.trim() === '') { delete instr[field]; }
                else { instr[field] = val; }
            }
            editorMarkDirty();
        });
    });

    // Selection d'une task au clic (hors clic sur les boutons)
    container.querySelectorAll('.editorTaskItem').forEach(function (li) {
        li.addEventListener('click', function (ev) {
            if (ev.target.tagName === 'BUTTON') return;
            window.editor.selectedTaskRef = {
                iInstr: parseInt(this.dataset.selInstr, 10),
                iTask: parseInt(this.dataset.selTask, 10)
            };
            editorRenderInstructionsList();
        });
    });

    // Boutons ⬆⬇🗑 sur instructions
    container.querySelectorAll('[data-move-instr-up]').forEach(function (b) {
        b.addEventListener('click', function () {
            editorMoveInstruction(parseInt(this.dataset.moveInstrUp, 10), -1);
        });
    });
    container.querySelectorAll('[data-move-instr-down]').forEach(function (b) {
        b.addEventListener('click', function () {
            editorMoveInstruction(parseInt(this.dataset.moveInstrDown, 10), +1);
        });
    });
    container.querySelectorAll('[data-delete-instr]').forEach(function (b) {
        b.addEventListener('click', function () {
            editorDeleteInstruction(parseInt(this.dataset.deleteInstr, 10));
        });
    });

    // Boutons ⬆⬇🗑 sur tasks
    container.querySelectorAll('[data-move-task-up]').forEach(function (b) {
        b.addEventListener('click', function () {
            var p = this.dataset.moveTaskUp.split(':');
            editorMoveTask(parseInt(p[0], 10), parseInt(p[1], 10), -1);
        });
    });
    container.querySelectorAll('[data-move-task-down]').forEach(function (b) {
        b.addEventListener('click', function () {
            var p = this.dataset.moveTaskDown.split(':');
            editorMoveTask(parseInt(p[0], 10), parseInt(p[1], 10), +1);
        });
    });
    container.querySelectorAll('[data-delete-task]').forEach(function (b) {
        b.addEventListener('click', function () {
            var p = this.dataset.deleteTask.split(':');
            editorDeleteTask(parseInt(p[0], 10), parseInt(p[1], 10));
        });
    });

    editorRenderEditPanel();
    editorRenderLayer();
    // Sync boutons BLEU/JAUNE en bas (activation suivant presence d'instructions)
    editorUpdateLoadedSlotUi();
}

/**
 * Representation texte d'une task pour la liste (une ligne).
 */
function editorTaskOneLine(task) {
    if (!task) return '';
    if (task.desc) return task.desc;
    return taskSummary(task);  // reutilise la fct de visualisator.js
}

function editorEscapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function editorEscapeAttr(s) { return editorEscapeHtml(s); }

/**
 * Definition des champs editables par (type, subtype).
 * Retourne un tableau [{ key, label, kind? }].
 */
function editorFieldsForTask(task) {
    var fields = [];
    var t = task.type, st = task.subtype || '';
    var POS = [
        { key: 'position_x', label: 'position_x (mm)', kind: 'number' },
        { key: 'position_y', label: 'position_y (mm)', kind: 'number' }
    ];
    if (t === 'MOVEMENT') {
        var primPos = ['GO_TO', 'PATH_TO', 'MOVE_FORWARD_TO', 'MOVE_BACKWARD_TO',
                       'GO_BACK_TO', 'PATH_BACK_TO', 'FACE_TO', 'FACE_BACK_TO'];
        if (primPos.indexOf(st) !== -1) fields = fields.concat(POS);
        if (st === 'LINE') fields.push({ key: 'dist', label: 'dist (mm, signe)', kind: 'number' });
        if (st === 'ROTATE_DEG') {
            fields.push({ key: 'angle_deg', label: 'angle_deg (° RELATIF, +=CCW / -=CW)', kind: 'number' });
        }
        if (st === 'ROTATE_ABS_DEG') {
            fields.push({ key: 'angle_deg', label: 'angle_deg (° ABSOLU, heading cible)', kind: 'number' });
        }
        if (st === 'ORBITAL_TURN_DEG') {
            fields.push({ key: 'angle_deg', label: 'angle_deg (° RELATIF, arc pivot)', kind: 'number' });
            fields.push({ key: 'forward', label: 'forward (true/false)' });
            fields.push({ key: 'turn_right', label: 'turn_right (true/false)' });
        }
        if (st === 'MANUAL_PATH') fields.push({ key: 'waypoints', label: 'waypoints [[x,y],...]', kind: 'textarea' });
        // Composites : dest + complement
        if (st.indexOf('_AND_') !== -1) {
            if (!fields.some(function (f) { return f.key === 'position_x'; })) fields = fields.concat(POS);
            if (st.indexOf('_AND_ROTATE_ABS_DEG') !== -1) fields.push({ key: 'final_angle_deg', label: 'final_angle_deg (° ABSOLU, heading final)', kind: 'number' });
            if (st.indexOf('_AND_ROTATE_REL_DEG') !== -1) fields.push({ key: 'rotate_rel_deg', label: 'rotate_rel_deg (° RELATIF, delta post-arrivée)', kind: 'number' });
            if (st.indexOf('_AND_FACE_TO') !== -1 || st.indexOf('_AND_FACE_BACK_TO') !== -1) {
                fields.push({ key: 'face_x', label: 'face_x (mm)', kind: 'number' });
                fields.push({ key: 'face_y', label: 'face_y (mm)', kind: 'number' });
            }
        }
    } else if (t === 'MANIPULATION') {
        fields.push({ key: 'action_id', label: 'action_id' });
    } else if (t === 'ELEMENT') {
        fields.push({ key: 'subtype', label: 'subtype (ADD_ZONE | DELETE_ZONE)' });
        fields.push({ key: 'item_id', label: 'item_id' });
    } else if (t === 'SPEED') {
        fields.push({ key: 'speed_percent', label: 'speed_percent (0..100)', kind: 'number' });
    } else if (t === 'WAIT') {
        fields.push({ key: 'duration_ms', label: 'duration_ms', kind: 'number' });
    }
    // Champs communs a toutes les tasks (spec §2.3 et §3.3)
    fields.push({ key: 'timeout', label: 'timeout (ms, -1 = aucun)', kind: 'number' });
    fields.push({ key: 'needed_flag', label: 'needed_flag (skip task si flag non actif)' });
    fields.push({ key: 'desc', label: 'desc (libelle affiche)' });
    return fields;
}

/**
 * Construit le form d'edition de la task selectionnee.
 */
function editorRenderEditPanel() {
    var body = document.getElementById('editorTaskEditBody');
    if (!body) return;
    var sel = window.editor.selectedTaskRef;
    if (!sel) {
        body.innerHTML = '<em>(aucune selection)</em>';
        return;
    }
    var instr = window.editor.strategy.instructions[sel.iInstr];
    if (!instr) { body.innerHTML = '<em>Instruction introuvable</em>'; return; }
    if (sel.iTask == null) {
        // Instruction seule selectionnee (pas de task) : message adapte
        body.innerHTML = '<em>Instruction #' + (instr.id || (sel.iInstr + 1))
            + ' selectionnee (' + (instr.tasks ? instr.tasks.length : 0) + ' tache(s)). '
            + 'Cliquer sur une tache pour l\'editer.</em>';
        return;
    }
    var task = instr.tasks[sel.iTask];
    if (!task) { body.innerHTML = '<em>Task introuvable</em>'; return; }

    var html = '';
    html += '<div>Type : <strong>' + editorEscapeHtml(task.type || '') + '</strong>';
    if (task.subtype) html += ' / <strong>' + editorEscapeHtml(task.subtype) + '</strong>';
    html += ' &nbsp; (instr #' + (instr.id || (sel.iInstr + 1));
    html += ', task ' + (sel.iTask + 1) + ')</div>';

    editorFieldsForTask(task).forEach(function (f) {
        var v = task[f.key];
        if (v === undefined) v = '';
        if (f.kind === 'textarea') {
            var txt = (typeof v === 'string') ? v : JSON.stringify(v);
            html += '<div style="margin-top:2px;"><label>' + editorEscapeHtml(f.label) + ' :<br>';
            html += '<textarea data-edit-field="' + f.key + '" style="width:650px; height:50px; font-size:20px;">';
            html += editorEscapeHtml(txt);
            html += '</textarea></label></div>';
        } else {
            var type = (f.kind === 'number') ? 'number' : 'text';
            var width = (type === 'number') ? 150 : 400;
            html += '<div style="margin-top:2px;"><label>' + editorEscapeHtml(f.label) + ' : ';
            html += '<input type="' + type + '" data-edit-field="' + f.key + '"';
            html += ' value="' + editorEscapeAttr(v) + '" style="width:' + width + 'px;"/>';
            html += '</label></div>';
        }
    });

    html += '<div style="margin-top:2px;">';
    html += '<button type="button" id="editorDeleteTask">Supprimer cette task</button> ';
    html += '<button type="button" id="editorUnselect">Deselectionner</button>';
    html += '</div>';
    body.innerHTML = html;

    // input = maj state live + re-render canvas (sans rebuild liste => pas de perte focus)
    body.querySelectorAll('[data-edit-field]').forEach(function (inp) {
        inp.addEventListener('input', function () {
            editorApplyFieldEdit(task, this.dataset.editField, this.value);
            editorRenderLayer();
        });
        // change = perte focus => resync la liste (libelle mis a jour)
        inp.addEventListener('change', editorRenderInstructionsList);
    });

    var delBtn = document.getElementById('editorDeleteTask');
    if (delBtn) delBtn.addEventListener('click', editorDeleteSelectedTask);
    var unselBtn = document.getElementById('editorUnselect');
    if (unselBtn) unselBtn.addEventListener('click', function () {
        window.editor.selectedTaskRef = null;
        editorRenderInstructionsList();
    });
}

/**
 * Applique l'edition d'un champ : conversion type + cas speciaux (waypoints).
 */
function editorApplyFieldEdit(task, key, val) {
    if (key === 'waypoints') {
        try { task[key] = JSON.parse(val); editorMarkDirty(); } catch (e) { /* invalide */ }
        return;
    }
    if (key === 'forward' || key === 'turn_right') {
        task[key] = (val === 'true' || val === '1');
        editorMarkDirty();
        return;
    }
    // Arrondi specifique par type de champ :
    // - positions (mm, 2 decimales) / angles (deg, 2 decimales) : editorRound2
    // - distances / entiers (dist, timeout, duration_ms, speed_percent) : arrondi mm/entier
    var decimal2Keys = ['position_x', 'position_y', 'face_x', 'face_y',
        'angle_deg', 'final_angle_deg', 'rotate_rel_deg'];
    var integerKeys = ['dist', 'timeout', 'duration_ms', 'speed_percent'];
    if (decimal2Keys.indexOf(key) !== -1) {
        if (val === '') { delete task[key]; }
        else { var n1 = parseFloat(val); task[key] = isNaN(n1) ? 0 : editorRound2(n1); }
        editorMarkDirty();
        return;
    }
    if (integerKeys.indexOf(key) !== -1) {
        if (val === '') { delete task[key]; }
        else { var n2 = parseFloat(val); task[key] = isNaN(n2) ? 0 : Math.round(n2); }
        editorMarkDirty();
        return;
    }
    // Champs string : supprime la cle si vide (evite "needed_flag": "" dans JSON)
    if (val === '') { delete task[key]; }
    else { task[key] = val; }
    editorMarkDirty();
}

// ============================================================================
// Menu contextuel zone (clic-droit)
// ============================================================================

/**
 * Intercepte le clic-droit sur le canvas en mode edition, identifie la zone
 * sous le pointeur et affiche un menu DELETE_ZONE / ADD_ZONE.
 */
function editorOnCanvasContextMenu(ev) {
    if (window.editor.mode !== 'edit') return;
    ev.preventDefault();
    // Si on est en mode construction MANUAL_PATH, le clic-droit finalise
    var active = window.editor.activeCommand;
    if (active && active.cmd === 'MANUAL_PATH') {
        editorFinalizeManualPath();
        return;
    }
    if (typeof stage === 'undefined' || !stage) return;

    var canvas = document.getElementById('canvas');
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var canvasX = (ev.clientX - rect.left) * scaleX;
    var canvasY = (ev.clientY - rect.top) * scaleY;

    var objs = stage.getObjectsUnderPoint(canvasX, canvasY) || [];
    var zoneId = null;
    for (var i = 0; i < objs.length; i++) {
        var n = objs[i].name;
        if (n && n.indexOf('_margin') === -1) {
            zoneId = n;
            break;
        }
    }
    if (!zoneId) {
        editorHideContextMenu();
        return;
    }
    editorShowContextMenu(ev.clientX, ev.clientY, zoneId);
}

function editorShowContextMenu(pageX, pageY, zoneId) {
    editorHideContextMenu();
    var menu = document.createElement('div');
    menu.id = 'editorContextMenu';
    menu.className = 'editorContextMenu';
    menu.style.left = pageX + 'px';
    menu.style.top = pageY + 'px';
    menu.innerHTML =
        '<div style="font-weight:bold; padding:2px 4px;">Zone : ' + editorEscapeHtml(zoneId) + '</div>' +
        '<button type="button" data-elem-action="DELETE_ZONE">DELETE_ZONE</button>' +
        '<button type="button" data-elem-action="ADD_ZONE">ADD_ZONE</button>';
    document.body.appendChild(menu);
    menu.querySelectorAll('[data-elem-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            editorAppendTask({
                type: 'ELEMENT',
                subtype: this.dataset.elemAction,
                item_id: zoneId,
                desc: this.dataset.elemAction + ' ' + zoneId
            });
            editorHideContextMenu();
        });
    });
}

function editorHideContextMenu() {
    var menu = document.getElementById('editorContextMenu');
    if (menu) menu.remove();
}

/**
 * Supprime la task actuellement selectionnee.
 */
function editorDeleteSelectedTask() {
    var sel = window.editor.selectedTaskRef;
    if (!sel) return;
    editorDeleteTask(sel.iInstr, sel.iTask);
}

/**
 * Supprime la task (iInstr, iTask) et deselectionne si c'etait celle-la.
 */
function editorDeleteTask(iInstr, iTask) {
    var instr = window.editor.strategy.instructions[iInstr];
    if (!instr || !Array.isArray(instr.tasks)) return;
    instr.tasks.splice(iTask, 1);
    var sel = window.editor.selectedTaskRef;
    if (sel && sel.iInstr === iInstr && sel.iTask === iTask) {
        window.editor.selectedTaskRef = null;
    } else if (sel && sel.iInstr === iInstr && sel.iTask > iTask) {
        window.editor.selectedTaskRef = { iInstr: iInstr, iTask: sel.iTask - 1 };
    }
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Deplace la task dans la meme instruction (dir = -1 ou +1).
 */
function editorMoveTask(iInstr, iTask, dir) {
    var instr = window.editor.strategy.instructions[iInstr];
    if (!instr || !Array.isArray(instr.tasks)) return;
    var j = iTask + dir;
    if (j < 0 || j >= instr.tasks.length) return;
    var tmp = instr.tasks[iTask];
    instr.tasks[iTask] = instr.tasks[j];
    instr.tasks[j] = tmp;
    var sel = window.editor.selectedTaskRef;
    if (sel && sel.iInstr === iInstr && sel.iTask === iTask) {
        window.editor.selectedTaskRef = { iInstr: iInstr, iTask: j };
    }
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Deplace une instruction dans la liste (dir = -1 ou +1).
 */
function editorMoveInstruction(iInstr, dir) {
    var arr = window.editor.strategy.instructions;
    var j = iInstr + dir;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[iInstr];
    arr[iInstr] = arr[j];
    arr[j] = tmp;
    var sel = window.editor.selectedTaskRef;
    if (sel) {
        if (sel.iInstr === iInstr) sel.iInstr = j;
        else if (sel.iInstr === j) sel.iInstr = iInstr;
    }
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Supprime une instruction entiere (avec confirmation si elle n'est pas vide).
 */
function editorDeleteInstruction(iInstr) {
    var arr = window.editor.strategy.instructions;
    var instr = arr[iInstr];
    if (!instr) return;
    if (instr.tasks && instr.tasks.length > 0) {
        if (!confirm('Supprimer l\'instruction #' + (instr.id || (iInstr + 1))
                + ' et ses ' + instr.tasks.length + ' task(s) ?')) return;
    }
    arr.splice(iInstr, 1);
    var sel = window.editor.selectedTaskRef;
    if (sel) {
        if (sel.iInstr === iInstr) window.editor.selectedTaskRef = null;
        else if (sel.iInstr > iInstr) sel.iInstr -= 1;
    }
    editorMarkDirty();
    editorRenderInstructionsList();
}

// ============================================================================
// Rendu canvas (layer editor)
// ============================================================================

/**
 * Efface et redessine la layer editeur : trace de toutes les tasks MOVEMENT
 * depuis la pose initiale, plus pastille de la pose initiale.
 */
function editorRenderLayer() {
    var layer = window.editor._layer;
    if (!layer || typeof stage === 'undefined' || !stage) return;
    stage.setChildIndex(layer, stage.numChildren - 1);
    layer.removeAllChildren();

    // Applique le miroir si la couleur active est jaune (memes conventions que
    // l'Asserv C++ : x -> 3000-x, theta -> pi - theta).
    var mirror = (typeof matchColor !== 'undefined' && matchColor === 'jaune');

    // Pose initiale (eventuellement miroiree)
    var p0 = window.editor.initialPose;
    var p0x = mirror ? mirrorX(p0.x) : p0.x;
    var p0y = p0.y;
    var p0theta = mirror ? (Math.PI - p0.theta) : p0.theta;

    // Pastille "pose initiale"
    var startDot = new createjs.Shape();
    startDot.graphics
        .setStrokeStyle(3).beginStroke('rgba(0,120,0,1)')
        .beginFill('rgba(0,200,0,0.5)')
        .drawCircle(toCanvasX(p0x), toCanvasY(p0y), 12);
    layer.addChild(startDot);

    // Parcours des instructions et simulation de la pose (miroirisee si jaune)
    var x = p0x, y = p0y, theta = p0theta;
    void p0theta;
    window.editor.strategy.instructions.forEach(function (instr, instrIdx) {
        if (!Array.isArray(instr.tasks)) return;
        // Tracking bounding box de l'instruction si l'option encadres est on
        var bb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity, has: false };
        bb.x1 = Math.min(bb.x1, x); bb.y1 = Math.min(bb.y1, y);
        bb.x2 = Math.max(bb.x2, x); bb.y2 = Math.max(bb.y2, y); bb.has = true;
        instr.tasks.forEach(function (task) {
            var usedTask = mirror ? mirrorTask(task) : task;
            var fromX = x, fromY = y;
            var target = (typeof computeTaskTarget === 'function')
                ? computeTaskTarget(usedTask, x, y, theta)
                : null;
            if (target) {
                var color = (typeof strokeColorForTask === 'function')
                    ? strokeColorForTask(usedTask)
                    : null;
                var isMovement = usedTask.type === 'MOVEMENT';
                var st2 = usedTask.subtype || '';
                var rotDashed = (typeof isBackwardTask === 'function') && isBackwardTask(usedTask);

                if (isMovement && st2 !== 'ORBITAL_TURN_DEG' && st2 !== 'MANUAL_PATH') {
                    // Heading pendant le mouvement : atan2 pour composites, sinon target.theta
                    var heading;
                    if (st2.indexOf('_AND_') !== -1) {
                        heading = Math.atan2(target.y - fromY, target.x - fromX);
                    } else {
                        heading = target.theta;
                    }
                    // Type de rotation pour le code couleur :
                    // ROTATE_DEG / _AND_ROTATE_REL_DEG = relatif (orange)
                    // autres (ROTATE_ABS_DEG, FACE_*, composites ABS, alignement) = absolu (violet)
                    var preRotKind = (st2 === 'ROTATE_DEG') ? 'rel' : 'abs';
                    var postRotKind = (st2.indexOf('_AND_ROTATE_REL_DEG') !== -1) ? 'rel' : 'abs';
                    // Secteur de pre-rotation (rotation au depart)
                    if (Math.abs(heading - theta) > 0.01) {
                        editorDrawRotationSector(layer, fromX, fromY, theta, heading, rotDashed, preRotKind);
                    }
                    // Trait / arc (si couleur disponible = tache avec deplacement visible)
                    if (color) {
                        editorDrawSegment(layer, fromX, fromY, target.x, target.y,
                                          color, st2, usedTask, theta);
                    }
                    // Secteur de post-rotation (composites : rotation finale apres move)
                    if (st2.indexOf('_AND_') !== -1
                            && Math.abs(target.theta - heading) > 0.01) {
                        editorDrawRotationSector(layer, target.x, target.y,
                            heading, target.theta, rotDashed, postRotKind);
                    }
                } else if (isMovement && (st2 === 'ORBITAL_TURN_DEG' || st2 === 'MANUAL_PATH')) {
                    // Orbital et manual path dessinent leur arc/polyline en interne
                    if (color) {
                        editorDrawSegment(layer, fromX, fromY, target.x, target.y,
                                          color, st2, usedTask, theta);
                    }
                }
                x = target.x; y = target.y; theta = target.theta;
                bb.x1 = Math.min(bb.x1, x); bb.y1 = Math.min(bb.y1, y);
                bb.x2 = Math.max(bb.x2, x); bb.y2 = Math.max(bb.y2, y);
            }
            if (usedTask.type && usedTask.type !== 'MOVEMENT') {
                editorDrawBadge(layer, x, y, editorBadgeLetter(usedTask));
            }
        });
        // Trace encadre de l'instruction si option activee
        if (window.editor.showInstrBounds && bb.has && bb.x1 < bb.x2) {
            var label = '#' + (instr.id || (instrIdx + 1)) + ' ' + (instr.desc || '');
            editorDrawInstrBox(layer, bb.x1, bb.y1, bb.x2, bb.y2, label, instrIdx);
        }
    });

    // Memorise la pose simulee finale pour les composites 2-clics (1er clic capture from)
    window.editor._lastPose = { x: x, y: y, theta: theta };

    // Preview du premier clic d'un composite (en attente du 2e clic)
    var cb = window.editor.composite2ndBuffer;
    if (cb) {
        var destDot = new createjs.Shape();
        destDot.graphics
            .beginFill('rgba(0,200,200,0.8)').beginStroke('#0a5').setStrokeStyle(2)
            .drawCircle(toCanvasX(cb.dest.x), toCanvasY(cb.dest.y), 10);
        layer.addChild(destDot);
        var destLabel = new createjs.Text('dest', 'bold 14px Arial', '#064');
        destLabel.x = toCanvasX(cb.dest.x) + 14;
        destLabel.y = toCanvasY(cb.dest.y) - 8;
        layer.addChild(destLabel);
    }

    // Preview du MANUAL_PATH en cours de construction (buffer de waypoints
    // accumules par clic-gauche, finalise au clic-droit)
    var buf = window.editor.manualPathBuffer;
    if (buf && buf.length > 0) {
        var mpShape = new createjs.Shape();
        var gmp = mpShape.graphics.setStrokeStyle(3).setStrokeDash([6, 4])
            .beginStroke('rgba(255,20,147,0.9)')
            .moveTo(toCanvasX(x), toCanvasY(y));
        buf.forEach(function (wp) {
            gmp.lineTo(toCanvasX(wp[0]), toCanvasY(wp[1]));
        });
        layer.addChild(mpShape);
        buf.forEach(function (wp, i) {
            var dot = new createjs.Shape();
            dot.graphics.beginFill('rgba(255,20,147,0.9)').beginStroke('#fff')
                .setStrokeStyle(2).drawCircle(toCanvasX(wp[0]), toCanvasY(wp[1]), 10);
            layer.addChild(dot);
            var t = new createjs.Text(String(i + 1), 'bold 14px Arial', '#fff');
            t.x = toCanvasX(wp[0]) - 4;
            t.y = toCanvasY(wp[1]) - 8;
            layer.addChild(t);
        });
    }

    stage.update();
}

/**
 * Trace un segment entre deux points PMX avec la couleur de la task.
 * Pour ORBITAL_TURN_DEG : trace l'arc autour de la roue pivot.
 * Pour les autres subtypes : ligne droite + fleche a l'arrivee.
 * Styles spec dash : GO_BACK_TO / PATH_BACK_TO en pointille.
 */
function editorDrawSegment(layer, fromX, fromY, toX, toY, color, subtype, task, fromTheta) {
    var dashed = (typeof isBackwardTask === 'function') && task && isBackwardTask(task);
    // ORBITAL : trace l'arc echantillonne autour du pivot
    if (subtype === 'ORBITAL_TURN_DEG' && task) {
        editorDrawOrbitalArc(layer, fromX, fromY, fromTheta, task, color, dashed);
        return;
    }
    // MANUAL_PATH : trace la polyline complete (pas juste ligne directe) + fleche par segment
    if (subtype === 'MANUAL_PATH' && task && Array.isArray(task.waypoints) && task.waypoints.length > 0) {
        var shape = new createjs.Shape();
        var gp = shape.graphics.setStrokeStyle(3);
        if (dashed) gp.setStrokeDash([10, 7]);
        gp.beginStroke(color).moveTo(toCanvasX(fromX), toCanvasY(fromY));
        var prevWpX = fromX, prevWpY = fromY;
        task.waypoints.forEach(function (wp) {
            gp.lineTo(toCanvasX(wp[0]), toCanvasY(wp[1]));
            prevWpX = wp[0]; prevWpY = wp[1];
        });
        layer.addChild(shape);
        // Fleche a chaque waypoint
        prevWpX = fromX; prevWpY = fromY;
        task.waypoints.forEach(function (wp) {
            editorDrawLayerArrow(layer, toCanvasX(wp[0]), toCanvasY(wp[1]),
                toCanvasX(wp[0]) - toCanvasX(prevWpX),
                toCanvasY(wp[1]) - toCanvasY(prevWpY),
                color, 16);
            prevWpX = wp[0]; prevWpY = wp[1];
        });
        return;
    }

    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(3);
    if (dashed) g.setStrokeDash([10, 7]);
    g.beginStroke(color)
        .moveTo(toCanvasX(fromX), toCanvasY(fromY))
        .lineTo(toCanvasX(toX), toCanvasY(toY));
    layer.addChild(shape);

    // Fleche a l'arrivee (direction du deplacement)
    var dxCanvas = toCanvasX(toX) - toCanvasX(fromX);
    var dyCanvas = toCanvasY(toY) - toCanvasY(fromY);
    if (Math.abs(dxCanvas) + Math.abs(dyCanvas) > 1) {
        editorDrawLayerArrow(layer, toCanvasX(toX), toCanvasY(toY),
            dxCanvas, dyCanvas, color, 16);
    }
}

/**
 * Trace l'arc orbital pour l'apercu editor. Meme math que playOrbital cote
 * visualisator.js (demi-voie 128 mm, direction selon side + forward).
 */
function editorDrawOrbitalArc(layer, fromX, fromY, fromTheta, task, color, dashed) {
    var R = 128;
    var side = task.turn_right ? -1 : 1;
    var fwd = (task.forward !== false) ? 1 : -1;
    var pivotX = fromX - side * Math.sin(fromTheta) * R;
    var pivotY = fromY + side * Math.cos(fromTheta) * R;
    var totalAngle = (task.angle_deg || 0) * Math.PI / 180 * side * fwd;
    var N = Math.max(6, Math.floor(Math.abs(totalAngle) * 180 / Math.PI / 5));

    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(3);
    if (dashed) g.setStrokeDash([10, 7]);
    g.beginStroke(color);
    g.moveTo(toCanvasX(fromX), toCanvasY(fromY));
    var rx = fromX - pivotX, ry = fromY - pivotY;
    var lastX = fromX, lastY = fromY;
    for (var i = 1; i <= N; i++) {
        var a = totalAngle * i / N;
        var cosA = Math.cos(a), sinA = Math.sin(a);
        var px = pivotX + rx * cosA - ry * sinA;
        var py = pivotY + rx * sinA + ry * cosA;
        g.lineTo(toCanvasX(px), toCanvasY(py));
        lastX = px; lastY = py;
    }
    layer.addChild(shape);

    // Fleche a la fin de l'arc (direction tangente)
    var preA = totalAngle * (N - 1) / N;
    var preX = pivotX + rx * Math.cos(preA) - ry * Math.sin(preA);
    var preY = pivotY + rx * Math.sin(preA) + ry * Math.cos(preA);
    editorDrawLayerArrow(layer,
        toCanvasX(lastX), toCanvasY(lastY),
        toCanvasX(lastX) - toCanvasX(preX),
        toCanvasY(lastY) - toCanvasY(preY),
        color, 16);
}

/**
 * Dessine un secteur circulaire plein pour visualiser une rotation sur place
 * (FACE_TO, FACE_BACK_TO, ROTATE_DEG, ROTATE_ABS_DEG). Rayon 60mm, fill
 * violet translucide + outline violet + fleche a l'extremite de l'arc.
 */
function editorDrawRotationSector(layer, cx, cy, thetaStart, thetaEnd, dashed, rotKind) {
    var delta = thetaEnd - thetaStart;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) < 0.01) return;

    var r = 60;
    var ccx = toCanvasX(cx), ccy = toCanvasY(cy);
    // 2 couleurs : 'rel' (orange/rouge) pour rotations relatives,
    // 'abs' (violet) pour rotations absolues / alignements (FACE / heading)
    var strokeCol, fillCol;
    if (rotKind === 'rel') {
        strokeCol = 'rgba(255,90,0,0.9)';
        fillCol = 'rgba(255,90,0,0.25)';
    } else {
        strokeCol = 'rgba(140,0,200,0.9)';
        fillCol = 'rgba(140,0,200,0.25)';
    }

    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(2);
    if (dashed) g.setStrokeDash([8, 5]);
    g.beginStroke(strokeCol).beginFill(fillCol);
    g.moveTo(ccx, ccy);
    // Bord radial initial
    g.lineTo(ccx + r * Math.cos(thetaStart), ccy - r * Math.sin(thetaStart));
    // Arc echantillonne
    var N = Math.max(6, Math.floor(Math.abs(delta) * 180 / Math.PI / 5));
    for (var i = 1; i <= N; i++) {
        var t = thetaStart + delta * i / N;
        g.lineTo(ccx + r * Math.cos(t), ccy - r * Math.sin(t));
    }
    // Fermeture vers centre
    g.lineTo(ccx, ccy);
    layer.addChild(shape);

    // Fleche a l'extremite de l'arc
    var endT = thetaStart + delta;
    var endX = ccx + r * Math.cos(endT);
    var endY = ccy - r * Math.sin(endT);
    var tanX = -Math.sin(endT), tanY = -Math.cos(endT);
    if (delta < 0) { tanX = -tanX; tanY = -tanY; }
    editorDrawLayerArrow(layer, endX, endY, tanX, tanY, strokeCol, 14);
}

/**
 * Dessine un rectangle encadrant toutes les positions de l'instruction +
 * un label (id + desc) en haut. Couleur cyclique selon l'index.
 */
function editorDrawInstrBox(layer, x1, y1, x2, y2, label, instrIdx) {
    var palette = [
        'rgba(0,120,255,0.9)',
        'rgba(255,120,0,0.9)',
        'rgba(0,160,80,0.9)',
        'rgba(200,0,160,0.9)',
        'rgba(120,80,40,0.9)',
        'rgba(0,160,180,0.9)'
    ];
    var col = palette[instrIdx % palette.length];
    var pad = 30;
    var cx1 = toCanvasX(x1 - pad);
    var cy1 = toCanvasY(y2 + pad);     // y2 = max Y PMX -> min Y canvas (Y inverse)
    var cx2 = toCanvasX(x2 + pad);
    var cy2 = toCanvasY(y1 - pad);
    var w = cx2 - cx1;
    var h = cy2 - cy1;

    var shape = new createjs.Shape();
    shape.graphics
        .setStrokeStyle(2).setStrokeDash([6, 4]).beginStroke(col)
        .drawRect(cx1, cy1, w, h);
    layer.addChild(shape);

    // Label en haut a gauche du box
    var txt = new createjs.Text(label, 'bold 18px Arial', col);
    txt.x = cx1 + 4;
    txt.y = cy1 + 2;
    var txtBg = new createjs.Shape();
    txtBg.graphics
        .beginFill('rgba(255,255,255,0.85)')
        .drawRect(cx1 + 2, cy1 + 2, Math.min(w - 4, txt.getMeasuredWidth() + 6), 22);
    layer.addChild(txtBg);
    layer.addChild(txt);
}

/**
 * Dessine une pointe de fleche triangulaire dans la layer editeur.
 */
function editorDrawLayerArrow(layer, x, y, dirX, dirY, color, size) {
    size = size || 16;
    var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= len; dirY /= len;
    var bx = -dirX, by = -dirY;
    var c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
    var vx1 = bx * c30 - by * s30, vy1 = bx * s30 + by * c30;
    var vx2 = bx * c30 + by * s30, vy2 = -bx * s30 + by * c30;
    var arrow = new createjs.Shape();
    arrow.graphics
        .setStrokeStyle(2).beginStroke(color).beginFill(color)
        .moveTo(x, y)
        .lineTo(x + size * vx1, y + size * vy1)
        .lineTo(x + size * vx2, y + size * vy2)
        .closePath();
    layer.addChild(arrow);
}

/**
 * Pastille circulaire avec une lettre au centre pour les tasks non-MOVEMENT.
 */
function editorDrawBadge(layer, x, y, letter) {
    var dot = new createjs.Shape();
    dot.graphics
        .setStrokeStyle(2).beginStroke('rgba(80,80,80,1)')
        .beginFill('rgba(255,220,80,0.9)')
        .drawCircle(toCanvasX(x), toCanvasY(y), 14);
    layer.addChild(dot);
    var t = new createjs.Text(letter, 'bold 18px Arial', '#000');
    t.x = toCanvasX(x) - 5;
    t.y = toCanvasY(y) - 10;
    layer.addChild(t);
}

function editorBadgeLetter(task) {
    switch (task.type) {
        case 'MANIPULATION': return 'M';
        case 'WAIT': return 'W';
        case 'SPEED': return 'S';
        case 'ELEMENT': return 'E';
        default: return '?';
    }
}

// ============================================================================
// Import / Export JSON
// ============================================================================

function editorExportStrategy() {
    var name = window.editor.strategy.name || 'PMX0';
    var json = JSON.stringify(window.editor.strategy.instructions, null, 2);
    editorDownloadJson('strategy' + name + '.json', json);
    editorClearDirty();
}

function editorExportInit() {
    var p = window.editor.initialPose;
    // Format Esial : { x, y, theta (rad), regX, regY }
    var obj = {
        x: p.x,
        y: p.y,
        theta: p.theta,
        regX: 0,
        regY: 0
    };
    var name = window.editor.strategy.name || 'PMX0';
    editorDownloadJson('init' + name + '.json', JSON.stringify(obj, null, 2));
}

function editorDownloadJson(filename, content) {
    var blob = new Blob([content], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// ============================================================================
// Slot "Strat chargée" (hors éditeur) + toggle colonne log
// ============================================================================

/**
 * Charge un fichier strategy JSON : l'écrit dans editor.strategy.instructions
 * (état partagé lecture/édition). L'éditeur affiche la nouvelle strat, les
 * boutons ▶ Bleu/Jaune du slot "loaded" se débloquent.
 */
function editorOnLoadStratFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        var data;
        try { data = JSON.parse(e.target.result); }
        catch (err) { alert('JSON invalide : ' + err.message); return; }
        if (!Array.isArray(data)) {
            alert('Format attendu : tableau d\'instructions.');
            return;
        }
        window.editor.strategy.instructions = data;
        var base = file.name.replace(/\.json$/i, '');
        window.editor.strategy.name = base.replace(/^strategy/i, '') || 'PMX0';
        window.editor.loadedStratFileName = file.name;
        window.editor.selectedTaskRef = null;
        window.editor.dirty = false;
        var nameInput = document.getElementById('editorStratName');
        if (nameInput) nameInput.value = window.editor.strategy.name;
        // Prepare playback en bleu (Suivant/Auto se debloquent)
        if (typeof loadSimulatorStrat === 'function') {
            loadSimulatorStrat(JSON.parse(JSON.stringify(data)));
        }
        editorUpdateLoadedSlotUi();
        editorRenderInstructionsList();
    };
    reader.readAsText(file);
    ev.target.value = '';
}

/**
 * Charge un fichier initPMX JSON dans editor.initialPose.
 */
function editorOnLoadInitFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        var data;
        try { data = JSON.parse(e.target.result); }
        catch (err) { alert('JSON invalide : ' + err.message); return; }
        if (typeof data.x !== 'number' || typeof data.y !== 'number'
                || typeof data.theta !== 'number') {
            alert('initPMX invalide : il faut { x, y, theta (rad) }.');
            return;
        }
        window.editor.initialPose = { x: data.x, y: data.y, theta: data.theta };
        editorRefreshInitialPoseInputs();
        editorUpdateRobotFromInitialPose();
        editorRenderLayer();
    };
    reader.readAsText(file);
    ev.target.value = '';
}

/**
 * Met a jour le libelle de la strat chargee (fichier utilisateur ou preconfig)
 * + l'etat activé des boutons BLEU / JAUNE.
 */
function editorUpdateLoadedSlotUi() {
    var label = document.getElementById('loadedStratName');
    var bBleu = document.getElementById('playStratBleu');
    var bJaune = document.getElementById('playStratJaune');
    var hasStrat = Array.isArray(window.editor.strategy.instructions)
                   && window.editor.strategy.instructions.length > 0;

    if (label) {
        var txt;
        if (hasStrat) {
            txt = window.editor.loadedStratFileName
                || window.editor.strategy.name
                || '(strat)';
        } else {
            txt = '(aucune)';
        }
        // Indicateur de modif non exportee
        var prefix = window.editor.dirty ? '● ' : '';
        label.textContent = prefix + txt;
        label.style.color = window.editor.dirty ? '#c00' : '#555';
    }
    if (bBleu) bBleu.disabled = !hasStrat;
    if (bJaune) bJaune.disabled = !hasStrat;
    var bDraw = document.getElementById('drawStratBtn');
    if (bDraw) bDraw.disabled = !hasStrat;
    // Highlight le bouton de couleur correspondant au matchColor courant
    var color = (typeof matchColor !== 'undefined') ? matchColor : 'bleu';
    document.querySelectorAll('.btnStratBleu').forEach(function (b) {
        b.classList.toggle('active', color === 'bleu');
    });
    document.querySelectorAll('.btnStratJaune').forEach(function (b) {
        b.classList.toggle('active', color === 'jaune');
    });
}

/**
 * Appelé par les boutons "✏ Éditer" des rangs "strat PMX0" et "strat chargée".
 * - source='default' : charge strategyPMX0.json + initPMX0.json dans le state
 *   puis active le mode édition.
 * - source='loaded' : state déjà à jour (chargé via file picker) : active juste
 *   le mode édition.
 */
function editorOpenStrat(source) {
    if (source === 'default') {
        editorLoadPMX0FromDisk(function () {
            window.editor.mode = 'edit';
            editorApplyMode();
            editorRenderInstructionsList();
        });
    } else {
        window.editor.mode = 'edit';
        editorApplyMode();
        editorRenderInstructionsList();
    }
}

/**
 * Charge strategy<suffix>.json + init<suffix>.json depuis resources/<year>/
 * et les met dans editor.strategy / editor.initialPose. Ecrase la strat
 * utilisateur + reset playback. Exemple : editorLoadPreconfig('PMX0').
 */
function editorLoadPreconfig(suffix, cb) {
    if (typeof currentYear === 'undefined') { cb && cb(); return; }
    if (typeof resetTerrainAndPaths === 'function') resetTerrainAndPaths();
    window.editor.loadedStratFileName = null;
    window.editor.dirty = false;
    var stratFile = 'strategy' + suffix + '.json';
    var initFile = 'init' + suffix + '.json';
    var stratUrl = 'resources/' + currentYear + '/' + stratFile;
    var initUrl = 'resources/' + currentYear + '/' + initFile;
    $.getScript(stratUrl, function (script) {
        try {
            var arr = JSON.parse(script);
            if (Array.isArray(arr)) {
                window.editor.strategy.instructions = arr;
                window.editor.strategy.name = suffix;
                window.editor.selectedTaskRef = null;
                var nameInput = document.getElementById('editorStratName');
                if (nameInput) nameInput.value = suffix;
            }
        } catch (e) { console.error('Parse ' + stratFile + ':', e); }
        $.getScript(initUrl, function (script2) {
            try {
                var data = JSON.parse(script2);
                if (typeof data.x === 'number') {
                    window.editor.initialPose = { x: data.x, y: data.y, theta: data.theta };
                    editorRefreshInitialPoseInputs();
                    editorUpdateRobotFromInitialPose();
                }
            } catch (e) { console.error('Parse ' + initFile + ':', e); }
            // Prepare playback en bleu (Suivant/Auto se debloquent)
            if (Array.isArray(window.editor.strategy.instructions)
                    && window.editor.strategy.instructions.length > 0
                    && typeof loadSimulatorStrat === 'function') {
                loadSimulatorStrat(JSON.parse(JSON.stringify(window.editor.strategy.instructions)));
            }
            editorRenderInstructionsList();
            editorUpdateLoadedSlotUi();
            if (cb) cb();
        });
    });
}

// Wrapper backward-compat (HTML existant)
function editorLoadPMX0FromDisk(cb) { editorLoadPreconfig('PMX0', cb); }

/**
 * Cree une nouvelle strategie vide, prete a etre editee. Ecrase la strat
 * courante (avertit si non exportee ? ici on n'avertit pas, simple).
 * Pose initiale conservee (ou remise a defaut si aucune).
 */
function editorCreateNewStrategy() {
    if (typeof resetTerrainAndPaths === 'function') resetTerrainAndPaths();
    window.editor.strategy.instructions = [];
    window.editor.strategy.name = 'NEW';
    window.editor.loadedStratFileName = null;
    window.editor.selectedTaskRef = null;
    window.editor.dirty = false;
    var nameInput = document.getElementById('editorStratName');
    if (nameInput) nameInput.value = 'NEW';
    editorRenderInstructionsList();
    editorUpdateLoadedSlotUi();
    window.editor.mode = 'edit';
    editorApplyMode();
}

/**
 * Affiche / masque la colonne log (#logColumn).
 */
function editorToggleLogColumn() {
    var col = document.getElementById('logColumn');
    var btn = document.getElementById('toggleLogColumn');
    if (!col) return;
    var visible = col.style.display !== 'none' && col.style.display !== '';
    col.style.display = visible ? 'none' : 'flex';
    if (btn) btn.textContent = visible ? 'log ◂' : 'log ▸';
}

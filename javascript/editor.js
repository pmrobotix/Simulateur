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
    nextClickAction: 'PATH_TO',   // subtype du prochain clic canvas
    snapMm: 0,                    // 0 | 10 | 50 | 100
    strategy: {
        name: 'PMX0',             // nom court ; exports : strategy<nom>.json + init<nom>.json
        instructions: []          // [{ id, desc, tasks: [...] }, ...] — état partagé édition/lecture
    },
    initialPose: { x: 300, y: 300, theta: Math.PI / 2 },
    currentInstructionIdx: 0,
    selectedTaskRef: null,        // { iInstr, iTask }
    _layer: null,                 // createjs.Container pour le rendu edition
    // Nom du fichier utilisateur charge (juste pour l'affichage ; le contenu
    // est dans `strategy.instructions` ci-dessus)
    loadedStratFileName: null,
    // true = modifie depuis le dernier load/export (indicateur ●)
    dirty: false,
    // true = editor layer toujours visible (bouton "Dessiner strat")
    previewAlways: false
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

    // Select "prochain clic" (active pour etape 2, seul POSE_INIT fait qqch)
    var sel = document.getElementById('editorNextClick');
    if (sel) {
        sel.disabled = false;
        sel.value = window.editor.nextClickAction;
        sel.addEventListener('change', function () {
            window.editor.nextClickAction = this.value;
        });
    }

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

    // Boutons "+ LINE", "+ ROTATE_DEG", etc.
    document.querySelectorAll('[data-add-task]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            editorAddNonClickTask(this.dataset.addTask);
        });
    });

    editorRenderInstructionsList();
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
        toggleBtn.textContent = isEdit ? '✏ édition ◂' : '✏ édition ▸';
        toggleBtn.style.backgroundColor = isEdit ? '#4caf50' : '';
        toggleBtn.style.color = isEdit ? 'white' : '';
    }
    if (sidePanel) sidePanel.style.display = isEdit ? 'flex' : 'none';
    if (canvas) canvas.style.cursor = isEdit ? 'crosshair' : 'pointer';

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
    if (ix) p.x = parseFloat(ix.value) || 0;
    if (iy) p.y = parseFloat(iy.value) || 0;
    if (ith) p.theta = (parseFloat(ith.value) || 0) * Math.PI / 180;
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
function editorSnap(v) {
    var s = window.editor.snapMm;
    return s > 0 ? Math.round(v / s) * s : v;
}

/**
 * Handler createjs : un clic canvas en mode edition dispatche selon
 * `nextClickAction`.
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
 * Dispatch du clic selon l'action selectionnee dans le dropdown.
 */
function editorHandleCanvasClick(pmxX, pmxY) {
    var action = window.editor.nextClickAction;
    if (action === 'POSE_INIT') {
        window.editor.initialPose.x = pmxX;
        window.editor.initialPose.y = pmxY;
        editorMarkDirty();
        editorRefreshInitialPoseInputs();
        editorUpdateRobotFromInitialPose();
        editorRenderLayer();
        return;
    }
    // Primitives 1-clic MOVEMENT : GO_TO, PATH_TO, MOVE_FORWARD_TO,
    // MOVE_BACKWARD_TO, FACE_TO
    var movementSubtypes = ['GO_TO', 'PATH_TO', 'MOVE_FORWARD_TO',
                            'MOVE_BACKWARD_TO', 'FACE_TO'];
    if (movementSubtypes.indexOf(action) !== -1) {
        var task = {
            type: 'MOVEMENT',
            subtype: action,
            position_x: pmxX,
            position_y: pmxY,
            desc: action + ' (' + pmxX + ',' + pmxY + ')'
        };
        editorAppendTask(task);
    }
}

// ============================================================================
// Gestion des instructions
// ============================================================================

/**
 * Renvoie l'instruction courante (la cree si necessaire).
 */
function editorEnsureCurrentInstruction() {
    var s = window.editor.strategy;
    if (s.instructions.length === 0) {
        editorAddInstruction();
    }
    if (window.editor.currentInstructionIdx >= s.instructions.length) {
        window.editor.currentInstructionIdx = s.instructions.length - 1;
    }
    return s.instructions[window.editor.currentInstructionIdx];
}

/**
 * Cree une nouvelle instruction vide et la definit comme courante.
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
    window.editor.currentInstructionIdx = s.instructions.length - 1;
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Ajoute une task a l'instruction courante.
 */
function editorAppendTask(task) {
    var sel = window.editor.selectedTaskRef;
    // Option B : si une task est selectionnee, on insere la nouvelle JUSTE APRES
    // dans la meme instruction. Sinon, append a la fin de l'instruction courante.
    if (sel) {
        var instrSel = window.editor.strategy.instructions[sel.iInstr];
        if (instrSel && Array.isArray(instrSel.tasks)) {
            instrSel.tasks.splice(sel.iTask + 1, 0, task);
            window.editor.selectedTaskRef = { iInstr: sel.iInstr, iTask: sel.iTask + 1 };
            window.editor.currentInstructionIdx = sel.iInstr;
            editorMarkDirty();
            editorRenderInstructionsList();
            return;
        }
    }
    var instr = editorEnsureCurrentInstruction();
    instr.tasks.push(task);
    window.editor.selectedTaskRef = {
        iInstr: window.editor.currentInstructionIdx,
        iTask: instr.tasks.length - 1
    };
    editorMarkDirty();
    editorRenderInstructionsList();
}

/**
 * Ajoute une task non-clic avec des valeurs par defaut. L'utilisateur les edite
 * ensuite dans le form d'edition (ouvert automatiquement via selection).
 */
function editorAddNonClickTask(kind) {
    var t;
    switch (kind) {
        case 'LINE':
            t = { type: 'MOVEMENT', subtype: 'LINE', dist: 100, desc: 'LINE dist=100' };
            break;
        case 'ROTATE_DEG':
            t = { type: 'MOVEMENT', subtype: 'ROTATE_DEG', angle_deg: 90, desc: 'ROTATE rel +90°' };
            break;
        case 'ROTATE_ABS_DEG':
            t = { type: 'MOVEMENT', subtype: 'ROTATE_ABS_DEG', angle_deg: 0, desc: 'ROTATE abs 0° (terrain)' };
            break;
        case 'MANIPULATION':
            t = { type: 'MANIPULATION', action_id: 'a_definir', timeout: 2000, desc: 'MANIPULATION a_definir' };
            break;
        case 'WAIT':
            t = { type: 'WAIT', duration_ms: 500, desc: 'WAIT 500ms' };
            break;
        case 'SPEED':
            t = { type: 'SPEED', subtype: 'SET_SPEED', speed_percent: 50, desc: 'SPEED 50%' };
            break;
        case 'ELEMENT_DELETE':
            t = { type: 'ELEMENT', subtype: 'DELETE_ZONE', item_id: 'a_definir', desc: 'DELETE_ZONE a_definir' };
            break;
        case 'ELEMENT_ADD':
            t = { type: 'ELEMENT', subtype: 'ADD_ZONE', item_id: 'a_definir', desc: 'ADD_ZONE a_definir' };
            break;
        default:
            return;
    }
    editorAppendTask(t);
}

/**
 * Definit l'instruction courante (celle qui accueille les prochaines tasks).
 */
function editorSetCurrentInstruction(idx) {
    window.editor.currentInstructionIdx = idx;
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
        var isCurrent = (iInstr === window.editor.currentInstructionIdx);
        html += '<div class="editorInstruction" style="margin-top:2px; border:1px solid #999; padding:4px;">';
        html += '<div style="font-weight:bold;">';
        html += '#' + (instr.id || (iInstr + 1)) + ' ';
        html += '<input type="text" data-instr-desc="' + iInstr + '" value="' + editorEscapeAttr(instr.desc || '') + '" style="width:280px; font-size:20px;"/>';
        if (isCurrent) html += ' <span style="color:#4caf50;">[courante]</span>';
        else html += ' <button type="button" style="font-size:18px;" data-set-current="' + iInstr + '">choisir</button>';
        // Controles instruction
        html += ' <button type="button" style="font-size:18px;" data-move-instr-up="' + iInstr + '" title="Monter">&#9650;</button>';
        html += ' <button type="button" style="font-size:18px;" data-move-instr-down="' + iInstr + '" title="Descendre">&#9660;</button>';
        html += ' <button type="button" style="font-size:18px;" data-delete-instr="' + iInstr + '" title="Supprimer l\'instruction">&#128465;</button>';
        html += '</div>';
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
        if (st === 'ROTATE_DEG' || st === 'ROTATE_ABS_DEG') {
            fields.push({ key: 'angle_deg', label: 'angle_deg', kind: 'number' });
        }
        if (st === 'ORBITAL_TURN_DEG') {
            fields.push({ key: 'angle_deg', label: 'angle_deg', kind: 'number' });
            fields.push({ key: 'forward', label: 'forward (true/false)' });
            fields.push({ key: 'turn_right', label: 'turn_right (true/false)' });
        }
        if (st === 'MANUAL_PATH') fields.push({ key: 'waypoints', label: 'waypoints [[x,y],...]', kind: 'textarea' });
        // Composites : dest + complement
        if (st.indexOf('_AND_') !== -1) {
            if (!fields.some(function (f) { return f.key === 'position_x'; })) fields = fields.concat(POS);
            if (st.indexOf('_AND_ROTATE_ABS_DEG') !== -1) fields.push({ key: 'final_angle_deg', label: 'final_angle_deg', kind: 'number' });
            if (st.indexOf('_AND_ROTATE_REL_DEG') !== -1) fields.push({ key: 'rotate_rel_deg', label: 'rotate_rel_deg', kind: 'number' });
            if (st.indexOf('_AND_FACE_TO') !== -1 || st.indexOf('_AND_FACE_BACK_TO') !== -1) {
                fields.push({ key: 'face_x', label: 'face_x (mm)', kind: 'number' });
                fields.push({ key: 'face_y', label: 'face_y (mm)', kind: 'number' });
            }
        }
        fields.push({ key: 'timeout', label: 'timeout (ms, -1 = aucun)', kind: 'number' });
    } else if (t === 'MANIPULATION') {
        fields.push({ key: 'action_id', label: 'action_id' });
        fields.push({ key: 'timeout', label: 'timeout (ms)', kind: 'number' });
    } else if (t === 'ELEMENT') {
        fields.push({ key: 'subtype', label: 'subtype (ADD_ZONE | DELETE_ZONE)' });
        fields.push({ key: 'item_id', label: 'item_id' });
    } else if (t === 'SPEED') {
        fields.push({ key: 'speed_percent', label: 'speed_percent (0..100)', kind: 'number' });
    } else if (t === 'WAIT') {
        fields.push({ key: 'duration_ms', label: 'duration_ms', kind: 'number' });
    }
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
        body.innerHTML = '<em>(aucune task selectionnee)</em>';
        return;
    }
    var instr = window.editor.strategy.instructions[sel.iInstr];
    if (!instr) { body.innerHTML = '<em>Instruction introuvable</em>'; return; }
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
    var numericKeys = ['position_x', 'position_y', 'dist', 'angle_deg',
        'final_angle_deg', 'rotate_rel_deg', 'face_x', 'face_y',
        'timeout', 'speed_percent', 'duration_ms'];
    if (numericKeys.indexOf(key) !== -1) {
        var n = parseFloat(val);
        task[key] = isNaN(n) ? 0 : n;
        editorMarkDirty();
        return;
    }
    task[key] = val;
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
    // Maj currentInstructionIdx si necessaire
    if (window.editor.currentInstructionIdx === iInstr) {
        window.editor.currentInstructionIdx = j;
    } else if (window.editor.currentInstructionIdx === j) {
        window.editor.currentInstructionIdx = iInstr;
    }
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
    // Maj currentInstructionIdx
    if (window.editor.currentInstructionIdx >= arr.length) {
        window.editor.currentInstructionIdx = Math.max(0, arr.length - 1);
    }
    // Deselectionne si la task ciblait cette instruction
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
    window.editor.strategy.instructions.forEach(function (instr) {
        if (!Array.isArray(instr.tasks)) return;
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
                if (color && usedTask.type === 'MOVEMENT') {
                    editorDrawSegment(layer, fromX, fromY, target.x, target.y,
                                      color, usedTask.subtype);
                }
                x = target.x; y = target.y; theta = target.theta;
            }
            // Pastille pour les tasks non-MOVEMENT (MANIPULATION/WAIT/SPEED/ELEMENT)
            if (usedTask.type && usedTask.type !== 'MOVEMENT') {
                editorDrawBadge(layer, x, y, editorBadgeLetter(usedTask));
            }
        });
    });

    stage.update();
}

/**
 * Trace un segment entre deux points PMX avec la couleur de la task.
 * Styles spec dash : GO_BACK_TO / PATH_BACK_TO en pointille.
 */
function editorDrawSegment(layer, fromX, fromY, toX, toY, color, subtype) {
    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(4);
    if (subtype === 'GO_BACK_TO' || subtype === 'PATH_BACK_TO') {
        g.setStrokeDash([8, 6]);
    }
    g.beginStroke(color)
        .moveTo(toCanvasX(fromX), toCanvasY(fromY))
        .lineTo(toCanvasX(toX), toCanvasY(toY));
    layer.addChild(shape);

    // Petit rond a l'arrivee pour reperer la pose
    var dot = new createjs.Shape();
    dot.graphics
        .setStrokeStyle(2).beginStroke(color)
        .beginFill('white')
        .drawCircle(toCanvasX(toX), toCanvasY(toY), 6);
    layer.addChild(dot);
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
        window.editor.currentInstructionIdx = Math.max(0, data.length - 1);
        window.editor.selectedTaskRef = null;
        window.editor.dirty = false;
        var nameInput = document.getElementById('editorStratName');
        if (nameInput) nameInput.value = window.editor.strategy.name;
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
                window.editor.strategy.name = suffix;   // nom court (p.ex. "PMX0")
                window.editor.currentInstructionIdx = Math.max(0, arr.length - 1);
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
    window.editor.currentInstructionIdx = 0;
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

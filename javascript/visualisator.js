var stage;

var pmx;
var margin = 0;

// Toggle affichage des zones (gere les shapes de zones ajoutees par displayZone + bordures)
var zonesVisible = true;
var zonesLoaded = false;
var zoneShapeList = [];
var zoneVisibilityCache = new Map();

function registerZoneShape(shape, type) {
    shape.zoneType = type || 'all';
    zoneShapeList.push(shape);
}

function toggleZones() {
    zonesVisible = !zonesVisible;
    zoneShapeList.forEach(s => {
        if (!zonesVisible) {
            zoneVisibilityCache.set(s, s.visible);
            s.visible = false;
        } else {
            var prev = zoneVisibilityCache.get(s);
            s.visible = (prev === undefined) ? true : prev;
        }
    });
    if (stage) stage.update();
}

function setZonesOpacity(value) {
    zoneShapeList.forEach(s => { s.alpha = value; });
    if (stage) stage.update();
}

function showZones() {
    if (!zonesLoaded) {
        $.getScript(`resources/${currentYear}/table.json`, function (script) {
            loadTable(JSON.parse(script), rotateTable);
            zonesLoaded = true;
            var slider = document.getElementById('zonesOpacity');
            if (slider) setZonesOpacity(slider.value / 100);
            if (typeof matchColor !== 'undefined') applyColorFilter(matchColor);
        });
    } else {
        toggleZones();
    }
}

// Toggle affichage quadrillage 100mm (10cm) avec labels
var gridVisible = false;
var gridShape = null;
var gridLabelsShape = null;

function drawGrid() {
    if (gridShape !== null) return;

    gridShape = new createjs.Shape();
    var g = gridShape.graphics;

    // Lignes fines tous les 100mm (sauf multiples de 500mm)
    g.setStrokeStyle(1).beginStroke('rgba(0,0,0,0.25)');
    for (var x = 0; x <= TABLE_WIDTH; x += 100) {
        if (x % 500 !== 0) {
            g.moveTo(toCanvasX(x), 0).lineTo(toCanvasX(x), TABLE_HEIGHT);
        }
    }
    for (var y = 0; y <= TABLE_HEIGHT; y += 100) {
        if (y % 500 !== 0) {
            g.moveTo(0, toCanvasY(y)).lineTo(TABLE_WIDTH, toCanvasY(y));
        }
    }
    g.endStroke();

    // Lignes épaisses tous les 500mm
    g.setStrokeStyle(1.5).beginStroke('rgba(0,0,0,0.55)');
    for (var x = 0; x <= TABLE_WIDTH; x += 500) {
        g.moveTo(toCanvasX(x), 0).lineTo(toCanvasX(x), TABLE_HEIGHT);
    }
    for (var y = 0; y <= TABLE_HEIGHT; y += 500) {
        g.moveTo(0, toCanvasY(y)).lineTo(TABLE_WIDTH, toCanvasY(y));
    }
    g.endStroke();

    gridShape.alpha = 0.6;
    gridShape.visible = gridVisible;
    stage.addChild(gridShape);

    // Labels mm (axe X en bas, axe Y à gauche)
    gridLabelsShape = new createjs.Container();
    for (var x = 0; x <= TABLE_WIDTH; x += 100) {
        var labelX = new createjs.Text(x.toString(), 'bold 28px Arial', '#000');
        labelX.x = toCanvasX(x) + 4;
        labelX.y = toCanvasY(0) - 34;
        gridLabelsShape.addChild(labelX);
    }
    for (var y = 0; y <= TABLE_HEIGHT; y += 100) {
        var labelY = new createjs.Text(y.toString(), 'bold 28px Arial', '#000');
        labelY.x = 5;
        labelY.y = (y === 0) ? toCanvasY(y) - 34 : toCanvasY(y) + 2;
        gridLabelsShape.addChild(labelY);
    }
    gridLabelsShape.visible = gridVisible;
    stage.addChild(gridLabelsShape);

    stage.update();
}

function toggleGrid() {
    if (gridShape === null) {
        drawGrid();
    }
    gridVisible = !gridVisible;
    gridShape.visible = gridVisible;
    gridLabelsShape.visible = gridVisible;
    stage.update();
}

function showGrid() {
    if (gridShape === null) {
        gridVisible = true;
        drawGrid();
        var slider = document.getElementById('gridOpacity');
        if (slider) setGridOpacity(slider.value / 100);
    } else {
        toggleGrid();
    }
}

function setGridOpacity(value) {
    if (gridShape !== null) gridShape.alpha = value;
    if (gridLabelsShape !== null) gridLabelsShape.alpha = Math.min(1, value + 0.2);
    if (stage) stage.update();
}

/**
 * Affiche / masque l'image de la table (png de fond).
 */
function toggleTableImage() {
    var img = document.getElementById('table');
    if (!img) return;
    img.style.visibility = (img.style.visibility === 'hidden') ? 'visible' : 'hidden';
}

/**
 * Ajuste la taille de police d'un element (par pas de 1px). Utilise pour les
 * boutons A- / A+ des panneaux log et editeur.
 */
function adjustFontSize(elementId, delta) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var cur = parseFloat(window.getComputedStyle(el).fontSize) || 14;
    var next = Math.max(8, Math.min(40, cur + delta));
    el.style.fontSize = next + 'px';
}

/**
 * Zoom CSS du terrain (resolution interne canvas inchangee : 3000x2000).
 * La hauteur suit automatiquement via aspect-ratio CSS.
 * @param percent 20..100 (%)
 */
function setCanvasZoom(percent) {
    var wrapper = document.querySelector('.outsideWrapper');
    if (wrapper) {
        wrapper.style.width = (3000 * percent / 100) + 'px';
        wrapper.style.height = '';    /* aspect-ratio gere */
    }
    var valSpan = document.getElementById('zoomVal');
    if (valSpan) valSpan.textContent = percent + '%';
}

/**
 * Bouton "Fit" : calcule l'espace dispo horizontal ET vertical (soustrait tous
 * les elements visibles autour du canvas), prend le plus contraignant
 * (aspect 3:2 du terrain), applique au wrapper.
 */
function fitCanvasToBrowser() {
    var wrapper = document.querySelector('.outsideWrapper');
    if (!wrapper) return;
    // Largeur : soustrait tous les enfants visibles de body sauf canvasColumn
    var availW = window.innerWidth - 8;
    Array.from(document.body.children).forEach(function (el) {
        if (el.classList.contains('canvasColumn')) return;
        var style = window.getComputedStyle(el);
        if (style.display === 'none') return;
        availW -= el.offsetWidth;
    });
    // Hauteur : soustrait la hauteur de belowCanvasRow (controles sous terrain)
    var availH = window.innerHeight - 8;
    var belowRow = document.querySelector('.belowCanvasRow');
    if (belowRow) availH -= belowRow.offsetHeight;
    // Aspect ratio terrain = 3:2
    var targetW = Math.min(availW, availH * 3 / 2);
    targetW = Math.max(300, targetW);
    wrapper.style.width = targetW + 'px';
    wrapper.style.height = '';
    // Sync slider + label
    var percent = Math.round((targetW / 3000) * 100);
    var slider = document.getElementById('canvasZoom');
    if (slider) slider.value = Math.max(20, Math.min(100, percent));
    var valSpan = document.getElementById('zoomVal');
    if (valSpan) valSpan.textContent = percent + '%';
}

// Convention PMX-CORTEX
//   X horizontal: 0..3000 (mm)
//   Y vertical:   0..2000 (mm), 0 en bas
//   Angle: radians, sens trigo (+ = CCW, 0 = vers +X)
// Canvas: origine en haut-gauche, Y vers le bas, rotation CW en degres
const TABLE_WIDTH = 3000;
const TABLE_HEIGHT = 2000;
function toCanvasX(x) { return x; }
function toCanvasY(y) { return TABLE_HEIGHT - y; }
function toCanvasRotationDeg(thetaRad) { return -thetaRad * (180 / Math.PI); }

// Robot PMX: forme identique au symbol SVG bot-OPOS6UL (OPOS6UL_SvgWriterExtended.cpp)
//   - cercle bounding (r=140, diametre 28 cm) en pointille
//   - corps octogonal (6 sommets) avec corde arriere a 128 mm du centre (+ chanfreins)
//   - repere central et trait d'orientation (+X = avant)
const ROBOT_RADIUS = 140;
function drawPmxRobot(shape, fill, stroke) {
    var r = ROBOT_RADIUS;

    // Cercle bounding en pointille (contour theorique 28 cm)
    shape.graphics
        .setStrokeStyle(2)
        .setStrokeDash([2, 8])
        .beginStroke(stroke)
        .drawCircle(0, 0, r);

    // Corps du robot: octogone avec corde arriere
    shape.graphics
        .setStrokeDash([])
        .setStrokeStyle(3)
        .beginStroke(stroke)
        .beginFill(fill)
        .moveTo(-128, -55)
        .lineTo(-128,  55)
        .lineTo( -55,  129)
        .lineTo(  55,  129)
        .lineTo(  55, -128)
        .lineTo( -55, -129)
        .closePath();

    // Marqueur de centre
    shape.graphics
        .setStrokeStyle(2)
        .beginStroke(stroke)
        .drawCircle(0, 0, 10);
}

var stratSimulator;
var stratIndex = 0;
var timestampLog;

// Temps de base pour les animations (ms). Modifiables via le slider "Vitesse
// playback" via setPlaybackSpeedFactor() : les temps effectifs sont divises par
// le facteur (factor=2 => deux fois plus rapide).
var BASE_ROTATION_TIME = 100;
var BASE_MOVE_TIME = 600;
var playbackSpeedFactor = 1;
var rotationTime = BASE_ROTATION_TIME;
var moveTime = BASE_MOVE_TIME;
function setPlaybackSpeedFactor(factor) {
    factor = parseFloat(factor) || 1;
    if (factor < 0.1) factor = 0.1;
    if (factor > 10) factor = 10;
    playbackSpeedFactor = factor;
    rotationTime = BASE_ROTATION_TIME / factor;
    moveTime = BASE_MOVE_TIME / factor;
    var lbl = document.getElementById('playbackSpeedVal');
    if (lbl) lbl.textContent = factor.toFixed(2) + 'x';
}
var detected = [];
// Shapes tracant les deplacements du robot (ligne colorees) ; nettoyees au reset.
var pathShapes = [];
// Flag : auto en cours (enchaine les tasks). Source de verite unique.
var autoPlaying = false;
// Pose logique de playback (PMX mm), independante du tween createjs.
var playbackPose = null;

function init(currentYear, rotateTable) {
    var head  = document.getElementsByTagName('head')[0];
    var link  = document.createElement('link');
    link.rel  = 'stylesheet';
    link.type = 'text/css';
    link.href = rotateTable ? 'css/visualisatorRotated.css' : 'css/visualisator.css';
    link.media = 'all';
    head.appendChild(link);
    var canvas = document.getElementById("canvas");
    canvas.width = rotateTable ? 2000 : 3000;
    canvas.height = rotateTable ? 3000 : 2000;

    $.getScript(`resources/${currentYear}/initPMX0.json`, function (script) {
        var init = JSON.parse(script);
        // Conversion PMX -> canvas pour init (x,y en coord PMX dans le JSON)
        init._cx = toCanvasX(init.x);
        init._cy = toCanvasY(init.y);
        init._crot = toCanvasRotationDeg(init.theta);
        initComplete(currentYear, init);
    });
}

/**
 * Robots and table initialization with resources/customization/currentYear.js
 */
function initComplete(currentYear, start) {
    document.getElementById("table").src = table;

    stage = new createjs.Stage("canvas");

    pmx = new createjs.Shape();
    drawPmxRobot(pmx, 'rgba(0,100,255,0.6)', 'rgba(0,0,100,1)');
    pmx.x = start._cx;
    pmx.y = start._cy;
    pmx.regX = 0;
    pmx.regY = 0;
    stage.addChild(pmx);

    stage.update();

    createjs.Ticker.setFPS(60);
    createjs.Ticker.addEventListener("tick", stage);
    initRobot(start);

    // Editeur de strategie (optionnel: editor.js peut ne pas etre charge)
    if (typeof editorInit === 'function') editorInit(start);

    // Affichage quadrillage actif par defaut
    showGrid();

    var inputs = document.querySelectorAll('.inputfile');
    Array.prototype.forEach.call(inputs, function (input) {
        var label = input.nextElementSibling,
            labelVal = label.innerHTML;

        input.addEventListener('change', function (e) {
            var fileName = '';
            if (this.files && this.files.length > 1)
                fileName = (this.getAttribute('data-multiple-caption') || '').replace('{count}', this.files.length);
            else
                fileName = e.target.value.split('\\').pop();

            if (fileName)
                label.querySelector('span').innerHTML = fileName;
            else
                label.innerHTML = labelVal;
        });
    });
}

/**
 * Mise en position de départ du robot PMX
 * @var object start : {x, y, theta, regX, regY, _cx, _cy, _crot}
 */
function initRobot(start) {
    createjs.Tween.get(pmx)
        .to({rotation: start._crot}, rotationTime, createjs.Ease.getPowInOut(4))
        .to({x: start._cx, y: start._cy}, moveTime, createjs.Ease.getPowInOut(4));
}

/**
 * Déplacement robot principal
 * @param x Position en X
 * @param y Position en Y
 * @param rotation Angle
 * @param speed Temps d'exécution
 * @param strokeColor Couleur du tracé (défaut: rose)
 */
/**
 * Deplace le robot avec animation + trace de la ligne.
 * @param fromX/fromY optionnels : coord PMX de depart (pour la ligne + point
 *     de depart du tween). Si absents, utilise pmx.x/y actuel.
 * L'utilisation des fromX/fromY permet d'enchainer correctement les taches
 * meme si un tween precedent est encore en cours (kill + resume from that pose).
 */
/**
 * Dessine une pointe de fleche triangulaire a (x, y) orientee dans la direction
 * (dirX, dirY) (repere canvas, Y vers le bas). Couleur + taille configurables.
 */
function drawArrowHead(x, y, dirX, dirY, color, size) {
    size = size || 18;
    var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= len; dirY /= len;
    // Base dir = -tangent (pointe vers l'arriere depuis la pointe)
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
    stage.addChild(arrow);
    pathShapes.push(arrow);
}

/**
 * Dessine un petit arc + fleche pour visualiser une rotation sur place
 * (FACE_TO, ROTATE_*). Parametres : centre en coord canvas, angles en rad PMX.
 * Prend l'arc le plus court (±π). La fleche indique le sens de rotation.
 */
function drawRotationArc(cx, cy, thetaStart, thetaEnd, dashed, rotKind) {
    var delta = thetaEnd - thetaStart;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) < 0.01) return;

    var r = 60;
    var strokeCol, fillCol;
    if (rotKind === 'rel') {
        strokeCol = 'rgba(255,90,0,0.9)';
        fillCol = 'rgba(255,90,0,0.25)';
    } else {
        strokeCol = 'rgba(140,0,200,0.9)';
        fillCol = 'rgba(140,0,200,0.25)';
    }

    // Secteur plein (pie slice) : 2 bords radiaux + arc echantillonne
    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(2);
    if (dashed) g.setStrokeDash([10, 7]);
    g.beginStroke(strokeCol).beginFill(fillCol);
    g.moveTo(cx, cy);
    g.lineTo(cx + r * Math.cos(thetaStart), cy - r * Math.sin(thetaStart));
    var N = Math.max(6, Math.floor(Math.abs(delta) * 180 / Math.PI / 5));
    for (var i = 1; i <= N; i++) {
        var t = thetaStart + delta * i / N;
        g.lineTo(cx + r * Math.cos(t), cy - r * Math.sin(t));
    }
    g.lineTo(cx, cy);
    stage.addChild(shape);
    pathShapes.push(shape);

    // Fleche a l'extremite de l'arc
    var endT = thetaStart + delta;
    var endX = cx + r * Math.cos(endT);
    var endY = cy - r * Math.sin(endT);
    var tanX = -Math.sin(endT), tanY = -Math.cos(endT);
    if (delta < 0) { tanX = -tanX; tanY = -tanY; }
    drawArrowHead(endX, endY, tanX, tanY, strokeCol, 14);
}

/**
 * Anime un ORBITAL_TURN_DEG : pivot autour d'une roue (D ou G), le robot
 * decrit un arc de cercle de rayon = demi-voie. Trace l'arc en points
 * echantillonnes + chain tween pour l'animation.
 */
function playOrbital(task, fromX, fromY, fromTheta, strokeColor, dashed) {
    var R = 128;
    var side = task.turn_right ? -1 : 1;
    var fwd = (task.forward !== false) ? 1 : -1;
    var pivotX = fromX - side * Math.sin(fromTheta) * R;
    var pivotY = fromY + side * Math.cos(fromTheta) * R;
    var totalAngle = (task.angle_deg || 0) * Math.PI / 180 * side * fwd;

    // Echantillonne l'arc en N points pour la polyline + la chain de tweens
    var N = Math.max(6, Math.floor(Math.abs(totalAngle) * 180 / Math.PI / 5));
    var pts = [];
    var rx = fromX - pivotX, ry = fromY - pivotY;
    for (var i = 1; i <= N; i++) {
        var a = totalAngle * i / N;
        var cosA = Math.cos(a), sinA = Math.sin(a);
        pts.push({
            x: pivotX + rx * cosA - ry * sinA,
            y: pivotY + rx * sinA + ry * cosA,
            theta: fromTheta + a
        });
    }

    // Trace polyline (pointillee si task "arriere" = forward:false)
    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(3);
    if (dashed) g.setStrokeDash([10, 7]);
    g.beginStroke(strokeColor);
    g.moveTo(toCanvasX(fromX), toCanvasY(fromY));
    pts.forEach(function (p) { g.lineTo(toCanvasX(p.x), toCanvasY(p.y)); });
    stage.addChild(shape);
    pathShapes.push(shape);
    // Fleche a la fin de l'arc
    if (pts.length >= 2) {
        var last = pts[pts.length - 1];
        var prev = pts[pts.length - 2];
        drawArrowHead(toCanvasX(last.x), toCanvasY(last.y),
            toCanvasX(last.x) - toCanvasX(prev.x),
            toCanvasY(last.y) - toCanvasY(prev.y),
            strokeColor, 16);
    }

    // Tween chain : on tween conjointement x, y, rotation entre chaque pt
    createjs.Tween.removeTweens(pmx);
    pmx.x = toCanvasX(fromX);
    pmx.y = toCanvasY(fromY);
    pmx.rotation = toCanvasRotationDeg(fromTheta);
    stage.update();
    var tween = createjs.Tween.get(pmx);
    var segTime = (moveTime + rotationTime) / N;
    pts.forEach(function (p) {
        tween = tween.to({
            x: toCanvasX(p.x),
            y: toCanvasY(p.y),
            rotation: toCanvasRotationDeg(p.theta)
        }, segTime);
    });
}

/**
 * Anime un MANUAL_PATH : pour chaque waypoint, tourne vers la direction du
 * segment puis avance. Trace aussi la polyline.
 */
function playManualPath(waypoints, fromX, fromY, strokeColor) {
    // Polyline complete
    var shape = new createjs.Shape();
    var g = shape.graphics.setStrokeStyle(3).beginStroke(strokeColor);
    g.moveTo(toCanvasX(fromX), toCanvasY(fromY));
    waypoints.forEach(function (wp) {
        g.lineTo(toCanvasX(wp[0]), toCanvasY(wp[1]));
    });
    stage.addChild(shape);
    pathShapes.push(shape);

    createjs.Tween.removeTweens(pmx);
    pmx.x = toCanvasX(fromX);
    pmx.y = toCanvasY(fromY);
    stage.update();

    var tween = createjs.Tween.get(pmx);
    var prevX = fromX, prevY = fromY;
    var segMove = moveTime / waypoints.length;
    waypoints.forEach(function (wp) {
        var heading = Math.atan2(wp[1] - prevY, wp[0] - prevX);
        tween = tween
            .to({ rotation: toCanvasRotationDeg(heading) }, rotationTime, createjs.Ease.getPowInOut(4))
            .to({ x: toCanvasX(wp[0]), y: toCanvasY(wp[1]) }, segMove, createjs.Ease.getPowInOut(4));
        // Fleche a chaque waypoint (direction du segment)
        drawArrowHead(toCanvasX(wp[0]), toCanvasY(wp[1]),
            toCanvasX(wp[0]) - toCanvasX(prevX),
            toCanvasY(wp[1]) - toCanvasY(prevY),
            strokeColor, 16);
        prevX = wp[0]; prevY = wp[1];
    });
}

/**
 * Deplace le robot avec animation + trace de la ligne.
 * @param rotation   angle (rad) pendant le deplacement (= heading). Pour un
 *                   composite _AND_*, c'est la direction du mouvement, pas
 *                   l'angle final.
 * @param finalRotation optionnel : angle (rad) a atteindre APRES le mouvement.
 *                   Si defini, ajoute une 3eme phase de rotation.
 */
function moveRobot(x, y, rotation, speed, auto = false, strokeColor = 'rgba(255,20,147,1)', fromX, fromY, finalRotation, dashed, fromTheta, rotKindPre, rotKindPost) {
    var cx = toCanvasX(x);
    var cy = toCanvasY(y);
    var startX = (fromX !== undefined) ? toCanvasX(fromX) : pmx.x;
    var startY = (fromY !== undefined) ? toCanvasY(fromY) : pmx.y;
    // Theta de depart : utilise fromTheta (pose logique) si fourni, sinon la
    // rotation courante de pmx (peut etre stale entre 2 tweens).
    var startTheta = (fromTheta !== undefined)
        ? fromTheta
        : (-pmx.rotation * Math.PI / 180);

    // Secteur de pre-rotation : rotation du robot de startTheta vers rotation
    // (motion heading). Visible si rotation delta notable (tasks de motion ET
    // pure rotations FACE_*/ROTATE_*).
    if (Math.abs(rotation - startTheta) > 0.01) {
        drawRotationArc(startX, startY, startTheta, rotation, dashed, rotKindPre);
    }
    var hasDisp = (Math.abs(cx - startX) + Math.abs(cy - startY)) > 1;
    if (hasDisp) {
        var shape = new createjs.Shape();
        var gLine = shape.graphics.setStrokeStyle(3);
        if (dashed) gLine.setStrokeDash([10, 7]);
        gLine.beginStroke(strokeColor)
            .moveTo(startX, startY)
            .lineTo(cx, cy);
        stage.addChild(shape);
        pathShapes.push(shape);
        drawArrowHead(cx, cy, cx - startX, cy - startY, strokeColor, 16);
        // Secteur de post-rotation (composites : rotation finale apres arrivee)
        if (finalRotation !== undefined && finalRotation !== null
                && Math.abs(finalRotation - rotation) > 0.01) {
            drawRotationArc(cx, cy, rotation, finalRotation, dashed, rotKindPost);
        }
    }

    // Kill eventuel tween en cours + snap pmx au point de depart logique.
    if (fromX !== undefined && fromY !== undefined) {
        createjs.Tween.removeTweens(pmx);
        pmx.x = startX;
        pmx.y = startY;
        if (fromTheta !== undefined) {
            pmx.rotation = toCanvasRotationDeg(fromTheta);
        }
    }
    stage.update();

    var tRotation = rotationTime;
    var tMove = moveTime;
    if (speed) {
        tRotation = speed * 1/3;
        tMove = speed * 2/3;
    }

    // Phases separees : d'abord la rotation vers la heading, PUIS le deplacement.
    // Sinon le tween combine produirait un crab walk (translation+rotation
    // simultanees = robot qui pointe dans une direction et avance dans une autre).
    var tween = createjs.Tween.get(pmx)
        .to({ rotation: toCanvasRotationDeg(rotation) },
            tRotation, createjs.Ease.getPowInOut(4))
        .to({ x: cx, y: cy }, tMove, createjs.Ease.getPowInOut(4));
    // 3eme phase pour les composites : rotation finale apres arrivee
    if (finalRotation !== undefined && finalRotation !== null) {
        tween = tween.to({ rotation: toCanvasRotationDeg(finalRotation) },
            tRotation, createjs.Ease.getPowInOut(4));
    }
    tween.call(() => {
        if (auto) {
            autoPlay();
        }
    });
}

/**
 * Convertion des angles en degrés
 * @param radians
 * @returns {number}
 */
function radiansToDegrees(radians) {
    var pi = Math.PI;
    return radians * (180 / pi);
}

/**
 * Chargement de la table et affichage des zones interdites
 * @returns {boolean}
 */
function loadTable(jsonTable, flip = false) {
    margin = jsonTable.marge;

    // Zones interdites fixes
    jsonTable.forbiddenZones.forEach(zone => {
        displayZone(zone, jsonTable, 'rgb(0,0,255)', 'rgb(0,0,200)');
    });

    // Bordures (margin de securite le long des murs) - coord canvas directes
    var shape = new createjs.Shape();
    shape.graphics.beginFill('rgb(200,0,0)').drawRect(0, 0, TABLE_WIDTH, jsonTable.marge);
    stage.addChild(shape);
    registerZoneShape(shape);

    shape = new createjs.Shape();
    shape.graphics.beginFill('rgb(200,0,0)').drawRect(0, TABLE_HEIGHT - jsonTable.marge, TABLE_WIDTH, jsonTable.marge);
    stage.addChild(shape);
    registerZoneShape(shape);

    shape = new createjs.Shape();
    shape.graphics.beginFill('rgb(200,0,0)').drawRect(0, 0, jsonTable.marge, TABLE_HEIGHT);
    stage.addChild(shape);
    registerZoneShape(shape);

    shape = new createjs.Shape();
    shape.graphics.beginFill('rgb(200,0,0)').drawRect(TABLE_WIDTH - jsonTable.marge, 0, jsonTable.marge, TABLE_HEIGHT);
    stage.addChild(shape);
    registerZoneShape(shape);

    // Zones interdites mobiles
    jsonTable.dynamicZones.forEach(zone => {
        displayZone(zone, jsonTable, 'rgb(255,255,0)', 'rgb(255,165,0)');
    });
    stage.update();
}

/**
 * Affichage des zones interdites
 * @param zone
 * @param jsonTable
 * @param colorPrimary
 * @param colorSecondary
 */
function displayZone(zone, jsonTable, colorPrimary, colorSecondary) {
    var zt = zone.type || 'all';
    if (zone.forme == 'polygone') {
        if (zone.points.length === 4) {
            // Coord PMX: on calcule la bounding box puis on convertit en canvas
            var minX = zone.points[0].x, maxX = zone.points[0].x;
            var minY = zone.points[0].y, maxY = zone.points[0].y;
            zone.points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
            // Canvas: x direct, y flippe (top-left origin)
            var cx = toCanvasX(minX);
            var cy = toCanvasY(maxY); // coin haut en canvas = y PMX max
            var w = maxX - minX;
            var h = maxY - minY;

            var shape = new createjs.Shape();
            shape.name = zone.id;
            shape.visible = zone.active;
            shape.graphics.beginFill(colorPrimary).drawRect(cx, cy, w, h);
            stage.addChild(shape);
            registerZoneShape(shape, zt);

            shape = new createjs.Shape();
            shape.name = zone.id + '_margin';
            shape.visible = zone.active;
            shape.graphics
                .beginFill(colorSecondary)
                .drawRect(cx - jsonTable.marge, cy - jsonTable.marge, w + jsonTable.marge * 2, h + jsonTable.marge * 2);
            stage.addChild(shape);
            registerZoneShape(shape, zt);
        } else if (zone.points.length >= 3) {
            // Polygone générique à N points (triangle ou N > 4)
            var color = zone.id.match('_margin') ? colorSecondary : colorPrimary;
            var shape = new createjs.Shape();
            shape.name = zone.id;
            shape.visible = zone.active;
            var g = shape.graphics.beginFill(color);
            g.moveTo(toCanvasX(zone.points[0].x), toCanvasY(zone.points[0].y));
            for (var i = 1; i < zone.points.length; i++) {
                g.lineTo(toCanvasX(zone.points[i].x), toCanvasY(zone.points[i].y));
            }
            g.closePath();
            stage.addChild(shape);
            registerZoneShape(shape, zt);
        } else {
            console.warn('[displayZone] Polygon invalide (< 3 points):', zone.id);
        }
    } else if (zone.forme == 'cercle') {
        var shape = new createjs.Shape();
        shape.name = zone.id;
        shape.visible = zone.active;
        shape.graphics
            .beginFill(colorPrimary)
            .drawCircle(toCanvasX(zone.centre.x), toCanvasY(zone.centre.y), zone.rayon);
        stage.addChild(shape);
        registerZoneShape(shape, zt);

        shape = new createjs.Shape();
        shape.name = zone.id + '_margin';
        shape.visible = zone.active;
        shape.graphics
            .beginFill(colorSecondary)
            .drawCircle(toCanvasX(zone.centre.x), toCanvasY(zone.centre.y), zone.rayon + jsonTable.marge);
        stage.addChild(shape);
        registerZoneShape(shape, zt);
    }
}

/**
 * Suppression d'une zone interdite
 * @param zoneName
 */
function deleteZone(zoneName) {
    if (stage.getChildByName(zoneName)) {
        stage.getChildByName(zoneName).visible = false;
        stage.getChildByName(zoneName + '_margin').visible = false;
        stage.update();
    }
}

/**
 * Activation d'une zone interdite
 * @param zoneName
 */
function addZone(zoneName) {
    if (stage.getChildByName(zoneName)) {
        stage.getChildByName(zoneName).visible = true;
        stage.getChildByName(zoneName + '_margin').visible = true;
        stage.update();
    }
}

/**
 * Aplatit la structure [{id, desc, tasks:[...]}, ...] en une liste
 * plate de tasks annotées avec l'instruction parente (id/desc) pour l'affichage.
 */
function flattenStrategy(strategy) {
    var flat = [];
    if (!Array.isArray(strategy)) return flat;
    strategy.forEach(function (instruction) {
        if (!instruction || !Array.isArray(instruction.tasks)) return;
        instruction.tasks.forEach(function (task) {
            var entry = Object.assign({}, task);
            entry._instructionId = instruction.id;
            entry._instructionDesc = instruction.desc;
            entry._displayLabel = task.desc || instruction.desc || '';
            flat.push(entry);
        });
    });
    return flat;
}

/**
 * Chargement de la strat simulateur du robot principal
 * @returns {boolean}
 */
function loadSimulatorStrat(strategy) {
    stratSimulator = flattenStrategy(strategy);
    stratIndex = 0;
    document.getElementById('pmxNext').disabled = false;
    document.getElementById('pmxAuto').disabled = false;
    return true;
}

// ============================================================================
// Miroir bleu → jaune (mêmes conventions que l'Asserv C++ changeMatchX/Angle)
//   x → 3000 - x
//   y → inchangé
//   theta → π - theta
// ============================================================================
var matchColor = 'bleu';

function mirrorX(x) { return 3000 - x; }
function mirrorAngleDegAbs(a) { return 180 - a; }
function mirrorAngleDegRel(a) { return -a; }

function mirrorTask(task) {
    var m = Object.assign({}, task);
    if (m.type !== 'MOVEMENT') return m;
    var st = m.subtype || '';

    if (m.position_x !== undefined) m.position_x = mirrorX(m.position_x);
    if (m.face_x !== undefined) m.face_x = mirrorX(m.face_x);

    if (st === 'ROTATE_ABS_DEG' && m.angle_deg !== undefined) {
        m.angle_deg = mirrorAngleDegAbs(m.angle_deg);
    } else if (st === 'ROTATE_DEG' && m.angle_deg !== undefined) {
        m.angle_deg = mirrorAngleDegRel(m.angle_deg);
    }
    if (m.final_angle_deg !== undefined) m.final_angle_deg = mirrorAngleDegAbs(m.final_angle_deg);
    if (m.rotate_rel_deg !== undefined) m.rotate_rel_deg = mirrorAngleDegRel(m.rotate_rel_deg);
    // ORBITAL_TURN_DEG : le miroir se fait via le flip de turn_right (la roue
    // pivot passe a l'oppose). NE PAS negater angle_deg en plus (double-negation
    // annulerait le miroir car side apparait deja dans le calcul worldAngle).
    if (st === 'ORBITAL_TURN_DEG' && m.turn_right !== undefined) m.turn_right = !m.turn_right;

    if (Array.isArray(m.waypoints)) {
        m.waypoints = m.waypoints.map(function (wp) { return [mirrorX(wp[0]), wp[1]]; });
    }
    return m;
}

function mirrorStrategy(strategy) {
    if (!Array.isArray(strategy)) return strategy;
    return strategy.map(function (instruction) {
        var mi = Object.assign({}, instruction);
        if (Array.isArray(mi.tasks)) {
            mi.tasks = mi.tasks.map(mirrorTask);
        }
        return mi;
    });
}

/**
 * Applique le filtre zones selon la couleur du match.
 * Zones avec type='all' restent inchangées. Les autres sont montrées/masquées
 * selon que leur type correspond à matchColor.
 * Met également à jour le cache de visibilité pour que toggleZones respecte le filtre.
 */
function applyColorFilter(color) {
    zoneShapeList.forEach(function (shape) {
        var t = shape.zoneType || 'all';
        if (t === 'all') return;
        var visible = (t === color);
        shape.visible = zonesVisible ? visible : false;
        zoneVisibilityCache.set(shape, visible);
    });
    if (stage) stage.update();
}

/**
 * Téléporte (sans tween) le robot à la pose initiale (éventuellement miroir).
 */
function teleportToInit(mirror) {
    $.getScript(`resources/${currentYear}/initPMX0.json`, function (script) {
        var init = JSON.parse(script);
        var x = mirror ? mirrorX(init.x) : init.x;
        var y = init.y;
        var theta = mirror ? (Math.PI - init.theta) : init.theta;
        if (pmx) {
            pmx.x = toCanvasX(x);
            pmx.y = toCanvasY(y);
            pmx.rotation = toCanvasRotationDeg(theta);
            if (stage) stage.update();
        }
    });
}

/**
 * Pause : arrete juste l'enchainement (la task courante termine normalement).
 */
function pauseAuto() {
    autoPlaying = false;
    updatePlayPauseBtn();
}

/**
 * Reset complet : arrete l'enchainement + kill le tween en cours (pour BLEU/
 * JAUNE ou re-load PMX0).
 */
function stopAuto() {
    autoPlaying = false;
    if (typeof createjs !== 'undefined' && pmx) {
        createjs.Tween.removeTweens(pmx);
    }
    updatePlayPauseBtn();
}

/**
 * Synchronise le libelle du bouton Play/Pause avec l'etat autoPlaying.
 */
function updatePlayPauseBtn() {
    var btn = document.getElementById('pmxAuto');
    if (!btn) return;
    btn.textContent = autoPlaying ? '⏸ Pause' : '▶ Auto';
}

/**
 * Nettoie les traces, le log, le playback state, les tweens.
 * Appele avant de relancer une strategie (BLEU/JAUNE) ou au re-chargement PMX0.
 */
function resetTerrainAndPaths() {
    stopAuto();
    // Clear les traces de deplacement (moveRobot)
    pathShapes.forEach(function (s) {
        if (s.parent) s.parent.removeChild(s);
    });
    pathShapes = [];
    // Clear les cercles de detection (Live/log)
    detected.forEach(function (name) {
        var s = stage.getChildByName(name);
        if (s) stage.removeChild(s);
        var m = stage.getChildByName(name + '_margin');
        if (m) stage.removeChild(m);
    });
    detected = [];
    // Reactive toutes les zones (supprime l'effet des DELETE_ZONE precedents)
    zoneShapeList.forEach(function (s) {
        s.visible = true;
        zoneVisibilityCache.set(s, true);
    });
    // Clear panneau log execution
    var dataDiv = document.getElementById('data');
    if (dataDiv) dataDiv.innerHTML = '';
    // Reset index strat + pose logique de playback
    stratIndex = 0;
    playbackPose = null;
    if (stage) stage.update();
    // Re-render editor layer (efface eventuels vestiges + redessine proprement)
    if (typeof editorRenderLayer === 'function') editorRenderLayer();
}

/**
 * Charge strategyPMX0.json + initPMX0.json depuis le disque dans le state
 * partage (editor.strategy / editor.initialPose), puis lance la lecture avec
 * la couleur demandee (miroir applique si jaune).
 * @param color 'bleu' ou 'jaune'
 */
function loadDefaultStrat(color) {
    matchColor = color;           // defini AVANT reset
    if (typeof editorUpdateLoadedSlotUi === 'function') editorUpdateLoadedSlotUi();
    resetTerrainAndPaths();
    var mirror = (color === 'jaune');
    if (zonesLoaded) applyColorFilter(color);

    $.getScript(`resources/${currentYear}/strategyPMX0.json`, function (script) {
        var raw = JSON.parse(script);
        if (window.editor) {
            window.editor.strategy.instructions = raw;
            window.editor.strategy.name = 'strategyPMX0';
            window.editor.currentInstructionIdx = Math.max(0, raw.length - 1);
            window.editor.selectedTaskRef = null;
            var nameInput = document.getElementById('editorStratName');
            if (nameInput) nameInput.value = 'strategyPMX0';
        }
        $.getScript(`resources/${currentYear}/initPMX0.json`, function (script2) {
            var init = JSON.parse(script2);
            if (window.editor) {
                window.editor.initialPose = { x: init.x, y: init.y, theta: init.theta };
                if (typeof editorRefreshInitialPoseInputs === 'function') editorRefreshInitialPoseInputs();
            }
            var x = mirror ? mirrorX(init.x) : init.x;
            var y = init.y;
            var theta = mirror ? (Math.PI - init.theta) : init.theta;
            if (pmx) {
                pmx.x = toCanvasX(x);
                pmx.y = toCanvasY(y);
                pmx.rotation = toCanvasRotationDeg(theta);
                if (stage) stage.update();
            }
            if (typeof editorRenderInstructionsList === 'function') editorRenderInstructionsList();

            var strategy = JSON.parse(JSON.stringify(raw));
            if (mirror) strategy = mirrorStrategy(strategy);
            loadSimulatorStrat(strategy);
        });
    });
}

/**
 * Lit la strategie courante (editor.strategy) et la joue avec la couleur
 * demandee. editor.strategy.instructions peut etre issu du fichier charge
 * via le picker, ou des modifications de l'editeur.
 * @param color 'bleu' ou 'jaune'
 */
function loadLoadedStrat(color) {
    if (!window.editor || !Array.isArray(window.editor.strategy.instructions)
            || window.editor.strategy.instructions.length === 0) return;
    matchColor = color;           // defini AVANT reset pour que editorRenderLayer utilise la bonne couleur
    if (typeof editorUpdateLoadedSlotUi === 'function') editorUpdateLoadedSlotUi();
    resetTerrainAndPaths();
    var mirror = (color === 'jaune');
    if (zonesLoaded) applyColorFilter(color);

    var p = window.editor.initialPose;
    var x = mirror ? mirrorX(p.x) : p.x;
    var y = p.y;
    var theta = mirror ? (Math.PI - p.theta) : p.theta;
    if (pmx) {
        pmx.x = toCanvasX(x);
        pmx.y = toCanvasY(y);
        pmx.rotation = toCanvasRotationDeg(theta);
        if (stage) stage.update();
    }
    // Initialise la pose de playback pour que "Suivant" / auto enchainent
    // correctement depuis cette pose.
    playbackPose = { x: x, y: y, theta: theta };

    var strategy = JSON.parse(JSON.stringify(window.editor.strategy.instructions));
    if (mirror) strategy = mirrorStrategy(strategy);
    loadSimulatorStrat(strategy);
}

/**
 * Joue la prochaine task du simulateur.
 * @returns {boolean} true quand la fin est atteinte
 */
function nextInstruction(auto = false) {
    if (!stratSimulator || stratIndex >= stratSimulator.length) return true;
    var instruction = stratSimulator[stratIndex];
    stratIndex++;
    playSimulatorInstruction(instruction, 'data', auto);
    return false;
}

/**
 * Retourne true si la task est un deplacement ou une rotation "en arriere"
 * (motion reculee). Utilise pour dessiner en trait pointille.
 *   GO_BACK_TO, PATH_BACK_TO, MOVE_BACKWARD_TO : deplacement arriere
 *   FACE_BACK_TO : rotation pour mettre l'arriere face a la cible
 *   LINE avec dist < 0 : recul
 *   ORBITAL_TURN_DEG avec forward=false : pivot en arriere
 */
function isBackwardTask(task) {
    if (!task || task.type !== 'MOVEMENT') return false;
    var st = task.subtype || '';
    if (st === 'GO_BACK_TO' || st === 'PATH_BACK_TO' || st === 'MOVE_BACKWARD_TO') return true;
    if (st === 'FACE_BACK_TO') return true;
    if (st === 'LINE' && (task.dist || 0) < 0) return true;
    if (st === 'ORBITAL_TURN_DEG' && task.forward === false) return true;
    return false;
}

/**
 * Couleur du tracé selon le subtype MOVEMENT
 * Retourne null pour les tasks sans tracé (rotation sur place, non-MOVEMENT).
 */
function strokeColorForTask(task) {
    if (!task || task.type !== 'MOVEMENT') return null;
    var st = task.subtype || '';

    if (st === 'LINE') {
        return ((task.dist || 0) >= 0) ? 'rgba(30,144,255,1)' : 'rgba(255,140,0,1)';
    }
    if (st === 'GO_TO' || st === 'GO_BACK_TO' || st.indexOf('GO_TO_AND_') === 0) {
        return 'rgba(0,200,180,1)';
    }
    if (st === 'MOVE_FORWARD_TO' || st.indexOf('MOVE_FORWARD_TO_AND_') === 0) {
        return 'rgba(100,180,255,1)';
    }
    if (st === 'MOVE_BACKWARD_TO') {
        return 'rgba(255,180,80,1)';
    }
    if (st === 'PATH_TO' || st === 'PATH_BACK_TO' || st === 'MANUAL_PATH' || st.indexOf('PATH_TO_AND_') === 0) {
        return 'rgba(255,20,147,1)';
    }
    if (st === 'ORBITAL_TURN_DEG') {
        return 'rgba(180,0,255,1)';
    }
    // FACE_TO, FACE_BACK_TO, ROTATE_DEG, ROTATE_ABS_DEG: rotation sur place, pas de trait
    return null;
}

/**
 * Calcule la pose cible {x, y, theta} (PMX, theta en rad) pour une task MOVEMENT,
 * à partir de la pose courante. Retourne null si pas de déplacement.
 */
function computeTaskTarget(task, currentX, currentY, currentTheta) {
    if (!task || task.type !== 'MOVEMENT') return null;
    var st = task.subtype || '';
    var d2r = Math.PI / 180;

    var dxPos = (task.position_x || 0) - currentX;
    var dyPos = (task.position_y || 0) - currentY;

    switch (st) {
        case 'LINE': {
            var dist = task.dist || 0;
            return {
                x: currentX + dist * Math.cos(currentTheta),
                y: currentY + dist * Math.sin(currentTheta),
                theta: currentTheta
            };
        }
        case 'GO_TO':
        case 'PATH_TO':
        case 'MOVE_FORWARD_TO': {
            return {
                x: task.position_x, y: task.position_y,
                theta: Math.atan2(dyPos, dxPos)
            };
        }
        case 'GO_BACK_TO':
        case 'MOVE_BACKWARD_TO':
        case 'PATH_BACK_TO': {
            return {
                x: task.position_x, y: task.position_y,
                theta: Math.atan2(dyPos, dxPos) + Math.PI
            };
        }
        case 'FACE_TO':
            return { x: currentX, y: currentY, theta: Math.atan2(dyPos, dxPos) };
        case 'FACE_BACK_TO':
            return { x: currentX, y: currentY, theta: Math.atan2(dyPos, dxPos) + Math.PI };
        case 'ROTATE_DEG':
            return { x: currentX, y: currentY, theta: currentTheta + (task.angle_deg || 0) * d2r };
        case 'ROTATE_ABS_DEG':
            return { x: currentX, y: currentY, theta: (task.angle_deg || 0) * d2r };
        case 'ORBITAL_TURN_DEG': {
            // Pivot sur la roue gauche (turn_right=false) ou droite (turn_right=true).
            // Demi-voie PMX ~128 mm (cohérent avec drawPmxRobot).
            var R = 128;
            var side = task.turn_right ? -1 : 1;    // 1=pivot gauche, -1=pivot droite
            var fwd = (task.forward !== false) ? 1 : -1;
            // Pivot en coord world : perpendiculaire a la heading, du cote choisi
            var pivotX = currentX - side * Math.sin(currentTheta) * R;
            var pivotY = currentY + side * Math.cos(currentTheta) * R;
            // Sens de rotation dans le monde : depend de side et forward
            var worldAngle = (task.angle_deg || 0) * d2r * side * fwd;
            var cosW = Math.cos(worldAngle), sinW = Math.sin(worldAngle);
            var rx = currentX - pivotX, ry = currentY - pivotY;
            return {
                x: pivotX + rx * cosW - ry * sinW,
                y: pivotY + rx * sinW + ry * cosW,
                theta: currentTheta + worldAngle
            };
        }
        case 'MANUAL_PATH': {
            if (Array.isArray(task.waypoints) && task.waypoints.length > 0) {
                var last = task.waypoints[task.waypoints.length - 1];
                // theta final = direction du dernier segment (coherent avec playManualPath
                // qui oriente le robot selon chaque segment)
                var prev = task.waypoints.length >= 2
                    ? task.waypoints[task.waypoints.length - 2]
                    : [currentX, currentY];
                return {
                    x: last[0], y: last[1],
                    theta: Math.atan2(last[1] - prev[1], last[0] - prev[0])
                };
            }
            return null;
        }
        case 'GO_TO_AND_ROTATE_ABS_DEG':
        case 'MOVE_FORWARD_TO_AND_ROTATE_ABS_DEG':
        case 'PATH_TO_AND_ROTATE_ABS_DEG':
            return {
                x: task.position_x, y: task.position_y,
                theta: (task.final_angle_deg || 0) * d2r
            };
        case 'GO_TO_AND_ROTATE_REL_DEG':
        case 'MOVE_FORWARD_TO_AND_ROTATE_REL_DEG':
        case 'PATH_TO_AND_ROTATE_REL_DEG': {
            var thetaMove = Math.atan2(dyPos, dxPos);
            return {
                x: task.position_x, y: task.position_y,
                theta: thetaMove + (task.rotate_rel_deg || 0) * d2r
            };
        }
        case 'GO_TO_AND_FACE_TO':
        case 'MOVE_FORWARD_TO_AND_FACE_TO':
        case 'PATH_TO_AND_FACE_TO': {
            var dfx = (task.face_x || 0) - (task.position_x || 0);
            var dfy = (task.face_y || 0) - (task.position_y || 0);
            return {
                x: task.position_x, y: task.position_y,
                theta: Math.atan2(dfy, dfx)
            };
        }
        case 'GO_TO_AND_FACE_BACK_TO':
        case 'MOVE_FORWARD_TO_AND_FACE_BACK_TO':
        case 'PATH_TO_AND_FACE_BACK_TO': {
            var dfx2 = (task.face_x || 0) - (task.position_x || 0);
            var dfy2 = (task.face_y || 0) - (task.position_y || 0);
            return {
                x: task.position_x, y: task.position_y,
                theta: Math.atan2(dfy2, dfx2) + Math.PI
            };
        }
        default:
            return null;
    }
}

/**
 * Retourne la pose PMX courante {x, y, theta_rad} du robot principal.
 */
function currentPmxPose() {
    if (!pmx) return { x: 0, y: 0, theta: 0 };
    return {
        x: pmx.x,
        y: TABLE_HEIGHT - pmx.y,
        theta: -pmx.rotation * Math.PI / 180
    };
}

/**
 * Résumé textuel de la task pour affichage dans le panneau.
 */
function taskSummary(task) {
    var parts = [];
    if (task.type) parts.push(task.type);
    if (task.subtype) parts.push(task.subtype);
    if (task.type === 'MOVEMENT') {
        if (task.subtype === 'LINE' && task.dist !== undefined) parts.push(task.dist + 'mm');
        else if (task.position_x !== undefined && task.position_y !== undefined) {
            parts.push('(' + task.position_x + ',' + task.position_y + ')');
        } else if (task.angle_deg !== undefined) parts.push(task.angle_deg + '°');
    } else if (task.type === 'MANIPULATION' && task.action_id) {
        parts.push(task.action_id);
    } else if (task.type === 'ELEMENT' && task.item_id) {
        parts.push(task.item_id);
    } else if (task.type === 'SPEED' && task.speed_percent !== undefined) {
        parts.push(task.speed_percent + '%');
    } else if (task.type === 'WAIT' && task.duration_ms !== undefined) {
        parts.push(task.duration_ms + 'ms');
    }
    return parts.join(' ');
}

/**
 * Exécution d'une task du simulateur (nouveau format structuré).
 */
async function playSimulatorInstruction(task, divId, auto = false) {
    var dataDiv = document.getElementById(divId);
    var label = task._displayLabel || task.desc || '';
    dataDiv.insertAdjacentHTML('beforeend',
        '<strong>' + label + '</strong> : ' + taskSummary(task) + '<br>');
    dataDiv.scrollTop = dataDiv.scrollHeight;

    // Gestion des zones (ELEMENT)
    if (task.type === 'ELEMENT') {
        if (task.subtype === 'DELETE_ZONE' && task.item_id) deleteZone(task.item_id);
        else if (task.subtype === 'ADD_ZONE' && task.item_id) addZone(task.item_id);
    }

    // Gestion du déplacement (MOVEMENT) : on utilise playbackPose (pose logique,
    // independante du tween) pour que "Suivant" fonctionne en sequence meme
    // lorsque le tween n'est pas termine. On passe aussi fromX/fromY a moveRobot
    // pour que la ligne de trace + le tween partent de la pose logique.
    if (task.type === 'MOVEMENT') {
        if (!playbackPose) playbackPose = currentPmxPose();
        var fromX = playbackPose.x, fromY = playbackPose.y;
        var target = computeTaskTarget(task, playbackPose.x, playbackPose.y, playbackPose.theta);
        if (target !== null) {
            var strokeColor = strokeColorForTask(task);
            var heading = target.theta;
            var finalRot;
            var st = task.subtype || '';
            var dashed = isBackwardTask(task);
            // MANUAL_PATH : anime chaque segment separement (rotate+move par
            // waypoint) pour eviter le crab walk.
            if (st === 'MANUAL_PATH' && Array.isArray(task.waypoints) && task.waypoints.length > 0) {
                playManualPath(task.waypoints, fromX, fromY,
                    strokeColor || 'rgba(255,20,147,1)');
                var last = task.waypoints[task.waypoints.length - 1];
                var prev = task.waypoints.length >= 2
                    ? task.waypoints[task.waypoints.length - 2]
                    : [fromX, fromY];
                playbackPose = {
                    x: last[0], y: last[1],
                    theta: Math.atan2(last[1] - prev[1], last[0] - prev[0])
                };
            } else if (st === 'ORBITAL_TURN_DEG') {
                playOrbital(task, fromX, fromY, playbackPose.theta,
                    strokeColor || 'rgba(180,0,255,1)', dashed);
                playbackPose = { x: target.x, y: target.y, theta: target.theta };
            } else {
                if (st.indexOf('_AND_') !== -1) {
                    var dx = target.x - fromX, dy = target.y - fromY;
                    heading = Math.atan2(dy, dx);
                    finalRot = target.theta;
                }
                var fromTheta = playbackPose.theta;
                // Couleurs rotation : rel (orange) pour ROTATE_DEG / _AND_ROTATE_REL_DEG,
                // abs (violet) pour tout le reste (alignements, FACE_*, ROTATE_ABS_DEG, composites ABS)
                var rotPre = (st === 'ROTATE_DEG') ? 'rel' : 'abs';
                var rotPost = (st.indexOf('_AND_ROTATE_REL_DEG') !== -1) ? 'rel' : 'abs';
                moveRobot(target.x, target.y, heading, undefined, false,
                    strokeColor || 'rgba(255,20,147,1)', fromX, fromY, finalRot, dashed, fromTheta, rotPre, rotPost);
                playbackPose = { x: target.x, y: target.y, theta: target.theta };
            }
        }
    }

    // Pause adaptee : composites +1 rotation, MANUAL_PATH = N segments.
    // Le WAIT strategique (duration_ms) est egalement divise par le facteur de
    // vitesse de lecture pour garder une coherence visuelle avec les animations.
    var delay = (task.type === 'WAIT' && task.duration_ms)
        ? (task.duration_ms / (playbackSpeedFactor || 1))
        : (moveTime + rotationTime);
    var st2 = task.subtype || '';
    if (task.type === 'MOVEMENT' && st2.indexOf('_AND_') !== -1) {
        delay += rotationTime;
    } else if (task.type === 'MOVEMENT' && st2 === 'MANUAL_PATH'
            && Array.isArray(task.waypoints) && task.waypoints.length > 0) {
        delay = task.waypoints.length * rotationTime + moveTime;
    }
    await sleep(delay);

    // Enchaine uniquement si auto est encore actif (autoPlaying = source verite)
    if (autoPlaying) {
        nextInstruction(true);
    }
    void auto;  // parametre conserve pour compat, non utilise
}

async function playLogInstruction(instruction, auto = false) {
    var regexpTimestamp = /([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}),([0-9]+) .+/;
    var parseTimestamp = regexpTimestamp.exec(instruction);
    var delta = undefined;
    var divId = 'data';
    if (parseTimestamp != null) {
        var date = Date.parse(parseTimestamp[1] + 'T' + parseTimestamp[2] + ':' + parseTimestamp[3] + ':' + parseTimestamp[4] + '.' + parseTimestamp[5] + '+00:00');
        delta = date - timestampLog;
        timestampLog = date;
    }

    if (delta == undefined || delta == NaN) {
        delta = 0;
    }

    var regexpAsserv = /.+\[Asserv\].+#([-0-9]+);([-0-9]+);([-0-9\.]+).+/;
    var parseAsserv = regexpAsserv.exec(instruction);
    if (parseAsserv != null) {
        moveRobot(parseAsserv[1], parseAsserv[2], parseAsserv[3], delta, auto);
    } else {
        var regexpInfo = /.+INFO :(.+)/;
        var parseInfo = regexpInfo.exec(instruction);
        if (parseInfo != null) {
            var dataDiv = document.getElementById(divId);
            dataDiv.insertAdjacentHTML('beforeend', parseInfo[1] + '<br>');
            dataDiv.scrollTop = dataDiv.scrollHeight;
        }

        var regexpDetection = /.+\[UltraSoundManager\] INFO : (.+) : STOP \(([-0-9]+),([-0-9]+)\)/;
        var parseDetection = regexpDetection.exec(instruction);
        if (parseDetection != null) {
            var colorPrimary = 'rgba(100,100,100,0.6)';
            var colorSecondary = 'rgba(200,200,200,0.4)';
            var detectionName = 'pmx_' + parseDetection[1].replaceAll(' ', '_');

            if (stage.getChildByName(detectionName)) {
                stage.removeChild(
                    stage.getChildByName(detectionName),
                    stage.getChildByName(detectionName + '_margin')
                );
                stage.update();
            }

            var shape = new createjs.Shape();
            shape.name = detectionName;
            shape.active = true;
            shape.graphics
                .beginFill(colorPrimary)
                .drawCircle(parseDetection[3], parseDetection[2], 150);
            stage.addChild(shape);

            shape = new createjs.Shape();
            shape.name = detectionName + '_margin';
            shape.active = true;
            shape.graphics
                .beginFill(colorSecondary)
                .drawCircle(parseDetection[3], parseDetection[2], 150 + margin);
            stage.addChild(shape);
            stage.update();
            detected.push(detectionName);
        }

        if (instruction.includes('INFO : OK devant')) {
            detected.forEach(val => {
                stage.removeChild(
                    stage.getChildByName(val),
                    stage.getChildByName(val + '_margin')
                );
            });
            detected = [];
            stage.update();
        }

        // TODO virer les fantomes des logs
        // TODO logs propre des zones interdites

        await sleep(delta);

        if (auto) {
            nextInstruction(true);
        }
    }
}

/**
 * Toggle Auto/Pause. Si running : pause (task courante finit normalement).
 * Si pas running : demarre/reprend l'enchainement depuis stratIndex.
 */
async function autoPlay() {
    if (autoPlaying) {
        pauseAuto();
        return;
    }
    if (!stratSimulator) return;
    if (stratIndex >= stratSimulator.length) stratIndex = 0;
    autoPlaying = true;
    updatePlayPauseBtn();
    nextInstruction(true);
}

/**
 * Bouton "Suivant" : stoppe l'auto (s'il tourne) et joue UNE task a partir de
 * stratIndex. La task courante qui serait en cours reste interrompue par le
 * fromX/fromY passe a moveRobot (snap + nouveau tween). Auto peut reprendre
 * plus tard avec le bouton Auto.
 */
function stepNext() {
    autoPlaying = false;
    updatePlayPauseBtn();
    nextInstruction(false);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function connectSocket() {
    var socket = null;
    try {
        socket = new WebSocket("ws://192.168.42.103:4269");
    } catch (exception) {
        console.error(exception);
    }

    // Récupération des erreurs.
    // Si la connexion ne s'établie pas,
    // l'erreur sera émise ici.
    socket.onerror = function (error) {
        console.error(error);
    };

    // Lorsque la connexion est établie.
    socket.onopen = function (event) {
        console.log("Connexion établie.");

        // Lorsque la connexion se termine.
        this.onclose = function (event) {
            console.log("Connexion terminé.");
        };

        // Lorsque le serveur envoi un message.
        this.onmessage = function (event) {
            var regexpLog = /([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2},[0-9]+) \[([a-z]+)\](.+)/;
            var parseLog = regexpLog.exec(event.data);
            if (parseLog != null) {
                playLogInstruction(parseLog[1] + ' ' + parseLog[3], false);
            } else {
                var dataDiv = document.getElementById('data');
                dataDiv.insertAdjacentHTML('beforeend', event.data + '<br>');
                dataDiv.scrollTop = dataDiv.scrollHeight;
            }
        };

        this.send("loggerListener");
    };
}

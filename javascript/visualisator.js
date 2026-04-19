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
var stratLog;
var stratIndex = 0;
var timestampLog;

var rotationTime = 100;
var moveTime = 600;
var detected = [];

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

    $.getScript(`resources/${currentYear}/initBig.json`, function (script) {
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
function moveRobot(x, y, rotation, speed, auto = false, strokeColor = 'rgba(255,20,147,1)') {
    var cx = toCanvasX(x);
    var cy = toCanvasY(y);
    var shape = new createjs.Shape();
    shape.graphics
        .setStrokeStyle(3)
        .beginStroke(strokeColor)
        .moveTo(pmx.x, pmx.y)
        .lineTo(cx, cy);
    stage.addChild(shape);
    stage.update();

    var tRotation = rotationTime;
    var tMove = moveTime;
    if (speed) {
        tRotation = speed * 1/3;
        tMove = speed * 2/3;
    }

    createjs.Tween.get(pmx)
        .to({rotation: toCanvasRotationDeg(rotation)}, tRotation, createjs.Ease.getPowInOut(4))
        .to({x: cx, y: cy}, tMove, createjs.Ease.getPowInOut(4))
        .call(() => {
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
    } else if ((st === 'ROTATE_DEG' || st === 'ORBITAL_TURN_DEG') && m.angle_deg !== undefined) {
        m.angle_deg = mirrorAngleDegRel(m.angle_deg);
    }
    if (m.final_angle_deg !== undefined) m.final_angle_deg = mirrorAngleDegAbs(m.final_angle_deg);
    if (m.rotate_rel_deg !== undefined) m.rotate_rel_deg = mirrorAngleDegRel(m.rotate_rel_deg);
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
    $.getScript(`resources/${currentYear}/initBig.json`, function (script) {
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
 * Charge la stratégie depuis strategyPMX0.json et applique le miroir si besoin.
 * @param color 'bleu' ou 'jaune'
 */
function loadStratColor(color) {
    matchColor = color;
    var mirror = (color === 'jaune');

    teleportToInit(mirror);

    if (zonesLoaded) applyColorFilter(color);

    $.getScript(`resources/${currentYear}/strategyPMX0.json`, function (script) {
        var strategy = JSON.parse(script);
        if (mirror) strategy = mirrorStrategy(strategy);
        loadSimulatorStrat(strategy);
    });
}

/**
 * Chargement des logs d'un match du robot principal
 * @returns {boolean}
 */
function loadStratLog() {
    var file = document.getElementById('stratLog');
    if (file && file.files && file.files.length) {
        var reader = new FileReader();
        reader.onload = function (e) {
            stratLog = cleanLogFile(e.target.result);
            rotationTime = 50;
            moveTime = 50;
            stratIndex = 0;

            for (var key in stratLog) {
                if (stratLog[key].includes('TRACE: Position :')) {
                    var regexpAsserv = /.+\[Asserv\].+#([-0-9]+);([-0-9]+);([-0-9\.]+).+/;
                    var parseAsserv = regexpAsserv.exec(stratLog[key]);
                    if (parseAsserv != null) {
                        createjs.Tween.get(pmx)
                            .to({rotation: radiansToDegrees(parseAsserv[3])}, rotationTime, createjs.Ease.getPowInOut(4))
                            .to({x: parseAsserv[2], y: parseAsserv[1]}, moveTime, createjs.Ease.getPowInOut(4));
                        console.log('PMX init : ' + parseAsserv[1] + ' - ' + parseAsserv[2] + ' - ' + radiansToDegrees(parseAsserv[3]));
                        break;
                    }
                }
            }
        };
        reader.readAsBinaryString(file.files[0]);
        document.getElementById('pmxNext').disabled = false;
        document.getElementById('pmxAuto').disabled = false;
        return true;
    }
}

function cleanLogFile(file) {
    var res = [];
    var drop = true;
    var split = file.split('\n');
    for (var key in split) {

        if (drop && split[key].includes('Tirette pull, begin of the match')) {
            drop = false;
        }
        if (!drop && split[key] !== '' && !split[key].includes('DEBUG: Detection NOK')) {
            res.push(split[key]);
        }
    }
    return res;
}

/**
 * Récupération et application de l'instruction suivante du PMX
 * @returns {boolean}
 */
function nextInstruction(auto = false) {
    var startFile = stratSimulator ? stratSimulator : stratLog;
    if (stratIndex >= startFile.length) {
        return true;
    }
    var instruction = startFile[stratIndex];
    stratIndex++;

    if (stratSimulator) {
        playSimulatorInstruction(instruction, 'data', auto);
    } else {
        playLogInstruction(instruction, auto);
    }
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
        case 'ORBITAL_TURN_DEG':
            return { x: currentX, y: currentY, theta: currentTheta + (task.angle_deg || 0) * d2r };
        case 'MANUAL_PATH': {
            if (Array.isArray(task.waypoints) && task.waypoints.length > 0) {
                var last = task.waypoints[task.waypoints.length - 1];
                return { x: last[0], y: last[1], theta: currentTheta };
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

    // Gestion du déplacement (MOVEMENT)
    if (task.type === 'MOVEMENT') {
        var pose = currentPmxPose();
        var target = computeTaskTarget(task, pose.x, pose.y, pose.theta);
        if (target !== null) {
            var strokeColor = strokeColorForTask(task);
            moveRobot(target.x, target.y, target.theta, undefined, false,
                strokeColor || 'rgba(255,20,147,1)');
        }
    }

    // Pause (WAIT: durée spécifique, sinon pause par défaut d'animation)
    var delay = (task.type === 'WAIT' && task.duration_ms)
        ? task.duration_ms
        : (moveTime + rotationTime);
    await sleep(delay);

    if (auto) {
        nextInstruction(true);
    }
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

async function autoPlay() {
    nextInstruction(true);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadFiles() {
    loadStratLog();
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

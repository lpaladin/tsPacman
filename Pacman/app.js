var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/**
 * Pacman 逻辑控制脚本
 * 原始语言：TypeScript
 * 使用的库：Greensocks、THREE.js
 * 已进行 Chrome 和 Firefox 的兼容性测试
 * 时间轴约定：表现和背后逻辑变量是不同时的，背后的逻辑变量只在计算时临时出现，表现需要依赖于当次计算出的逻辑变量或解析当前表现
 * 作者：zhouhy
 */
/*
 ### 第三方资源版权声明 ###

吃豆人模型：
作者：zhouhy，工具：Blender
可自由使用，不保留任何权利。

苹果模型：
Apple Low Poly #01 by Game Green is licensed under CC Attribution
由 zhouhy 进行了顶点着色。
https://skfb.ly/EGJ6

 */
window['Promise'] = window['Promise'] || window['ES6Promise'];
//#region 工具
var MAX_PLAYER_COUNT = 4;
var zeroVector2 = new THREE.Vector2();
var zeroVector3 = new THREE.Vector3();
var dummy = {};
if (!window.parent || window.parent == window) {
    // 调试时候才会用到吧……
    infoProvider = {
        getMatchInitData: function () { },
        getLogList: function () { },
        getPlayerNames: function () { },
        isLive: function () { },
        getPlayerID: function () { },
        setNewLogCallback: function (fn) { },
        setNewRequestCallback: function (fn) { },
        setGameOverCallback: function (fn) { },
        setReadHistoryCallback: function (fn) { },
        setReadFullLogCallback: function (fn) { },
        setPauseCallback: function (fn) { },
        setPlayCallback: function (fn) { },
        setSize: function (width, height) { },
        notifyInitComplete: function () { },
        notifyPlayerMove: function (move) { },
        notifyRequestPause: function () { },
        notifyRequestResume: function () { }
    };
}
infoProvider.setSize(0, 600);
jQuery.fn.shatter = function () {
    return this.each(function () {
        var text = this.textContent;
        var result = "";
        for (var _i = 0, _a = text.trim(); _i < _a.length; _i++) {
            var x = _a[_i];
            result += "<figure>" + x + "</figure>";
        }
        this.innerHTML = result;
    });
};
jQuery.fn.expand = function () {
    var lastTween = this.data("lasttween");
    if (lastTween)
        lastTween.kill();
    this.data("lasttween", TweenMax.fromTo(this, 0.3, { scale: "+=0.3" }, { scale: 1 }));
    return this;
};
jQuery.fn.shrink = function () {
    var lastTween = this.data("lasttween");
    if (lastTween)
        lastTween.kill();
    this.data("lasttween", TweenMax.fromTo(this, 0.3, { scale: "-=0.3" }, { scale: 1 }));
    return this;
};
jQuery.fn.addNumberHandle = function () {
    var dom = this[0];
    dom["_realNumber"] = parseInt(dom.innerHTML);
    Object.defineProperty(dom, "_contentAsNumber", {
        get: function () { return dom["_realNumber"]; },
        set: function (v) { return dom.innerHTML = (dom["_realNumber"] = Math.round(v)).toString(); }
    });
    return this;
};
/**
 * 对已经附加数字句柄的 JQuery 对象的内容作为数字进行动画补间
 * @param obj JQuery 对象
 * @param target 目标数字，或者是"+=xx"这样的变化量
 */
function tweenContentAsNumber(obj, target) {
    var dom = obj[0], first;
    var initial, last;
    return TweenMax.to(dom, 0.5, {
        _contentAsNumber: target,
        onStart: function () {
            first = true;
            initial = dom["_contentAsNumber"];
            last = initial;
        },
        onUpdate: function () {
            if ((first && dom["_contentAsNumber"] - last > 0) || dom["_contentAsNumber"] - last > 5) {
                last = dom["_contentAsNumber"];
                obj.expand();
                first = false;
            }
            if ((first && last - dom["_contentAsNumber"] > 0) || last - dom["_contentAsNumber"] > 5) {
                last = dom["_contentAsNumber"];
                obj.shrink();
                first = false;
            }
        }
    });
}
function rotateNearest(rotation, to) {
    return TweenMax.to(rotation, 0.1, { z: [1, 0, -1, -2][to] * Math.PI / 2 });
}
/**
 * 【抖】
 * @param amplitudeBase 抖动多大
 * @param target 抖动元素
 * @param durationBase 抖动多久
 */
function shake(amplitudeBase, target, durationBase) {
    if (durationBase === void 0) { durationBase = 0.05; }
    var tl = new TL();
    var $body = $(target || "body");
    tl.call(function () { return $body.css("border", "none"); });
    for (var i = 0; i < 5; i++) {
        var amplitude = (11 - i * 2) * amplitudeBase;
        tl.to($body, durationBase, {
            x: Math.random() * amplitude * 2 - amplitude,
            y: Math.random() * amplitude * 2 - amplitude,
            yoyo: true
        });
    }
    tl.to($body, durationBase * 2, { x: 0, y: 0 });
    return tl;
}
function biDirConstSet(obj, propName, to) {
    var initial;
    return TweenMax.to(dummy, 0.001, {
        immediateRender: false,
        onComplete: function () {
            initial = obj[propName];
            if (to instanceof Function)
                obj[propName] = to();
            else
                obj[propName] = to;
        },
        onReverseComplete: function () {
            return obj[propName] = initial;
        }
    });
}
var __constNode = document.createElement('p');
/**
 * 将字符串中的危险字符进行转义
 * @param hostile 危险的字符串
 */
function neutralize(hostile) {
    __constNode.textContent = hostile;
    return __constNode.innerHTML;
}
function insertTemplate(templateID) {
    return document.importNode(document.getElementById(templateID)["content"], true);
}
var Vector2D = (function () {
    function Vector2D(r, c) {
        this.r = r;
        this.c = c;
    }
    Vector2D.prototype.move = function (dir) {
        if (dir == Direction.up || dir == Direction.upperleft || dir == Direction.upperright)
            this.r--;
        else if (dir == Direction.down || dir == Direction.lowerleft || dir == Direction.lowerright)
            this.r++;
        if (dir == Direction.right || dir == Direction.upperright || dir == Direction.lowerright)
            this.c++;
        else if (dir == Direction.left || dir == Direction.upperleft || dir == Direction.lowerleft)
            this.c--;
        return this;
    };
    Vector2D.prototype.moveOpposite = function (dir) {
        if (dir == Direction.up || dir == Direction.upperleft || dir == Direction.upperright)
            this.r++;
        else if (dir == Direction.down || dir == Direction.lowerleft || dir == Direction.lowerright)
            this.r--;
        if (dir == Direction.right || dir == Direction.upperright || dir == Direction.lowerright)
            this.c--;
        else if (dir == Direction.left || dir == Direction.upperleft || dir == Direction.lowerleft)
            this.c++;
        return this;
    };
    Vector2D.prototype.copy = function () {
        return new Vector2D(this.r, this.c);
    };
    Vector2D.prototype.copyMove = function (dir) {
        var vec = new Vector2D(this.r, this.c);
        vec.arr = this.arr;
        vec.move(dir);
        return vec;
    };
    /**
     * @return 是否越界
     */
    Vector2D.prototype.round = function () {
        if (!this.arr)
            return false;
        var r = (this.r + this.arr.length) % this.arr.length;
        var row = this.arr[r];
        var c = (this.c + row.length) % row.length;
        if (r == this.r && c == this.c)
            return false;
        this.r = r;
        this.c = c;
        return true;
    };
    Object.defineProperty(Vector2D.prototype, "valid", {
        get: function () {
            var row = this.arr && this.arr[this.r];
            return this.c >= 0 && row && row.length > this.c;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Vector2D.prototype, "val", {
        get: function () {
            var r = this.arr[this.r];
            if (!r)
                return;
            return r[this.c];
        },
        set: function (value) {
            this.arr[this.r][this.c] = value;
        },
        enumerable: true,
        configurable: true
    });
    Vector2D.prototype.on = function (arr) {
        this.arr = arr;
        return this;
    };
    return Vector2D;
})();
/**
 * 可以单独将 Helper 排除在外的场景类
 */
var PScene = (function (_super) {
    __extends(PScene, _super);
    function PScene() {
        _super.apply(this, arguments);
        this.childrenExcludingHelpers = [];
    }
    PScene.prototype.add = function (object) {
        _super.prototype.add.call(this, object);
        if (object instanceof THREE.EdgesHelper)
            return;
        this.childrenExcludingHelpers.push(object);
    };
    PScene.prototype.remove = function (object) {
        _super.prototype.remove.call(this, object);
        pull(this.childrenExcludingHelpers, object);
    };
    return PScene;
})(THREE.Scene);
var TL = (function (_super) {
    __extends(TL, _super);
    function TL() {
        _super.apply(this, arguments);
    }
    TL.prototype.add = function (value, position, align, stagger) {
        if (value) {
            _super.prototype.add.call(this, value, position, align, stagger);
        }
        else
            console.log("Empty insert: ", arguments);
        return this;
    };
    return TL;
})(TimelineMax);
function addGlow(fromMesh, color) {
    // 加圣光特技
    // 来自 https://github.com/jeromeetienne/threex.geometricglow
    if (color === void 0) { color = new THREE.Color('cyan'); }
    var glow = new THREE.Object3D();
    function dilate(geometry, amount) {
        var vertexNormals = new Array(geometry.vertices.length);
        geometry.faces.forEach(function (face) {
            if (face instanceof THREE.Face3) {
                vertexNormals[face.a] = face.vertexNormals[0].add(vertexNormals[face.a] || zeroVector3);
                vertexNormals[face.b] = face.vertexNormals[1].add(vertexNormals[face.b] || zeroVector3);
                vertexNormals[face.c] = face.vertexNormals[2].add(vertexNormals[face.c] || zeroVector3);
            }
            else
                console.assert(false);
        });
        geometry.vertices.forEach(function (vertex, idx) {
            var vertexNormal = vertexNormals[idx];
            if (!vertexNormal)
                return;
            vertexNormal.normalize();
            vertex.x += vertexNormal.x * amount;
            vertex.y += vertexNormal.y * amount;
            vertex.z += vertexNormal.z * amount;
        });
    }
    function getMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                coeficient: {
                    type: "f",
                    value: 1.0
                },
                power: {
                    type: "f",
                    value: 2
                },
                glowColor: {
                    type: "c",
                    value: color
                },
            },
            vertexShader: "\nvarying vec3\tvVertexWorldPosition;\nvarying vec3\tvVertexNormal;\nvarying vec4\tvFragColor;\n\nvoid main() {\n\tvVertexNormal\t= normalize(normalMatrix * normal);\n\tvVertexWorldPosition\t= (modelMatrix * vec4(position, 1.0)).xyz;\n\tgl_Position\t= projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
            fragmentShader: "\nuniform vec3\tglowColor;\nuniform float\tcoeficient;\nuniform float\tpower;\n\nvarying vec3\tvVertexNormal;\nvarying vec3\tvVertexWorldPosition;\nvarying vec4\tvFragColor;\n\nvoid main(){\n\tvec3 worldCameraToVertex= vVertexWorldPosition - cameraPosition;\n\tvec3 viewCameraToVertex\t= (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;\n\tviewCameraToVertex\t= normalize(viewCameraToVertex);\n\tfloat intensity\t\t= pow(max(coeficient + dot(vVertexNormal, viewCameraToVertex), 0.0), power);\n\tgl_FragColor\t\t= vec4(glowColor, intensity);\n}",
            transparent: true,
            depthWrite: false,
        });
    }
    var geometry = fromMesh.geometry.clone();
    dilate(geometry, 0.01);
    var material = getMaterial();
    material.uniforms.coeficient.value = 1.1;
    material.uniforms.power.value = 1.4;
    glow.add(new THREE.Mesh(geometry, material));
    geometry = fromMesh.geometry.clone();
    dilate(geometry, 0.1);
    material = getMaterial();
    material.uniforms.coeficient.value = 0.1;
    material.uniforms.power.value = 1.2;
    material.side = THREE.BackSide;
    glow.add(new THREE.Mesh(geometry, material));
    fromMesh.add(fromMesh["glowObject"] = glow);
}
function changeGlow(mesh, color) {
    var glowObject = mesh["glowObject"];
    for (var _i = 0, _a = glowObject.children; _i < _a.length; _i++) {
        var mesh_1 = _a[_i];
        mesh_1["material"].uniforms.glowColor.value = color;
    }
}
function removeGlow(mesh) {
    mesh.remove(mesh["glowObject"]);
    delete mesh["glowObject"];
}
/**
 * 高效地将第二个数组连接到第一个
 * @param arr1 会被改变的数组
 * @param arr2 追加的新数组
 */
function cat(arr1, arr2) {
    Array.prototype.push.apply(arr1, arr2);
}
/**
 * 将两个元素为 number 的对象的元素取平均值输出
 * @param obj1
 * @param obj2
 */
function mid(obj1, obj2) {
    var newObj = {};
    for (var key in obj1)
        newObj[key] = (obj1[key] + obj2[key]) / 2;
    return newObj;
}
/**
 * 从数组中删除第一个指定元素并返回自身，失败不报错
 * @param arr 数组
 * @param obj 元素
 */
function pull(arr, obj) {
    var idx = arr.indexOf(obj);
    if (idx >= 0)
        arr.splice(arr.indexOf(obj), 1);
    return arr;
}
/**
 * 通过有序下标创建一个矩形面的两个三角形面。请保证a、b、c、d用右手螺旋顺序得出正方向。
 * @param a 下标1
 * @param b 下标2
 * @param c 下标3
 * @param d 下标4
 * @param base 下标起点
 */
function Face4(a, b, c, d, base) {
    if (base === void 0) { base = 0; }
    return [new THREE.Face3(a + base, b + base, c + base), new THREE.Face3(a + base, c + base, d + base)];
}
//#endregion
//#region 外部素材
var extGeometries = {
    tree: null,
    mushroom: null,
    pacman: null,
    apple: null,
}, extMaterials = {
    tree: null,
    mushroom: null,
    pacman: null,
    apple: null,
};
var PlayerStatusChange;
(function (PlayerStatusChange) {
    PlayerStatusChange[PlayerStatusChange["none"] = 0] = "none";
    PlayerStatusChange[PlayerStatusChange["ateSmall"] = 1] = "ateSmall";
    PlayerStatusChange[PlayerStatusChange["ateLarge"] = 2] = "ateLarge";
    PlayerStatusChange[PlayerStatusChange["powerUpCancel"] = 4] = "powerUpCancel";
    PlayerStatusChange[PlayerStatusChange["die"] = 8] = "die";
    PlayerStatusChange[PlayerStatusChange["error"] = 16] = "error";
})(PlayerStatusChange || (PlayerStatusChange = {}));
;
var CellStaticType;
(function (CellStaticType) {
    CellStaticType[CellStaticType["emptyWall"] = 0] = "emptyWall";
    CellStaticType[CellStaticType["wallNorth"] = 1] = "wallNorth";
    CellStaticType[CellStaticType["wallEast"] = 2] = "wallEast";
    CellStaticType[CellStaticType["wallSouth"] = 4] = "wallSouth";
    CellStaticType[CellStaticType["wallWest"] = 8] = "wallWest";
    CellStaticType[CellStaticType["generator"] = 16] = "generator"; // 豆子产生器
})(CellStaticType || (CellStaticType = {}));
;
var CellStatus;
(function (CellStatus) {
    CellStatus[CellStatus["empty"] = 0] = "empty";
    CellStatus[CellStatus["player1"] = 1] = "player1";
    CellStatus[CellStatus["player2"] = 2] = "player2";
    CellStatus[CellStatus["player3"] = 4] = "player3";
    CellStatus[CellStatus["player4"] = 8] = "player4";
    CellStatus[CellStatus["playerMask"] = 15] = "playerMask";
    CellStatus[CellStatus["smallFruit"] = 16] = "smallFruit";
    CellStatus[CellStatus["largeFruit"] = 32] = "largeFruit";
    CellStatus[CellStatus["generator"] = 64] = "generator";
})(CellStatus || (CellStatus = {}));
;
var Direction;
(function (Direction) {
    Direction[Direction["stay"] = -1] = "stay";
    Direction[Direction["up"] = 0] = "up";
    Direction[Direction["right"] = 1] = "right";
    Direction[Direction["down"] = 2] = "down";
    Direction[Direction["left"] = 3] = "left";
    Direction[Direction["upperright"] = 4] = "upperright";
    Direction[Direction["lowerright"] = 5] = "lowerright";
    Direction[Direction["lowerleft"] = 6] = "lowerleft";
    Direction[Direction["upperleft"] = 7] = "upperleft";
})(Direction || (Direction = {}));
;
var reasonStr = {
    "INVALID_INPUT_VERDICT_RE": "程序崩溃",
    "INVALID_INPUT_VERDICT_MLE": "程序内存爆炸",
    "INVALID_INPUT_VERDICT_TLE": "决策超时",
    "INVALID_INPUT_VERDICT_NJ": "程序输出不是JSON",
    "INVALID_INPUT_VERDICT_OLE": "程序输出爆炸",
    "INVALID_INPUT_VERDICT_OK": "程序输出格式错误",
    "INVALID_ACTION": "动作错误",
    "KILLED": "被吃"
};
var FieldObject = (function (_super) {
    __extends(FieldObject, _super);
    function FieldObject() {
        _super.apply(this, arguments);
    }
    return FieldObject;
})(THREE.Mesh);
var SmallFruit = (function (_super) {
    __extends(SmallFruit, _super);
    function SmallFruit() {
        _super.call(this, extGeometries.apple, new THREE.MeshLambertMaterial({ transparent: true, vertexColors: THREE.FaceColors }));
    }
    return SmallFruit;
})(FieldObject);
var LargeFruit = (function (_super) {
    __extends(LargeFruit, _super);
    function LargeFruit() {
        _super.call(this, extGeometries.apple, new THREE.MeshLambertMaterial({ transparent: true, vertexColors: THREE.FaceColors }));
    }
    return LargeFruit;
})(FieldObject);
var FruitGenerator = (function (_super) {
    __extends(FruitGenerator, _super);
    function FruitGenerator() {
        _super.call(this, extGeometries.tree, extMaterials.tree);
    }
    return FruitGenerator;
})(FieldObject);
var Player = (function (_super) {
    __extends(Player, _super);
    function Player(playerID, playerName) {
        _super.call(this, extGeometries.pacman, new THREE.MeshLambertMaterial({ color: Player.id2playerColor[playerID], vertexColors: THREE.FaceColors, transparent: true }));
        this.playerID = playerID;
        this.playerName = playerName;
        this.strength = 1;
        this.powerUpLeft = 0;
        this.dead = false;
        this.lazyvars = {
            strength: 1,
            powerUpLeft: 0,
            fieldCoord: new Vector2D(0, 0)
        };
    }
    Player.id2playerColor = [
        "red",
        "green",
        "blue",
        "yellow",
    ];
    return Player;
})(FieldObject);
var GameFieldBaseLogic = (function () {
    function GameFieldBaseLogic(engine, initdata, names) {
        var _this = this;
        this.engine = engine;
        this.turnID = 0;
        this.aliveCount = MAX_PLAYER_COUNT;
        this.players = [];
        this.cellStatus = [];
        this.cellPlayer = [];
        this.cellProp = [];
        this.verticalWalls = [];
        this.horizontalWalls = [];
        this.generators = [];
        this.height = initdata.height;
        this.width = initdata.width;
        this.generatorTurnLeft = this.GENERATOR_INTERVAL = initdata.GENERATOR_INTERVAL;
        this.LARGE_FRUIT_DURATION = initdata.LARGE_FRUIT_DURATION;
        this.LARGE_FRUIT_ENHANCEMENT = initdata.LARGE_FRUIT_ENHANCEMENT;
        for (var _ = 0; _ < MAX_PLAYER_COUNT; _++)
            this.players[_] = new Player(_, names[_]);
        var i, j;
        for (i = 0; i < this.height + 1; i++) {
            if (i != this.height) {
                this.cellStatus.push(new Array(this.width));
                this.cellProp.push(new Array(this.width));
                this.verticalWalls.push(new Array(this.width + 1));
                this.cellPlayer.push([]);
            }
            this.horizontalWalls.push(new Array(this.width));
            for (j = 0; j < this.width + 1; j++) {
                if (j != this.width) {
                    if (i != this.height) {
                        var players = [];
                        if (initdata.static[i][j] & CellStaticType.generator)
                            this.cellStatus[i][j] = CellStatus.generator;
                        else if (initdata.content[i][j] & CellStatus.smallFruit)
                            this.cellStatus[i][j] = CellStatus.smallFruit;
                        else if (initdata.content[i][j] & CellStatus.largeFruit)
                            this.cellStatus[i][j] = CellStatus.largeFruit;
                        else {
                            if (initdata.content[i][j] & CellStatus.playerMask) {
                                if (initdata.content[i][j] & CellStatus.player1)
                                    players.push(this.players[0]);
                                if (initdata.content[i][j] & CellStatus.player2)
                                    players.push(this.players[1]);
                                if (initdata.content[i][j] & CellStatus.player3)
                                    players.push(this.players[2]);
                                if (initdata.content[i][j] & CellStatus.player4)
                                    players.push(this.players[3]);
                                players.forEach(function (p) { return _this.putAt(p, i, j); });
                            }
                            this.cellStatus[i][j] = CellStatus.empty;
                        }
                        this.cellPlayer[i].push(players);
                    }
                    this.horizontalWalls[i][j] = i == this.height ?
                        !!(initdata.static[i - 1][j] & CellStaticType.wallSouth) :
                        !!(initdata.static[i][j] & CellStaticType.wallNorth);
                }
                if (i != this.height)
                    this.verticalWalls[i][j] = j == this.width ?
                        !!(initdata.static[i][j - 1] & CellStaticType.wallEast) :
                        !!(initdata.static[i][j] & CellStaticType.wallWest);
            }
        }
    }
    GameFieldBaseLogic.prototype.applyChange = function (log) {
        console.log("parsing log", log);
        var tl = new TL();
        var i;
        var _;
        var trace = log.trace;
        if (!trace)
            return;
        // 处理状态变化
        // 3. 射♂豆子
        if (--this.generatorTurnLeft == 0) {
            this.generatorTurnLeft = this.GENERATOR_INTERVAL;
            for (var _i = 0, _a = this.generators; _i < _a.length; _i++) {
                var generator = _a[_i];
                tl.add(this.generateFruitsFromGenerator(generator), 0);
            }
        }
        for (_ = 0; _ < MAX_PLAYER_COUNT; _++) {
            var _p = this.players[_];
            var fieldCursor = _p.fieldCoord.copy().on(this.cellStatus);
            var change = trace.change[_.toString()], action = trace.actions[_.toString()];
            // 0. 非法灵魂打入地狱
            if (change & PlayerStatusChange.error) {
                tl.add(this.playerDie(_p, log[_.toString()].reason || "INVALID_ACTION"), 0);
            }
            // 1. 移形换影
            if (!_p.dead && action != Direction.stay) {
                tl.add(this.playerMove(_p, action), 0);
            }
            // 2. 夺魂摄魄
            if (change & PlayerStatusChange.die) {
                tl.add(this.playerDie(_p, "KILLED"), 0.5);
            }
            if (!_p.dead) {
                // 4. 吔豆子
                if (change & PlayerStatusChange.ateSmall) {
                    fieldCursor.val = CellStatus.empty;
                    tl.add(this.propHide(_p.fieldCoord.on(this.cellProp).val), 0.5);
                }
                else if (change & PlayerStatusChange.ateLarge) {
                    fieldCursor.val = CellStatus.empty;
                    if (_p.powerUpLeft == 0)
                        trace.strengthDelta[_.toString()] -= this.LARGE_FRUIT_ENHANCEMENT;
                    tl.add([
                        this.propHide(_p.fieldCoord.on(this.cellProp).val),
                        this.powerUpLeftModification(_p, this.LARGE_FRUIT_DURATION)
                    ], 0.5);
                }
                // 5. 大豆回合变化
                if (_p.powerUpLeft)
                    tl.add(this.powerUpLeftModification(_p, -1), 0.5);
                if (change & PlayerStatusChange.powerUpCancel)
                    trace.strengthDelta[_.toString()] += this.LARGE_FRUIT_ENHANCEMENT;
            }
            // *. 力量变化
            if (trace.strengthDelta[_.toString()])
                tl.add(this.strengthModification(_p, trace.strengthDelta[_.toString()]), 0.5);
        }
        this.turnID++;
        tl.add(this.updateDisplayInfo());
        return tl;
    };
    GameFieldBaseLogic.prototype.roundToCoordAndSet = function (pos, obj, duration) {
        if (duration === void 0) { duration = 0; }
        var c = Math.round(pos.x - 0.5 + this.width / 2), r = Math.round(-pos.y - 0.5 + this.height / 2);
        var v = new Vector2D(r, c);
        if (obj.fieldCoord.c == c && obj.fieldCoord.r == r || !v.on(this.cellProp).valid || v.val)
            return;
        var target = obj.fieldCoord.on(this.cellProp);
        if (target.val == obj)
            target.val = undefined;
        this.cellProp[r][c] = obj;
        return this.putAt(obj, r, c, duration);
    };
    GameFieldBaseLogic.prototype.putAt = function (obj, r, c, duration) {
        if (duration === void 0) { duration = 0; }
        if (obj.fieldCoord) {
            obj.fieldCoord.r = r;
            obj.fieldCoord.c = c;
        }
        else
            obj.fieldCoord = new Vector2D(r, c);
        return this.put(obj, duration);
    };
    GameFieldBaseLogic.prototype.put = function (obj, duration) {
        if (duration === void 0) { duration = 0; }
        return TweenMax.to(obj.position, duration, {
            x: this.X(obj.fieldCoord.c),
            y: this.Y(obj.fieldCoord.r)
        });
    };
    GameFieldBaseLogic.prototype.X = function (c) {
        return c + 0.5 - this.width / 2;
    };
    GameFieldBaseLogic.prototype.Y = function (r) {
        return this.height / 2 - r - 0.5;
    };
    GameFieldBaseLogic.prototype.wrapXY = function (v, obj) {
        if (obj === void 0) { obj = {}; }
        obj["x"] = this.X(v.c);
        obj["y"] = this.Y(v.r);
        return obj;
    };
    return GameFieldBaseLogic;
})();
var GameField = (function (_super) {
    __extends(GameField, _super);
    function GameField(e, i, n) {
        _super.call(this, e, i, n);
        this.oldOrder = [0, 1, 2, 3];
        this.infoHeight = $info.infobox["p1"].self.offset().top - $info.infobox["p0"].self.offset().top;
        this.strengthOffsets = this.oldOrder.map(function (i) { return $info.infobox["p" + i].strength.offset(); });
        this.infoOffsets = this.oldOrder.map(function (i) { return $info.infobox["p" + i].self.offset(); });
        this.smallFruitsIndex = 0;
        for (var _ = 0; _ < MAX_PLAYER_COUNT; _++) {
            $info.infobox["p" + _].powerupamount.text("+" + this.LARGE_FRUIT_ENHANCEMENT);
            $info.infobox["p" + _].self.find(".player-name").html((_ + 1) + "\u53F7\u73A9\u5BB6 <b>" + neutralize(n[_]) + "</b>");
        }
    }
    GameField.prototype.initializeProps = function (scene) {
        this.smallFruits = new Array(this.height * this.width);
        for (var i = 0; i < this.smallFruits.length; i++) {
            var fruit = new SmallFruit();
            fruit.visible = false;
            scene.add(fruit);
            this.smallFruits[i] = fruit;
        }
        for (var i = 0; i < this.height; i++)
            for (var j = 0; j < this.width; j++) {
                var prop = void 0;
                switch (this.cellStatus[i][j]) {
                    case CellStatus.empty:
                        continue;
                    case CellStatus.smallFruit:
                        prop = this.newSmallFruit;
                        prop.visible = true;
                        break;
                    case CellStatus.largeFruit:
                        prop = new LargeFruit();
                        scene.add(prop);
                        break;
                    case CellStatus.generator:
                        prop = new FruitGenerator();
                        scene.add(prop);
                        this.generators.push(prop);
                        break;
                }
                this.putAt(prop, i, j);
                this.cellProp[i][j] = prop;
            }
        for (var _i = 0, _a = this.players; _i < _a.length; _i++) {
            var player = _a[_i];
            scene.add(player);
        }
    };
    Object.defineProperty(GameField.prototype, "newSmallFruit", {
        get: function () {
            var fruit = this.smallFruits[this.smallFruitsIndex];
            this.smallFruitsIndex = (this.smallFruitsIndex + 1) % (this.height * this.width);
            return fruit;
        },
        enumerable: true,
        configurable: true
    });
    GameField.prototype.strengthModification = function (player, delta) {
        var _this = this;
        var tl = new TL();
        var obj = $info.infobox["p" + player.playerID].strength;
        var dobj = $strengthDeltas[player.playerID];
        var sign = delta > 0 ? "+" : ((delta *= -1), "-");
        tl.add(biDirConstSet(dobj[0], "innerHTML", sign + delta));
        var s = this.strengthOffsets[this.oldOrder.indexOf(player.playerID)];
        if (sign == "-") {
            tl.set(dobj, { className: "+=dec" });
        }
        else {
            tl.set(dobj, { className: "-=dec" });
        }
        tl.call(function () {
            return TweenMax.set(dobj, _this.engine.projectTo2D(_this.wrapXY(player.lazyvars.fieldCoord, { z: 1 })));
        });
        tl.fromTo(dobj, 0.1, { autoAlpha: 0, scale: 0 }, { autoAlpha: 1, scale: 1, immediateRender: false, y: "-=20px" });
        tl.to(dobj, 0.5, { x: s.left, ease: Power2.easeIn }, 0.601);
        tl.to(dobj, 0.5, { y: s.top, ease: Power2.easeOut }, 0.601);
        tl.to(dobj, 0.1, { autoAlpha: 0 });
        tl.add(tweenContentAsNumber(obj, sign + "=" + delta));
        player.strength += delta;
        tl.add(biDirConstSet(player.lazyvars, "strength", player.strength));
        tl.add(biDirConstSet(this, "updateInfoTrigger", undefined));
        return tl;
    };
    GameField.prototype.updateDisplayInfo = function () {
        var _this = this;
        var tl = new TL();
        var newOrder = [0, 1, 2, 3];
        newOrder.sort(function (a, b) { return _this.players[b].strength - _this.players[a].strength; });
        if (this.oldOrder.every(function (v, i) { return v == newOrder[i]; })) {
            tl.add(tweenContentAsNumber($info.alivecount, this.aliveCount), 0);
            tl.add(tweenContentAsNumber($info.turnid, this.turnID), 0);
            return tl;
        }
        (function (oldOrder, newOrder) {
            tl.add(tweenContentAsNumber($info.alivecount, _this.aliveCount), 0);
            tl.add(tweenContentAsNumber($info.turnid, _this.turnID), 0);
            // 改变左侧顺序
            for (var rank = 0; rank < newOrder.length; rank++)
                tl.set($info.infobox["p" + newOrder[rank]].self, {
                    y: (rank - oldOrder.indexOf(newOrder[rank])) * _this.infoHeight,
                    immediateRender: false
                }, 0);
            tl.to({}, 0.001, {
                onComplete: function () {
                    for (var _i = 0; _i < newOrder.length; _i++) {
                        var i = newOrder[_i];
                        $info.self.append($info.infobox["p" + i].self.removeProp("style"));
                    }
                },
                onReverseComplete: function () {
                    for (var _i = 0; _i < oldOrder.length; _i++) {
                        var i = oldOrder[_i];
                        $info.self.append($info.infobox["p" + i].self.removeProp("style"));
                    }
                }
            });
        })(this.oldOrder, newOrder);
        this.oldOrder = newOrder;
        return tl;
    };
    GameField.prototype.playerDie = function (player, reason) {
        player.dead = true;
        this.aliveCount--;
        pull(player.fieldCoord.on(this.cellPlayer).val, player);
        var tl = new TL();
        tl.to(player.position, 0.5, { z: 3 }, "-=0.5");
        tl.to(player.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
        tl.to(player.material, 0.25, { opacity: 0.5 }, "-=0.25");
        tl.add(this.engine.shutterAndDropScreenShot(player.playerID, this.infoOffsets[this.oldOrder.indexOf(player.playerID)], reasonStr[reason]));
        tl.to(player.material, 0.25, { opacity: 0 });
        tl.add(biDirConstSet(player, "visible", false));
        return tl;
    };
    GameField.prototype.propHide = function (prop) {
        var obj = prop.fieldCoord.on(this.cellProp);
        if (obj.val) {
            var tl = new TL();
            tl.to(prop.position, 0.5, { z: 3 }, "-=0.5");
            tl.to(prop.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
            tl.to(prop.material, 0.5, { opacity: 0 }, "-=0.25");
            tl.add(biDirConstSet(obj.val, "visible", false));
            obj.val = undefined;
            obj.on(this.cellStatus).val = CellStatus.empty;
            return tl;
        }
    };
    GameField.prototype.powerUpLeftModification = function (player, delta) {
        var tl = new TL();
        if (player.powerUpLeft == 0 && delta > 0) {
            tl.set($info.infobox["p" + player.playerID].self, { className: "+=powerup" });
        }
        else if (player.powerUpLeft + delta == 0) {
            tl.set($info.infobox["p" + player.playerID].self, { className: "-=powerup" });
        }
        tl.add(tweenContentAsNumber($info.infobox["p" + player.playerID].remaining, delta > 0 ? "+=" + delta : "-=" + -delta), 0);
        player.powerUpLeft += delta;
        tl.add(biDirConstSet(player.lazyvars, "powerUpLeft", player.powerUpLeft));
        tl.add(biDirConstSet(this, "updateInfoTrigger", undefined));
        return tl;
    };
    Object.defineProperty(GameField.prototype, "updateInfoTrigger", {
        get: function () { return; },
        set: function (v) { this.engine.updateActiveObjInfo(); return; },
        enumerable: true,
        configurable: true
    });
    GameField.prototype.playerMove = function (player, dir) {
        if (this.testMove(player.playerID, dir)) {
            var slot = player.fieldCoord.on(this.cellPlayer).val;
            pull(slot, player);
            player.fieldCoord.move(dir);
            slot.push(player);
            var tl = new TL();
            tl.add(rotateNearest(player.rotation, dir), 0);
            tl.to(player.scale, 0.1, { x: 1.1, y: 1.1, z: 0.5, ease: Power2.easeOut }, 0);
            tl.to(player.scale, 0.1, { x: 1, y: 1, z: 1, ease: Power2.easeIn }, 0.1);
            tl.fromTo(player.position, 0.2, { z: 0 }, { z: 2, ease: Power2.easeOut, yoyo: true, repeat: 1, immediateRender: false }, 0.1);
            tl.add(this.put(player, 0.4), 0.1);
            if (player.fieldCoord.round()) {
                tl.to(player.material, 0.1, { opacity: 0, yoyo: true, repeat: 1 }, 0.2);
                player.fieldCoord.moveOpposite(dir);
                var s = this.wrapXY(player.fieldCoord), e = this.wrapXY(player.fieldCoord.move(dir));
                e["immediateRender"] = false;
                tl.fromTo(player.position, 0.2, mid(s, e), e, 0.3);
            }
            tl.add(biDirConstSet(player.lazyvars.fieldCoord, "r", player.fieldCoord.r));
            tl.add(biDirConstSet(player.lazyvars.fieldCoord, "c", player.fieldCoord.c));
            return tl;
        }
    };
    /**
     * 从玩家出发，判断向 dir 行进是否成功
     * @param playerid 玩家序号
     * @param dir 方向
     */
    GameField.prototype.testMove = function (playerid, dir) {
        var startCell = this.players[playerid].fieldCoord;
        if (dir == Direction.up)
            return !startCell.on(this.horizontalWalls).val;
        else if (dir == Direction.down)
            return !this.horizontalWalls[startCell.r + 1][startCell.c];
        else if (dir == Direction.left)
            return !startCell.on(this.verticalWalls).val;
        else
            return !this.verticalWalls[startCell.r][startCell.c + 1];
    };
    GameField.prototype.focusOn = function (camera, v, slowMo) {
        if (slowMo === void 0) { slowMo = false; }
        var tl = new TL();
        tl.add(biDirConstSet(this.engine, "cinematic", true));
        tl.to(camera.position, 1, this.wrapXY(v, { z: 2, ease: Power4.easeOut, yoyo: true, repeat: 1 }));
        tl.to(camera.rotation, 1, { x: 0, y: 0, z: 0, ease: Power4.easeOut, yoyo: true, repeat: 1 }, 0);
        tl.add(biDirConstSet(this.engine, "cinematic", false));
        return tl;
    };
    GameField.prototype.generateFruitsFromGenerator = function (generator) {
        var tl = new TL(), j = 0;
        for (var i = 0; i < 8; i++) {
            var target = generator.fieldCoord.copyMove(i).on(this.cellProp);
            if (target.valid && !target.val) {
                var fruit = this.newSmallFruit;
                target.val = fruit;
                fruit.fieldCoord = target.copy();
                target.on(this.cellStatus).val = CellStatus.smallFruit;
                tl.add(biDirConstSet(fruit, "visible", true), j * 0.1);
                tl.fromTo(fruit.position, 0.5, this.wrapXY(generator.fieldCoord), this.wrapXY(target, { immediateRender: false }), j * 0.1);
                // 这里使用 0.01 是为了防止 THREE.js 报矩阵不满秩的 Warning
                tl.fromTo(fruit.scale, 0.5, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, immediateRender: false }, j * 0.1);
                tl.fromTo(fruit.position, 0.5, { z: 0 }, { z: 3, ease: Power2.easeOut, immediateRender: false }, j * 0.1);
                tl.to(fruit.position, 0.5, { z: 0, ease: Bounce.easeOut }, j++ * 0.1 + 0.5);
            }
        }
        return tl;
    };
    Object.defineProperty(GameField.prototype, "floorTexture", {
        get: function () {
            var tmpCanvas = document.createElement("canvas");
            tmpCanvas.height = 8;
            tmpCanvas.width = 8;
            var context = tmpCanvas.getContext("2d");
            context.fillStyle = "#A8DBA8";
            context.fillRect(0, 0, 8, 8);
            context.fillStyle = "#79BD9A";
            context.fillRect(1, 1, 6, 6);
            var texture = new THREE.CanvasTexture(tmpCanvas, THREE.UVMapping, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
            texture.repeat.set(this.width, this.height);
            return texture;
        },
        enumerable: true,
        configurable: true
    });
    GameField.prototype.createFloor = function (wallThickness) {
        var gridSize = 1;
        var geometry = new THREE.Geometry();
        var totalHeight = gridSize * this.height + wallThickness, totalWidth = gridSize * this.width + wallThickness;
        var noTextureUV = [zeroVector2, zeroVector2, zeroVector2];
        geometry.vertices.push(new THREE.Vector3(totalWidth / -2, totalHeight / -2, -wallThickness), new THREE.Vector3(totalWidth / 2, totalHeight / -2, -wallThickness), new THREE.Vector3(totalWidth / -2, totalHeight / 2, -wallThickness), new THREE.Vector3(totalWidth / 2, totalHeight / 2, -wallThickness), new THREE.Vector3(totalWidth / -2, totalHeight / -2, 0), new THREE.Vector3(totalWidth / 2, totalHeight / -2, 0), new THREE.Vector3(totalWidth / -2, totalHeight / 2, 0), new THREE.Vector3(totalWidth / 2, totalHeight / 2, 0));
        (_a = geometry.faces).push.apply(_a, Face4(4, 5, 7, 6).concat(Face4(2, 3, 1, 0), Face4(0, 1, 5, 4), Face4(4, 6, 2, 0), Face4(1, 3, 7, 5), Face4(2, 6, 7, 3)));
        // 为底面添加材质映射
        var uvArray = geometry.faceVertexUvs[0] = new Array(geometry.faces.length);
        uvArray[0] = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)];
        uvArray[1] = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)];
        for (var i = 2; i < uvArray.length; i++)
            uvArray[i] = noTextureUV;
        geometry.computeFaceNormals();
        return new THREE.BufferGeometry().fromGeometry(geometry);
        var _a;
    };
    GameField.prototype.createGeometry = function (wallThickness, wallHeight) {
        var _this = this;
        var i, j;
        var gridSize = 1;
        var geometry = new THREE.Geometry();
        var totalHeight = gridSize * this.height + wallThickness, totalWidth = gridSize * this.width + wallThickness;
        var addWall = function (lastR, lastC, length, isHorizontal) {
            var begin = geometry.vertices.length, l, r, t, b, _l, _r, _t, _b;
            if (isHorizontal) {
                l = lastC - length;
                _l = (l - _this.width / 2) * gridSize + wallThickness / 2;
                if (l || lastR == 0 || lastR == _this.height)
                    _l -= wallThickness;
                r = lastC;
                _r = (r - _this.width / 2) * gridSize - wallThickness / 2;
                if (r - _this.width || lastR == 0 || lastR == _this.height)
                    _r += wallThickness;
                _t = (_this.height / 2 - lastR) * gridSize + wallThickness / 2;
                _b = (_this.height / 2 - lastR) * gridSize - wallThickness / 2;
            }
            else {
                _l = (lastC - _this.width / 2) * gridSize - wallThickness / 2;
                _r = (lastC - _this.width / 2) * gridSize + wallThickness / 2;
                t = lastR - length;
                _t = (_this.height / 2 - t) * gridSize - wallThickness / 2;
                if (t || lastC == 0 || lastC == _this.width)
                    _t += wallThickness;
                b = lastR;
                _b = (_this.height / 2 - b) * gridSize + wallThickness / 2;
                if (b - _this.height || lastC == 0 || lastC == _this.width)
                    _b -= wallThickness;
            }
            geometry.vertices.push(new THREE.Vector3(_l, _t, 0), new THREE.Vector3(_r, _t, 0), new THREE.Vector3(_l, _b, 0), new THREE.Vector3(_r, _b, 0), new THREE.Vector3(_l, _t, wallHeight), new THREE.Vector3(_r, _t, wallHeight), new THREE.Vector3(_l, _b, wallHeight), new THREE.Vector3(_r, _b, wallHeight));
            // 顶面
            cat(geometry.faces, Face4(6, 7, 5, 4, begin));
            // 舍去靠墙面
            // 嗯……先不舍去啦
            //if (l !== 0)
            cat(geometry.faces, Face4(0, 2, 6, 4, begin));
            //if (r !== this.width)
            cat(geometry.faces, Face4(5, 7, 3, 1, begin));
            //if (t !== 0)
            cat(geometry.faces, Face4(4, 5, 1, 0, begin));
            //if (b !== this.height)
            cat(geometry.faces, Face4(2, 3, 7, 6, begin));
        };
        var lastLen = 0;
        for (i = 0; i < this.height + 1; i++) {
            for (j = 0; j < this.width; j++) {
                if (this.horizontalWalls[i][j]) {
                    lastLen++;
                }
                else if (lastLen != 0) {
                    addWall(i, j, lastLen, true);
                    lastLen = 0;
                }
            }
            if (lastLen != 0) {
                addWall(i, j, lastLen, true);
                lastLen = 0;
            }
        }
        for (j = 0; j < this.width + 1; j++) {
            for (i = 0; i < this.height; i++) {
                if (this.verticalWalls[i][j]) {
                    lastLen++;
                }
                else if (lastLen != 0) {
                    addWall(i, j, lastLen, false);
                    lastLen = 0;
                }
            }
            if (lastLen != 0) {
                addWall(i, j, lastLen, false);
                lastLen = 0;
            }
        }
        geometry.computeFaceNormals();
        return new THREE.BufferGeometry().fromGeometry(geometry);
    };
    return GameField;
})(GameFieldBaseLogic);
//#endregion
var $ui = {
    sLoading: null,
    sIntro: null,
    sGameScene: null,
    mainCanvas: null,
    lblFloatingInfo: null,
    panSettings: null,
    lblFPS: null,
    prgbarLoading: null,
}, $info = {
    self: null,
    turnid: null,
    alivecount: null,
    infobox: {
        p0: {
            strength: null,
            powerupamount: null,
            remaining: null,
            self: null
        },
        p1: {
            strength: null,
            powerupamount: null,
            remaining: null,
            self: null
        },
        p2: {
            strength: null,
            powerupamount: null,
            remaining: null,
            self: null
        },
        p3: {
            strength: null,
            powerupamount: null,
            remaining: null,
            self: null
        }
    }
};
var $strengthDeltas = [];
var Engine = (function () {
    function Engine(finishCallback) {
        var _this = this;
        this.fullTL = new TL({ smoothChildTiming: true });
        // 状态
        this._cinematic = false;
        this.initialized = false;
        // 参数
        this.wallThickness = 0.25;
        // THREE.js 场景物件
        this.lights = {
            sky: null,
            point: null,
            top: null,
            right: null,
            left: null,
            bottom: null
        };
        this.raycaster = new THREE.Raycaster();
        // 界面用（鼠标选择）
        this.mouseCoord = new THREE.Vector2();
        this.mouseDown = false;
        this.mouseDownFirst = false;
        //return;
        var initdata;
        // 切勿用Promise……Promise的then的调用不是和resolve同步的……
        var retrieveExistingLogs = function (next) {
            if (infoProvider.isLive()) {
                infoProvider.setReadHistoryCallback(function (displays) { return (initdata = displays[0], next(displays.slice(1))); });
                infoProvider.setNewLogCallback(function (display) { return (initdata = display, next([])); });
            }
            else {
                var list = infoProvider.getLogList();
                initdata = list[0].output.display;
                var logs = [];
                for (var i = 2; i < list.length; i += 2)
                    if (list[i] && list[i]["output"] && list[i]["output"]["display"])
                        logs.push(list[i]["output"]["display"]);
                next(logs);
            }
            infoProvider.notifyInitComplete();
        };
        var initAndParseLogs = function (logs) {
            var names;
            try {
                names = infoProvider.getPlayerNames().map(function (o) { return o.name; }) || [];
            }
            catch (ex) {
                names = [];
            }
            _this.gameField = new GameField(_this, initdata, names);
            _this.dispWidth = $ui.sGameScene.width();
            _this.dispHeight = $ui.sGameScene.height();
            _this.fieldMaxWidth = _this.gameField.width;
            _this.fieldMaxHeight = _this.gameField.height;
            /**
             *    ^ y(top, -bottom)
             *    |
             *    |  场
             *    |______>
             *   /      x(right, -left)
             *  /
             * L z(back, -front)
             */
            _this.scene = new PScene();
            // 光照
            _this.lights.sky = new THREE.HemisphereLight(0xFFFFFF, 0xAAAAAA, 0.3);
            _this.lights.sky.position.z = -1;
            _this.lights.sky.position.y = 0;
            _this.lights.point = new THREE.PointLight(0xFFFFFF, 0.2);
            _this.lights.point.position.z = 5;
            _this.lights.top = new THREE.DirectionalLight(0xFFFFFF, 0.3);
            _this.lights.top.position.y = 1;
            _this.lights.top.position.z = 1;
            _this.lights.right = new THREE.DirectionalLight(0xFFFFFF, 0.4);
            _this.lights.right.position.x = 1;
            _this.lights.right.position.z = 1;
            _this.lights.bottom = new THREE.DirectionalLight(0xFFFFFF, 0.2);
            _this.lights.bottom.position.y = -1;
            _this.lights.bottom.position.z = 1;
            _this.lights.left = new THREE.DirectionalLight(0xFFFFFF, 0.1);
            _this.lights.left.position.x = -1;
            _this.lights.left.position.z = 1;
            for (var name_1 in _this.lights)
                _this.scene.add(_this.lights[name_1]);
            _this.field = new THREE.Mesh(_this.gameField.createFloor(_this.wallThickness), new THREE.MeshLambertMaterial({ color: 0xFFFFFF, map: _this.gameField.floorTexture }));
            _this.wall = new THREE.Mesh(_this.gameField.createGeometry(_this.wallThickness, 1), new THREE.MeshLambertMaterial({ color: 0xCFF09E }));
            _this.edgeshelper = new THREE.EdgesHelper(_this.wall, 0x79BD9A);
            _this.scene.add(_this.edgeshelper);
            _this.scene.add(_this.wall);
            _this.scene.add(_this.field);
            _this.gameField.initializeProps(_this.scene);
            // 让 Three.JS 使用 Greensocks 的渲染循环
            TweenMax.ticker.addEventListener('tick', _this.renderTick.bind(_this));
            $ui.mainCanvas
                .mousemove(function (event) {
                _this.mouseCoord.x = (event.clientX / _this.dispWidth) * 2 - 1;
                _this.mouseCoord.y = -(event.clientY / _this.dispHeight) * 2 + 1;
            })
                .mousedown(function () { return (_this.mouseDown = true, _this.mouseDownFirst = true); })
                .mouseup(function () { return _this.mouseDown = false; })
                .on('wheel', function (event) { return TweenMax.to(_this.camera.position, 0.1, { z: "+=" + (event.originalEvent['deltaY'] / 100) }); });
            var keyCode2dir = {
                37: Direction.left,
                38: Direction.up,
                39: Direction.right,
                40: Direction.down
            };
            $(window)
                .resize(_this.resetRenderer.bind(_this))
                .keydown(function (event) {
                switch (event.keyCode) {
                    case 13:
                        _this.fullTL.paused(!_this.fullTL.paused());
                        return;
                    case 189:
                        _this.fullTL.timeScale(_this.fullTL.timeScale() * 0.5);
                        return;
                    case 187:
                        _this.fullTL.timeScale(_this.fullTL.timeScale() * 2);
                        return;
                    case 82:
                        _this.fullTL.reversed(!_this.fullTL.reversed());
                        return;
                }
                var dir = keyCode2dir[event.keyCode];
                if (dir !== undefined) {
                    if (_this.gameField.testMove(infoProvider.getPlayerID(), dir)) {
                        var move = { action: dir, tauntText: "" };
                        infoProvider.notifyPlayerMove(move);
                    }
                }
                else
                    _this.fullTL.timeScale(_this.fullTL.timeScale() * 2);
            });
            _this.antialiasing = false;
            var parseLog = function (display) { return _this.fullTL.add(_this.gameField.applyChange(display)); };
            logs.forEach(parseLog);
            infoProvider.setNewLogCallback(parseLog);
            infoProvider.setNewRequestCallback(function (log) {
                // 接受用户输入
            });
            _this.initialized = true;
            finishCallback();
        };
        retrieveExistingLogs(initAndParseLogs);
    }
    Engine.prototype.renderTick = function () {
        if (!this.cinematic) {
            var tiltx = this.mouseCoord.x * Math.PI / 2;
            var tilty = this.mouseCoord.y * Math.PI / 2;
            // 鼠标控制视角
            this.camera.position.x = Math.sin(tiltx) * this.fieldMaxWidth;
            this.camera.position.y = Math.sin(tilty) * this.fieldMaxHeight;
            this.camera.lookAt(zeroVector3);
            // 查找鼠标指向的物件
            this.raycaster.setFromCamera(this.mouseCoord, this.camera);
            var intersects = this.raycaster.intersectObjects(this.scene.childrenExcludingHelpers);
            if (this.mouseDown) {
                if (this.mouseDownFirst)
                    for (var _i = 0; _i < intersects.length; _i++) {
                        var intersect = intersects[_i];
                        var obj = intersect.object;
                        if (obj != this.field) {
                            if (obj instanceof FieldObject) {
                                if (obj == this.selectedObj)
                                    this.selectedObj = null;
                                else
                                    this.selectedObj = obj;
                            }
                        }
                        else if (this.selectedObj) {
                            this.gameField.roundToCoordAndSet(intersect.point, this.selectedObj, 0.1);
                        }
                    }
                else if (this.selectedObj)
                    for (var _a = 0; _a < intersects.length; _a++) {
                        var intersect = intersects[_a];
                        if (intersect.object == this.field) {
                            this.gameField.roundToCoordAndSet(intersect.point, this.selectedObj, 0.1);
                            break;
                        }
                    }
            }
            else {
                if (intersects.length == 0)
                    this.hoveredObj = null;
                else
                    for (var _b = 0; _b < intersects.length; _b++) {
                        var intersect = intersects[_b];
                        if (intersect.object instanceof FieldObject) {
                            this.hoveredObj = intersect.object;
                            break;
                        }
                    }
            }
            var activeObj = this.selectedObj || this.hoveredObj;
            if (activeObj) {
                var _c = this.projectTo2D(activeObj.position), x = _c.x, y = _c.y;
                $ui.lblFloatingInfo.css("transform", "translate(" + x + "px," + y + "px)");
            }
            this.mouseDownFirst = false;
        }
        this.renderer.render(this.scene, this.camera);
    };
    Engine.prototype.resetRenderer = function () {
        if (this.renderer) {
            var $newCanvas = $ui.mainCanvas.clone(true);
            $ui.mainCanvas.replaceWith($newCanvas);
            $ui.mainCanvas = $newCanvas;
        }
        this.dispWidth = $ui.sGameScene.width();
        this.dispHeight = $ui.sGameScene.height();
        var canvas = $ui.mainCanvas.prop({
            height: this.dispHeight,
            width: this.dispWidth
        })[0];
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: this.antialiasing });
        this.renderer.setSize(this.dispWidth, this.dispHeight);
        this.renderer.setClearColor(0xe8f4d6, 1);
        this.camera = new THREE.PerspectiveCamera(50, this.dispWidth / this.dispHeight);
        this.camera.position.set(0, 0, 15);
        this.camera.lookAt(this.scene.position);
    };
    Engine.prototype.shutterAndDropScreenShot = function (toID, boxOffset, comment) {
        var _this = this;
        var tl = new TL();
        var letterboxes = $ui.sGameScene.find(".letterbox");
        var infobox = $info.infobox["p" + toID].self;
        var screenShot = infobox.find(".screen-shot");
        var img = screenShot.find("img");
        tl.to(letterboxes, 0.3, { scaleY: 6, ease: Power2.easeIn, yoyo: true, repeat: 1 });
        tl.add(biDirConstSet(img[0], "src", function () { return _this.screenShot; }));
        tl.to(screenShot, 0.5, { autoAlpha: 1 });
        var left = boxOffset.left, top = boxOffset.top;
        left += infobox.width();
        top += infobox.height() / 2;
        var imgOrigHeight = screenShot.height();
        tl.fromTo(screenShot, 1, {
            x: -left + this.dispWidth / 2,
            y: -top + this.dispHeight / 2,
            scale: this.dispHeight / imgOrigHeight
        }, {
            rotation: "-360deg",
            x: 0,
            y: 0,
            ease: Power2.easeIn,
            scale: 2
        });
        tl.to(screenShot, 0.3, { scale: 1, rotation: "-375deg", ease: Back.easeOut });
        tl.set(screenShot, {
            className: "+=satisified",
            x: -left + this.dispWidth / 2,
            y: -top + this.dispHeight / 2,
            rotation: "0",
            scale: this.dispHeight / 2 / imgOrigHeight
        });
        tl.set(infobox, { className: "+=dead" }, "-=0.3");
        tl.to(infobox, 0.075, { scale: 0.8, y: 0 }, "-=0.15");
        tl.to(infobox, 0.075, { scale: 1, y: 0, clearProps: "transform" }, "-=0.075");
        return tl;
    };
    Engine.prototype.projectTo2D = function (_a) {
        var x = _a.x, y = _a.y, z = _a.z;
        var coord = new THREE.Vector3(x, y, z);
        coord.project(this.camera);
        return {
            x: Math.round((1 + coord.x) * this.dispWidth / 2),
            y: Math.round((1 - coord.y) * this.dispHeight / 2)
        };
    };
    Engine.prototype.updateActiveObjInfo = function () {
        var activeObj = this.selectedObj || this.hoveredObj;
        if (activeObj instanceof SmallFruit)
            $ui.lblFloatingInfo.show().text("\n\u8C46\u5B50\n\u6C38\u4E45\u589E\u52A01\u529B\u91CF\n");
        else if (activeObj instanceof LargeFruit)
            $ui.lblFloatingInfo.show().text("\n\u5927\u8C46\u5B50\n\u98DF\u7528\u540E" + this.gameField.LARGE_FRUIT_DURATION + "\u56DE\u5408\u4E2D\uFF0C\u529B\u91CF\u589E\u52A0" + this.gameField.LARGE_FRUIT_ENHANCEMENT + "\n");
        else if (activeObj instanceof Player) {
            var p = activeObj;
            $ui.lblFloatingInfo.show().text("\n\u73A9\u5BB6" + p.playerID + " \u201C" + neutralize(p.playerName) + "\u201D\n\u529B\u91CF" + p.lazyvars.strength + "\uFF0C\u589E\u76CA\u5269\u4F59\u56DE\u5408" + p.lazyvars.powerUpLeft + "\n");
        }
        else if (activeObj instanceof FruitGenerator)
            $ui.lblFloatingInfo.show().text("\n\u8C46\u5B50\u4EA7\u751F\u5668\n\u6BCF\u9694" + this.gameField.GENERATOR_INTERVAL + "\u56DE\u5408\u5411\u5468\u56F4\u4EA7\u751F\u8C46\u5B50\n");
        else
            $ui.lblFloatingInfo.hide().text("...");
    };
    Object.defineProperty(Engine.prototype, "hoveredObj", {
        get: function () {
            return this._hoveredObj;
        },
        set: function (to) {
            if (to == this._hoveredObj)
                return;
            if (this._hoveredObj && this._hoveredObj != this._selectedObj) {
                removeGlow(this._hoveredObj);
                this._hoveredObj = null;
            }
            if (this._selectedObj != to)
                (this._hoveredObj = to) && addGlow(to, new THREE.Color("cyan"));
            this.updateActiveObjInfo();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Engine.prototype, "screenShot", {
        get: function () {
            // 由于不想修改 preserveDrawingBuffer（双缓冲开关）来牺牲性能，这里多渲染一次，仅仅是为了拿到图片
            this.renderer.render(this.scene, this.camera);
            return $ui.mainCanvas[0].toDataURL();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Engine.prototype, "selectedObj", {
        get: function () {
            return this._selectedObj;
        },
        set: function (to) {
            if (to == this._selectedObj)
                return;
            if (this._selectedObj) {
                for (var _i = 0, _a = this._selectedTween; _i < _a.length; _i++) {
                    var t = _a[_i];
                    t.kill();
                }
                if (!to) {
                    this._hoveredObj = this._selectedObj;
                    changeGlow(this._hoveredObj, new THREE.Color("cyan"));
                    this._selectedObj = null;
                    return;
                }
                else
                    removeGlow(this._selectedObj);
            }
            this._selectedObj = to;
            if (this._hoveredObj == to)
                changeGlow(to, new THREE.Color("red"));
            else
                to && addGlow(to);
            if (to instanceof FruitGenerator) {
                var generator = to;
            }
            this._selectedTween = [
                TweenMax.fromTo(to.position, 0.5, { z: 0.5 }, { z: 0, yoyo: true, repeat: -1, ease: Power2.easeOut }),
                TweenMax.fromTo(to.scale, 0.5, { x: 1, y: 1, z: 1 }, { x: 1.1, y: 1.1, z: 0.5, yoyo: true, repeat: -1, ease: Power2.easeOut })
            ];
            this.updateActiveObjInfo();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Engine.prototype, "antialiasing", {
        get: function () {
            return this.enableAA;
        },
        set: function (to) {
            if (this.enableAA !== to) {
                this.enableAA = to;
                this.resetRenderer();
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Engine.prototype, "graphicsLevel", {
        get: function () {
            return this.detailLevel;
        },
        set: function (to) {
            if (this.detailLevel !== to) {
                if (to > 0)
                    this.scene.add(this.edgeshelper);
                else
                    this.scene.remove(this.edgeshelper);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Engine.prototype, "cinematic", {
        get: function () {
            return this._cinematic;
        },
        set: function (to) {
            if (this._cinematic !== to) {
                $ui.sGameScene.find(".canvas-container").toggleClass("cinematic");
                if (to)
                    TweenMax.to($ui.sGameScene.find(".letterbox"), 0.3, { scaleY: 2 });
                else
                    TweenMax.to($ui.sGameScene.find(".letterbox"), 0.3, { scaleY: 1 });
                this._cinematic = to;
            }
        },
        enumerable: true,
        configurable: true
    });
    return Engine;
})();
var engine;
$(window).load(function () {
    for (var id in $ui)
        $ui[id] = $("#" + id);
    // 处理 data-child-centered 元素的居中样式
    $("[data-child-centered]").each(function () {
        $(this).children().wrapAll('<div class="centered"></div>');
    });
    // 处理 data-text-shattered 元素文本，将其用 span 拆分开
    $("[data-text-shattered]").shatter();
    var pushables = $(".push-left");
    $("a.show").click(function () {
        if (pushables.hasClass("active"))
            pushables.css("transform", "translateX(0)");
        else
            pushables.css("transform", "translateX(-" + $ui.panSettings.width() + "px)");
        pushables.toggleClass("active");
    });
    var templateContainer = $(".infobox-container");
    for (var i = 0; i < 4; i++)
        (function (i) {
            var nodes = insertTemplate('tmpInfobox').childNodes, node;
            for (var i_1 = 0; i_1 < nodes.length; i_1++)
                if (nodes[i_1].nodeType == Node.ELEMENT_NODE) {
                    node = nodes[i_1];
                    break;
                }
            var infobox = $(node).addClass("p" + i).hover(function (e) {
                if (engine && engine.initialized)
                    engine.selectedObj = engine.gameField.players[i];
            }, function (e) {
                if (engine && engine.initialized)
                    engine.selectedObj = null;
            });
            templateContainer.append(infobox);
            $strengthDeltas[i] = $(".strength-delta.p" + i);
        })(i);
    // 填充信息组件
    function fillComponents(obj, ancestor) {
        for (var className in obj) {
            if (obj[className] === null) {
                if (className == "self")
                    obj[className] = ancestor;
                else
                    obj[className] = ancestor.find("." + className + " > .value").addNumberHandle();
            }
            else {
                var scope = ancestor.find("." + className);
                if (scope.length == 0)
                    scope = ancestor.filter("." + className);
                fillComponents(obj[className], scope);
            }
        }
    }
    fillComponents($info, templateContainer);
    var breakFourthWall = function (duration) {
        if (duration === void 0) { duration = 2; }
        var tl = new TL();
        try {
            var view = $(window.parent.document.getElementById('dDanmakuOverlay')), viewOrigPos = view.offset(), viewOrigHeight = view.height(), viewOrigWidth = view.width(), navbarHeight = window.parent.document.getElementById('dNavbar').clientHeight, screenRealHeight = window.parent.innerHeight, screenRealWidth = window.parent.innerWidth, bodyHeight = window.parent.document.body.clientHeight, idealHeight = screenRealHeight - (bodyHeight - viewOrigHeight);
            var placeHolder = $("<div></div>").css({
                height: viewOrigHeight,
                width: viewOrigWidth
            });
            var iframe = $(window.frameElement);
            var fn = function () {
                iframe.removeProp("height").css({
                    height: idealHeight,
                    width: screenRealWidth
                });
                view.after(placeHolder).css({
                    position: "fixed",
                    top: viewOrigPos.top,
                    left: viewOrigPos.left,
                    width: viewOrigWidth,
                    height: viewOrigHeight
                });
            };
            if (duration)
                tl.call(fn);
            else
                fn();
            tl.to(view, duration, { top: navbarHeight, left: 0, height: idealHeight, width: screenRealWidth });
            tl.fromTo(iframe, duration, {
                x: -(screenRealWidth - viewOrigWidth) / 2,
                y: -(idealHeight - viewOrigHeight) / 2
            }, { x: 0, y: 0, immediateRender: false }, 0);
            tl.to(placeHolder, duration, { height: idealHeight }, 0);
            return tl;
        }
        catch (ex) { }
        finally {
            breakFourthWall = function () { return undefined; };
        }
    };
    var fLoadExternalModels = function () { return new Promise(function (cb) {
        var manager = new THREE.LoadingManager();
        manager.onLoad = function () {
            extGeometries.apple.rotateX(Math.PI / 2);
            extGeometries.tree.rotateX(Math.PI / 2);
            extGeometries.mushroom.rotateX(Math.PI / 2);
            var treeM = extMaterials.tree;
            treeM.shading = THREE.FlatShading;
            treeM.vertexColors = THREE.FaceColors;
            cb();
        };
        var loader = new THREE.JSONLoader(manager);
        for (var key in extGeometries)
            (function (key) {
                return loader.load("Pacman/models/" + key + ".json", function (geometry, materials) {
                    extGeometries[key] = geometry;
                    if (materials.length == 1)
                        extMaterials[key] = materials[0];
                    else
                        extMaterials[key] = new THREE.MultiMaterial(materials);
                });
            })(key);
        manager.onProgress = function (item, loaded, total) { return $ui.prgbarLoading.prop({ max: total, value: loaded }); };
    }); };
    // 开场
    var fOpening = function () {
        var tl = new TL();
        tl.call(function () { return infoProvider.notifyRequestPause(); });
        tl.to($ui.sLoading, 0.5, { scale: 2, opacity: 0 });
        tl.call(function () { return ($ui.sLoading.hide(), $ui.sIntro.show()); });
        var outer = $ui.sIntro.find(".intro-circle.outer"), inner = $ui.sIntro.find(".intro-circle.inner"), bkgRect = $ui.sIntro.find(".intro-line"), title = $ui.sIntro.find(".intro-title");
        // 内外圆形
        tl.staggerTo([outer[0], inner[0]], 2, { height: "12em", width: "12em", ease: Circ.easeInOut }, 0.5);
        tl.call(function () { return outer.hide(); });
        tl.to(inner, 1, { rotationX: "90deg", ease: Back.easeIn.config(2.5) }, "+=1");
        tl.call(function () {
            bkgRect.width(inner.find(".centered").width()).show();
            inner.hide();
        });
        // 拉长矩形
        tl.fromTo(bkgRect, 0.5, { rotationX: "-90deg" }, { rotationX: "-88deg" });
        tl.to(bkgRect, 0.5, { scaleX: 3 }, "+=0.1");
        tl.to(bkgRect, 0.5, { rotationX: "0deg" }, "+=0.1");
        tl.call(function () { return title.show(); });
        // 文字导入
        var parts = title.find("figure");
        tl.from(parts[0], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn });
        tl.call(function () {
            return TweenMax.to($(parts[0]).clone().prependTo(parts[0]), 0.2, { scale: 2, autoAlpha: 0 });
        });
        tl.add(shake(1));
        tl.from(parts[1], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
        tl.call(function () {
            return TweenMax.to($(parts[1]).clone().prependTo(parts[1]), 0.2, { scale: 2, autoAlpha: 0 });
        });
        tl.add(shake(2, window.frameElement, 0.1));
        tl.from(parts[2], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
        tl.call(function () {
            return TweenMax.to($(parts[2]).clone().prependTo(parts[2]), 0.2, { scale: 2, autoAlpha: 0 });
        });
        tl.to(window.parent.document.body, 0.2, { opacity: 0 });
        // 打破次元壁障
        var subtl = breakFourthWall();
        subtl.to(window.parent.document.body, 0.5, { opacity: 1 }, 0);
        subtl.add(shake(4, window.parent.document.body, 0.2), 0);
        subtl.call(function () { return bkgRect.width("25vw" /* x 3 = 75vw */); }, null, null, 0.2);
        subtl.paused(true);
        tl.to(subtl, subtl.duration(), { time: subtl.duration(), ease: SteppedEase.config(15) }, "-=0.2");
        // 边框特技
        var borders = bkgRect.find(".border"); // 上、右、下、左
        tl.from(borders[3], 1, { scale: 0, ease: Power2.easeIn }, "-=0.5");
        tl.from(borders[0], 1, { scale: 0, ease: Linear.easeNone });
        tl.from(borders[1], 1, { scale: 0, ease: Power2.easeOut });
        tl.to(bkgRect.find(".intro-line-fill"), 3, { scaleY: "0" }, "-=3");
        // 离场
        tl.call(function () { return ($ui.sGameScene.show(), bkgRect.css({ overflow: "hidden", borderColor: "white" })); });
        tl.to(bkgRect, 1, { width: 0, ease: Power2.easeIn });
        tl.to(bkgRect, 1, { scaleY: 2, y: "-100%", ease: Power2.easeOut });
        tl.to(bkgRect, 2, { y: "100%" });
        var p = new Promise(function (resolve) { return tl.call(resolve); });
        tl.from($ui.sGameScene, 2, { y: "-100%", opacity: 0, ease: Bounce.easeOut }, "-=2");
        tl.call(function () { return ($ui.sIntro.hide(), infoProvider.notifyRequestResume()); });
        return p;
    };
    // 如果之前跳过了开场……这里再调整一下场景大小
    var fBreakFourthWallAgain = function () { return new Promise(function (cb) {
        breakFourthWall(0).call(cb);
    }); };
    // 创建游戏场景
    var fCreateScene = function () {
        $ui.sLoading.hide();
        $ui.sGameScene.show();
        var tickFrom = Date.now(), frameCount = 0;
        // FPS 计数
        TweenMax.ticker.addEventListener('tick', function () {
            var delta = Date.now() - tickFrom;
            if (++frameCount > 20 || delta > 1000) {
                $ui.lblFPS.text(Math.round(frameCount * 1000 / delta));
                frameCount = 0;
                tickFrom = Date.now();
            }
        });
        var settingHeight = $ui.panSettings.height(), settingWidth = $ui.panSettings.width(), settingContainer = $ui.panSettings.find(".container")[0];
        $ui.panSettings.mousemove(function (event) {
            var settingOffset = $ui.panSettings.offset();
            var dx = (Math.max(event.clientX - settingOffset.left, 0) / settingWidth) * 2 - 1;
            TweenMax.set(settingContainer, { rotationY: dx * 15, z: "-1em" });
        });
        return new Promise(function (r) { return engine = new Engine(r); }); // 千万要在场景初始化好后再执行！
    };
    var fFinalInitializations = function () {
    };
    new Promise(function (r) {
        infoProvider.notifyFinishedLoading();
        r();
    })
        .then(fLoadExternalModels)
        .then(fBreakFourthWallAgain)
        .then(fCreateScene)
        .then(fFinalInitializations)
        .catch(function (err) { return console.error(err); });
});
//# sourceMappingURL=app.js.map
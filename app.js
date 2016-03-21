/**
 * Pacman 逻辑控制脚本
 * 原始语言：TypeScript
 * 使用的库：Greensocks、THREE.js
 * 已进行 Chrome 和 Firefox 的兼容性测试
 * 作者：zhouhy
 */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
window['Promise'] = window['Promise'] || window['ES6Promise'];
//#region 工具
var zeroVector2 = new THREE.Vector2();
var zeroVector3 = new THREE.Vector3();
var dummy = {};
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
function shake(amplitudeBase) {
    var tl = new TimelineMax();
    var $body = $("body");
    for (var i = 0; i < 5; i++) {
        var amplitude = (11 - i * 2) * amplitudeBase;
        tl.to($body, 0.05, {
            x: Math.random() * amplitude * 2 - amplitude,
            y: Math.random() * amplitude * 2 - amplitude,
            yoyo: true,
            ease: SteppedEase.config(3)
        });
    }
    tl.to($body, 0.1, { x: 0, y: 0 });
    return tl;
}
function biDirConstSet(obj, propName, to) {
    var initial;
    return TweenMax.to(dummy, 0.001, {
        onComplete: function () {
            initial = obj[propName];
            obj[propName] = to;
        },
        onReverseComplete: function () {
            return obj[propName] = initial;
        }
    });
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
    Vector2D.prototype.copy = function () {
        return new Vector2D(this.r, this.c);
    };
    Vector2D.prototype.copyMove = function (dir) {
        var vec = new Vector2D(this.r, this.c);
        vec.arr = this.arr;
        vec.move(dir);
        return vec;
    };
    Object.defineProperty(Vector2D.prototype, "valid", {
        get: function () {
            return this.c >= 0 && this.arr && this.arr[this.r] && this.arr[this.r].length > this.c;
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
//#region 定义
var GameStatus;
(function (GameStatus) {
    GameStatus[GameStatus["intro"] = 0] = "intro";
    GameStatus[GameStatus["init"] = 1] = "init";
    GameStatus[GameStatus["animating"] = 2] = "animating";
    GameStatus[GameStatus["paused"] = 3] = "paused";
    GameStatus[GameStatus["waiting"] = 4] = "waiting";
    GameStatus[GameStatus["requesting"] = 5] = "requesting";
})(GameStatus || (GameStatus = {}));
;
var CellStatus;
(function (CellStatus) {
    CellStatus[CellStatus["empty"] = 0] = "empty";
    CellStatus[CellStatus["smallFruit"] = 1] = "smallFruit";
    CellStatus[CellStatus["largeFruit"] = 2] = "largeFruit";
    CellStatus[CellStatus["generator"] = 3] = "generator";
})(CellStatus || (CellStatus = {}));
;
var Direction;
(function (Direction) {
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
        var geometry = new THREE.OctahedronGeometry(0.25, 0);
        geometry.translate(0, 0, 0.25);
        _super.call(this, geometry, new THREE.MeshPhongMaterial({ color: 0xFFFF00, shading: THREE.FlatShading, transparent: true }));
    }
    return SmallFruit;
})(FieldObject);
var LargeFruit = (function (_super) {
    __extends(LargeFruit, _super);
    function LargeFruit() {
        var geometry = new THREE.SphereGeometry(0.4);
        geometry.translate(0, 0, 0.4);
        _super.call(this, geometry, new THREE.MeshPhongMaterial({ color: 0x0000FF, shading: THREE.FlatShading, transparent: true }));
    }
    return LargeFruit;
})(FieldObject);
var FruitGenerator = (function (_super) {
    __extends(FruitGenerator, _super);
    function FruitGenerator() {
        var geometry = new THREE.CubeGeometry(0.7, 0.7, 0.7);
        geometry.translate(0, 0, 0.35);
        _super.call(this, geometry, new THREE.MeshPhongMaterial({ color: 0x0000FF, shading: THREE.FlatShading, transparent: true }));
    }
    return FruitGenerator;
})(FieldObject);
var Player = (function (_super) {
    __extends(Player, _super);
    function Player() {
        var geometry = new THREE.CylinderGeometry(0.5, 0.4, 0.6);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, 0.3);
        _super.call(this, geometry, new THREE.MeshPhongMaterial({ color: 0x00FF00, shading: THREE.FlatShading }));
    }
    return Player;
})(FieldObject);
var GameField = (function () {
    function GameField(width, height) {
        this.width = width;
        this.height = height;
        this.cellStatus = [];
        this.cellProp = [];
        this.cellPlayer = [];
        this.id2Player = [];
        this.verticalWalls = [];
        this.horizontalWalls = [];
        this.smallFruitsIndex = 0;
        var i, j;
        for (i = 0; i < height + 1; i++) {
            if (i != height) {
                this.cellStatus.push(new Array(width));
                this.cellProp.push(new Array(width));
                this.verticalWalls.push(new Array(width + 1));
                this.cellPlayer.push([]);
            }
            this.horizontalWalls.push(new Array(width));
            for (j = 0; j < width + 1; j++) {
                if (j != width) {
                    if (i != height) {
                        this.cellStatus[i][j] = Math.random() > 0.9 ?
                            CellStatus.smallFruit : Math.random() > 0.9 ?
                            CellStatus.largeFruit : Math.random() > 0.9 ?
                            CellStatus.generator : CellStatus.empty;
                        this.cellPlayer[i].push([]);
                    }
                    if (i == 0 || i == height)
                        this.horizontalWalls[i][j] = true;
                    else
                        this.horizontalWalls[i][j] = Math.random() > 0.5;
                }
                if (i != height)
                    if (j == 0 || j == width)
                        this.verticalWalls[i][j] = true;
                    else
                        this.verticalWalls[i][j] = Math.random() > 0.5;
            }
        }
        this.putAt(this.id2Player[0] = this.cellPlayer[5][5][0] = new Player(), 5, 5);
    }
    GameField.prototype.initializeProps = function (scene) {
        this.smallFruits = new Array(16); //this.height * this.width);
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
                        break;
                }
                this.putAt(prop, i, j);
                this.cellProp[i][j] = prop;
            }
        for (var _i = 0, _a = this.id2Player; _i < _a.length; _i++) {
            var player = _a[_i];
            scene.add(player);
        }
    };
    Object.defineProperty(GameField.prototype, "newSmallFruit", {
        get: function () {
            var fruit = this.smallFruits[this.smallFruitsIndex];
            this.smallFruitsIndex = (this.smallFruitsIndex + 1) % 16; //(this.height * this.width);
            return fruit;
        },
        enumerable: true,
        configurable: true
    });
    GameField.prototype.doAction = function (dir) {
        var player = this.id2Player[0];
        if (this.testMove(player.fieldCoord, dir)) {
            var slot = player.fieldCoord.on(this.cellPlayer).val;
            pull(slot, player);
            player.fieldCoord.move(dir);
            slot.push(player);
            var tl = new TimelineMax({ paused: true });
            tl.to(player.scale, 0.1, { x: 1.1, y: 1.1, z: 0.5, ease: Power2.easeOut });
            tl.fromTo(player.position, 0.2, { z: 0 }, { z: 2, ease: Power2.easeOut, yoyo: true, repeat: 1 });
            tl.add(this.put(player, 0.4), 0.1);
            tl.to(player.scale, 0.1, { x: 1, y: 1, z: 1, ease: Power2.easeIn });
            var obj = player.fieldCoord.on(this.cellProp);
            if (obj.val) {
                tl.to(obj.val.material, 0.5, { opacity: 0 }, "-=0.1");
                tl.to(obj.val.position, 0.5, { z: 3 }, "-=0.5");
                tl.to(obj.val.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
                tl.add(biDirConstSet(obj.val, "visible", false));
                obj.val = undefined;
            }
            return tl;
        }
    };
    /**
     * 从 startCell 出发，判断向 dir 行进是否成功
     * @param startCell 起始格子坐标
     * @param dir 方向
     */
    GameField.prototype.testMove = function (startCell, dir) {
        if (dir == Direction.up)
            return !startCell.on(this.horizontalWalls).val;
        else if (dir == Direction.down)
            return !this.horizontalWalls[startCell.r + 1][startCell.c];
        else if (dir == Direction.left)
            return !startCell.on(this.verticalWalls).val;
        else
            return !this.verticalWalls[startCell.r][startCell.c + 1];
    };
    GameField.prototype.roundToCoordAndSet = function (pos, obj, duration) {
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
    GameField.prototype.putAt = function (obj, r, c, duration) {
        if (duration === void 0) { duration = 0; }
        if (obj.fieldCoord) {
            obj.fieldCoord.r = r;
            obj.fieldCoord.c = c;
        }
        else
            obj.fieldCoord = new Vector2D(r, c);
        return this.put(obj, duration);
    };
    GameField.prototype.put = function (obj, duration) {
        if (duration === void 0) { duration = 0; }
        return TweenMax.to(obj.position, duration, {
            x: this.X(obj.fieldCoord.c),
            y: this.Y(obj.fieldCoord.r)
        });
    };
    GameField.prototype.X = function (c) {
        return c + 0.5 - this.width / 2;
    };
    GameField.prototype.Y = function (r) {
        return this.height / 2 - r - 0.5;
    };
    GameField.prototype.wrapXY = function (v, obj) {
        if (obj === void 0) { obj = {}; }
        obj["x"] = this.X(v.c);
        obj["y"] = this.Y(v.r);
        return obj;
    };
    GameField.prototype.focusOn = function (camera, v, slowMo) {
        if (slowMo === void 0) { slowMo = false; }
        var tl = new TimelineMax();
        tl.add(biDirConstSet(engine, "cinematic", true));
        tl.to(camera.position, 1, this.wrapXY(v, { z: 2, ease: Power4.easeOut, yoyo: true, repeat: 1 }));
        tl.to(camera.rotation, 1, { x: 0, y: 0, z: 0, ease: Power4.easeOut, yoyo: true, repeat: 1 }, 0);
        tl.add(biDirConstSet(engine, "cinematic", false));
        return tl;
    };
    GameField.prototype.generateFruitsFromGenerator = function (fromCell) {
        var tl = new TimelineMax(), j = 0;
        for (var i = 0; i < 8; i++) {
            var target = fromCell.copyMove(i).on(this.cellProp);
            if (target.valid && !target.val) {
                var fruit = this.newSmallFruit;
                target.val = fruit;
                fruit.fieldCoord = target.copy();
                tl.add(biDirConstSet(fruit, "visible", true), j * 0.1);
                tl.fromTo(fruit.position, 0.5, this.wrapXY(fromCell), this.wrapXY(target), j * 0.1);
                // 这里使用 0.01 是为了防止 THREE.js 报矩阵不满秩的 Warning
                tl.fromTo(fruit.scale, 0.5, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1 }, j * 0.1);
                tl.fromTo(fruit.position, 0.5, { z: 0 }, { z: 3, ease: Power2.easeOut }, j * 0.1);
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
            context.fillStyle = "#444";
            context.fillRect(0, 0, 8, 8);
            context.fillStyle = "#555";
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
            if (l !== 0)
                cat(geometry.faces, Face4(0, 2, 6, 4, begin));
            if (r !== _this.width)
                cat(geometry.faces, Face4(5, 7, 3, 1, begin));
            if (t !== 0)
                cat(geometry.faces, Face4(4, 5, 1, 0, begin));
            if (b !== _this.height)
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
})();
//#endregion
var $ui = {
    sLoading: null,
    sIntro: null,
    sGameScene: null,
    mainCanvas: null,
    lblFloatingInfo: null,
    panSettings: null,
    lblFPS: null
};
var Engine = (function () {
    function Engine() {
        var _this = this;
        this.fullTL = new TimelineMax();
        // 状态
        this._cinematic = false;
        this.gameStatus = GameStatus.intro;
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
        this.gameField = new GameField(10, 7);
        this.dispWidth = $ui.sGameScene.width();
        this.dispHeight = $ui.sGameScene.height();
        this.fieldMaxWidth = this.gameField.width;
        this.fieldMaxHeight = this.gameField.height;
        /**
         *    ^ y(top, -bottom)
         *    |
         *    |  场
         *    |______>
         *   /      x(right, -left)
         *  /
         * L z(back, -front)
         */
        this.scene = new PScene();
        // 光照
        this.lights.sky = new THREE.HemisphereLight(0xFFFFFF, 0xAAAAAA, 0.3);
        this.lights.sky.position.z = -1;
        this.lights.sky.position.y = 0;
        this.lights.point = new THREE.PointLight(0xFFFFFF, 0.2);
        this.lights.point.position.z = 5;
        this.lights.top = new THREE.DirectionalLight(0xFFFFFF, 0.3);
        this.lights.top.position.y = 1;
        this.lights.top.position.z = 1;
        this.lights.right = new THREE.DirectionalLight(0xFFFFFF, 0.4);
        this.lights.right.position.x = 1;
        this.lights.right.position.z = 1;
        this.lights.bottom = new THREE.DirectionalLight(0xFFFFFF, 0.2);
        this.lights.bottom.position.y = -1;
        this.lights.bottom.position.z = 1;
        this.lights.left = new THREE.DirectionalLight(0xFFFFFF, 0.1);
        this.lights.left.position.x = -1;
        this.lights.left.position.z = 1;
        for (var name_1 in this.lights)
            this.scene.add(this.lights[name_1]);
        this.field = new THREE.Mesh(this.gameField.createFloor(this.wallThickness), new THREE.MeshLambertMaterial({ color: 0xFFFFFF, map: this.gameField.floorTexture }));
        this.wall = new THREE.Mesh(this.gameField.createGeometry(this.wallThickness, 1), new THREE.MeshLambertMaterial({ color: 0xDDDDDD }));
        this.edgeshelper = new THREE.EdgesHelper(this.wall, 0x999999);
        this.scene.add(this.edgeshelper);
        this.scene.add(this.wall);
        this.scene.add(this.field);
        this.gameField.initializeProps(this.scene);
        // 让 Three.JS 使用 Greensocks 的渲染循环
        TweenMax.ticker.addEventListener('tick', this.renderTick.bind(this));
        $ui.mainCanvas
            .mousemove(function (event) {
            _this.mouseCoord.x = (event.clientX / _this.dispWidth) * 2 - 1;
            _this.mouseCoord.y = -(event.clientY / _this.dispHeight) * 2 + 1;
        })
            .mousedown(function () { return (_this.mouseDown = true, _this.mouseDownFirst = true); })
            .mouseup(function () { return _this.mouseDown = false; })
            .on('wheel', function (event) { return TweenMax.to(_this.camera.position, 0.1, { z: "+=" + (event.originalEvent['deltaY'] / 100) }); });
        this.antialiasing = false;
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
                var coord = activeObj.position.clone();
                coord.project(this.camera);
                $ui.lblFloatingInfo.css("transform", "translate(" + Math.round((1 + coord.x) * this.dispWidth / 2) + "px," + Math.round((1 - coord.y) * this.dispHeight / 2) + "px)");
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
        this.renderer.setClearColor(0xFFFFFF, 1);
        this.camera = new THREE.PerspectiveCamera(50, this.dispWidth / this.dispHeight);
        this.camera.position.set(0, 0, 15);
        this.camera.lookAt(this.scene.position);
    };
    Engine.prototype.shutterAndDropScreenShot = function () {
        var tl = new TimelineMax();
        var letterboxes = $ui.sGameScene.find(".letterbox");
        var screenShot = $ui.sGameScene.find(".screen-shot");
        tl.set(letterboxes, { transitionDuration: 0 });
        tl.to(letterboxes, 0.3, { scaleY: 6, clearProps: "transform,transitionDuration", ease: Power2.easeIn, yoyo: true, repeat: 1 });
        tl.set(screenShot, {
            display: "block"
        });
        tl.add(biDirConstSet(screenShot.find("img")[0], "src", this.screenShot));
        tl.to(screenShot, 2, { rotation: "360deg", top: "40%", bottom: "40%", left: "40%", right: "40%" });
        tl.to(screenShot, 0.5, { x: "-500%", ease: Power2.easeIn });
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
                addGlow(this._hoveredObj = to, new THREE.Color("cyan"));
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
                addGlow(to);
            this.gameField.focusOn(this.camera, to.fieldCoord);
            if (to instanceof FruitGenerator) {
                var generator = to;
                this.fullTL.add(this.gameField.generateFruitsFromGenerator(generator.fieldCoord));
            }
            this._selectedTween = [
                TweenMax.fromTo(to.position, 0.5, { z: 0.5 }, { z: 0, yoyo: true, repeat: -1, ease: Power2.easeOut }),
                TweenMax.fromTo(to.scale, 0.5, { x: 1, y: 1, z: 1 }, { x: 1.1, y: 1.1, z: 0.5, yoyo: true, repeat: -1, ease: Power2.easeOut })
            ];
            $ui.lblFloatingInfo.text(to.fieldCoord.r + "," + to.fieldCoord.c);
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
    var templateContainer = $(".infobox-container");
    for (var i = 0; i < 4; i++)
        templateContainer.append($(insertTemplate('tmpInfobox')['children'][0]).addClass("p" + (i + 1)));
    var currTL;
    $(document).keydown(function (e) {
        if (e.keyCode != 13)
            return;
        if (currTL) {
            currTL.resume();
            currTL = null;
            return;
        }
        currTL = TimelineLite.exportRoot();
        currTL.pause();
    });
    // 开场
    var fOpening = function (cb) {
        var tl = new TimelineMax();
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
        tl.add(shake(1.5));
        tl.from(parts[2], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
        tl.call(function () {
            return TweenMax.to($(parts[2]).clone().prependTo(parts[2]), 0.2, { scale: 2, autoAlpha: 0 });
        });
        tl.add(shake(2));
        // 边框特技
        var borders = bkgRect.find(".border"); // 上、右、下、左
        tl.from(borders[3], 1, { scale: 0, ease: Power2.easeIn }, "+=0.5");
        tl.from(borders[0], 1, { scale: 0, ease: Linear.easeNone });
        tl.from(borders[1], 1, { scale: 0, ease: Power2.easeOut });
        tl.to(bkgRect.find(".intro-line-fill"), 3, { scaleY: "0" }, "-=3");
        // 离场
        tl.call(function () { return ($ui.sGameScene.show(), bkgRect.css({ overflow: "hidden", borderColor: "white" })); });
        tl.to(bkgRect, 1, { width: 0, ease: Power2.easeIn });
        tl.to(bkgRect, 1, { scaleY: 2, y: "-100%", ease: Power2.easeOut });
        tl.to(bkgRect, 2, { y: "100%" });
        tl.from($ui.sGameScene, 2, { y: "-100%", opacity: 0, ease: Bounce.easeOut }, "-=2");
        tl.call(function () { return $ui.sIntro.hide(); });
        cb && tl.call(cb);
    };
    // 创建游戏场景
    var fCreateScene = function (cb) {
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
        engine = new Engine();
        var keyCode2dir = {
            37: Direction.left,
            38: Direction.up,
            39: Direction.right,
            40: Direction.down
        };
        $(window)
            .resize(engine.resetRenderer.bind(engine))
            .keydown(function (event) {
            var dir = keyCode2dir[event.keyCode];
            if (dir !== undefined) {
                var tl = engine.gameField.doAction(dir);
                if (tl)
                    engine.fullTL.to(tl, tl.duration(), { time: tl.duration() });
            }
            else
                engine.shutterAndDropScreenShot();
        });
        cb && cb();
    };
    var pOpening = new Promise(function (r) { return (0 && infoProvider.notifyInitComplete(), r()); });
    //pOpening.then(fOpening);
    pOpening.then(fCreateScene);
    pOpening.catch(function (err) { return console.error(err); });
});
//# sourceMappingURL=app.js.map
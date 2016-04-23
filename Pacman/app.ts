/**
 * Pacman 逻辑控制脚本
 * 原始语言：TypeScript
 * 使用的库：Greensocks、THREE.js
 * 已进行 Chrome 和 Firefox 的兼容性测试
 * 时间轴约定：表现和背后逻辑变量是不同时的，背后的逻辑变量只在计算时临时出现，表现需要依赖于当次计算出的逻辑变量或解析当前表现
 * 已知bug：弹幕无法正常使用
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

const MAX_PLAYER_COUNT = 4;
const zeroVector2 = new THREE.Vector2();
const zeroVector3 = new THREE.Vector3();
const dummy = {};

if (!window.parent || window.parent == window) {
	// 调试时候才会用到吧……
	infoProvider = <any>{
		getMatchInitData: function () {},
		getLogList: function () {},
		getPlayerNames: function () {},
		isLive: function () { },
		getPlayerID: function () {},
		setNewLogCallback: function (fn) {},
		setNewRequestCallback: function (fn) {},
		setGameOverCallback: function (fn) {},
		setReadHistoryCallback: function (fn) {},
		setReadFullLogCallback: function (fn) { },
		setPauseCallback: function (fn) {},
		setPlayCallback: function (fn) {},
		setSize: function (width, height) {},
		notifyInitComplete: function () {},
		notifyPlayerMove: function (move) {},
		notifyRequestPause: function () {},
		notifyRequestResume: function () {}
	};
}

jQuery.fn.shatter = function (): JQuery {
	return this.each(function () {
		let text: string = this.textContent;
		let result = "";
		for (let x of text.trim())
			if (x == "" || x == " ")
				result += `<figure>&nbsp;</figure>`;
			else
				result += `<figure>${x}</figure>`;
		this.innerHTML = result;
	});
};

jQuery.fn.expand = function (): JQuery {
	let lastTween: TweenMax = this.data("lasttween");
	if (lastTween)
		lastTween.kill();
	this.data("lasttween", TweenMax.fromTo(this, 0.3, { scale: "+=0.3" }, { scale: 1 }));
	return this;
};

jQuery.fn.shrink = function (): JQuery {
	let lastTween: TweenMax = this.data("lasttween");
	if (lastTween)
		lastTween.kill();
	this.data("lasttween", TweenMax.fromTo(this, 0.3, { scale: "-=0.3" }, { scale: 1 }));
	return this;
};

jQuery.fn.addNumberHandle = function (): JQuery {
	let dom: HTMLElement = this[0];
	dom["_realNumber"] = parseInt(dom.innerHTML);
	Object.defineProperty(dom, "_contentAsNumber", {
		get: () => dom["_realNumber"],
		set: v => dom.innerHTML = (dom["_realNumber"] = Math.round(v)).toString()
	});
	return this;
}

let cookie = $.cookie("pacman");
let settings: ICookieSettings;
let future = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));

function saveSettings() {
	$.cookie("pacman", JSON.stringify(settings), { expires: future });
}

function xhrGetArrayBuffer(url: string, cb: (data: ArrayBuffer) => void) {
	let xhr = new XMLHttpRequest();
	xhr.open('GET', url, true);
	xhr.responseType = 'arraybuffer';

	xhr.onload = () => cb(xhr.response);

	xhr.send();
}

/**
 * 对已经附加数字句柄的 JQuery 对象的内容作为数字进行动画补间
 * @param obj JQuery 对象
 * @param target 目标数字，或者是"+=xx"这样的变化量
 */
function tweenContentAsNumber(obj: JQuery, target: number | string) {
	let dom: HTMLElement = obj[0], first: boolean;
	let initial: number, last: number;
	return TweenMax.to(dom, 0.5, {
		_contentAsNumber: target,
		onStart: () => {
			first = true;
			initial = dom["_contentAsNumber"];
			last = initial;
		},
		onUpdate: () => {
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

function rotateNearest(rotation: THREE.Euler, to: Direction) {
	return TweenMax.to(rotation, 0.1, { z: [1, 0, -1, -2][to] * Math.PI / 2 });
}

/**
 * 【抖】
 * @param amplitudeBase 抖动多大
 * @param target 抖动元素
 * @param durationBase 抖动多久
 */
function shake(amplitudeBase: number, target?, durationBase: number = 0.05) {
	let tl = new TL();
	let $body = $(target || "body");
	tl.call(() => $body.css("border", "none"));
	for (let i = 0; i < 5; i++) {
		let amplitude = (11 - i * 2) * amplitudeBase;
		tl.to($body, durationBase, {
			x: Math.random() * amplitude * 2 - amplitude,
			y: Math.random() * amplitude * 2 - amplitude,
			yoyo: true
		});
	}
	tl.to($body, durationBase * 2, { x: 0, y: 0 });
	return tl;
}

function biDirConstSet(obj: Object, propName: string, to: (() => void) | any) {
	let initial: any;
	return TweenMax.to(dummy, 0.001, {
		immediateRender: false,
		onComplete: () => {
			initial = obj[propName];
			if (to instanceof Function)
				obj[propName] = to();
			else
				obj[propName] = to;
		},
		onReverseComplete: () =>
			obj[propName] = initial
	});
}

let __constNode = document.createElement('p');
/**
 * 将字符串中的危险字符进行转义
 * @param hostile 危险的字符串
 */
function neutralize(hostile: string) {
	__constNode.textContent = hostile;
	return __constNode.innerHTML;
}

function insertTemplate(templateID: string) {
	return document.importNode(document.getElementById(templateID)["content"], true);
}

class Vector2D<T> {
	constructor(public r: number, public c: number) { }
	public move(dir: Direction) {
		if (dir == Direction.up || dir == Direction.upperleft || dir == Direction.upperright)
			this.r--;
		else if (dir == Direction.down || dir == Direction.lowerleft || dir == Direction.lowerright)
			this.r++;
		if (dir == Direction.right || dir == Direction.upperright || dir == Direction.lowerright)
			this.c++;
		else if (dir == Direction.left || dir == Direction.upperleft || dir == Direction.lowerleft)
			this.c--;
		return this;
	}
	public moveOpposite(dir: Direction) {
		if (dir == Direction.up || dir == Direction.upperleft || dir == Direction.upperright)
			this.r++;
		else if (dir == Direction.down || dir == Direction.lowerleft || dir == Direction.lowerright)
			this.r--;
		if (dir == Direction.right || dir == Direction.upperright || dir == Direction.lowerright)
			this.c--;
		else if (dir == Direction.left || dir == Direction.upperleft || dir == Direction.lowerleft)
			this.c++;
		return this;
	}
	public copy<T>() {
		return new Vector2D<T>(this.r, this.c);
	}
	public copyMove(dir: Direction) {
		let vec = new Vector2D<T>(this.r, this.c);
		vec.arr = this.arr;
		vec.move(dir);
		return vec;
	}
	private arr: T[][];

	/**
	 * @return 是否越界
	 */
	public round() {
		if (!this.arr)
			return false;

		let r = (this.r + this.arr.length) % this.arr.length;
		let row = this.arr[r];
		let c = (this.c + row.length) % row.length;
		if (r == this.r && c == this.c)
			return false;

		this.r = r;
		this.c = c;
		return true;
	}
	public get valid(): boolean {
		let row = this.arr && this.arr[this.r];
		return this.c >= 0 && row && row.length > this.c;
	}
	public get val(): T {
		let r = this.arr[this.r];
		if (!r)
			return;
		return r[this.c];
	}
	public set val(value: T) {
		this.arr[this.r][this.c] = value;
	}
	public on<T>(arr: T[][]) {
		this.arr = <any>arr;
		return <any>this as Vector2D<T>;
	}
}

/**
 * 可以单独将 Helper 排除在外的场景类
 */
class PScene extends THREE.Scene {
	public childrenExcludingHelpers: THREE.Object3D[] = [];

	public add(object: THREE.Object3D) {
		super.add(object);
		if (object instanceof THREE.EdgesHelper)
			return;
		this.childrenExcludingHelpers.push(object);
	}

	public remove(object: THREE.Object3D) {
		super.remove(object);
		pull(this.childrenExcludingHelpers, object);
	}
}

class TL extends TimelineMax {
	add(value: any, position?: any, align?: string, stagger?: number): TL {
		if (value) {
			super.add(value, position, align, stagger);
		} else
			console.log("Empty insert: ", this);
		return this;
	}
}

function addGlow(fromMesh: THREE.Mesh, color: THREE.Color = new THREE.Color('cyan')): void {
	// 加圣光特技
	// 来自 https://github.com/jeromeetienne/threex.geometricglow

	let glow = new THREE.Object3D();

	function dilate(geometry: THREE.Geometry, amount: number): void {
		let vertexNormals: THREE.Vector3[] = new Array(geometry.vertices.length);
		geometry.faces.forEach(face => {
			if (face instanceof THREE.Face3) {
				vertexNormals[face.a] = face.vertexNormals[0].add(vertexNormals[face.a] || zeroVector3);
				vertexNormals[face.b] = face.vertexNormals[1].add(vertexNormals[face.b] || zeroVector3);
				vertexNormals[face.c] = face.vertexNormals[2].add(vertexNormals[face.c] || zeroVector3);
			} else console.assert(false);
		});
		geometry.vertices.forEach((vertex, idx) => {
			let vertexNormal = vertexNormals[idx];
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
			vertexShader: `
varying vec3	vVertexWorldPosition;
varying vec3	vVertexNormal;
varying vec4	vFragColor;

void main() {
	vVertexNormal	= normalize(normalMatrix * normal);
	vVertexWorldPosition	= (modelMatrix * vec4(position, 1.0)).xyz;
	gl_Position	= projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
			fragmentShader: `
uniform vec3	glowColor;
uniform float	coeficient;
uniform float	power;

varying vec3	vVertexNormal;
varying vec3	vVertexWorldPosition;
varying vec4	vFragColor;

void main(){
	vec3 worldCameraToVertex= vVertexWorldPosition - cameraPosition;
	vec3 viewCameraToVertex	= (viewMatrix * vec4(worldCameraToVertex, 0.0)).xyz;
	viewCameraToVertex	= normalize(viewCameraToVertex);
	float intensity		= pow(max(coeficient + dot(vVertexNormal, viewCameraToVertex), 0.0), power);
	gl_FragColor		= vec4(glowColor, intensity);
}`,
			transparent: true,
			depthWrite: false,
		});
	}

	let geometry = fromMesh.geometry.clone() as THREE.Geometry;
	dilate(geometry, 0.01);
	var material = getMaterial();
	material.uniforms.coeficient.value = 1.1;
	material.uniforms.power.value = 1.4;
	glow.add(new THREE.Mesh(geometry, material));


	geometry = fromMesh.geometry.clone() as THREE.Geometry;
	dilate(geometry, 0.1);
	material = getMaterial();
	material.uniforms.coeficient.value = 0.1;
	material.uniforms.power.value = 1.2;
	material.side = THREE.BackSide;
	glow.add(new THREE.Mesh(geometry, material));

	fromMesh.add(fromMesh["glowObject"] = glow);
}

function changeGlow(mesh: THREE.Mesh, color: THREE.Color): void {
	let glowObject: THREE.Object3D = mesh["glowObject"];
	for (let mesh of glowObject.children)
		mesh["material"].uniforms.glowColor.value = color;
}

function removeGlow(mesh: THREE.Mesh): void {
	mesh.remove(mesh["glowObject"]);
	delete mesh["glowObject"];
}

/**
 * 高效地将第二个数组连接到第一个
 * @param arr1 会被改变的数组
 * @param arr2 追加的新数组
 */
function cat<T>(arr1: T[], arr2: T[]): void {
	Array.prototype.push.apply(arr1, arr2);
}

/**
 * 将两个元素为 number 的对象的元素取平均值输出
 * @param obj1
 * @param obj2
 */
function mid(obj1: Object, obj2: Object): Object {
	let newObj = {};
	for (let key in obj1)
		newObj[key] = (obj1[key] + obj2[key]) / 2;
	return newObj;
}

/**
 * 从数组中删除第一个指定元素并返回自身，失败不报错
 * @param arr 数组
 * @param obj 元素
 */
function pull<T>(arr: T[], obj: T): T[] {
	let idx = arr.indexOf(obj);
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
function Face4(a: number, b: number, c: number, d: number, base: number = 0): THREE.Face3[] {
	return [new THREE.Face3(a + base, b + base, c + base), new THREE.Face3(a + base, c + base, d + base)];
}

//#endregion

//#region 外部素材
let extGeometries = {
	tree: <THREE.Geometry>null,
	pacman: <THREE.Geometry>null,
	apple: <THREE.Geometry>null,
},
	extMaterials = {
		tree: <THREE.Material>null,
		pacman: <THREE.Material>null,
		apple: <THREE.Material>null,
	};
//#endregion

//#region 定义

interface IPlayerToAny<T> {
	"0": T;
	"1": T;
	"2": T;
	"3": T;
}

interface IInitdata {
	seed: number;
	width: number;
	height: number;
	GENERATOR_INTERVAL: number;
	LARGE_FRUIT_DURATION: number;
	LARGE_FRUIT_ENHANCEMENT: number;
	static: CellStaticType[][];
	content: CellStatus[][];
}

interface IRequest {
	action: Direction;
	tauntText?: string;
}

interface ITrace {
	strengthDelta: IPlayerToAny<number>;
	change: IPlayerToAny<PlayerStatusChange>;
	actions: IPlayerToAny<Direction>;
}

interface IDisplayLog extends IPlayerToAny<IRequest> {
	trace?: ITrace;
	result?: IPlayerToAny<number>;
}

interface ICookieSettings {
	intro: boolean;
	antialiasing: boolean;
	graphicsLevel: number;
	orthographic: boolean;
	sound: boolean;
	musicProgress: {
		id: number;
		time: number;
	};
}

enum PlayerStatusChange {
	none = 0,
	ateSmall = 1,
	ateLarge = 2,
	powerUpCancel = 4,
	die = 8,
	error = 16
};

enum CellStaticType {
	emptyWall = 0, // 其实不会用到
	wallNorth = 1, // 北墙（纵坐标减少的方向）
	wallEast = 2, // 东墙（横坐标增加的方向）
	wallSouth = 4, // 南墙（纵坐标增加的方向）
	wallWest = 8, // 西墙（横坐标减少的方向）
	generator = 16 // 豆子产生器
};

enum CellStatus {
	empty = 0,
	player1 = 1, // 1号玩家（注意这几个都不会在初始化之后用）
	player2 = 2, // 2号玩家
	player3 = 4, // 3号玩家
	player4 = 8, // 4号玩家
	playerMask = 1 | 2 | 4 | 8, // 用于检查有没有玩家等
	smallFruit = 16, largeFruit = 32, generator = 64
};

enum Direction {
	stay = -1, up, right, down, left, upperright, lowerright, lowerleft, upperleft
};

let reasonStr = {
	"INVALID_INPUT_VERDICT_RE": "程序崩溃",
	"INVALID_INPUT_VERDICT_MLE": "程序内存爆炸",
	"INVALID_INPUT_VERDICT_TLE": "决策超时",
	"INVALID_INPUT_VERDICT_NJ": "程序输出不是JSON",
	"INVALID_INPUT_VERDICT_OLE": "程序输出爆炸",
	"INVALID_INPUT_VERDICT_OK": "程序输出格式错误",
	"INVALID_ACTION": "动作错误",
	"KILLED": "被吃"
};

abstract class FieldObject extends THREE.Mesh {
	public fieldCoord: Vector2D<FieldObject>;
}

class SmallFruit extends FieldObject {
	constructor(public fruitID: number) {
		super(
			extGeometries.apple,
			new THREE.MeshLambertMaterial({ transparent: true, vertexColors: THREE.FaceColors })
		);
	}
}

class LargeFruit extends FieldObject {
	constructor() {
		let g = extGeometries.apple.clone();
		g.scale(1.3, 1.3, 1.3);
		super(
			g,
			new THREE.MeshLambertMaterial({ color: 0xAAFFAA, transparent: true, vertexColors: THREE.FaceColors })
		);
	}
}

class FruitGenerator extends FieldObject {
	constructor() {
		super(
			extGeometries.tree,
			extMaterials.tree
		);
	}
}

class Player extends FieldObject {
	static id2playerColor: string[] = [
		"red",
		"green",
		"blue",
		"yellow",
	];
	public strength = 1;
	public powerUpLeft = 0;
	public dead = false;
	public lazyvars = {
		strength: 1,
		powerUpLeft: 0,
		fieldCoord: new Vector2D<FieldObject>(0, 0)
	};
	constructor(public playerID: number, public playerName: string) {
		super(
			extGeometries.pacman,
			new THREE.MeshLambertMaterial({ color: Player.id2playerColor[playerID], vertexColors: THREE.FaceColors, transparent: true })
		);
	}

}

abstract class GameFieldBaseLogic {
	protected turnID: number = 0;
	protected aliveCount: number = MAX_PLAYER_COUNT;
	protected generatorTurnLeft: number;
	public players: Player[] = [];
	protected cellStatus: CellStatus[][] = [];
	protected cellPlayer: Player[][][] = [];
	protected cellProp: FieldObject[][] = [];
	protected verticalWalls: boolean[][] = [];
	protected horizontalWalls: boolean[][] = [];
	protected generators: FruitGenerator[] = [];
	public LARGE_FRUIT_DURATION: number;
	public LARGE_FRUIT_ENHANCEMENT: number;
	public GENERATOR_INTERVAL: number;
	public width: number;
	public height: number;

	protected abstract propHide(prop: FieldObject): TL;
	protected abstract playerDie(player: Player, reason: string): TL;
	protected abstract playerMove(player: Player, dir: Direction): TL;
	protected abstract generateFruitsFromGenerator(generator: FruitGenerator): TL;
	protected abstract strengthModification(player: Player, delta: number): TL;
	protected abstract powerUpLeftModification(player: Player, delta: number): TL;
	protected abstract playerTaunt(player: Player, taunt: string): TL;
	protected abstract updateDisplayInfo(): TL;
	protected abstract showResults(scores: IPlayerToAny<number>): TL;

	constructor(protected engine: Engine, initdata: IInitdata, names: string[]) {
		this.height = initdata.height;
		this.width = initdata.width;
		this.generatorTurnLeft = this.GENERATOR_INTERVAL = initdata.GENERATOR_INTERVAL;
		this.LARGE_FRUIT_DURATION = initdata.LARGE_FRUIT_DURATION;
		this.LARGE_FRUIT_ENHANCEMENT = initdata.LARGE_FRUIT_ENHANCEMENT;

		for (let _ = 0; _ < MAX_PLAYER_COUNT; _++)
			this.players[_] = new Player(_, names[_]);

		let i, j;
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
						let players: Player[] = [];
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
								players.forEach(p => {
									this.putAt(p, i, j);
									p.lazyvars.fieldCoord.r = i;
									p.lazyvars.fieldCoord.c = j;
								});
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

	public applyChange(log: IDisplayLog): TL {
		let tl = new TL();
		let i: number;
		let _: number;
		let trace = log.trace;
		if (!trace)
			return;

		// 处理状态变化

		// 3. 射♂豆子
		if (--this.generatorTurnLeft == 0) {
			this.generatorTurnLeft = this.GENERATOR_INTERVAL;
			this.engine.playSound(tl, sounds.sndGenerate, 0);
			for (let generator of this.generators)
				tl.add(
					this.generateFruitsFromGenerator(generator),
					0
				);
		}

		for (_ = 0; _ < MAX_PLAYER_COUNT; _++) {
			let _p = this.players[_];
			let fieldCursor = _p.fieldCoord.copy().on(this.cellStatus);
			let change: PlayerStatusChange = trace.change[_.toString()],
				action: Direction = trace.actions[_.toString()];

			// 叫嚣
			if (!_p.dead && log[_.toString()]) {
				let taunt: string = log[_.toString()].tauntText;
				if (taunt && taunt.length > 0)
					tl.add(this.playerTaunt(_p, taunt), 0);
			}

			// 0. 非法灵魂打入地狱
			if (change & PlayerStatusChange.error) {
				tl.add(
					this.playerDie(_p,
						log[_.toString()].reason || "INVALID_ACTION"),
					0
				);
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
					this.engine.playSound(tl, sounds.sndPick, 0.5);
					fieldCursor.val = CellStatus.empty;
					tl.add(
						this.propHide(_p.fieldCoord.on(this.cellProp).val),
						0.5
					);
				} else if (change & PlayerStatusChange.ateLarge) {
					this.engine.playSound(tl, sounds.sndEnhance, 0.5);
					fieldCursor.val = CellStatus.empty;
					if (_p.powerUpLeft == 0) {
						_p.strength += this.LARGE_FRUIT_ENHANCEMENT;
						trace.strengthDelta[_.toString()] -= this.LARGE_FRUIT_ENHANCEMENT;
					}
					tl.add([
							this.propHide(_p.fieldCoord.on(this.cellProp).val),
							this.powerUpLeftModification(_p, this.LARGE_FRUIT_DURATION - 1)
						],
						0.5
					);
				}

				// 5. 大豆回合变化
				if (_p.powerUpLeft && !(change & PlayerStatusChange.ateLarge))
					tl.add(this.powerUpLeftModification(_p, -1), 0.5);
				if (change & PlayerStatusChange.powerUpCancel) {
					trace.strengthDelta[_.toString()] += this.LARGE_FRUIT_ENHANCEMENT;
					_p.strength -= this.LARGE_FRUIT_ENHANCEMENT;
					this.engine.playSound(tl, sounds.sndLosePower, 0.5);
				}

			}

			// *. 力量变化
			if (trace.strengthDelta[_.toString()])
				tl.add(
					this.strengthModification(_p, trace.strengthDelta[_.toString()]),
					0.5
				);
		}

		this.turnID++;
		tl.add(this.updateDisplayInfo());

		if (log.result) {
			// 游戏结束啦
			tl.add(this.showResults(log.result));
		}

		return tl;
	}

	public roundToCoordAndSet(pos: THREE.Vector3 | THREE.Vector2, obj: FieldObject, duration: number = 0) {
		let c = Math.round(pos.x - 0.5 + this.width / 2),
			r = Math.round(-pos.y - 0.5 + this.height / 2);
		let v = new Vector2D(r, c);
		if (obj.fieldCoord.c == c && obj.fieldCoord.r == r || !v.on(this.cellProp).valid || v.val)
			return;
		let target = obj.fieldCoord.on(this.cellProp);
		if (target.val == obj)
			target.val = undefined;
		this.cellProp[r][c] = obj;
		return this.putAt(obj, r, c, duration);
	}
	public putAt(obj: FieldObject, r: number, c: number, duration: number = 0) {
		if (obj.fieldCoord) {
			obj.fieldCoord.r = r;
			obj.fieldCoord.c = c;
		} else
			obj.fieldCoord = new Vector2D<FieldObject>(r, c);
		return this.put(obj, duration);
	}
	public put(obj: FieldObject, duration: number = 0) {
		return TweenMax.to(obj.position, duration, {
			x: this.X(obj.fieldCoord.c),
			y: this.Y(obj.fieldCoord.r),
			immediateRender: false
		});
	}
	public X(c: number) {
		return c + 0.5 - this.width / 2;
	}
	public Y(r: number) {
		return this.height / 2 - r - 0.5;
	}
	public wrapXY(v: Vector2D<any>, obj: Object = {}) {
		obj["x"] = this.X(v.c);
		obj["y"] = this.Y(v.r);
		return obj;
	}
}

class GameField extends GameFieldBaseLogic {

	private oldOrder: number[] = [0, 1, 2, 3];
	private infoHeight = $info.infobox["p1"].self.offset().top - $info.infobox["p0"].self.offset().top;
	private strengthOffsets = this.oldOrder.map(i => $info.infobox["p" + i].strength.offset());
	private infoOffsets = this.oldOrder.map(i => $info.infobox["p" + i].self.offset());

	constructor(e: Engine, i: IInitdata, n: string[]) {
		super(e, i, n);
		for (let _ = 0; _ < MAX_PLAYER_COUNT; _++) {
			$info.infobox["p" + _].powerupamount.text("+" + this.LARGE_FRUIT_ENHANCEMENT);
			$info.infobox["p" + _].self.find(".player-name").html(`${_ + 1}号玩家 <b>${neutralize(n[_])}</b>`);
		}
	}

	private smallFruits: SmallFruit[];
	public initializeProps(scene: PScene) {
		this.smallFruits = new Array(this.height * this.width);
		for (let i = 0; i < this.smallFruits.length; i++) {
			let fruit = new SmallFruit(i);
			fruit.visible = false;
			scene.add(fruit);
			this.smallFruits[i] = fruit;
			this.freeFruits.push(i);
		}

		for (let i = 0; i < this.height; i++)
			for (let j = 0; j < this.width; j++) {
				let prop: FieldObject;
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
		for (let player of this.players)
			scene.add(player);
	}

	private freeFruits: number[] = [];
	public get newSmallFruit(): SmallFruit {
		let fruit = this.smallFruits[this.freeFruits.pop()];
		return fruit;
	}
	public set freeFruit(fruit: SmallFruit) {
		this.freeFruits.unshift(fruit.fruitID);
	}

	protected strengthModification(player: Player, delta: number) {
		let tl = new TL();
		const obj = $info.infobox["p" + player.playerID].strength;
		const dobj = $strengthDeltas[player.playerID];
		const sign = delta > 0 ? "+" : ((delta *= -1), "-");
		tl.add(biDirConstSet(dobj[0], "innerHTML", sign + delta));
		const s = this.strengthOffsets[this.oldOrder.indexOf(player.playerID)];
		if (sign == "-") {
			tl.set(dobj, { className: "+=dec", immediateRender: false });
			//tl.fromTo(dobj, 0.1, { autoAlpha: 0, scale: 0, x: s.left, y: s.top },
			//	{ autoAlpha: 1, scale: 1, immediateRender: false });
			//tl.to(dobj, 0.5, { x: e.x, ease: Power2.easeOut }, 0.601);
			//tl.to(dobj, 0.5, { y: e.y, ease: Power2.easeIn }, 0.601);
		} else {
			tl.set(dobj, { className: "-=dec", immediateRender: false });
		}
		tl.call(() =>
			TweenMax.set(dobj, this.engine.projectTo2D(this.wrapXY(player.lazyvars.fieldCoord, { z: 1 }) as any))
		);
		tl.fromTo(dobj, 0.1, { autoAlpha: 0, scale: 0 },
			{ autoAlpha: 1, scale: 1, immediateRender: false, y: "-=20px" });
		tl.to(dobj, 0.5, { x: s.left, ease: Power2.easeIn }, 0.601);
		tl.to(dobj, 0.5, { y: s.top, ease: Power2.easeOut }, 0.601);
		tl.to(dobj, 0.1, { autoAlpha: 0 });
		tl.add(tweenContentAsNumber(obj, sign + "=" + delta));
		if (sign == "-")
			player.strength -= delta;
		else
			player.strength += delta;
		tl.add(biDirConstSet(player.lazyvars, "strength", player.strength));
		tl.add(biDirConstSet(this, "updateInfoTrigger", undefined));
		return tl;
	}

	protected updateDisplayInfo() {
		let tl = new TL();

		let newOrder = [0, 1, 2, 3];
		newOrder.sort((a, b) => this.players[b].strength - this.players[a].strength);
		if (this.oldOrder.every((v, i) => v == newOrder[i])) {

			tl.add(tweenContentAsNumber($info.alivecount, this.aliveCount), 0);
			tl.add(tweenContentAsNumber($info.turnid, this.turnID), 0);

			return tl;
		}

		((oldOrder: number[], newOrder: number[]) => {

			tl.add(tweenContentAsNumber($info.alivecount, this.aliveCount), 0);
			tl.add(tweenContentAsNumber($info.turnid, this.turnID), 0);

			// 改变左侧顺序
			let offsets: number[] = [];
			for (let rank = 0; rank < newOrder.length; rank++)
				tl.to($info.infobox["p" + newOrder[rank]].self, 0.3, {
					y: offsets[newOrder[rank]] = (rank - oldOrder.indexOf(newOrder[rank])) * this.infoHeight
				}, 0);

			tl.to({}, 0.001, {
				onComplete: () => {
					for (let i of newOrder) {
						let box = $info.infobox["p" + i].self;
						TweenMax.set(box, { y: 0 });
						$info.self.append(box);
					}
				},
				onReverseComplete: () => {
					for (let i of oldOrder) {
						let box = $info.infobox["p" + i].self;
						//TweenMax.set(box, { y: offsets[i] });
						$info.self.append(box);
					}
				}
			});
		})(this.oldOrder, newOrder);

		this.oldOrder = newOrder;
		return tl;
	}

	protected playerDie(player: Player, reason: string) {
		player.dead = true;
		this.aliveCount--;
		pull(player.fieldCoord.on(this.cellPlayer).val, player);
		let tl = new TL();
		this.engine.playSound(tl, sounds.sndExplode, 0);
		tl.to(player.position, 0.5, { z: 3 }, "-=0.5");
		tl.to(player.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
		tl.to(player.material, 0.25, { opacity: 0.5 }, "-=0.25");
		tl.add(this.engine.shutterAndDropScreenShot(player.playerID,
			this.infoOffsets[this.oldOrder.indexOf(player.playerID)], reasonStr[reason]));
		tl.to(player.material, 0.25, { opacity: 0 });
		tl.add(biDirConstSet(player, "visible", false));
		return tl;
	}

	protected propHide(prop: FieldObject) {
		let obj = prop.fieldCoord.on(this.cellProp);
		if (obj.val) {
			let tl = new TL();
			tl.to(prop.position, 0.5, { z: 3 }, "-=0.5");
			tl.to(prop.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
			tl.to(prop.material, 0.5, { opacity: 0 }, "-=0.25");
			tl.add(biDirConstSet(obj.val, "visible", false));
			obj.val = undefined;
			obj.on(this.cellStatus).val = CellStatus.empty;
			if (prop instanceof SmallFruit)
				this.freeFruit = prop as SmallFruit;
			return tl;
		}
	}

	protected playerTaunt(player: Player, taunt: string) {
		let tl = new TL();
		const bobj = $tauntBubbles[player.playerID];
		this.engine.playSound(tl, sounds.sndExclamation, 0);
		tl.add(biDirConstSet(bobj.find(".content")[0], "textContent", taunt));
		tl.call(() =>
			TweenMax.set(bobj, this.engine.projectTo2D(this.wrapXY(player.lazyvars.fieldCoord, { z: 1 }) as any))
		);
		tl.fromTo(bobj, 0.2, { autoAlpha: 0, scale: 0 },
			{ autoAlpha: 1, scale: 1, immediateRender: false, ease: Back.easeOut });
		tl.to(bobj, 0.1, { autoAlpha: 0 }, 1);
		return tl;
	}

	protected showResults(scores: IPlayerToAny<number>) {
		let tl = new TL();
		let $container = $ui.dResult.find(".infobox-container");

		this.engine.playSound(tl, sounds.sndEnd, 0);
		tl.add(biDirConstSet(this.engine, "cinematic", true));
		tl.call(() => {
			$container.find(".infobox").remove();
			let $newBoxes = $info.self.children(".infobox").clone();
			for (let id in scores)
				$newBoxes.filter(`.p${id}`).find('.final-score').text(scores[id] + "分");
			$container.append($newBoxes);
		});
		tl.set($ui.dResult, { display: "block", immediateRender: false });
		tl.to($ui.dResult, 0.5, { autoAlpha: 1 });
		tl.fromTo($container, 0.5, { scale: 0 }, { scale: 1, ease: Back.easeOut.config(0.5) }, "-=0.25");
		return tl;
	}

	protected powerUpLeftModification(player: Player, delta: number) {
		let tl = new TL();
		if (player.powerUpLeft == 0 && delta > 0) {
			tl.set($info.infobox["p" + player.playerID].self, { className: "+=powerup", immediateRender: false });
		} else if (player.powerUpLeft + delta == 0) {
			tl.set($info.infobox["p" + player.playerID].self, { className: "-=powerup", immediateRender: false });
		}
		tl.add(tweenContentAsNumber($info.infobox["p" + player.playerID].remaining, delta > 0 ? `+=${delta}` : `-=${-delta}`), 0);
		player.powerUpLeft += delta;
		tl.add(biDirConstSet(player.lazyvars, "powerUpLeft", player.powerUpLeft));
		tl.add(biDirConstSet(this, "updateInfoTrigger", undefined));
		return tl;
	}

	private get updateInfoTrigger() { return; }
	private set updateInfoTrigger(v) { this.engine.updateActiveObjInfo(); return; }

	protected playerMove(player: Player, dir: Direction) {
		if (this.testMove(player.playerID, dir)) {
			let slot = player.fieldCoord.on(this.cellPlayer).val;
			pull(slot, player);
			let src = this.wrapXY(player.fieldCoord),
				target = this.wrapXY(player.fieldCoord.move(dir));
			slot.push(player);

			let tl = new TL();
			tl.add(rotateNearest(player.rotation, dir), 0);
			tl.to(player.scale, 0.1, { x: 1.1, y: 1.1, z: 0.5, ease: Power2.easeOut }, 0);
			tl.to(player.scale, 0.1, { x: 1, y: 1, z: 1, ease: Power2.easeIn }, 0.1);
			tl.fromTo(player.position, 0.2, { z: 0 }, { z: 2, ease: Power2.easeOut, yoyo: true, repeat: 1, immediateRender: false }, 0.1);

			if (player.fieldCoord.round()) {
				this.engine.playSound(tl, sounds.sndWarp, 0.2);
				player.fieldCoord.moveOpposite(dir);
				const s = this.wrapXY(player.fieldCoord),
					e = this.wrapXY(player.fieldCoord.move(dir));
				tl.to(player.position, 0.2, mid(src, target), 0.1);
				tl.to(player.material, 0.1, { opacity: 0, yoyo: true, repeat: 1 }, 0.2);
				e["immediateRender"] = false;
				tl.fromTo(player.position, 0.2, mid(s, e), e, 0.3);
			} else
				tl.to(player.position, 0.4, target, 0.1);
			tl.add(biDirConstSet(player.lazyvars.fieldCoord, "r", player.fieldCoord.r));
			tl.add(biDirConstSet(player.lazyvars.fieldCoord, "c", player.fieldCoord.c));

			return tl;
		}
	}

	/**
	 * 从玩家出发，判断向 dir 行进是否成功
	 * @param playerid 玩家序号
	 * @param dir 方向
	 */
	public testMove(playerid: number, dir: Direction): boolean {
		if (dir == Direction.stay)
			return true;
		let startCell = this.players[playerid].fieldCoord;
		if (dir == Direction.up)
			return !startCell.on(this.horizontalWalls).val;
		else if (dir == Direction.down)
			return !this.horizontalWalls[startCell.r + 1][startCell.c];
		else if (dir == Direction.left)
			return !startCell.on(this.verticalWalls).val;
		else
			return !this.verticalWalls[startCell.r][startCell.c + 1];
	}

	public focusOn(camera: THREE.Camera, v: Vector2D<any>, slowMo: boolean = false) {
		let tl = new TL();
		tl.add(biDirConstSet(this.engine, "cinematic", true));
		tl.to(camera.position, 1, this.wrapXY(v, { z: 2, ease: Power4.easeOut, yoyo: true, repeat: 1 }));
		tl.to(camera.rotation, 1, { x: 0, y: 0, z: 0, ease: Power4.easeOut, yoyo: true, repeat: 1 }, 0);
		tl.add(biDirConstSet(this.engine, "cinematic", false));
		return tl;
	}

	protected generateFruitsFromGenerator(generator: FruitGenerator): TL {
		let tl = new TL(), j = 0;
		for (let i = 0; i < 8; i++) {
			let target = generator.fieldCoord.copyMove(i).on(this.cellProp);
			if (target.valid && !target.val) {
				let fruit = this.newSmallFruit;
				target.val = fruit;
				fruit.fieldCoord = target.copy<FieldObject>();
				target.on(this.cellStatus).val = CellStatus.smallFruit;
				tl.add(biDirConstSet(fruit, "visible", true), j * 0.1);
				tl.set(fruit.material, { opacity: 1, immediateRender: false }, j * 0.1);
				tl.fromTo(fruit.position, 0.5, this.wrapXY(generator.fieldCoord), this.wrapXY(target, { immediateRender: false }), j * 0.1);

				// 这里使用 0.01 是为了防止 THREE.js 报矩阵不满秩的 Warning
				tl.fromTo(fruit.scale, 0.5, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, immediateRender: false }, j * 0.1);
				tl.fromTo(fruit.position, 0.5, { z: 0 }, { z: 3, ease: Power2.easeOut, immediateRender: false }, j * 0.1);
				tl.to(fruit.position, 0.5, { z: 0, ease: Bounce.easeOut }, j++ * 0.1 + 0.5);
			}
		}
		return tl;
	}

	public get floorTexture(): THREE.Texture {
		let tmpCanvas = document.createElement("canvas");
		tmpCanvas.height = 8;
		tmpCanvas.width = 8;
		let context = tmpCanvas.getContext("2d");
		context.fillStyle = "#A8DBA8";
		context.fillRect(0, 0, 8, 8);
		context.fillStyle = "#79BD9A";
		context.fillRect(1, 1, 6, 6);
		let texture = new THREE.CanvasTexture(tmpCanvas, THREE.UVMapping, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
		texture.repeat.set(this.width, this.height);
		return texture;
	}

	public createFloor(wallThickness: number) {
		const gridSize = 1;
		const geometry = new THREE.Geometry();
		const totalHeight = gridSize * this.height,
			totalWidth = gridSize * this.width;
		const noTextureUV = [zeroVector2, zeroVector2, zeroVector2];

		geometry.vertices.push(
			new THREE.Vector3(totalWidth / -2, totalHeight / -2, -wallThickness),
			new THREE.Vector3(totalWidth / 2, totalHeight / -2, -wallThickness),
			new THREE.Vector3(totalWidth / -2, totalHeight / 2, -wallThickness),
			new THREE.Vector3(totalWidth / 2, totalHeight / 2, -wallThickness),
			new THREE.Vector3(totalWidth / -2, totalHeight / -2, 0),
			new THREE.Vector3(totalWidth / 2, totalHeight / -2, 0),
			new THREE.Vector3(totalWidth / -2, totalHeight / 2, 0),
			new THREE.Vector3(totalWidth / 2, totalHeight / 2, 0)
		);
		geometry.faces.push(
			...Face4(4, 5, 7, 6),
			...Face4(2, 3, 1, 0),
			...Face4(0, 1, 5, 4),
			...Face4(4, 6, 2, 0),
			...Face4(1, 3, 7, 5),
			...Face4(2, 6, 7, 3)
		);
		// 为底面添加材质映射
		let uvArray = geometry.faceVertexUvs[0] = new Array(geometry.faces.length);
		uvArray[0] = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)];
		uvArray[1] = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)];
		for (let i = 2; i < uvArray.length; i++)
			uvArray[i] = noTextureUV;

		geometry.computeFaceNormals();
		return new THREE.BufferGeometry().fromGeometry(geometry);
	}

	public createGeometry(wallThickness: number, wallHeight: number) {
		let i, j;
		const gridSize = 1;
		const geometry = new THREE.Geometry();
		const totalHeight = gridSize * this.height + wallThickness,
			totalWidth = gridSize * this.width + wallThickness;

		const addWall = (lastR: number, lastC: number, length: number, isHorizontal: boolean) => {
			let begin = geometry.vertices.length,
				l: number, r: number, t: number, b: number,
				_l: number, _r: number, _t: number, _b: number;
			if (isHorizontal) {
				l = lastC - length;
				_l = (l - this.width / 2) * gridSize + wallThickness / 2;
				if (l || lastR == 0 || lastR == this.height)
					_l -= wallThickness;

				r = lastC;
				_r = (r - this.width / 2) * gridSize - wallThickness / 2;
				if (r - this.width || lastR == 0 || lastR == this.height)
					_r += wallThickness;

				_t = (this.height / 2 - lastR) * gridSize + wallThickness / 2;
				_b = (this.height / 2 - lastR) * gridSize - wallThickness / 2;
			} else {
				_l = (lastC - this.width / 2) * gridSize - wallThickness / 2;
				_r = (lastC - this.width / 2) * gridSize + wallThickness / 2;

				t = lastR - length;
				_t = (this.height / 2 - t) * gridSize - wallThickness / 2;
				if (t || lastC == 0 || lastC == this.width)
					_t += wallThickness;

				b = lastR;
				_b = (this.height / 2 - b) * gridSize + wallThickness / 2;
				if (b - this.height || lastC == 0 || lastC == this.width)
					_b -= wallThickness;
			}

			geometry.vertices.push(
				new THREE.Vector3(_l, _t, 0),
				new THREE.Vector3(_r, _t, 0),
				new THREE.Vector3(_l, _b, 0),
				new THREE.Vector3(_r, _b, 0),
				new THREE.Vector3(_l, _t, wallHeight),
				new THREE.Vector3(_r, _t, wallHeight),
				new THREE.Vector3(_l, _b, wallHeight),
				new THREE.Vector3(_r, _b, wallHeight)
			);

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

		}

		let lastLen = 0;
		for (i = 0; i < this.height + 1; i++) {
			for (j = 0; j < this.width; j++) {
				if (this.horizontalWalls[i][j]) {
					lastLen++;
				} else if (lastLen != 0) {
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
				} else if (lastLen != 0) {
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
	}
}

//#endregion

let $ui = {
	sLoading: <JQuery>null,
	sIntro: <JQuery>null,
	sGameScene: <JQuery>null,
	mainCanvas: <JQuery>null,
	lblFloatingInfo: <JQuery>null,
	panSettings: <JQuery>null,
	lblFPS: <JQuery>null,
	prgbarLoading: <JQuery>null,
	dInfoboxContainer: <JQuery>null,
	dResult: <JQuery>null,
	panControl: <JQuery>null,
	txtTaunt: <JQuery>null,
	chkAntiAliasing: <JQuery>null,
	radHighGraphicsLevel: <JQuery>null,
	radLowGraphicsLevel: <JQuery>null,
	chkIntro: <JQuery>null,
	chkOrthographic: <JQuery>null,
	chkSound: <JQuery>null
}, $info = {
	self: <JQuery>null,
	turnid: <JQuery>null,
	alivecount: <JQuery>null,
	infobox: <{
		[name: string]: {
			strength: JQuery;
			powerupamount: JQuery;
			remaining: JQuery;
			self: JQuery;
		}
	}>{
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
}, sounds = {
	sndBGM1: <HTMLAudioElement>null,
	sndBGM2: <HTMLAudioElement>null,
	sndEnd: <HTMLAudioElement>null,
	sndEnhance: <HTMLAudioElement>null,
	sndExclamation: <HTMLAudioElement>null,
	sndExplode: <HTMLAudioElement>null,
	sndLosePower: <HTMLAudioElement>null,
	sndPick: <HTMLAudioElement>null,
	sndGenerate: <HTMLAudioElement>null,
	sndWarp: <HTMLAudioElement>null
};
let $strengthDeltas: JQuery[] = [];
let $tauntBubbles: JQuery[] = [];
let $outerProgressbar: JQuery;

//#region 引擎
class Engine {
	public gameField: GameField;
	public fullTL = new TL({ smoothChildTiming: true });

	// 选项
	private enableAA: boolean;
	private detailLevel: number;
	private enableSound: boolean;
	private useOrthographic: boolean;

	// 状态
	private _cinematic = false;
	public initialized = false;

	// 参数
	private wallThickness = 0.25;
	private dispWidth: number;
	private dispHeight: number;
	private fieldMaxWidth: number;
	private fieldMaxHeight: number;

	// THREE.js 基础
	private scene: PScene;
	private renderer: THREE.WebGLRenderer;
	private camera: THREE.Camera;

	// THREE.js 场景物件
	private lights = {
		sky: <THREE.Light>null,
		point: <THREE.Light>null,
		top: <THREE.Light>null,
		right: <THREE.Light>null,
		left: <THREE.Light>null,
		bottom: <THREE.Light>null
	};
	private field: THREE.Mesh;
	private wall: THREE.Mesh;
	private raycaster = new THREE.Raycaster();
	private edgeshelper: THREE.EdgesHelper;
	private orthoEdgeHighlight: THREE.EdgesHelper;

	// 界面用（鼠标选择）
	private mouseCoord = new THREE.Vector2();
	private mouseDown = false;
	private mouseDownFirst = false;
	private _hoveredObj: FieldObject;
	private _selectedObj: FieldObject;
	private _selectedTween: TweenMax[];

	constructor(finishCallback: () => void) {
		//return;
		let initdata: IInitdata;

		// 切勿用Promise……Promise的then的调用不是和resolve同步的……
		let retrieveExistingLogs = (next: (logs: IDisplayLog[]) => void) => {
			if (infoProvider.isLive()) {
				infoProvider.setReadHistoryCallback(displays => {
					if (displays && displays.length > 0) {
						initdata = displays[0];
						next(displays.slice(1));
					}
				});
				infoProvider.setNewLogCallback(display => (initdata = display, next([])));
			} else {
				let list = infoProvider.getLogList();
				initdata = (list[0] as JudgeResultLog).output.display;
				let logs: IDisplayLog[] = [];
				for (let i = 2; i < list.length; i += 2)
					if (list[i] && list[i]["output"] && list[i]["output"]["display"])
						logs.push(list[i]["output"]["display"]);
				next(logs);
			}
			infoProvider.notifyInitComplete();
		};

		let initAndParseLogs = (logs: IDisplayLog[]) => {
			let names: string[];
			try {
				names = infoProvider.getPlayerNames().map(o => o.name) || [];
			} catch (ex) {
				names = [];
			}

			this.gameField = new GameField(this, initdata, names);

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

			for (let name in this.lights)
				this.scene.add(this.lights[name]);

			this.field = new THREE.Mesh(
				this.gameField.createFloor(this.wallThickness),
				new THREE.MeshLambertMaterial({ color: 0xFFFFFF, map: this.gameField.floorTexture })
			);
			this.wall = new THREE.Mesh(
				this.gameField.createGeometry(this.wallThickness, 1),
				new THREE.MeshLambertMaterial({ color: 0xCFF09E })
			);
			this.edgeshelper = new THREE.EdgesHelper(this.wall, 0x79BD9A);
			this.orthoEdgeHighlight = new THREE.EdgesHelper(this.wall, 0x333333);
			this.scene.add(this.edgeshelper);
			this.scene.add(this.wall);
			this.scene.add(this.field);

			this.gameField.initializeProps(this.scene);

			// 让 Three.JS 使用 Greensocks 的渲染循环
			TweenMax.ticker.addEventListener('tick', this.renderTick.bind(this));

			$ui.mainCanvas
				.mousemove(event => {
					this.mouseCoord.x = (event.clientX / this.dispWidth) * 2 - 1;
					this.mouseCoord.y = -(event.clientY / this.dispHeight) * 2 + 1;
				})
				.mousedown(() => (this.mouseDown = true, this.mouseDownFirst = true))
				.mouseup(() => this.mouseDown = false)
				.on('wheel', event => {
					if (!this.orthographic) {
						TweenMax.to(this.camera.position, 0.1, { z: "+=" + (event.originalEvent['deltaY'] / 100) });
					}
				});

			let keyCode2dir = {
				32: Direction.stay,
				37: Direction.left,
				38: Direction.up,
				39: Direction.right,
				40: Direction.down
			};

			$(window)
				.resize(this.resetRenderer.bind(this))
				.keydown(event => {
					switch (event.keyCode) {
						case 13: /* Enter */
							this.fullTL.paused(!this.fullTL.paused());
							return;
						case 189: /* - */
							this.fullTL.timeScale(this.fullTL.timeScale() * 0.5);
							return;
						case 187: /* = */
							this.fullTL.timeScale(this.fullTL.timeScale() * 2);
							return;
						case 82: /* r */
							this.fullTL.reversed(!this.fullTL.reversed());
							return;
					}

					let dir = keyCode2dir[event.keyCode];
					if (dir !== undefined)
						this.submitDirection(dir);
				})
				.on('beforeunload', e => {
					if (settings.musicProgress.id == 0)
						settings.musicProgress.time = sounds.sndBGM1.currentTime;
					else
						settings.musicProgress.time = sounds.sndBGM2.currentTime;
					saveSettings();
				});

			sounds.sndBGM1.onended = e => {
				settings.musicProgress.id = 1;
				sounds.sndBGM2.play();
			};
			sounds.sndBGM1.volume = 0.5;
			sounds.sndBGM2.onended = e => {
				settings.musicProgress.id = 0;
				sounds.sndBGM1.play();
			};
			sounds.sndBGM2.volume = 0.5;

			this.useOrthographic = settings.orthographic;
			this.antialiasing = settings.antialiasing;
			this.graphicsLevel = settings.graphicsLevel;
			this.sound = settings.sound;

			let parseLog = (display: IDisplayLog) => {
				if (this.myTurn) {
					this.fullTL.timeScale(1);
					this.myTurn = false;
					TweenMax.to($ui.txtTaunt, 0.3, { autoAlpha: 0 });
					TweenMax.staggerTo($ui.panControl.find(".control"), 0.3, { scale: 0, rotation: 0, autoAlpha: 0 }, 0.1);
				}
				this.fullTL.add(this.gameField.applyChange(display));
			};

			logs.forEach(parseLog);

			infoProvider.setNewLogCallback(parseLog);
			infoProvider.setNewRequestCallback(log => {
				// 接受用户输入
				this.fullTL.timeScale(Math.max((this.fullTL.duration() - this.fullTL.time()) * 2 / 3, 1));
				TweenMax.fromTo($ui.txtTaunt, 0.3, { autoAlpha: 0 }, { autoAlpha: 1 });
				TweenMax.staggerFromTo($ui.panControl.find(".control"), 0.3, { scale: 0, rotation: 0, autoAlpha: 0 },
					{ cycle: { rotation: [0, 45, 135, 225, 315] }, scale: 1, autoAlpha: 1 }, 0.1);
				this.selectedObj = this.gameField.players[infoProvider.getPlayerID()];
				this.myTurn = true;
				$ui.lblFloatingInfo.addClass("current-player");
			});

			this.initialized = true;
			finishCallback();
		};

		retrieveExistingLogs(initAndParseLogs);
	}

	private myTurn = false;
	public submitDirection(dir: Direction) {
		if (this.myTurn && this.gameField.testMove(infoProvider.getPlayerID(), dir)) {
			this.fullTL.timeScale(1);
			this.myTurn = false;
			$ui.lblFloatingInfo.removeClass("current-player");
			let move: IRequest = { action: dir, tauntText: $ui.txtTaunt.val() };
			$ui.txtTaunt.val("");
			TweenMax.to($ui.txtTaunt, 0.3, { autoAlpha: 0 });
			TweenMax.staggerTo($ui.panControl.find(".control"), 0.3, { scale: 0, rotation: 0, autoAlpha: 0 }, 0.1);
			infoProvider.notifyPlayerMove(move);
			this.selectedObj = null;
		}
	}

	public renderTick() {
		if (!this.cinematic && this.graphicsLevel > 0) {

			if (this.orthographic) {
				let tiltx = this.mouseCoord.x * Math.PI / 8;
				let tilty = this.mouseCoord.y * Math.PI / 8;

				// 鼠标控制视角
				this.camera.rotation.set(-tilty, tiltx, 0);
			} else {
				let tiltx = this.mouseCoord.x * Math.PI / 2;
				let tilty = this.mouseCoord.y * Math.PI / 2;

				// 鼠标控制视角
				this.camera.position.x = Math.sin(tiltx) * this.fieldMaxWidth;
				this.camera.position.y = Math.sin(tilty) * this.fieldMaxHeight;
				this.camera.lookAt(zeroVector3);
			}

			// 查找鼠标指向的物件
			this.raycaster.setFromCamera(this.mouseCoord, this.camera);
			let intersects = this.raycaster.intersectObjects(this.scene.childrenExcludingHelpers);

			if (this.mouseDown) {
				if (this.mouseDownFirst)
					for (let intersect of intersects) {
						let obj = intersect.object;
						if (obj != this.field) {
							if (obj instanceof FieldObject) {
								if (obj == this.selectedObj)
									this.selectedObj = null;
								else
									this.selectedObj = obj as FieldObject;
							}
						} else if (this.selectedObj) {
							this.gameField.roundToCoordAndSet(intersect.point, this.selectedObj, 0.1);
						}
					}
				else if (this.selectedObj)
					for (let intersect of intersects)
						if (intersect.object == this.field) {
							this.gameField.roundToCoordAndSet(intersect.point, this.selectedObj, 0.1);
							break;
						}
			} else {
				if (intersects.length == 0)
					this.hoveredObj = null;
				else
					for (let intersect of intersects)
						if (intersect.object instanceof FieldObject) {
							this.hoveredObj = intersect.object as FieldObject;
							break;
						}
			}

			this.mouseDownFirst = false;
		}

		let activeObj = this.selectedObj || this.hoveredObj;
		if (activeObj) {
			let { x, y } = this.projectTo2D(activeObj.position);
			$ui.lblFloatingInfo.css("transform", `translate(${
				x
				}px,${
				y
				}px)`);
		}

		if (!this.myTurn)
			$outerProgressbar.css("width", (100 * this.fullTL.progress()) + '%');

		this.renderer.render(this.scene, this.camera);
	}

	public resetRenderer() {
		if (this.renderer) {
			let $newCanvas = $ui.mainCanvas.clone(true);
			$ui.mainCanvas.replaceWith($newCanvas);
			$ui.mainCanvas = $newCanvas;
		}
		this.dispWidth = $ui.sGameScene.width();
		this.dispHeight = $ui.sGameScene.height();

		let canvas = $ui.mainCanvas.prop({
			height: this.dispHeight,
			width: this.dispWidth
		})[0] as HTMLCanvasElement;

		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.antialiasing });
		this.renderer.setSize(this.dispWidth, this.dispHeight);
		this.renderer.setClearColor(0xe8f4d6, 1);

		if (this.orthographic) {
			let ratio = this.dispWidth / this.dispHeight,
				h = (this.gameField.height + 1) / 2,
				w = h * ratio;
			this.camera = new THREE.OrthographicCamera(-w, w, h, -h, -30, 30);
		} else {
			this.camera = new THREE.PerspectiveCamera(50, this.dispWidth / this.dispHeight);
			this.camera.position.set(0, 0, 12);
			this.camera.lookAt(this.scene.position);
		}
	}

	public shutterAndDropScreenShot(toID: number, boxOffset: JQueryCoordinates, comment: string) {
		let tl = new TL();
		let letterboxes = $ui.sGameScene.find(".letterbox");
		let infobox = $info.infobox["p" + toID].self;
		let screenShot = infobox.find(".screen-shot");
		let img = screenShot.find("img");
		tl.to(letterboxes, 0.3, { scaleY: 6, ease: Power2.easeIn, yoyo: true, repeat: 1 });
		tl.add(biDirConstSet(img[0], "src", () => this.screenShot));
		tl.to(screenShot, 0.5, { autoAlpha: 1 });
		tl.staggerFrom(screenShot.find(".death-reason").text(comment).shatter().find("figure"),
			0.3, { autoAlpha: 0, scale: 2, ease: Back.easeOut.config(3) }, 0.05);

		let { left, top } = boxOffset;
		left += infobox.width();
		top += infobox.height() / 2;
		let imgOrigHeight = screenShot.height();
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
		tl.to(infobox, 0.075, { scale: 0.9 }, "-=0.225");
		tl.to(infobox, 0.075, { scale: 1 }, "-=0.15");
		return tl;
	}

	public projectTo2D({ x, y, z }: { x: number, y: number, z: number }) {
		let coord = new THREE.Vector3(x, y, z);
		coord.project(this.camera);
		return {
			x: Math.round((1 + coord.x) * this.dispWidth / 2),
			y: Math.round((1 - coord.y) * this.dispHeight / 2)
		};
	}

	public playSound(tl: TL, audio: HTMLAudioElement, at: string | number) {
		tl.call(() => this.sound && (audio.currentTime = 0, audio.play()), null, null, at);
	}

	public updateActiveObjInfo() {
		let activeObj = this.selectedObj || this.hoveredObj;
		if (activeObj instanceof SmallFruit)
			$ui.lblFloatingInfo.show().html(`
<header>豆子</header>
永久增加<span>1</span>力量
`
			);
		else if (activeObj instanceof LargeFruit)
			$ui.lblFloatingInfo.show().html(`
<header>大豆子</header>
食用后<span>${this.gameField.LARGE_FRUIT_DURATION}</span>回合中，力量增加<span>${this.gameField.LARGE_FRUIT_ENHANCEMENT}</span>
`
			);
		else if (activeObj instanceof Player) {
			let p = activeObj as Player;
			$ui.lblFloatingInfo.show().html(`
<header>玩家${p.playerID}</header>
<label>“${neutralize(p.playerName)}”</label>
力量<span>${p.lazyvars.strength}</span>，增益剩余回合<span>${p.lazyvars.powerUpLeft}</span>
`
			);
		} else if (activeObj instanceof FruitGenerator)
			$ui.lblFloatingInfo.show().html(`
<header>豆子产生器</header>
每隔<span>${this.gameField.GENERATOR_INTERVAL}</span>回合向周围产生豆子
`
			);
		else
			$ui.lblFloatingInfo.hide().text("...");
	}

	public get hoveredObj() {
		return this._hoveredObj;
	}
	public set hoveredObj(to: FieldObject) {
		if (to == this._hoveredObj)
			return;
		if (this._hoveredObj && this._hoveredObj != this._selectedObj) {
			removeGlow(this._hoveredObj);
			this._hoveredObj = null;
		}
		if (this._selectedObj != to)
			(this._hoveredObj = to) && addGlow(to, new THREE.Color("cyan"));
		this.updateActiveObjInfo();
	}

	public get screenShot() {
		// 由于不想修改 preserveDrawingBuffer（双缓冲开关）来牺牲性能，这里多渲染一次，仅仅是为了拿到图片
		this.renderer.render(this.scene, this.camera);
		return ($ui.mainCanvas[0] as HTMLCanvasElement).toDataURL();
	}

	public get selectedObj() {
		return this._selectedObj;
	}
	public set selectedObj(to: FieldObject) {
		if (to == this._selectedObj)
			return;
		if (this._selectedObj) {
			for (let t of this._selectedTween)
				t.kill();
			if (!to) {
				this._hoveredObj = this._selectedObj;
				changeGlow(this._hoveredObj, new THREE.Color("cyan"));
				this._selectedObj = null;
				return;
			} else
				removeGlow(this._selectedObj);
		}

		this._selectedObj = to;
		if (this._hoveredObj == to)
			changeGlow(to, new THREE.Color("red"));
		else
			to && addGlow(to);

		if (to instanceof FruitGenerator) {
			let generator = to as FruitGenerator;
		}
		this._selectedTween = [
			TweenMax.fromTo(to.position, 0.5, { z: 0.5 },
				{ z: 0, yoyo: true, repeat: -1, ease: Power2.easeOut }),
			TweenMax.fromTo(to.scale, 0.5, { x: 1, y: 1, z: 1 },
				{ x: 1.1, y: 1.1, z: 0.5, yoyo: true, repeat: -1, ease: Power2.easeOut })
		];
		this.updateActiveObjInfo();
	}

	public get antialiasing() {
		return this.enableAA;
	}
	public set antialiasing(to: boolean) {
		if (this.enableAA !== to) {
			this.enableAA = to;
			this.resetRenderer();
			if (this.initialized) {
				settings.antialiasing = to;
				saveSettings();
			}
		}
	}

	public get graphicsLevel() {
		return this.detailLevel;
	}
	public set graphicsLevel(to: number) {
		if (this.detailLevel !== to) {
			if (to > 0) {
				if (this.orthographic)
					this.scene.remove(this.orthoEdgeHighlight);
				this.scene.add(this.edgeshelper);
				$ui.sGameScene.removeClass("low-detail");
				TweenMax.ticker.fps(60);
			} else {
				this.scene.remove(this.edgeshelper);
				if (this.orthographic)
					this.scene.add(this.orthoEdgeHighlight);
				$ui.sGameScene.addClass("low-detail");
				TweenMax.ticker.fps(30);
				this.camera.position.set(0, 0, 12);
				this.camera.lookAt(zeroVector3);
			}
			this.detailLevel = to;
			if (this.initialized) {
				settings.graphicsLevel = to;
				saveSettings();
			}
		}
	}

	public set intro(to: boolean) {
		if (this.initialized) {
			settings.intro = to;
			saveSettings();
		}
	}

	public get sound() {
		return this.enableSound;
	}
	public set sound(to: boolean) {
		if (this.enableSound !== to) {
			this.enableSound = to;

			if (to) {
				if (settings.musicProgress.id == 0) {
					sounds.sndBGM1.currentTime = settings.musicProgress.time;
					sounds.sndBGM1.play();
				} else {
					sounds.sndBGM2.currentTime = settings.musicProgress.time;
					sounds.sndBGM2.play();
				}
			} else {
				if (settings.musicProgress.id == 0)
					settings.musicProgress.time = sounds.sndBGM1.currentTime;
				else
					settings.musicProgress.time = sounds.sndBGM2.currentTime;

				for (let id in sounds)
					sounds[id].pause();
			}

			if (this.initialized) {
				settings.sound = to;
				saveSettings();
			}
		}
	}

	public get orthographic() {
		return this.useOrthographic;
	}
	public set orthographic(to: boolean) {
		if (this.useOrthographic !== to) {
			this.useOrthographic = to;
			if (this.graphicsLevel == 0)
				if (to)
					this.scene.add(this.orthoEdgeHighlight);
				else
					this.scene.remove(this.orthoEdgeHighlight);
			this.resetRenderer();
			if (this.initialized) {
				settings.orthographic = to;
				saveSettings();
			}
		}
	}

	public get cinematic() {
		return this._cinematic;
	}
	public set cinematic(to: boolean) {
		if (this._cinematic !== to) {
			$ui.sGameScene.find(".canvas-container").toggleClass("cinematic");
			if (to)
				TweenMax.to($ui.sGameScene.find(".letterbox"), 0.3, { scaleY: 2 });
			else
				TweenMax.to($ui.sGameScene.find(".letterbox"), 0.3, { scaleY: 1 });
			this._cinematic = to;
		}
	}
}
//#endregion

let engine: Engine;

$(window).load(() => {
	for (let id in $ui)
		$ui[id] = $("#" + id);
	for (let id in sounds)
		sounds[id] = document.getElementById(id);

	// 处理 data-child-centered 元素的居中样式
	$("[data-child-centered]").each(function () {
		$(this).children().wrapAll('<div class="centered"></div>');
	});

	// 处理 data-text-shattered 元素文本，将其用 span 拆分开
	$("[data-text-shattered]").shatter();

	let pushables = $(".push-left");

	$("a.show").click(() => {
		if (pushables.hasClass("active"))
			pushables.css("transform", `translateX(0)`);
		else
			pushables.css("transform", `translateX(-${$ui.panSettings.width()}px)`);
		pushables.toggleClass("active");
	});

	let templateContainer = $ui.dInfoboxContainer;
	for (let i = 0; i < 4; i++)
		((i) => {
			let nodes = insertTemplate('tmpInfobox').childNodes, node: Node;
			for (let i = 0; i < nodes.length; i++)
				if (nodes[i].nodeType == Node.ELEMENT_NODE) {
					node = nodes[i];
					break;
				}
			let infobox = $(node).addClass("p" + i).hover(
				e => {
					if (engine && engine.initialized)
						engine.hoveredObj = engine.gameField.players[i];
				},
				e => {
					if (engine && engine.initialized)
						engine.hoveredObj = null;
				}
			).click(e => {
				if (engine && engine.initialized)
					if (engine.selectedObj != engine.gameField.players[i])
						engine.selectedObj = engine.gameField.players[i];
					else
						engine.selectedObj = null;
			});
			templateContainer.append(infobox);
			TweenMax.set($strengthDeltas[i] = $(".strength-delta.p" + i), { autoAlpha: 0 });
			TweenMax.set($tauntBubbles[i] = $(".bubble.p" + i), { autoAlpha: 0 });
		})(i);

	// 填充信息组件
	function fillComponents(obj: Object, ancestor: JQuery) {
		for (let className in obj) {
			if (obj[className] === null) {
				if (className == "self")
					obj[className] = ancestor;
				else
					obj[className] = ancestor.find(`.${className} > .value`).addNumberHandle();
			} else {
				let scope = ancestor.find("." + className);
				if (scope.length == 0)
					scope = ancestor.filter("." + className)
				fillComponents(obj[className], scope);
			}
		}
	}
	fillComponents($info, templateContainer);

	let breakFourthWall = (duration: number = 2) => {
		let tl = new TL();
		try {
			let $parent = $(window.parent.document);
			let view = $parent.find('#dDanmakuOverlay'),
				viewOrigPos = view.offset(),
				viewOrigHeight = view.height(),
				viewOrigWidth = view.width(),
				navbarHeight = $parent.find('#dNavbar')[0].offsetHeight,
				screenRealHeight = window.parent.innerHeight,
				screenRealWidth = window.parent.innerWidth,
				bodyHeight = window.parent.document.body.offsetHeight,
				idealHeight = screenRealHeight - (bodyHeight - viewOrigHeight);
			let placeHolder = $("<div></div>").css({
				height: viewOrigHeight,
				width: viewOrigWidth
			});
			let iframe = $(window.frameElement);
			let fn = () => {
				$parent.find("#dPlayback a:eq(0), #dPlayback a:eq(2), #dDanmakuConsole").hide();
				$outerProgressbar = $parent.find('#prgbarStatus .progress-bar').css(
					"transition", "none"
				);
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
		} catch (ex) { } finally {
			breakFourthWall = () => undefined;
		}
	};

	const fLoadExternalModels = () => new Promise((cb: () => void) => {
		let manager = new THREE.LoadingManager();
		manager.onLoad = () => {
			extGeometries.apple.rotateX(Math.PI / 2).scale(0.5, 0.5, 0.5);
			extGeometries.tree.rotateX(Math.PI / 2);
			let treeM = extMaterials.tree as THREE.MeshPhongMaterial;
			treeM.shading = THREE.FlatShading;
			treeM.vertexColors = THREE.FaceColors;

			cb();
		};
		let loader = new THREE.JSONLoader(manager);
		for (let key in extGeometries)
			(key =>
				loader.load(`Pacman/models/${key}.json`, (geometry, materials) => {
					extGeometries[key] = geometry;
					if (materials.length == 1)
						extMaterials[key] = materials[0];
					else
						extMaterials[key] = new THREE.MultiMaterial(materials);
				})
			)(key);
		manager.onProgress = (item, loaded, total) => $ui.prgbarLoading.prop({ max: total, value: loaded });
	});

	// 开场
	const fOpening = () => {
		const tl = new TL();
		tl.call(() => infoProvider.notifyRequestPause());
		tl.to($ui.sLoading, 0.5, { scale: 2, opacity: 0 });
		tl.call(() => ($ui.sLoading.hide(), $ui.sIntro.show()));

		const outer = $ui.sIntro.find(".intro-circle.outer"),
			inner = $ui.sIntro.find(".intro-circle.inner"),
			bkgRect = $ui.sIntro.find(".intro-line"),
			title = $ui.sIntro.find(".intro-title"),
			specialThanks = $ui.sIntro.find(".special-thanks");

		// 内外圆形
		tl.staggerTo([outer[0], inner[0]], 2, { height: "12em", width: "12em", ease: Circ.easeInOut }, 0.5);
		tl.call(() => outer.hide());
		tl.to(inner, 1, { rotationX: "90deg", ease: Back.easeIn.config(2.5) }, "+=1");
		tl.call(() => {
			bkgRect.width(inner.find(".centered").width()).show();
			inner.hide();
		});

		// 鸣谢
		if (Math.random() < 0.3)
			tl.call(() => {
				let specialThanksChars = specialThanks.find("figure");
				let subTL = new TL();
				specialThanks.show();
				subTL.staggerFrom(specialThanksChars, 0.2, {
					cycle: {
						y: i => Math.cos(i * Math.PI / specialThanksChars.length) * 100 + "%"
					},
					x: "+=100%",
					ease: Back.easeOut,
					autoAlpha: 0
				}, 0.05);
				subTL.to(specialThanks, 0.2, { autoAlpha: 0 });
			}, null, null, "-=0.5");

		// 拉长矩形
		tl.fromTo(bkgRect, 0.5, { rotationX: "-90deg" }, { rotationX: "-88deg" });
		tl.to(bkgRect, 0.5, { scaleX: 3 }, "+=0.1");
		tl.to(bkgRect, 0.5, { rotationX: "0deg" }, "+=0.1");

		tl.call(() => title.show());

		// 文字导入
		let parts = title.find("figure");
		tl.from(parts[0], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn });
		tl.call(() =>
			TweenMax.to($(parts[0]).clone().prependTo(parts[0]), 0.2, { scale: 2, autoAlpha: 0 }));
		tl.add(shake(1));
		tl.from(parts[1], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
		tl.call(() =>
			TweenMax.to($(parts[1]).clone().prependTo(parts[1]), 0.2, { scale: 2, autoAlpha: 0 }));
		tl.add(shake(2, window.frameElement, 0.1));
		tl.from(parts[2], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
		tl.call(() =>
			TweenMax.to($(parts[2]).clone().prependTo(parts[2]), 0.2, { scale: 2, autoAlpha: 0 }));
		tl.to(window.parent.document.body, 0.2, { opacity: 0 });
		// 打破次元壁障
		let subtl = breakFourthWall();
		subtl.to(window.parent.document.body, 0.5, { opacity: 1 }, 0);
		subtl.add(shake(4, window.parent.document.body, 0.2), 0);
		subtl.call(() => bkgRect.width("25vw" /* x 3 = 75vw */), null, null, 0.2);
		subtl.paused(true);
		tl.to(subtl, subtl.duration(), { time: subtl.duration(), ease: SteppedEase.config(15) }, "-=0.2");

		// 边框特技
		let borders = bkgRect.find(".border"); // 上、右、下、左
		tl.from(borders[3], 1, { scale: 0, ease: Power2.easeIn }, "-=0.5");
		tl.from(borders[0], 1, { scale: 0, ease: Linear.easeNone });
		tl.from(borders[1], 1, { scale: 0, ease: Power2.easeOut });
		tl.to(bkgRect.find(".intro-line-fill"), 3, { scaleY: "0" }, "-=3");


		// 离场
		tl.call(() => ($ui.sGameScene.show(), bkgRect.css({ overflow: "hidden", borderColor: "white" })));
		tl.to(bkgRect, 1, { width: 0, ease: Power2.easeIn });
		tl.to(bkgRect, 1, { scaleY: 2, y: "-100%", ease: Power2.easeOut });
		tl.to(bkgRect, 1, { y: "100%" });
		let p = new Promise((resolve: () => void) => tl.call(resolve));
		tl.from($ui.sGameScene, 1, { y: "-100%", opacity: 0, ease: Bounce.easeOut }, "-=1");
		tl.call(() => ($ui.sIntro.hide(), infoProvider.notifyRequestResume()));
		return p;
	};

	// 如果之前跳过了开场……这里再调整一下场景大小
	const fBreakFourthWallAgain = () => new Promise((cb: () => void) => {
		breakFourthWall(0).call(cb);
	});

	// 创建游戏场景
	const fCreateScene = () => {
		$ui.sLoading.hide();
		$ui.sGameScene.show();

		let tickFrom = Date.now(), frameCount = 0;
		// FPS 计数
		TweenMax.ticker.addEventListener('tick', () => {
			let delta = Date.now() - tickFrom;
			if (++frameCount > 20 || delta > 1000) {
				$ui.lblFPS.text(Math.round(frameCount * 1000 / delta));
				frameCount = 0;
				tickFrom = Date.now();
			}
		});

		let settingHeight = $ui.panSettings.height(),
			settingWidth = $ui.panSettings.width(),
			settingContainer = $ui.panSettings.find(".container")[0];

		$ui.panSettings.mousemove(function (event) {
			let settingOffset = $ui.panSettings.offset();
			let dx = (Math.max(event.clientX - settingOffset.left, 0) / settingWidth) * 2 - 1;
			TweenMax.set(settingContainer, { rotationY: dx * 15, z: "-1em" });
		});

		return new Promise(r => engine = new Engine(r)); // 千万要在场景初始化好后再执行！
	};

	try {
		settings = JSON.parse(cookie);
	} catch (ex) {
		settings = <any> {};
	}

	let defaults = {
		antialiasing: false,
		graphicsLevel: 1,
		intro: true,
		orthographic: false,
		sound: true,
		musicProgress: {
			id: 0,
			time: 0
		}
	};

	for (let i in defaults)
		if (settings[i] === undefined)
			settings[i] = defaults[i];

	let isLive = infoProvider.isLive();

	if (!isLive && settings.intro)
		settings.intro = !confirm("是否要跳过开场动画？\n\n你可以在右上角的设置中随时更改。");
	saveSettings();

	(<any>$ui.chkAntiAliasing[0]).checked = settings.antialiasing;
	if (settings.graphicsLevel == 0)
		(<any>$ui.radLowGraphicsLevel[0]).checked = true;
	else
		(<any>$ui.radHighGraphicsLevel[0]).checked = true;
	(<any>$ui.chkIntro[0]).checked = settings.intro;
	(<any>$ui.chkOrthographic[0]).checked = settings.orthographic;
	(<any>$ui.chkSound[0]).checked = settings.sound;

	const fFinalInitializations = () => {

	};

	let p = new Promise(r => {
		infoProvider.notifyFinishedLoading();
		r();
	}).then(fLoadExternalModels);

	if (!isLive && settings.intro)
		p = p.then(fOpening);
	else
		p = p.then(fBreakFourthWallAgain);

	p
		.then(fCreateScene)
		.then(fFinalInitializations)
		.catch(err => console.error(err));
});
/**
 * Pacman 逻辑控制脚本
 * 原始语言：TypeScript
 * 使用的库：Greensocks、THREE.js
 * 已进行 Chrome 和 Firefox 的兼容性测试
 * 作者：zhouhy
 */

window['Promise'] = window['Promise'] || window['ES6Promise'];

//#region 工具

const zeroVector2 = new THREE.Vector2();
const zeroVector3 = new THREE.Vector3();
const dummy = {};

jQuery.fn.shatter = function (): JQuery {
	return this.each(function () {
		let text: string = this.textContent;
		let result = "";
		for (let x of text.trim())
			result += `<figure>${x}</figure>`;
		this.innerHTML = result;
	});
};

function shake(amplitudeBase: number) {
	let tl = new TimelineMax();
	let $body = $("body");
	for (let i = 0; i < 5; i++) {
		let amplitude = (11 - i * 2) * amplitudeBase;
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

function biDirConstSet(obj: Object, propName: string, to: any) {
	let initial: any;
	return TweenMax.to(dummy, 0.001, {
		onComplete: () => {
			initial = obj[propName];
			obj[propName] = to;
		},
		onReverseComplete: () =>
			obj[propName] = initial
	});
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
	public get valid(): boolean {
		return this.c >= 0 && this.arr && this.arr[this.r] && this.arr[this.r].length > this.c;
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

//#region 定义

enum GameStatus {
	intro, init, animating, paused, waiting, requesting
};

enum CellStatus {
	empty, smallFruit, largeFruit, generator
};

enum Direction {
	up, right, down, left, upperright, lowerright, lowerleft, upperleft
};

abstract class FieldObject extends THREE.Mesh {
	public fieldCoord: Vector2D<FieldObject>;
}

class SmallFruit extends FieldObject {
	public geometry: THREE.OctahedronGeometry;
	constructor() {
		let geometry = new THREE.OctahedronGeometry(0.25, 0);
		geometry.translate(0, 0, 0.25);
		super(
			geometry,
			new THREE.MeshPhongMaterial({ color: 0xFFFF00, shading: THREE.FlatShading, transparent: true })
		);
	}
}

class LargeFruit extends FieldObject {
	public geometry: THREE.SphereGeometry;
	constructor() {
		let geometry = new THREE.SphereGeometry(0.4);
		geometry.translate(0, 0, 0.4);
		super(
			geometry,
			new THREE.MeshPhongMaterial({ color: 0x0000FF, shading: THREE.FlatShading, transparent: true })
		);
	}
}

class FruitGenerator extends FieldObject {
	public geometry: THREE.CubeGeometry;
	constructor() {
		let geometry = new THREE.CubeGeometry(0.7, 0.7, 0.7);
		geometry.translate(0, 0, 0.35);
		super(
			geometry,
			new THREE.MeshPhongMaterial({ color: 0x0000FF, shading: THREE.FlatShading, transparent: true })
		);
	}
}

class Player extends FieldObject {
	public geometry: THREE.CylinderGeometry;
	constructor() {
		let geometry = new THREE.CylinderGeometry(0.5, 0.4, 0.6);
		geometry.rotateX(Math.PI / 2);
		geometry.translate(0, 0, 0.3);
		super(
			geometry,
			new THREE.MeshPhongMaterial({ color: 0x00FF00, shading: THREE.FlatShading })
		);
	}
}

class GameField {
	private cellStatus: CellStatus[][] = [];
	private cellProp: FieldObject[][] = [];
	private cellPlayer: Player[][][] = [];
	private id2Player: Player[] = [];
	private verticalWalls: boolean[][] = [];
	private horizontalWalls: boolean[][] = [];

	constructor(public width: number, public height: number) {
		let i, j;
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

	private smallFruits: SmallFruit[];
	private smallFruitsIndex = 0;
	public initializeProps(scene: PScene) {
		this.smallFruits = new Array(16)//this.height * this.width);
		for (let i = 0; i < this.smallFruits.length; i++) {
			let fruit = new SmallFruit();
			fruit.visible = false;
			scene.add(fruit);
			this.smallFruits[i] = fruit;
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
						break;
				}
				this.putAt(prop, i, j);
				this.cellProp[i][j] = prop;
			}
		for (let player of this.id2Player)
			scene.add(player);
	}

	public get newSmallFruit(): SmallFruit {
		let fruit = this.smallFruits[this.smallFruitsIndex];
		this.smallFruitsIndex = (this.smallFruitsIndex + 1) % 16//(this.height * this.width);
		return fruit;
	}

	public doAction(dir: Direction) {
		let player = this.id2Player[0];
		if (this.testMove(player.fieldCoord, dir)) {
			let slot = player.fieldCoord.on(this.cellPlayer).val;
			pull(slot, player);
			player.fieldCoord.move(dir);
			slot.push(player);

			let tl = new TimelineMax({ paused: true });
			tl.to(player.scale, 0.1, { x: 1.1, y: 1.1, z: 0.5, ease: Power2.easeOut });
			tl.fromTo(player.position, 0.2, { z: 0 }, { z: 2, ease: Power2.easeOut, yoyo: true, repeat: 1 });
			tl.add(this.put(player, 0.4), 0.1);
			tl.to(player.scale, 0.1, { x: 1, y: 1, z: 1, ease: Power2.easeIn });

			let obj = player.fieldCoord.on(this.cellProp);
			if (obj.val) {
				tl.to(obj.val.material, 0.5, { opacity: 0 }, "-=0.1");
				tl.to(obj.val.position, 0.5, { z: 3 }, "-=0.5");
				tl.to(obj.val.scale, 0.5, { x: 3, y: 3, z: 3 }, "-=0.5");
				tl.add(biDirConstSet(obj.val, "visible", false));
				obj.val = undefined;
			}
			return tl;
		}
	}

	/**
	 * 从 startCell 出发，判断向 dir 行进是否成功
	 * @param startCell 起始格子坐标
	 * @param dir 方向
	 */
	public testMove(startCell: Vector2D<any>, dir: Direction): boolean {
		if (dir == Direction.up)
			return !startCell.on(this.horizontalWalls).val;
		else if (dir == Direction.down)
			return !this.horizontalWalls[startCell.r + 1][startCell.c];
		else if (dir == Direction.left)
			return !startCell.on(this.verticalWalls).val;
		else
			return !this.verticalWalls[startCell.r][startCell.c + 1];
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
			y: this.Y(obj.fieldCoord.r)
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

	public focusOn(camera: THREE.Camera, v: Vector2D<any>, slowMo: boolean = false) {
		let tl = new TimelineMax();
		tl.add(biDirConstSet(engine, "cinematic", true));
		tl.to(camera.position, 1, this.wrapXY(v, { z: 2, ease: Power4.easeOut, yoyo: true, repeat: 1 }));
		tl.to(camera.rotation, 1, { x: 0, y: 0, z: 0, ease: Power4.easeOut, yoyo: true, repeat: 1 }, 0);
		tl.add(biDirConstSet(engine, "cinematic", false));
		return tl;
	}

	public generateFruitsFromGenerator(fromCell: Vector2D<any>): TimelineMax {
		let tl = new TimelineMax(), j = 0;
		for (let i = 0; i < 8; i++) {
			let target = fromCell.copyMove(i).on(this.cellProp);
			if (target.valid && !target.val) {
				let fruit = this.newSmallFruit;
				target.val = fruit;
				fruit.fieldCoord = target.copy<FieldObject>();
				tl.add(biDirConstSet(fruit, "visible", true), j * 0.1);
				tl.fromTo(fruit.position, 0.5, this.wrapXY(fromCell), this.wrapXY(target), j * 0.1);

				// 这里使用 0.01 是为了防止 THREE.js 报矩阵不满秩的 Warning
				tl.fromTo(fruit.scale, 0.5, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1 }, j * 0.1);
				tl.fromTo(fruit.position, 0.5, { z: 0 }, { z: 3, ease: Power2.easeOut }, j * 0.1);
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
		context.fillStyle = "#444";
		context.fillRect(0, 0, 8, 8);
		context.fillStyle = "#555";
		context.fillRect(1, 1, 6, 6);
		let texture = new THREE.CanvasTexture(tmpCanvas, THREE.UVMapping, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestFilter);
		texture.repeat.set(this.width, this.height);
		return texture;
	}

	public createFloor(wallThickness: number) {
		const gridSize = 1;
		const geometry = new THREE.Geometry();
		const totalHeight = gridSize * this.height + wallThickness,
			totalWidth = gridSize * this.width + wallThickness;
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
			if (l !== 0)
				cat(geometry.faces, Face4(0, 2, 6, 4, begin));
			if (r !== this.width)
				cat(geometry.faces, Face4(5, 7, 3, 1, begin));
			if (t !== 0)
				cat(geometry.faces, Face4(4, 5, 1, 0, begin));
			if (b !== this.height)
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
	lblFPS: <JQuery>null
};

class Engine {
	public gameField: GameField;
	public fullTL = new TimelineMax();

	// 选项
	private enableAA: boolean;
	private detailLevel: number;

	// 状态
	private _cinematic = false;
	private gameStatus = GameStatus.intro;

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

	// 界面用（鼠标选择）
	private mouseCoord = new THREE.Vector2();
	private mouseDown = false;
	private mouseDownFirst = false;
	private _hoveredObj: FieldObject;
	private _selectedObj: FieldObject;
	private _selectedTween: TweenMax[];

	constructor() {
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

		for (let name in this.lights)
			this.scene.add(this.lights[name]);

		this.field = new THREE.Mesh(
			this.gameField.createFloor(this.wallThickness),
			new THREE.MeshLambertMaterial({ color: 0xFFFFFF, map: this.gameField.floorTexture })
		);
		this.wall = new THREE.Mesh(
			this.gameField.createGeometry(this.wallThickness, 1),
			new THREE.MeshLambertMaterial({ color: 0xDDDDDD })
		);
		this.edgeshelper = new THREE.EdgesHelper(this.wall, 0x999999);
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
			.on('wheel', event => TweenMax.to(this.camera.position, 0.1, { z: "+=" + (event.originalEvent['deltaY'] / 100) }));

		this.antialiasing = false;
	}

	public renderTick() {
		if (!this.cinematic) {
			let tiltx = this.mouseCoord.x * Math.PI / 2;
			let tilty = this.mouseCoord.y * Math.PI / 2;

			// 鼠标控制视角
			this.camera.position.x = Math.sin(tiltx) * this.fieldMaxWidth;
			this.camera.position.y = Math.sin(tilty) * this.fieldMaxHeight;
			this.camera.lookAt(zeroVector3);

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
				for (let intersect of intersects)
					if (intersect.object instanceof FieldObject) {
						this.hoveredObj = intersect.object as FieldObject;
						break;
					}
			}

			let activeObj = this.selectedObj || this.hoveredObj;
			if (activeObj) {
				let coord = activeObj.position.clone();
				coord.project(this.camera);
				$ui.lblFloatingInfo.css("transform", `translate(${
					Math.round((1 + coord.x) * this.dispWidth / 2)
					}px,${
					Math.round((1 - coord.y) * this.dispHeight / 2)
					}px)`);
			}

			this.mouseDownFirst = false;
		}

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
		this.renderer.setClearColor(0xFFFFFF, 1);

		this.camera = new THREE.PerspectiveCamera(50, this.dispWidth / this.dispHeight);
		this.camera.position.set(0, 0, 15);
		this.camera.lookAt(this.scene.position);
	}

	public shutterAndDropScreenShot() {
		let tl = new TimelineMax();
		let letterboxes = $ui.sGameScene.find(".letterbox");
		let screenShot = $ui.sGameScene.find(".screen-shot");
		tl.set(letterboxes, { transitionDuration: 0 });
		tl.to(letterboxes, 0.3, { scaleY: 6, clearProps: "transform,transitionDuration", ease: Power2.easeIn, yoyo: true, repeat: 1 });
		tl.set(screenShot, {
			display: "block"
		});
		tl.add(biDirConstSet(screenShot.find("img")[0], "src", this.screenShot));
		tl.to(screenShot, 2, { rotation: "360deg", top: "40%", bottom: "40%", left: "40%", right: "40%" });
		tl.to(screenShot, 0.5, { x: "-500%", ease: Power2.easeIn });
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
			addGlow(this._hoveredObj = to, new THREE.Color("cyan"));
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
			addGlow(to);

		this.gameField.focusOn(this.camera, to.fieldCoord);
		if (to instanceof FruitGenerator) {
			let generator = to as FruitGenerator;
			this.fullTL.add(this.gameField.generateFruitsFromGenerator(generator.fieldCoord));
		}
		this._selectedTween = [
			TweenMax.fromTo(to.position, 0.5, { z: 0.5 },
				{ z: 0, yoyo: true, repeat: -1, ease: Power2.easeOut }),
			TweenMax.fromTo(to.scale, 0.5, { x: 1, y: 1, z: 1 },
				{ x: 1.1, y: 1.1, z: 0.5, yoyo: true, repeat: -1, ease: Power2.easeOut })
		];
		$ui.lblFloatingInfo.text(to.fieldCoord.r + "," + to.fieldCoord.c);
	}

	public get antialiasing() {
		return this.enableAA;
	}
	public set antialiasing(to: boolean) {
		if (this.enableAA !== to) {
			this.enableAA = to;
			this.resetRenderer();
		}
	}

	public get graphicsLevel() {
		return this.detailLevel;
	}
	public set graphicsLevel(to: number) {
		if (this.detailLevel !== to) {
			if (to > 0)
				this.scene.add(this.edgeshelper);
			else
				this.scene.remove(this.edgeshelper);
		}
	}

	public get cinematic() {
		return this._cinematic;
	}
	public set cinematic(to: boolean) {
		if (this._cinematic !== to) {
			$ui.sGameScene.find(".canvas-container").toggleClass("cinematic");
			this._cinematic = to;
		}
	}
}

let engine: Engine;

$(window).load(() => {
	for (let id in $ui)
		$ui[id] = $("#" + id);

	// 处理 data-child-centered 元素的居中样式
	$("[data-child-centered]").each(function () {
		$(this).children().wrapAll('<div class="centered"></div>');
	});

	// 处理 data-text-shattered 元素文本，将其用 span 拆分开
	$("[data-text-shattered]").shatter();

	let templateContainer = $(".infobox-container");
	for (let i = 0; i < 4; i++)
		templateContainer.append($(insertTemplate('tmpInfobox')['children'][0]).addClass("p" + (i + 1)));

	let currTL: TimelineLite;
	$(document).keydown(e => {
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
	const fOpening = (cb: () => void) => {
		const tl = new TimelineMax();
		tl.to($ui.sLoading, 0.5, { scale: 2, opacity: 0 });
		tl.call(() => ($ui.sLoading.hide(), $ui.sIntro.show()));

		const outer = $ui.sIntro.find(".intro-circle.outer"),
			inner = $ui.sIntro.find(".intro-circle.inner"),
			bkgRect = $ui.sIntro.find(".intro-line"),
			title = $ui.sIntro.find(".intro-title");

		// 内外圆形
		tl.staggerTo([outer[0], inner[0]], 2, { height: "12em", width: "12em", ease: Circ.easeInOut }, 0.5);
		tl.call(() => outer.hide());
		tl.to(inner, 1, { rotationX: "90deg", ease: Back.easeIn.config(2.5) }, "+=1");
		tl.call(() => {
			bkgRect.width(inner.find(".centered").width()).show();
			inner.hide();
		});

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
		tl.add(shake(1.5));
		tl.from(parts[2], 0.75, { scale: 3, opacity: 0, ease: Power2.easeIn }, "-=0.5");
		tl.call(() =>
			TweenMax.to($(parts[2]).clone().prependTo(parts[2]), 0.2, { scale: 2, autoAlpha: 0 }));
		tl.add(shake(2));

		// 边框特技
		let borders = bkgRect.find(".border"); // 上、右、下、左
		tl.from(borders[3], 1, { scale: 0, ease: Power2.easeIn }, "+=0.5");
		tl.from(borders[0], 1, { scale: 0, ease: Linear.easeNone });
		tl.from(borders[1], 1, { scale: 0, ease: Power2.easeOut });
		tl.to(bkgRect.find(".intro-line-fill"), 3, { scaleY: "0" }, "-=3");

		// 离场
		tl.call(() => ($ui.sGameScene.show(), bkgRect.css({ overflow: "hidden", borderColor: "white" })));
		tl.to(bkgRect, 1, { width: 0, ease: Power2.easeIn });
		tl.to(bkgRect, 1, { scaleY: 2, y: "-100%", ease: Power2.easeOut });
		tl.to(bkgRect, 2, { y: "100%" });
		tl.from($ui.sGameScene, 2, { y: "-100%", opacity: 0, ease: Bounce.easeOut }, "-=2");
		tl.call(() => $ui.sIntro.hide());
		cb && tl.call(cb);
	};

	// 创建游戏场景
	const fCreateScene = (cb: () => void) => {
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

		engine = new Engine();

		let keyCode2dir = {
			37: Direction.left,
			38: Direction.up,
			39: Direction.right,
			40: Direction.down
		};

		$(window)
			.resize(engine.resetRenderer.bind(engine))
			.keydown(event => {
				let dir = keyCode2dir[event.keyCode];
				if (dir !== undefined) {
					let tl = engine.gameField.doAction(dir);
					if (tl)
						engine.fullTL.to(tl, tl.duration(), { time: tl.duration() });
				} else
					engine.shutterAndDropScreenShot();
			});

		cb && cb();
	};


	let pOpening = new Promise((r) => (0 && infoProvider.notifyInitComplete(), r()));
	//pOpening.then(fOpening);
	pOpening.then(fCreateScene);
	pOpening.catch(err => console.error(err));
});
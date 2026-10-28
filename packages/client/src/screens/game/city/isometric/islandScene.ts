import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITIES, COASTLINE, ISLAND, LAKE, MAP_HEIGHT, MAP_WIDTH, RIVERS, ROADS, roadPoints, type MapPoint } from '@muchomoney/core';
import { placeIslandLabel, type LabelRect } from './labelLayout';
import { islandPickMeshes, visibleIslandPickMeshes } from './picking';
import { ISLAND_MARKER_COLORS } from './markers';
import { ISOMETRIC_KM_PER_UNIT, pointAlongRoute, scenerySeed, type IslandModel, type IslandRoute } from './isometricModel';

const UNIT = ISOMETRIC_KM_PER_UNIT;
const X0 = MAP_WIDTH / (2 * UNIT), Z0 = MAP_HEIGHT / (2 * UNIT);
const PALETTE = { grass: '#aabd78', soil: '#cdbb86', shore: '#ece2b0', water: '#72b6b1', deep: '#559e9f',
  road: '#79827a', curb: '#d8d5b5', roof: '#c87952', wall: '#f1dec1', shadow: '#50695b', leaf: '#5b9269',
  stone: '#a5a48c', cream: '#fff1cf' };
const worldPoint = (p: MapPoint, height = 0) => new THREE.Vector3(p.x / UNIT - X0, height, p.y / UNIT - Z0);
const modifiedGesture = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
const inside = (p: MapPoint, polygon: readonly MapPoint[]) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};
const onLand = (p: MapPoint) => (inside(p, COASTLINE) && !inside(p, LAKE)) || inside(p, ISLAND);
let libraryPromise: Promise<THREE.Group> | null = null;
function loadLibrary(): Promise<THREE.Group> {
  libraryPromise ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}isometric/library.glb`).then(gltf => gltf.scene).catch(error => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

interface Actor { object: THREE.Object3D; route: IslandRoute; phase: number; speed: number }
export interface SceneCallbacks {
  selected: (cellId: string) => void;
  inspect: (cellId: string | null) => void;
  doubleClick: (cellId: string) => void;
  assets: (status: 'loading' | 'ready' | 'failed') => void;
  lost: () => void;
}
export interface IslandSceneState {
  model: IslandModel;
  selectedId: string | null;
  referenceId: string | null;
  colors: ReadonlyMap<string, string>;
  economicLayer: boolean;
  frozen: boolean;
  grid: boolean;
  hideRivals: boolean;
}

/** One owned renderer per mounted board. Reuses the static island and a compact, material-merged Blender kit. */
export class IslandScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-8, 8, 6, -6, .1, 150);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly staticWorld = new THREE.Group();
  private readonly dynamic = new THREE.Group();
  private readonly pickables = new THREE.Group();
  private pickMeshes: THREE.Mesh[] = [];
  private readonly routeGroup = new THREE.Group();
  private readonly overlay = new THREE.Group();
  private readonly ghost = new THREE.Group();
  private readonly generatedGeometries = new Set<THREE.BufferGeometry>();
  private readonly generatedMaterials = new Set<THREE.Material>();
  private readonly generatedTextures = new Set<THREE.Texture>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly templates = new Map<string, THREE.Group>();
  private readonly boxes = new THREE.BoxGeometry(1, 1, 1);
  private readonly cylinders = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly cones = new THREE.ConeGeometry(1, 1, 6);
  private readonly cellPlane = new THREE.PlaneGeometry(.985, .985);
  private readonly selection: THREE.LineLoop;
  private readonly inspection: THREE.LineLoop;
  private readonly reference: THREE.LineLoop;
  private readonly observer: ResizeObserver;
  private readonly visibility: IntersectionObserver | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: SceneCallbacks;
  private readonly label: HTMLElement;
  private state: IslandSceneState | null = null;
  private actors: Actor[] = [];
  private pedestrians: Actor[] = [];
  private ambient: Actor[] = [];
  private waveLines: THREE.Line[] = [];
  private hovered: string | null = null;
  private disposed = false;
  private contextLost = false;
  private inView = true;
  private needsRender = true;
  private frame = 0;
  private lastTime = 0;
  private clock = 0;
  private modelKey = '';
  private routesKey = '';
  private coloredKey = '';
  private initialized = false;
  private kitLoaded = false;
  private ghostKey = '';
  private readonly activePointers = new Set<number>();
  private pointerStart: { id: number; x: number; y: number } | null = null;
  private width = 1;
  private height = 1;
  private viewSpan = 12;
  private rotation = Math.PI / 4;
  private readonly events: Array<[EventTarget, string, EventListener]> = [];

  constructor(canvas: HTMLCanvasElement, label: HTMLElement, callbacks: SceneCallbacks, private readonly cityLabels?: HTMLElement) {
    this.canvas = canvas; this.callbacks = callbacks; this.label = label;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#d4e8dc');
    this.scene.fog = new THREE.Fog('#d4e8dc', 42, 85);
    this.scene.add(new THREE.HemisphereLight('#fff3d8', '#648b83', 1.9));
    const sun = new THREE.DirectionalLight('#fff0cb', 2.2);
    sun.position.set(-10, 20, -9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 55;
    sun.shadow.normalBias = .025; sun.shadow.bias = -.00015;
    this.scene.add(sun);
    this.scene.add(this.staticWorld, this.dynamic, this.pickables, this.overlay, this.routeGroup, this.ghost);
    this.generatedGeometries.add(this.boxes); this.generatedGeometries.add(this.cylinders);
    this.generatedGeometries.add(this.cones); this.generatedGeometries.add(this.cellPlane);
    this.selection = this.outline(ISLAND_MARKER_COLORS.selected, .98, .09);
    this.inspection = this.outline(ISLAND_MARKER_COLORS.hover, .94, .10);
    this.reference = this.outline(ISLAND_MARKER_COLORS.reference, .88, .105);
    this.scene.add(this.selection, this.inspection, this.reference);
    this.selection.visible = this.inspection.visible = this.reference.visible = false;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableRotate = false;
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = false;
    this.controls.zoomSpeed = .7;
    this.controls.minZoom = .55; this.controls.maxZoom = 5;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => { this.needsRender = true; });
    this.buildIsland();
    this.setCamera(new THREE.Vector3(), this.viewSpan);
    this.on(canvas, 'pointerdown', event => {
      const e = event as PointerEvent;
      this.activePointers.add(e.pointerId);
      // OrbitControls still owns every gesture. Only a single primary contact may become a click.
      this.pointerStart = this.activePointers.size === 1 && e.isPrimary && e.button === 0 && e.buttons === 1 && !modifiedGesture(e)
        ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    });
    this.on(canvas, 'pointerup', event => {
      const e = event as PointerEvent, start = this.pointerStart;
      this.activePointers.delete(e.pointerId);
      if (!start || start.id !== e.pointerId) return;
      this.pointerStart = null;
      if (this.activePointers.size || !e.isPrimary || e.button !== 0 || modifiedGesture(e)
        || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      const id = this.hit(e.clientX, e.clientY);
      if (id) callbacks.selected(id);
    });
    this.on(canvas, 'pointermove', event => {
      const e = event as PointerEvent, start = this.pointerStart;
      // Once panning (or chording buttons), returning to the starting point cannot restore a click.
      if (start?.id === e.pointerId && (e.buttons !== 1 || modifiedGesture(e)
        || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5)) this.pointerStart = null;
      if (e.buttons) return;
      this.inspect(this.hit(e.clientX, e.clientY));
    });
    this.on(canvas, 'pointerleave', () => this.inspect(null));
    const cancelPointer = (event: Event) => {
      const id = (event as PointerEvent).pointerId, active = this.activePointers.delete(id);
      if (this.pointerStart?.id === id) this.pointerStart = null;
      // The usual capture release follows pointerup; it must not erase an ordinary completed hover.
      if (active || event.type === 'pointercancel') this.inspect(null);
    };
    this.on(canvas, 'pointercancel', cancelPointer);
    this.on(canvas, 'lostpointercapture', cancelPointer);
    this.on(canvas, 'dblclick', event => {
      const e = event as MouseEvent;
      if (e.button !== 0 || modifiedGesture(e)) return;
      const id = this.hit(e.clientX, e.clientY);
      if (id) callbacks.doubleClick(id);
    });
    this.on(canvas, 'contextmenu', event => event.preventDefault());
    this.on(canvas, 'webglcontextlost', event => { event.preventDefault(); this.contextLost = true; callbacks.lost(); });
    this.on(document, 'visibilitychange', () => { this.lastTime = 0; this.needsRender = true; });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas.parentElement!);
    this.visibility = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      this.inView = entries[0]?.isIntersecting ?? true; this.lastTime = 0; this.needsRender = true;
    });
    this.visibility?.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
    callbacks.assets('loading');
    void this.loadKit();
  }

  private on(target: EventTarget, name: string, listener: EventListener) {
    target.addEventListener(name, listener); this.events.push([target, name, listener]);
  }
  private mat(color: string, metalness = 0, roughness = .83): THREE.MeshStandardMaterial {
    const key = `${color}:${metalness}:${roughness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      this.materials.set(key, material); this.generatedMaterials.add(material);
    }
    return material;
  }
  private box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(this.boxes, this.mat(color));
    mesh.position.set(x, y + h / 2, z); mesh.scale.set(w, h, d); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  private outline(color: string, side: number, height: number) {
    const r = side / 2;
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-r, height, -r), new THREE.Vector3(r, height, -r), new THREE.Vector3(r, height, r), new THREE.Vector3(-r, height, r)]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false });
    this.generatedGeometries.add(geometry); this.generatedMaterials.add(material);
    const line = new THREE.LineLoop(geometry, material); line.renderOrder = 10; return line;
  }
  private shape(points: readonly MapPoint[]) {
    const shape = new THREE.Shape();
    points.forEach((p, i) => { const v = worldPoint(p); if (i) shape.lineTo(v.x, -v.z); else shape.moveTo(v.x, -v.z); });
    shape.closePath(); return shape;
  }
  private land(points: readonly MapPoint[], lake = false) {
    const shape = this.shape(points);
    if (lake) { const hole = this.shape([...LAKE].reverse()); shape.holes.push(hole); }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .35, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .045, bevelThickness: .025 });
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, -.35, 0);
    this.generatedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, [this.mat(PALETTE.grass), this.mat(PALETTE.soil)]);
    mesh.receiveShadow = true; this.staticWorld.add(mesh);
    const edge = new THREE.BufferGeometry().setFromPoints([...points, points[0]].map(p => worldPoint(p, -.17)));
    this.generatedGeometries.add(edge);
    const material = new THREE.LineBasicMaterial({ color: PALETTE.cream, transparent: true, opacity: .55 });
    this.generatedMaterials.add(material); this.staticWorld.add(new THREE.Line(edge, material));
  }
  private line(points: readonly MapPoint[], color: string, height: number, dashed = false, parent: THREE.Object3D = this.staticWorld) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => worldPoint(p, height)));
    const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: .1, gapSize: .1, transparent: true, opacity: .85 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: .8 });
    this.generatedGeometries.add(geometry); this.generatedMaterials.add(material);
    const line = new THREE.Line(geometry, material); if (dashed) line.computeLineDistances();
    parent.add(line); return line;
  }
  private ribbon(points: readonly MapPoint[], width: number, color: string, height: number, parent: THREE.Object3D = this.staticWorld) {
    if (points.length < 2) return;
    const positions: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = worldPoint(points[i - 1], height), b = worldPoint(points[i], height), v = b.clone().sub(a);
      if (v.lengthSq() === 0) continue;
      const side = new THREE.Vector3(-v.z, 0, v.x).normalize().multiplyScalar(width / 2);
      const aa = a.clone().add(side), ab = a.clone().sub(side), ba = b.clone().add(side), bb = b.clone().sub(side);
      for (const p of [aa, ba, ab, ab, ba, bb]) positions.push(p.x, p.y, p.z);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    this.generatedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, this.mat(color)); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private buildIsland() {
    const water = this.box(this.staticWorld, 0, -.57, 0, 140, .2, 140, PALETTE.water);
    water.castShadow = false;
    this.land(COASTLINE, true); this.land(ISLAND);
    for (const river of RIVERS) this.ribbon(river, .08, PALETTE.water, .035);
    for (const road of ROADS) {
      const points = roadPoints(road);
      if (road.kind === 'sea') { this.line(points, '#dbe9cb', -.29, true); continue; }
      const width = road.kind === 'highway' ? .13 : road.kind === 'mountain' ? .065 : .085;
      this.ribbon(points, width + .05, PALETTE.curb, .038);
      this.ribbon(points, width, PALETTE.road, .043);
      if (road.kind !== 'mountain') this.line(points, '#e7e6c8', .049, true);
    }
    for (let i = 0; i < 22; i++) {
      const x = -19 + scenerySeed(`water-x-${i}`) * 38, z = -20 + scenerySeed(`water-z-${i}`) * 40;
      // Broad ocean ripples use a constant count and carry no transport information.
      if (Math.abs(x) < 8 && Math.abs(z) < 10) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -.355, z), new THREE.Vector3(x + .3, -.355, z + .03), new THREE.Vector3(x + 1.4, -.355, z)]);
      const material = new THREE.LineBasicMaterial({ color: '#e5f1d7', transparent: true, opacity: .3 });
      this.generatedGeometries.add(geometry); this.generatedMaterials.add(material);
      const line = new THREE.Line(geometry, material); this.staticWorld.add(line); this.waveLines.push(line);
    }
  }

  private async loadKit() {
    try {
      const library = await loadLibrary();
      if (this.disposed) return;
      library.updateMatrixWorld(true);
      library.traverse(node => {
        if (!node.name.startsWith('asset_')) return;
        const inverse = node.matrixWorld.clone().invert();
        const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
        node.traverse(child => {
          if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          // glTF exports a mesh primitive per material. Keep unusual multi-material exports intact.
          if (materials.length !== 1) return;
          let geometry = child.geometry.clone();
          geometry.applyMatrix4(inverse.clone().multiply(child.matrixWorld));
          if (geometry.index) { const original = geometry; geometry = geometry.toNonIndexed(); original.dispose(); }
          for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(attribute)) geometry.deleteAttribute(attribute);
          // The Blender palette is carried by COLOR_0. Keep it through material batching.
          if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          const list = byMaterial.get(materials[0]) ?? []; list.push(geometry); byMaterial.set(materials[0], list);
        });
        if (!byMaterial.size) return;
        const group = new THREE.Group(); group.name = node.name;
        for (const [sourceMaterial, geometries] of byMaterial) {
          const merged = mergeGeometries(geometries, false);
          geometries.forEach(geometry => geometry.dispose());
          if (!merged) continue;
          this.generatedGeometries.add(merged);
          const material = sourceMaterial.clone(); this.generatedMaterials.add(material);
          if (material instanceof THREE.MeshStandardMaterial) { material.roughness = Math.max(.4, material.roughness); }
          const mesh = new THREE.Mesh(merged, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        }
        this.templates.set(node.name, group);
      });
      this.kitLoaded = this.templates.size > 0;
      this.modelKey = ''; this.routesKey = ''; this.ghostKey = '';
      if (this.state) this.update(this.state);
      this.callbacks.assets(this.kitLoaded ? 'ready' : 'failed');
    } catch {
      if (!this.disposed) this.callbacks.assets('failed');
    }
  }
  private asset(name: string, color?: string): THREE.Group {
    const template = this.templates.get(`asset_${name}`);
    if (!template) return this.fallbackAsset(name, color);
    const clone = template.clone(true);
    clone.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = child.receiveShadow = true;
      const material = child.material;
      if (color && !Array.isArray(material) && material.name.startsWith('company_accent')) child.material = this.mat(color, .08, .6);
    });
    return clone;
  }
  private fallbackAsset(name: string, color = PALETTE.roof): THREE.Group {
    const group = new THREE.Group();
    if (name === 'tree') {
      this.box(group, 0, 0, 0, .06, .3, .06, '#847054');
      const crown = new THREE.Mesh(this.cones, this.mat(PALETTE.leaf)); crown.position.y = .37; crown.scale.set(.18, .5, .18); crown.castShadow = true; group.add(crown);
    } else if (name === 'person') {
      this.box(group, 0, 0, 0, .035, .075, .025, color); this.box(group, 0, .075, 0, .03, .025, .03, PALETTE.wall);
    } else if (name === 'truck') {
      this.box(group, 0, .025, -.035, .10, .09, .19, PALETTE.cream); this.box(group, 0, .025, .09, .1, .07, .07, color);
      this.box(group, 0, .045, .13, .078, .035, .004, '#3b666b');
    } else if (name === 'boat') {
      this.box(group, 0, -.04, 0, .22, .12, .55, color); this.box(group, 0, .08, -.15, .16, .14, .18, PALETTE.wall);
    } else if (name === 'construction') {
      for (const x of [-.3, .3]) for (const z of [-.25, .25]) this.box(group, x, 0, z, .025, .5, .025, '#d3a54e');
      this.box(group, 0, .49, -.25, .64, .02, .025, '#d3a54e'); this.box(group, 0, .49, .25, .64, .02, .025, '#d3a54e');
      this.box(group, .35, 0, .3, .04, 1, .04, '#caa541'); this.box(group, .12, .97, .3, .65, .035, .035, '#caa541');
    } else if (name.startsWith('extension')) {
      this.box(group, 0, 0, 0, .26, .28, .6, PALETTE.wall); this.box(group, 0, .28, 0, .3, .035, .64, color);
    } else {
      const small = name === 'house';
      this.box(group, 0, 0, 0, small ? .5 : .64, small ? .4 : .32, .52, PALETTE.wall);
      this.box(group, 0, small ? .4 : .32, 0, small ? .56 : .7, .05, .6, color);
      for (const x of [-.2, -.07, .07, .2]) this.box(group, x, .15, .265, .075, .09, .015, '#638d91');
      if (name.includes('energy_drinks') || name.includes('yogurts') || name.includes('oil')) for (const x of [-.23, .23]) {
        const tank = new THREE.Mesh(this.cylinders, this.mat('#c4d0c9', .3)); tank.position.set(x, .3, -.18); tank.scale.set(.1, .6, .1); tank.castShadow = true; group.add(tank);
      }
      if (name.includes('crypto')) this.box(group, .1, .37, 0, .3, .35, .3, '#7a958e');
    }
    return group;
  }

  private rebuildBuildings(model: IslandModel) {
    this.pickMeshes = [];
    this.clearGroup(this.dynamic); this.clearGroup(this.pickables); this.pedestrians = []; this.ambient = [];
    const pickerMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    this.generatedMaterials.add(pickerMaterial);
    pickerMaterial.userData.transient = true;
    for (const cell of model.cells) {
      const pick = new THREE.Mesh(this.cellPlane, pickerMaterial); pick.rotation.x = -Math.PI / 2;
      pick.position.copy(worldPoint(cell, .055)); pick.userData.cellId = cell.id; this.pickables.add(pick);
    }
    const ownedCells = new Set(model.ownedLand.map(land => land.cellId));
    for (const land of model.ownedLand) {
      const cell = model.cells.find(cell => cell.id === land.cellId); if (!cell) continue;
      const claim = new THREE.Group(); claim.position.copy(worldPoint(cell));
      // Solid painted curbs persist when the grid is hidden. Selection/reference sit outside/inside them.
      for (const z of [-.465, .465]) this.box(claim, 0, .055, z, .96, .018, .03, land.color);
      for (const x of [-.465, .465]) this.box(claim, x, .055, 0, .03, .018, .90, land.color);
      this.ownershipFlag(claim, land.color);
      claim.traverse(child => { child.userData.cellId = cell.id; });
      this.dynamic.add(claim);
    }
    for (const factory of model.factories) {
      const group = new THREE.Group(); group.position.copy(worldPoint(factory.point, .04)); group.userData.cellId = factory.cellId;
      this.box(group, 0, -.025, 0, .9, .035, .88, '#d5d1b1');
      const building = this.asset(`factory_${factory.sectorId}`, factory.color);
      // Every plant's footprint remains inside its parcel; existing factory objects never move when expanded.
      building.scale.setScalar(factory.incubator ? .65 : .8); group.add(building);
      if (factory.extensionRatio > .01) {
        const module = this.asset(['energy_drinks', 'yogurts'].includes(factory.sectorId) ? 'extension_tanks' : 'extension_warehouse', factory.color);
        module.position.set(.32, .015, -.05); module.scale.set(.85 * Math.max(.35, factory.extensionRatio), .85, .85); group.add(module);
      }
      if (factory.constructing || factory.pendingExtension) {
        const construction = this.asset('construction', '#dfad48');
        if (!factory.constructing) { construction.position.set(.30, .01, 0); construction.scale.set(.55, .8, .85); }
        group.add(construction);
      }
      for (let i = 0; i < (factory.stockPallets ?? 0); i++) {
        this.box(group, -.27 + i * .1, .015, .38, .075, .045, .075, '#bb9762');
        this.box(group, -.27 + i * .1, .06, .38, .065, .065, .065, '#dfc28c');
      }
      // Legacy views without a land ledger still identify the plant; network land has one shared flag.
      if (!ownedCells.has(factory.cellId)) this.ownershipFlag(group, factory.color);
      group.traverse(child => { child.userData.cellId = factory.cellId; });
      if (this.state?.hideRivals && !factory.mine) group.traverse(child => {
        if (child instanceof THREE.Mesh) child.visible = false;
      });
      this.dynamic.add(group);
      // The same two workers per visible plant are decorative; their count does not reveal production plans.
      if (!factory.constructing && !(this.state?.hideRivals && !factory.mine)) for (let i = 0; i < 2; i++) {
        const person = this.asset('person', i ? '#867454' : '#657b79'); person.scale.setScalar(.9); this.dynamic.add(person);
        const points = [{ x: factory.point.x - 29, y: factory.point.y + 29 }, { x: factory.point.x + 26, y: factory.point.y + 29 }];
        this.pedestrians.push({ object: person, route: { id: `person:${factory.id}:${i}`, color: factory.color, points, kind: 'truck', indicative: true },
          phase: scenerySeed(`${factory.id}:${i}`), speed: .035 });
      }
    }
    for (const site of model.sites) {
      const group = new THREE.Group(); group.position.copy(worldPoint(site.point, .02));
      const building = this.asset(`site_${site.commodityId}`, site.color); group.add(building);
      if (site.constructing) { const construction = this.asset('construction'); construction.scale.setScalar(.9); group.add(construction); }
      if (!site.companyId) { this.box(group, -.36, 0, .34, .025, .26, .025, '#9a8056'); this.box(group, -.36, .18, .34, .2, .12, .02, '#f3d48a'); }
      if (site.dormant) this.box(group, 0, .04, .36, .7, .035, .02, '#b49c76');
      if (site.cellId) group.traverse(child => { child.userData.cellId = site.cellId; });
      this.dynamic.add(group);
    }
    this.scenery(model);
    this.pickMeshes = islandPickMeshes([this.pickables, this.dynamic]);
  }

  private ownershipFlag(parent: THREE.Object3D, color: string) {
    this.box(parent, -.39, .03, .36, .085, .045, .085, PALETTE.cream);
    this.box(parent, -.39, .075, .36, .02, .68, .02, '#58665b');
    // A substantial two-sided banner stays legible from every camera rotation.
    this.box(parent, -.235, .53, .36, .31, .19, .018, PALETTE.cream);
    this.box(parent, -.235, .55, .36, .28, .15, .022, color);
  }

  private scenery(model: IslandModel) {
    const ownedCells = new Set(model.ownedLand.map(land => land.cellId));
    // Keep purchased lots clear of decorative buildings/trees, so an empty property reads as an empty lot.
    const blocked = [...model.factories.map(f => f.point), ...model.sites.map(s => s.point),
      ...model.cells.filter(cell => ownedCells.has(cell.id))];
    const free = (p: MapPoint, radius: number) => !blocked.some(b => Math.hypot(b.x - p.x, b.y - p.y) < radius);
    const trees: THREE.Matrix4[] = [], houses: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (const cell of model.cells) {
      if (cell.city || cell.deposit || ownedCells.has(cell.id) || !free(cell, 60)) continue;
      const n = cell.terrain === 'mountain' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x = cell.x + (scenerySeed(`${cell.id}:x${i}`) - .5) * 60;
        const y = cell.y + (scenerySeed(`${cell.id}:y${i}`) - .5) * 60;
        if (!onLand({ x, y }) || !free({ x, y }, 55) || this.nearRoad({ x, y }, .16)) continue;
        dummy.position.copy(worldPoint({ x, y }, .03)); dummy.rotation.set(0, scenerySeed(`${cell.id}:r${i}`) * Math.PI * 2, 0);
        dummy.scale.setScalar(1.3 + scenerySeed(`${cell.id}:s${i}`) * 1.1); dummy.updateMatrix(); trees.push(dummy.matrix.clone());
      }
      if (cell.terrain === 'mountain' && scenerySeed(cell.id) > .35) {
        const p = worldPoint(cell); const rock = new THREE.Mesh(this.cones, this.mat('#a6ad91'));
        rock.position.set(p.x + .18, .3, p.z - .12); rock.scale.set(.4, .75 + scenerySeed(`peak:${cell.id}`) * .8, .36);
        rock.castShadow = rock.receiveShadow = true; this.dynamic.add(rock);
      }
    }
    for (const city of Object.values(CITIES)) {
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2, radius = 50 + (i % 3) * 15;
        const p = { x: city.x + Math.cos(angle) * radius, y: city.y + Math.sin(angle) * radius };
        if (!onLand(p) || !free(p, 36) || this.nearRoad(p, .08)) continue;
        dummy.position.copy(worldPoint(p, .04)); dummy.rotation.set(0, (i % 4) * Math.PI / 2, 0);
        dummy.scale.setScalar(.85 + (i % 3) * .15); dummy.updateMatrix(); houses.push(dummy.matrix.clone());
      }
    }
    this.instances('tree', trees); this.instances('house', houses);
    const port = this.asset('port'); port.position.copy(worldPoint({ x: 82, y: 625 }, -.05)); port.rotation.y = Math.PI / 2;
    this.dynamic.add(port);
    // Moored boats are scenery. Vehicles on selected economic routes are built separately.
    const boat = this.asset('boat', '#577e83'); boat.position.copy(worldPoint({ x: 49, y: 645 }, -.32)); boat.rotation.y = .2;
    this.dynamic.add(boat);
    // A fixed handful of local vehicles gives the island life even with economic layers off.
    // Their count, timing, and paths depend only on public geography, never economic quantities.
    ROADS.filter(road => road.kind === 'highway').slice(0, 5).forEach((road, i) => {
      const vehicle = this.asset('truck', ['#d9aa67', '#82a6a2', '#a98172'][i % 3]); vehicle.scale.setScalar(.8); this.dynamic.add(vehicle);
      this.ambient.push({ object: vehicle, route: { id: `ambient:${i}`, points: roadPoints(road), color: '#8a9880', kind: 'truck', indicative: true }, phase: scenerySeed(`ambient:${i}`), speed: .012 });
    });
  }
  private nearRoad(p: MapPoint, radius: number) {
    for (const road of ROADS) {
      if (road.kind === 'sea') continue;
      const pts = roadPoints(road);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < radius * UNIT) return true;
      }
    }
    return false;
  }
  private instances(name: string, transforms: THREE.Matrix4[]) {
    if (!transforms.length) return;
    const template = this.templates.get(`asset_${name}`) ?? this.fallbackAsset(name);
    template.updateMatrixWorld(true);
    template.traverse(child => {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
      const instances = new THREE.InstancedMesh(child.geometry, child.material, transforms.length);
      for (let i = 0; i < transforms.length; i++) instances.setMatrixAt(i, transforms[i].clone().multiply(child.matrixWorld));
      instances.castShadow = instances.receiveShadow = true;
      instances.instanceMatrix.needsUpdate = true; this.dynamic.add(instances);
    });
  }

  private rebuildRoutes(routes: IslandRoute[]) {
    this.clearGroup(this.routeGroup); this.actors = [];
    for (const route of routes) {
      if (route.track && route.kind === 'truck') {
        const track = this.ribbon(route.points, .065, '#b5ac8b', .056, this.routeGroup);
        if (track) {
          const gravel = new THREE.MeshStandardMaterial({ color: '#b5ac8b', roughness: 1, transparent: true, opacity: .58, depthWrite: false });
          gravel.userData.transient = true; this.generatedMaterials.add(gravel);
          track.material = gravel; track.geometry.userData.transient = true;
        }
      }
      const height = route.kind === 'boat' ? -.25 : route.kind === 'digital' ? .5 : .085;
      const routeLine = this.line(route.points, route.color, height, route.indicative || route.kind === 'digital', this.routeGroup);
      routeLine.geometry.userData.transient = true; routeLine.material.userData.transient = true;
      const actor = route.kind === 'digital' ? new THREE.Group() : this.asset(route.kind, route.color);
      if (route.kind === 'digital') {
        const packet = new THREE.Mesh(this.boxes, this.mat(route.color, .2, .25)); packet.scale.set(.07, .07, .07); packet.rotation.z = Math.PI / 4; actor.add(packet);
      }
      actor.scale.setScalar(route.kind === 'boat' ? .8 : .85);
      this.routeGroup.add(actor);
      this.actors.push({ object: actor, route, phase: scenerySeed(route.id), speed: .035 });
    }
  }
  private rebuildOverlay() {
    this.clearGroup(this.overlay);
    if (!this.state) return;
    const tilesByColor = new Map<string, THREE.Matrix4[]>();
    const gridPoints: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();
    const owners = new Map(this.state.model.ownedLand.map(land => [land.cellId, land.color]));
    const economicLayer = this.state.economicLayer;
    for (const cell of this.state.model.cells) {
      // Ownership tint stays beneath roads and buildings. Economic lenses keep their original colours.
      const p = worldPoint(cell, economicLayer ? .045 : .03);
      const color = economicLayer ? this.state.colors.get(cell.id) : owners.get(cell.id);
      if (color) {
        dummy.position.copy(p); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.updateMatrix();
        const tiles = tilesByColor.get(color) ?? []; tiles.push(dummy.matrix.clone()); tilesByColor.set(color, tiles);
      }
      if (this.state.grid) {
        const corners = [[-.495, -.495], [.495, -.495], [.495, .495], [-.495, .495]];
        for (let i = 0; i < 4; i++) for (const corner of [corners[i], corners[(i + 1) % 4]]) gridPoints.push(new THREE.Vector3(p.x + corner[0], .053, p.z + corner[1]));
      }
    }
    for (const [color, tiles] of tilesByColor) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: economicLayer ? .22 : .32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      material.userData.transient = true; this.generatedMaterials.add(material);
      const mesh = new THREE.InstancedMesh(this.cellPlane, material, tiles.length);
      tiles.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); this.overlay.add(mesh);
    }
    if (gridPoints.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
      const material = new THREE.LineBasicMaterial({ color: '#5f795e', transparent: true, opacity: .2, depthWrite: false });
      geometry.userData.transient = material.userData.transient = true;
      this.generatedGeometries.add(geometry); this.generatedMaterials.add(material);
      this.overlay.add(new THREE.LineSegments(geometry, material));
    }
  }
  update(next: IslandSceneState) {
    if (this.disposed) return;
    const previousSelected = this.state?.selectedId;
    this.state = next;
    const key = JSON.stringify([next.model.factories, next.model.sites, next.model.ownedLand, next.hideRivals, this.kitLoaded]);
    if (key !== this.modelKey) { this.modelKey = key; this.rebuildBuildings(next.model); }
    const routesKey = JSON.stringify([next.model.routes, this.kitLoaded]);
    if (routesKey !== this.routesKey) { this.routesKey = routesKey; this.rebuildRoutes(next.model.routes); }
    const colorsKey = JSON.stringify([[...next.colors], next.economicLayer, next.grid, next.model.ownedLand]);
    if (colorsKey !== this.coloredKey) { this.coloredKey = colorsKey; this.rebuildOverlay(); }
    this.placeOutline(this.selection, next.selectedId);
    this.placeOutline(this.reference, next.referenceId && next.referenceId !== next.selectedId ? next.referenceId : null);
    if (!this.initialized && next.model.cells.length) {
      this.initialized = true;
      const initialCell = next.selectedId ?? next.model.factories.find(factory => factory.mine)?.cellId;
      if (initialCell) this.focus(initialCell); else this.fit();
    } else if (next.selectedId && next.selectedId !== previousSelected) {
      const cell = next.model.cells.find(cell => cell.id === next.selectedId);
      const projected = cell && worldPoint(cell).project(this.camera);
      if (projected && (Math.abs(projected.x) > .85 || Math.abs(projected.y) > .8)) this.focus(next.selectedId);
    }
    this.needsRender = true;
  }
  private placeOutline(line: THREE.LineLoop, id: string | null) {
    const cell = id && this.state?.model.cells.find(cell => cell.id === id);
    line.visible = Boolean(cell); if (cell) line.position.copy(worldPoint(cell));
  }
  private inspect(id: string | null) {
    if (id === this.hovered && (id !== null || !this.inspection.visible)) return;
    if (id === null) { this.clearInspection(); return; }
    this.hovered = id; this.placeOutline(this.inspection, id); this.callbacks.inspect(id); this.needsRender = true;
  }
  /** Placement can draw an outline without setting hovered; always clear both inspection channels. */
  clearInspection() {
    this.hovered = null; this.ghostKey = '';
    this.placeOutline(this.inspection, null); this.callbacks.inspect(null); this.needsRender = true;
  }
  hit(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(visibleIslandPickMeshes(this.pickMeshes), false);
    return hits.find(hit => typeof hit.object.userData.cellId === 'string')?.object.userData.cellId ?? null;
  }
  preview(cellId: string | null, activityKey: string | null) {
    const key = `${cellId}:${activityKey}:${this.kitLoaded}`;
    const cell = this.state?.model.cells.find(cell => cell.id === cellId);
    if (!cell || !activityKey) {
      this.clearGroup(this.ghost); this.clearInspection(); return;
    }
    if (key === this.ghostKey) return;
    this.ghostKey = key; this.clearGroup(this.ghost);
    this.placeOutline(this.inspection, null); this.needsRender = true;
    let assetName: string | null = null;
    if (activityKey.startsWith('launch:')) assetName = `factory_${activityKey.slice(7)}`;
    if (activityKey.startsWith('product:')) {
      const factory = this.state?.model.factories.find(factory => factory.id === activityKey.slice(8) && factory.mine);
      if (factory) assetName = `factory_${factory.sectorId}`;
    }
    if (activityKey.startsWith('supply:')) assetName = `site_${activityKey.split(':').at(-1)}`;
    if (!assetName) return;
    const object = this.asset(assetName);
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = new THREE.MeshStandardMaterial({ color: '#8bbda0', transparent: true, opacity: .5, depthWrite: false });
      material.userData.transient = true;
      this.generatedMaterials.add(material); child.material = material; child.castShadow = false;
    });
    object.position.copy(worldPoint(cell, .08)); this.ghost.add(object);
    this.placeOutline(this.inspection, cell.id); this.needsRender = true;
  }
  private setCamera(target: THREE.Vector3, span: number, zoom = 1) {
    this.viewSpan = span;
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(Math.sin(this.rotation) * 23, 23, Math.cos(this.rotation) * 23));
    this.camera.zoom = zoom; this.controls.update(); this.resize(); this.needsRender = true;
  }
  /** Keyboard navigation shifts the map without changing the user's viewing scale. */
  panTo(cellId: string) {
    const cell = this.state?.model.cells.find(cell => cell.id === cellId);
    if (cell) this.setCamera(worldPoint(cell), this.viewSpan, this.camera.zoom);
  }
  focus(cellId: string | null) {
    const cell = cellId && this.state?.model.cells.find(cell => cell.id === cellId);
    if (cell) this.setCamera(worldPoint(cell), this.width < 500 ? 5.5 : 6.5);
  }
  fit() { this.setCamera(new THREE.Vector3(0, 0, .3), this.width < this.height ? 28 : 22); }
  zoom(direction: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (direction > 0 ? 1.28 : 1 / 1.28), .55, 5);
    this.camera.updateProjectionMatrix(); this.needsRender = true;
  }
  rotate() { this.rotation += Math.PI / 2; this.setCamera(this.controls.target.clone(), this.viewSpan, this.camera.zoom); }
  private resize() {
    if (this.disposed) return;
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    this.camera.left = -this.viewSpan * aspect / 2; this.camera.right = this.viewSpan * aspect / 2;
    this.camera.top = this.viewSpan / 2; this.camera.bottom = -this.viewSpan / 2;
    this.camera.updateProjectionMatrix(); this.needsRender = true;
  }
  private moveActors(actors: Actor[], seconds: number, pedestrians = false) {
    for (const actor of actors) {
      let progress = (seconds * actor.speed + actor.phase) % 1;
      if (pedestrians) progress = progress < .5 ? progress * 2 : (1 - progress) * 2;
      const at = pointAlongRoute(actor.route.points, progress); if (!at) continue;
      const y = actor.route.kind === 'boat' ? -.29 : actor.route.kind === 'digital' ? .52 : .07;
      actor.object.position.copy(worldPoint(at.point, y)); actor.object.rotation.y = at.angle;
      if (pedestrians && (seconds * actor.speed + actor.phase) % 1 > .5) actor.object.rotation.y += Math.PI;
    }
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (this.contextLost || !this.inView || document.hidden) { this.lastTime = 0; return; }
    const delta = this.lastTime ? Math.min(.08, (now - this.lastTime) / 1000) : 0; this.lastTime = now;
    const moving = this.state && !this.state.frozen;
    if (moving) this.clock += delta;
    if (moving || this.needsRender) {
      this.moveActors(this.actors, this.clock); this.moveActors(this.pedestrians, this.clock, true); this.moveActors(this.ambient, this.clock);
      for (let i = 0; i < this.waveLines.length; i++) this.waveLines[i].position.x = Math.sin(this.clock * .17 + i) * .09;
      // Vehicles move continuously; DOM labels only need layout after a camera/content change.
      if (this.needsRender) this.positionLabels();
      this.renderer.render(this.scene, this.camera); this.needsRender = false;
    }
  };
  private positionLabels() {
    this.camera.updateMatrixWorld(true);
    const obstacles: LabelRect[] = [];
    const stage = this.canvas.parentElement;
    if (stage) {
      const bounds = stage.getBoundingClientRect();
      for (const control of stage.querySelectorAll<HTMLElement>('.iso-camera-tools, .iso-map-title, .iso-scene-tools, .iso-map-hint, .iso-asset-status, .iso-placement')) {
        const rect = control.getBoundingClientRect();
        obstacles.push({ x: rect.left - bounds.left - 4, y: rect.top - bounds.top - 4, width: rect.width + 8, height: rect.height + 8 });
      }
    }
    const cell = this.state?.model.cells.find(cell => cell.id === this.state?.selectedId);
    if (cell) {
      const p = worldPoint(cell, .92).project(this.camera), x = (p.x * .5 + .5) * this.width, y = (-p.y * .5 + .5) * this.height;
      this.label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      const visible = p.z < 1 && x > 8 && x < this.width - 8 && y > 24 && y < this.height - 12;
      this.label.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) obstacles.push({ x: x - this.label.offsetWidth / 2 - 4, y: y - this.label.offsetHeight - 4,
        width: this.label.offsetWidth + 8, height: this.label.offsetHeight + 8 });
    } else this.label.style.visibility = 'hidden';
    const labels = Object.values(CITIES).flatMap(city => {
      const element = this.cityLabels?.querySelector<HTMLElement>(`[data-iso-city="${city.id}"]`);
      if (!element) return [];
      const p = worldPoint(city, .24).project(this.camera);
      const x = (p.x * .5 + .5) * this.width, y = (-p.y * .5 + .5) * this.height;
      return [{ element, x, y, z: p.z, sales: element.dataset.isoSales === 'true', width: element.offsetWidth, height: element.offsetHeight }];
    }).sort((a, b) => Number(b.sales) - Number(a.sales)
      || Math.hypot(a.x - this.width / 2, a.y - this.height / 2) - Math.hypot(b.x - this.width / 2, b.y - this.height / 2));
    let shown = 0;
    for (const item of labels) {
      const eligible = item.z < 1 && shown < (this.width < 500 ? 1 : 5)
        && (item.sales || this.viewSpan / this.camera.zoom > 10);
      const rect = eligible ? placeIslandLabel(item, item, { width: this.width, height: this.height }, obstacles) : null;
      item.element.style.visibility = rect ? 'visible' : 'hidden';
      if (rect) {
        item.element.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
        obstacles.push({ x: rect.x - 3, y: rect.y - 3, width: rect.width + 6, height: rect.height + 6 });
        shown++;
      }
    }
  }
  private clearGroup(group: THREE.Group) {
    group.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      if (object.geometry.userData.transient) { object.geometry.dispose(); this.generatedGeometries.delete(object.geometry); }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.userData.transient) { material.dispose(); this.generatedMaterials.delete(material); }
      }
    });
    group.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.visibility?.disconnect();
    for (const [target, name, listener] of this.events) target.removeEventListener(name, listener);
    this.controls.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      // WebGLRenderer.dispose does not own this shadow render target.
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    for (const geometry of this.generatedGeometries) geometry.dispose();
    for (const material of this.generatedMaterials) material.dispose();
    for (const texture of this.generatedTextures) texture.dispose();
    // React StrictMode immediately remounts on this same canvas. Releasing GPU resources is sufficient;
    // forceContextLoss would also invalidate the replacement renderer's shared browser context.
    this.pickMeshes = []; this.scene.clear(); this.templates.clear(); this.renderer.dispose();
  }
}

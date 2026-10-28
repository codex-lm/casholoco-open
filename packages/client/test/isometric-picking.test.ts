import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGame, getPlayerView } from '@muchomoney/core';
import { IslandScene, type IslandSceneState } from '../src/screens/game/city/isometric/islandScene';
import { buildIslandModel } from '../src/screens/game/city/isometric/isometricModel';
import { islandPickMeshes, visibleIslandPickMeshes } from '../src/screens/game/city/isometric/picking';

// Build the real island and load its actual GLB in Node; only the browser/GPU shell is replaced.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = {};
    setPixelRatio() {} setSize() {} dispose() {}
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return { OrbitControls: class {
    target = new Vector3();
    constructor(private camera: THREE.Camera) {}
    addEventListener() {} dispose() {}
    update() { this.camera.lookAt(this.target); }
  } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', async importOriginal => {
  const actual = await importOriginal<typeof import('three/addons/loaders/GLTFLoader.js')>();
  return { ...actual, GLTFLoader: class extends actual.GLTFLoader {
    override loadAsync() {
      const bytes = readFileSync(new URL('../public/isometric/library.glb', import.meta.url));
      return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    }
  } };
});

interface SceneProbe {
  scene: THREE.Scene;
  dynamic: THREE.Group;
  pickables: THREE.Group;
  pickMeshes: THREE.Mesh[];
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  inspection: THREE.LineLoop;
  ghost: THREE.Group;
  hovered: string | null;
  needsRender: boolean;
  inspect(id: string | null): void;
}
const probe = (scene: IslandScene) => scene as unknown as SceneProbe;
const allMeshes = (...roots: THREE.Object3D[]) => roots.flatMap(root => {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
});
const game = createGame({ seed: 44, totalTurns: 8, turnSeconds: 0, startYear: 2027,
  mapMode: 'square', terrainAssignment: 'fair', industryRules: 'network' }, [
  { id: 'me', name: 'Ada', isBot: false, companyName: 'Manufacture', sectorId: 'yogurts', connected: true, color: '#b07b51' },
  { id: 'rival', name: 'Ben', isBot: false, companyName: 'Ateliers', sectorId: 'gadgets', connected: true, color: '#617c85' },
]);
const view = getPlayerView(game, 'me');
const own = view.companies.find(company => company.controllerId === 'me')!.products[0];
own.capacity = 150; own.capacityLimit = 200;
const model = buildIslandModel(view);
let runtime: IslandScene;
let inspect: ReturnType<typeof vi.fn>;
let state: IslandSceneState;
let initialMeshes: THREE.Mesh[];

beforeEach(async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', undefined);
  const rect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
  const canvas = Object.assign(new EventTarget(), { getBoundingClientRect: rect,
    parentElement: { getBoundingClientRect: rect } }) as unknown as HTMLCanvasElement;
  const assets = vi.fn(); inspect = vi.fn();
  runtime = new IslandScene(canvas, { style: {} } as HTMLElement,
    { selected: vi.fn(), inspect, doubleClick: vi.fn(), assets, lost: vi.fn() });
  state = { model, selectedId: own.hexId!, referenceId: null, colors: new Map(), economicLayer: false,
    frozen: true, grid: true, hideRivals: false };
  runtime.update(state);
  initialMeshes = [...probe(runtime).pickMeshes];
  await vi.waitFor(() => expect(assets).toHaveBeenCalledWith('ready'));
  probe(runtime).scene.updateMatrixWorld(true);
  probe(runtime).camera.updateMatrixWorld(true);
});
afterEach(() => { runtime?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('island hit surfaces on the built Blender scene', () => {
  it('never raycasts scenery or ambient people and vehicles', () => {
    const meshes = allMeshes(probe(runtime).pickables, probe(runtime).dynamic);
    const scenery = meshes.filter(mesh => typeof mesh.userData.cellId !== 'string');
    expect(scenery.some(mesh => mesh instanceof THREE.InstancedMesh && mesh.count > 100)).toBe(true);
    const calls = scenery.map(mesh => vi.spyOn(mesh, 'raycast'));
    runtime.hit(400, 300);
    expect(calls.reduce((sum, call) => sum + call.mock.calls.length, 0)).toBe(0);
    const candidates = visibleIslandPickMeshes(probe(runtime).pickMeshes);
    expect(candidates.length).toBeLessThan(meshes.length);
    expect(candidates.every(mesh => typeof mesh.userData.cellId === 'string')).toBe(true);
    expect(candidates.some(mesh => mesh instanceof THREE.InstancedMesh)).toBe(false);
  });

  it('does not raycast hidden rival meshes, while retaining their parcel surface', () => {
    runtime.update({ ...state, hideRivals: true });
    const hidden = allMeshes(probe(runtime).dynamic).filter(mesh => !mesh.visible);
    expect(hidden.length).toBeGreaterThan(0);
    const calls = hidden.map(mesh => vi.spyOn(mesh, 'raycast'));
    const parcels = allMeshes(probe(runtime).pickables);
    expect(parcels.length).toBe(model.cells.length);
    expect(parcels.every(mesh => mesh.visible && (mesh.material as THREE.Material).opacity === 0)).toBe(true);
    runtime.hit(400, 300);
    expect(calls.reduce((sum, call) => sum + call.mock.calls.length, 0)).toBe(0);
  });

  it('keeps the old nearest tagged hit across rotations and view scales', () => {
    const world = probe(runtime);
    let matchedParcels = 0;
    for (let turn = 0; turn < 4; turn++) {
      if (turn === 0) runtime.fit();
      else runtime.rotate();
      if (turn === 2) runtime.zoom(1);
      world.scene.updateMatrixWorld(true); world.camera.updateMatrixWorld(true);
      for (const x of [160, 320, 400, 480, 640]) for (const y of [120, 240, 300, 360, 480]) {
        const selected = runtime.hit(x, y);
        const previous = world.raycaster.intersectObjects([world.pickables, world.dynamic], true)
          .find(hit => typeof hit.object.userData.cellId === 'string')?.object.userData.cellId ?? null;
        expect(selected).toBe(previous);
        if (selected) matchedParcels++;
      }
    }
    expect(matchedParcels).toBeGreaterThan(30);
  });

  it('retains detailed extensions and subsidiaries, and replaces candidates on a model rebuild', () => {
    const world = probe(runtime);
    expect(world.pickMeshes.every(mesh => !initialMeshes.includes(mesh))).toBe(true);
    const extension = world.dynamic.getObjectByName('asset_extension_tanks');
    expect(extension).toBeDefined();
    expect(allMeshes(extension!).every(mesh => world.pickMeshes.includes(mesh))).toBe(true);
    for (const site of model.sites.filter(site => site.cellId)) {
      expect(world.pickMeshes.some(mesh => mesh.userData.cellId === site.cellId && mesh.parent !== world.pickables)).toBe(true);
    }
    const oldMeshes = [...world.pickMeshes];
    const staleCalls = oldMeshes.map(mesh => vi.spyOn(mesh, 'raycast'));
    const vacant = model.cells.find(cell => !model.ownedLand.some(land => land.cellId === cell.id)
      && !model.factories.some(factory => factory.cellId === cell.id) && !cell.deposit)!;
    runtime.update({ ...state, model: { ...model, ownedLand: [...model.ownedLand,
      { cellId: vacant.id, companyId: 'new-owner', companyName: 'New owner', color: '#bb9955', vacant: true }] } });
    expect(world.pickMeshes.every(mesh => !oldMeshes.includes(mesh))).toBe(true);
    expect(world.pickMeshes.some(mesh => mesh.userData.cellId === vacant.id && mesh.parent !== world.pickables)).toBe(true);
    world.scene.updateMatrixWorld(true);
    runtime.hit(400, 300);
    expect(staleCalls.reduce((sum, call) => sum + call.mock.calls.length, 0)).toBe(0);
    expect(world.pickMeshes).toEqual(islandPickMeshes([world.pickables, world.dynamic]));
  });
});

describe('island inspection after a placement preview', () => {
  it('clears the outline after preview(null, null), even when no cell was hovered', () => {
    expect(probe(runtime).hovered).toBeNull();
    runtime.preview(own.hexId!, 'launch:gadgets');
    expect(probe(runtime).inspection.visible).toBe(true);
    expect(probe(runtime).ghost.children.length).toBeGreaterThan(0);
    runtime.preview(null, null);
    expect(probe(runtime).inspection.visible).toBe(false);
    expect(probe(runtime).ghost.children).toHaveLength(0);
    expect(inspect).toHaveBeenLastCalledWith(null);
  });

  it('forces Three and the callback to clear, then permits the same hover and preview again', () => {
    const world = probe(runtime);
    runtime.preview(own.hexId!, 'launch:gadgets');
    world.needsRender = false;
    runtime.clearInspection();
    expect(world.inspection.visible).toBe(false);
    expect(world.needsRender).toBe(true);
    expect(inspect).toHaveBeenLastCalledWith(null);
    runtime.preview(own.hexId!, 'launch:gadgets');
    expect(world.inspection.visible).toBe(true);
    runtime.preview(null, null);
    runtime.preview(null, null);
    expect(world.inspection.visible).toBe(false);
    world.inspect(own.hexId!);
    expect(world.inspection.visible).toBe(true);
    runtime.clearInspection();
    expect(world.hovered).toBeNull();
    world.inspect(own.hexId!);
    expect(inspect).toHaveBeenLastCalledWith(own.hexId);
    expect(world.inspection.visible).toBe(true);
  });

  it('leaves an already empty hover idle, but clears a preview outline on pointer exit', () => {
    const world = probe(runtime);
    world.needsRender = false;
    world.inspect(null);
    expect(inspect).not.toHaveBeenCalled();
    expect(world.needsRender).toBe(false);
    runtime.preview(own.hexId!, 'launch:gadgets');
    expect(world.hovered).toBeNull();
    world.inspect(null);
    expect(world.inspection.visible).toBe(false);
    expect(inspect).toHaveBeenCalledExactlyOnceWith(null);
    world.needsRender = false;
    world.inspect(null);
    expect(world.needsRender).toBe(false);
    expect(inspect).toHaveBeenCalledTimes(1);
  });
});

describe('ordered interactive mesh filtering', () => {
  it('respects ancestor and material visibility, retaining intentional transparent parcel surfaces', () => {
    const parcel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    parcel.userData.cellId = 'parcel';
    const nested = new THREE.Group(), hidden = parcel.clone(), disabled = parcel.clone();
    hidden.material = new THREE.MeshBasicMaterial();
    disabled.material = new THREE.MeshBasicMaterial({ visible: false });
    hidden.userData.cellId = 'hidden'; disabled.userData.cellId = 'disabled';
    nested.add(hidden); nested.visible = false;
    const root = new THREE.Group(); root.add(parcel, nested, disabled, new THREE.Mesh());
    const candidates = islandPickMeshes([root]);
    expect(candidates).toEqual([parcel, hidden, disabled]);
    expect(visibleIslandPickMeshes(candidates)).toEqual([parcel]);
    nested.visible = true;
    expect(visibleIslandPickMeshes(candidates)).toEqual([parcel, hidden]);
    root.visible = false;
    expect(visibleIslandPickMeshes(candidates)).toEqual([]);
  });

  it('preserves transformed geometry, closest depth and stable equal-distance tie order', () => {
    const root = new THREE.Group(); root.position.set(4, 2, -3); root.rotation.y = .3;
    const material = new THREE.MeshBasicMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
    const parcel = new THREE.Mesh(geometry, material); parcel.userData.cellId = 'parcel';
    const front = new THREE.Mesh(geometry, material); front.position.z = 2; front.userData.cellId = 'front';
    const duplicate = front.clone(); duplicate.userData.cellId = 'same-depth';
    const nested = new THREE.Group(); nested.add(front, duplicate); root.add(parcel, nested);
    root.updateMatrixWorld(true);
    const origin = root.localToWorld(new THREE.Vector3(0, 0, 5));
    const direction = root.localToWorld(new THREE.Vector3()).sub(origin).normalize();
    const raycaster = new THREE.Raycaster(origin, direction);
    const candidates = islandPickMeshes([root]);
    const matrices = candidates.map(mesh => mesh.matrixWorld.clone());
    const legacy = raycaster.intersectObjects([root], true);
    const actual = raycaster.intersectObjects(visibleIslandPickMeshes(candidates), false);
    expect(actual.map(hit => [hit.object.userData.cellId, hit.distance, hit.point])).toEqual(
      legacy.map(hit => [hit.object.userData.cellId, hit.distance, hit.point]));
    expect(actual[0].object).toBe(front);
    expect(candidates.map(mesh => mesh.matrixWorld)).toEqual(matrices);
    expect(front.parent).toBe(nested);
  });
});

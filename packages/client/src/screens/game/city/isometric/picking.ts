import { Mesh, type Object3D } from 'three';

/** Keep the original depth-first order so equal-distance hits retain Three's existing tie order. */
export function islandPickMeshes(roots: readonly Object3D[]): Mesh[] {
  const meshes: Mesh[] = [];
  for (const root of roots) root.traverse(object => {
    if (object instanceof Mesh && typeof object.userData.cellId === 'string') meshes.push(object);
  });
  return meshes;
}

/** Raycaster ignores Object3D.visible. Zero-opacity parcel surfaces remain deliberately clickable. */
export function visibleIslandPickMeshes(meshes: readonly Mesh[]): Mesh[] {
  return meshes.filter(mesh => {
    for (let object: Object3D | null = mesh; object; object = object.parent) if (!object.visible) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(material => material.visible);
  });
}

import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const templates = new WeakMap();

// Batch static armor pieces per joint/material once, preserving every animated
// joint and the hand hierarchy. All pool clones share these prepared geometries.
export function clonePooledModel(scene, animations) {
  let template = templates.get(scene);
  if (!template) {
    template = cloneSkeleton(scene);
    const animated = new Set();
    for (const clip of animations) for (const track of clip.tracks) {
      animated.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName);
    }
    const parents = [];
    template.traverse(node => { if (node.children.length > 1) parents.push(node); });
    for (const parent of parents) {
      const batches = new Map();
      for (const child of parent.children) {
        if (!child.isMesh || child.isSkinnedMesh || child.children.length || animated.has(child.name)
          || Array.isArray(child.material) || Object.keys(child.geometry.morphAttributes).length) continue;
        const attributes = Object.keys(child.geometry.attributes).sort().join(',');
        const key = `${child.material.uuid}:${attributes}:${!!child.geometry.index}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(child);
      }
      for (const meshes of batches.values()) {
        if (meshes.length < 2) continue;
        const pieces = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
        const geometry = mergeGeometries(pieces, false);
        pieces.forEach(piece => piece.dispose());
        if (!geometry) continue;
        const merged = new THREE.Mesh(geometry, meshes[0].material);
        merged.name = `${parent.name}_batchedArmor`;
        meshes.forEach(mesh => parent.remove(mesh));
        parent.add(merged);
      }
    }
    template.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    templates.set(scene, template);
  }
  return cloneSkeleton(template);
}
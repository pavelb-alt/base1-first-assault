import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TANK } from '@/game/config';

// Visual-only model: local +Z matches the entity's heading/muzzle convention.
// Hundreds of fittings are baked once into eight shared material batches, not
// hundreds of scene nodes. No additional physics, lights, textures or frame work.
const lighter = (color, amount) => new THREE.Color(color).lerp(new THREE.Color('#b5b29a'), amount);
const materials = {
  hull: new THREE.MeshStandardMaterial({ color: TANK.hullColor, roughness: 0.48, metalness: 0.32 }),
  armor: new THREE.MeshStandardMaterial({ color: lighter(TANK.turretColor, 0.18), roughness: 0.42, metalness: 0.38 }),
  rubber: new THREE.MeshStandardMaterial({ color: TANK.trackColor, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: lighter(TANK.barrelColor, 0.27), roughness: 0.35, metalness: 0.72 }),
  dark: new THREE.MeshStandardMaterial({ color: TANK.barrelColor, roughness: 0.52, metalness: 0.46 }),
  accent: new THREE.MeshStandardMaterial({ color: TANK.accentColor, emissive: '#ff6a00', emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.38 }),
  marking: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ff7a1a', emissiveIntensity: 0.35, roughness: 0.55 }),
  lens: new THREE.MeshStandardMaterial({ color: '#86f7ff', emissive: '#20dff2', emissiveIntensity: 1.8, roughness: 0.18, metalness: 0.2 }),
};

function buildTank() {
  const batches = Object.fromEntries(['hull','turret','gun'].flatMap(part => Object.keys(materials).map(k => [`${part}:${k}`, []])));
  let part = 'hull';
  const transform = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const translation = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();
  function add(kind, geometry, p, r = [0, 0, 0]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    rotation.setFromEuler(euler.set(...r));
    transform.compose(translation.set(...p), rotation, scale);
    g.applyMatrix4(transform);
    batches[`${part}:${kind}`].push(g);
  }
  const box = (kind, size, p, r) => add(kind, new THREE.BoxGeometry(...size), p, r);
  const cylinder = (kind, radius, length, p, r, segments = 12) =>
    add(kind, new THREE.CylinderGeometry(radius, radius, length, segments), p, r);
  const ring = (kind, radius, tube, p, r) =>
    add(kind, new THREE.TorusGeometry(radius, tube, 4, 16), p, r);
  // Beveled plate: shape is in X/Z, extruded along Y. Crisp chamfered corners.
  function plate(kind, width, depth, height, bevel, p) {
    const w = width / 2, d = depth / 2, s = new THREE.Shape();
    s.moveTo(-w + bevel, -d); s.lineTo(w - bevel, -d);
    s.lineTo(w, -d + bevel); s.lineTo(w, d - bevel);
    s.lineTo(w - bevel, d); s.lineTo(-w + bevel, d);
    s.lineTo(-w, d - bevel); s.lineTo(-w, -d + bevel); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true,
      bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, steps: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, -height / 2, 0);
    add(kind, g, p);
  }

  // Low armored tub, layered deck, angled frontal glacis and rear engine deck.
  plate('dark', 2.24, 3.35, 0.36, 0.24, [0, 0.32, 0]);
  plate('hull', 2.5, 3.5, 0.46, 0.28, [0, 0.55, 0]);
  box('armor', [2.12, 0.16, 0.76], [0, 0.73, 1.3], [0.28, 0, 0]);
  box('dark', [1.62, 0.05, 0.62], [0, 0.8, -1.25]);
  for (let i = 0; i < 9; i++) {
    box('steel', [1.5, 0.035, 0.035], [0, 0.84, -1.51 + i * 0.066]);
  }

  // Exposed road wheels, drive hubs and individual continuous-track shoes.
  for (const side of [-1, 1]) {
    box('rubber', [0.43, 0.48, 3.34], [side * 1.3, 0.29, 0]);
    for (let wheel = 0; wheel < 7; wheel++) {
      const z = -1.48 + wheel * 0.493;
      cylinder('rubber', 0.245, 0.46, [side * 1.3, 0.29, z], [0, 0, Math.PI / 2]);
      cylinder('armor', 0.19, 0.03, [side * 1.548, 0.29, z], [0, 0, Math.PI / 2]);
      cylinder('steel', 0.074, 0.045, [side * 1.57, 0.29, z], [0, 0, Math.PI / 2], 8);
      for (let b = 0; b < 5; b++) {
        const a = b * Math.PI * 2 / 5;
        cylinder('dark', 0.018, 0.016, [side * 1.57, 0.29 + Math.cos(a) * 0.128, z + Math.sin(a) * 0.128], [0, 0, Math.PI / 2], 6);
      }
    }
    for (let shoe = 0; shoe < 19; shoe++) {
      const z = -1.52 + shoe * 3.04 / 18;
      for (const y of [0.012, 0.568]) {
        box('steel', [0.51, 0.052, 0.115], [side * 1.3, y, z]);
        box('rubber', [0.28, 0.064, 0.075], [side * 1.3, y, z]);
      }
    }
    for (const end of [-1, 1]) for (let shoe = 0; shoe < 7; shoe++) {
      const a = -Math.PI / 2 + shoe * Math.PI / 6;
      box('steel', [0.51, 0.052, 0.12], [side * 1.3, 0.29 + Math.sin(a) * 0.28, end * (1.52 + Math.cos(a) * 0.28)], [end * (Math.PI / 2 - a), 0, 0]);
    }
    // Segmented skirt leaves the running gear visible below it.
    box('hull', [0.6, 0.08, 3.6], [side * 1.27, 0.67, 0]);
    for (let panel = 0; panel < 5; panel++) {
      const z = -1.36 + panel * 0.68;
      box('armor', [0.08, 0.27, 0.6], [side * 1.58, 0.56, z]);
      for (const dz of [-0.23, 0.23]) cylinder('steel', 0.027, 0.028, [side * 1.63, 0.63, z + dz], [0, 0, Math.PI / 2], 6);
    }
    box('accent', [0.018, 0.18, 0.48], [side * 1.628, 0.55, 0]);
    // Protected headlights, tow shackles and rear exhausts.
    box('dark', [0.26, 0.19, 0.16], [side * 0.94, 0.73, 1.64]);
    box('lens', [0.18, 0.085, 0.018], [side * 0.94, 0.74, 1.73]);
    ring('steel', 0.095, 0.027, [side * 0.77, 0.4, 1.77]);
    cylinder('steel', 0.105, 0.4, [side * 0.96, 0.57, -1.65], [Math.PI / 2, 0, 0]);
    cylinder('dark', 0.078, 0.015, [side * 0.96, 0.57, -1.86], [Math.PI / 2, 0, 0]);
  }

  part = 'turret';
  // Turret bearing, faceted turret, cheek armor, mantlet and sleeved cannon.
  cylinder('dark', 0.81, 0.12, [0, 0.82, 0]);
  cylinder('steel', 0.73, 0.055, [0, 0.895, 0]);
  plate('hull', 1.8, 1.94, 0.44, 0.32, [0, 1.09, 0]);
  plate('armor', 1.61, 1.68, 0.08, 0.27, [0, 1.35, 0]);
  for (const side of [-1, 1]) {
    box('armor', [0.48, 0.31, 0.69], [side * 0.62, 1.13, 0.67], [0.08, side * 0.18, 0]);
    box('accent', [0.022, 0.15, 0.44], [side * 0.922, 1.14, -0.05]);
    // Twin cream identification bars on the turret sides.
    for (const z of [-0.46, -0.34]) box('marking', [0.024, 0.18, 0.043], [side * 0.923, 1.15, z]);
    box('dark', [0.28, 0.26, 0.64], [side * 0.82, 1.02, -0.57]);
    box('armor', [0.3, 0.05, 0.66], [side * 0.82, 1.175, -0.57]);
    // Three smoke-launcher tubes per cheek.
    for (let i = 0; i < 3; i++) {
      cylinder('steel', 0.047, 0.22, [side * (0.94 + i * 0.045), 1.17, 0.5 - i * 0.16], [0.6, 0, side * 0.5], 8);
    }
  }
  part = 'gun';
  box('dark', [0.66, 0.38, 0.26], [0, 1.06, 0.94]);
  cylinder('steel', 0.21, 0.43, [0, 1.06, 1.08], [Math.PI / 2, 0, 0]);
  cylinder('armor', 0.135, 0.74, [0, 1.06, 1.59], [Math.PI / 2, 0, 0]);
  cylinder('steel', 0.09, 0.87, [0, 1.06, 2.26], [Math.PI / 2, 0, 0]);
  for (const z of [1.32, 1.84, 2.56]) cylinder('dark', 0.148, 0.08, [0, 1.06, z], [Math.PI / 2, 0, 0]);
  box('steel', [0.28, 0.24, 0.3], [0, 1.06, 2.7]);
  box('dark', [0.16, 0.12, 0.012], [0, 1.06, 2.855]);
  for (const side of [-1, 1]) for (const z of [2.63, 2.75]) box('dark', [0.012, 0.12, 0.055], [side * 0.145, 1.06, z]);

  part = 'turret';
  // Commander's cupola, hatch handle, periscopes, sensor and whip aerial.
  cylinder('dark', 0.33, 0.1, [-0.35, 1.44, -0.25]);
  cylinder('armor', 0.28, 0.08, [-0.35, 1.52, -0.25]);
  box('steel', [0.18, 0.035, 0.035], [-0.35, 1.595, -0.25]);
  for (const x of [-0.43, -0.27]) box('steel', [0.03, 0.05, 0.035], [x, 1.57, -0.25]);
  for (const x of [-0.52, -0.33, -0.14]) {
    box('dark', [0.14, 0.09, 0.1], [x, 1.44, 0.13]);
    box('lens', [0.095, 0.045, 0.014], [x, 1.46, 0.187]);
  }
  box('dark', [0.25, 0.2, 0.24], [0.47, 1.48, 0.38]);
  box('lens', [0.15, 0.1, 0.015], [0.47, 1.49, 0.51]);
  cylinder('dark', 0.085, 0.14, [0.63, 1.46, -0.58]);
  cylinder('steel', 0.015, 0.81, [0.63, 1.92, -0.58], [0, 0, -0.07], 6);
  box('accent', [0.035, 0.09, 0.035], [0.66, 2.3, -0.58]);
  // Rear stowage box with straps and a spare tread shoe on the glacis.
  box('dark', [1.08, 0.25, 0.28], [0, 1.13, -1.06]);
  box('hull', [1.12, 0.06, 0.31], [0, 1.28, -1.06]);
  for (const x of [-0.38, 0.38]) box('steel', [0.055, 0.28, 0.3], [x, 1.15, -1.06]);
  part = 'hull';
  for (const x of [-0.26, 0, 0.26]) box('steel', [0.19, 0.05, 0.28], [x, 0.85, 1.25], [0.28, 0, 0]);

  return Object.entries(batches).filter(([,parts]) => parts.length).map(([key, parts]) => {
    const [part, kind] = key.split(':');
    const geometry = mergeGeometries(parts, false);
    parts.forEach(g => g.dispose());
    if (part === 'gun') geometry.translate(0,-1.06,-0.94);
    geometry.computeBoundingSphere();
    return { part, kind, geometry, material: materials[kind] };
  });
}
const tankMeshes = buildTank();
const explosionGeometry = new THREE.SphereGeometry(1, 8, 8);

const Parts = ({part}) => tankMeshes.filter(m => m.part === part).map(({kind,geometry,material}) => <mesh key={kind} name={`Tank-${part}-${kind}`} geometry={geometry} material={material} castShadow receiveShadow />);
export function TankVisual({ explosionRef, explosionMatRef, turretRef, barrelRef }) {
  return (
    <group name="DetailedTank" dispose={null}>
      <Parts part="hull" />
      <group ref={turretRef}>
        <Parts part="turret" />
        <group ref={barrelRef} position={[0,1.06,0.94]}><Parts part="gun" /></group>
      </group>
      <mesh ref={explosionRef} geometry={explosionGeometry} material={explosionMatRef} visible={false} />
    </group>
  );
}
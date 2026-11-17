import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, CircleGeometry,
  CylinderGeometry, Matrix4, PlaneGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** A complete, portable V-twin compressor. +Z is its service/label side; Y is up. */
export const dims = { width: 4.12, height: 2.62, depth: 1.38, tankRadius: 0.53, tankY: 0.84 } as const;
export type PartFinish = "paint" | "metal" | "rubber" | "dark" | "brass" | "red" | "cream";
type Point = readonly [number, number, number];
const finishes: readonly PartFinish[] = ["paint", "metal", "rubber", "dark", "brass", "red", "cream"];

/** Static repeated details are merged by finish: one draw call per material, no model download. */
export function buildCompressorGeometry() {
  const buckets = Object.fromEntries(finishes.map((finish) => [finish, []])) as unknown as Record<PartFinish, BufferGeometry[]>;
  const put = (finish: PartFinish, geometry: BufferGeometry, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], parent?: Matrix4) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    if (parent) geometry.applyMatrix4(parent);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    buckets[finish].push(part);
  };
  const box = (finish: PartFinish, size: Point, position: Point, radius = 0.025, parent?: Matrix4) =>
    put(finish, new RoundedBoxGeometry(...size, 2, radius), position, [0, 0, 0], parent);
  const cylinder = (finish: PartFinish, radius: number, length: number, position: Point, rotation: Point = [Math.PI / 2, 0, 0], segments = 24, parent?: Matrix4) =>
    put(finish, new CylinderGeometry(radius, radius, length, segments), position, rotation, parent);
  const tube = (finish: PartFinish, points: Point[], radius = 0.025, segments = 24) =>
    put(finish, new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), segments, radius, 8, false));

  // Rolled pressure vessel, shallow welded end seams and four rubber wheels.
  put("paint", new CapsuleGeometry(dims.tankRadius, 2.62, 10, 40), [0, dims.tankY, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1.27, 1.27]) {
    put("paint", new TorusGeometry(0.529, 0.009, 6, 48), [x, dims.tankY, 0], [0, Math.PI / 2, 0]);
    box("paint", [0.28, 0.33, 1.04], [x, 0.38, 0], 0.035);
    for (const z of [-0.5, 0.5]) {
      cylinder("rubber", 0.235, 0.145, [x, 0.235, z], undefined, 32);
      cylinder("metal", 0.102, 0.155, [x, 0.235, z], undefined, 24);
      cylinder("paint", 0.067, 0.165, [x, 0.235, z]);
      cylinder("metal", 0.027, 0.18, [x, 0.235, z], undefined, 6);
    }
  }
  for (const sign of [-1, 1]) {
    tube("paint", [[sign * 1.55, 1.17, -0.3], [sign * 1.95, 1.27, -0.3], [sign * 2.02, 1.3, 0], [sign * 1.95, 1.27, 0.3], [sign * 1.55, 1.17, 0.3]], 0.031);
  }
  box("paint", [3.05, 0.105, 0.86], [0, 1.385, -0.02], 0.035);
  // Mounting bolts, with actual hexagonal heads.
  for (const x of [-1.2, -0.3, 0.65, 1.27]) for (const z of [-0.29, 0.29]) cylinder("metal", 0.036, 0.04, [x, 1.46, z], [0, 0, 0], 6);

  // Cast crankcase and the two inclined, finned cylinder banks.
  const pumpX = -0.58;
  cylinder("paint", 0.345, 0.46, [pumpX, 1.74, 0.045], undefined, 36);
  put("paint", new SphereGeometry(0.31, 24, 12), [pumpX, 1.75, 0.19]);
  box("paint", [0.82, 0.15, 0.5], [pumpX, 1.51, 0.04], 0.035);
  for (const sign of [-1, 1]) {
    const bank = new Matrix4().makeRotationZ(sign * 0.56).setPosition(pumpX, 1.8, -0.01);
    cylinder("paint", 0.17, 0.53, [0, 0.28, 0], [0, 0, 0], 24, bank);
    for (let fin = 0; fin < 8; fin++) box("paint", [0.44, 0.026, 0.405], [0, 0.15 + fin * 0.053, 0], 0.009, bank);
    box("paint", [0.455, 0.12, 0.42], [0, 0.6, 0], 0.028, bank);
    for (const x of [-0.145, 0.145]) for (const z of [-0.13, 0.13]) cylinder("metal", 0.027, 0.035, [x, 0.675, z], [0, 0, 0], 6, bank);
    cylinder("dark", 0.063, 0.18, [0, 0.57, 0.27], undefined, 16, bank);
    cylinder("rubber", 0.195, 0.105, [0, 0.57, 0.385], undefined, 32, bank);
    put("dark", new TorusGeometry(0.174, 0.012, 6, 32), [0, 0.57, 0.442], [0, 0, 0], bank);
    cylinder("metal", 0.023, 0.012, [0, 0.57, 0.447], undefined, 12, bank);
  }
  cylinder("red", 0.062, 0.035, [pumpX, 2.085, 0.22], [0, 0, 0]);
  cylinder("brass", 0.045, 0.025, [pumpX, 1.62, 0.48]);

  // Silver electric motor, its cooling ribs, terminal box and ventilated end bell.
  const motorX = 0.92, motorY = 1.78;
  cylinder("metal", 0.315, 0.69, [motorX, motorY, -0.015], undefined, 36);
  for (let rib = 0; rib < 16; rib++) {
    const a = rib / 16 * Math.PI * 2;
    put("metal", new BoxGeometry(0.028, 0.044, 0.57), [motorX + Math.sin(a) * 0.324, motorY + Math.cos(a) * 0.324, -0.035], [0, 0, -a]);
  }
  cylinder("metal", 0.296, 0.115, [motorX, motorY, 0.375], undefined, 36);
  cylinder("dark", 0.251, 0.012, [motorX, motorY, 0.437], undefined, 32);
  for (let wire = -4; wire <= 4; wire++) {
    const offset = wire * 0.046;
    const extent = Math.sqrt(0.244 ** 2 - offset ** 2);
    box("metal", [extent * 2, 0.012, 0.014], [motorX, motorY + offset, 0.449], 0.002);
    box("metal", [0.012, extent * 2, 0.014], [motorX + offset, motorY, 0.45], 0.002);
  }
  cylinder("metal", 0.069, 0.022, [motorX, motorY, 0.46]);
  box("metal", [0.38, 0.16, 0.43], [motorX, 2.12, -0.08], 0.045);
  for (const x of [motorX - 0.23, motorX + 0.23]) box("metal", [0.12, 0.16, 0.6], [x, 1.51, -0.04], 0.018);

  // Belt/flywheel enclosure behind the pump. A light lattice replaces a costly fine mesh.
  tube("paint", [[-1.38, 1.57, -0.3], [-1.38, 2.22, -0.3], [-1.12, 2.36, -0.3], [1.1, 2.36, -0.3], [1.42, 2.14, -0.3], [1.42, 1.6, -0.3], [-1.38, 1.57, -0.3]], 0.035, 48);
  for (let i = 0; i < 20; i++) {
    const x = -1.22 + i * 0.13;
    tube("paint", [[x, 1.64, -0.325], [Math.min(x + 0.28, 1.37), 2.29, -0.325]], 0.008, 1);
    tube("paint", [[x, 2.29, -0.324], [Math.min(x + 0.28, 1.37), 1.64, -0.324]], 0.008, 1);
  }
  // A glimpse of the dark drive belt and pulley at the guard's lower edge.
  cylinder("dark", 0.31, 0.055, [pumpX, 1.79, -0.29], undefined, 32);
  put("rubber", new TorusGeometry(0.29, 0.022, 6, 32), [pumpX, 1.79, -0.255]);

  // Pressure switch, copper discharge line, pressure gauge and front service valves.
  box("cream", [0.235, 0.29, 0.215], [0.33, 1.62, 0.31], 0.018);
  box("dark", [0.1, 0.08, 0.13], [0.33, 1.45, 0.31], 0.01);
  tube("brass", [[-0.98, 2.15, -0.02], [-1.18, 2.11, 0.13], [-1.16, 1.48, 0.27], [-0.9, 1.43, 0.31]], 0.019);
  tube("rubber", [[1.02, 1.52, 0.32], [1.32, 1.29, 0.43], [1.19, 1.08, 0.5], [0.42, 1.18, 0.48], [0.33, 1.53, 0.35]], 0.019);
  cylinder("paint", 0.07, 0.22, [-1.29, 1.45, 0.35], [0, 0, 0]);
  cylinder("metal", 0.19, 0.07, [-1.29, 1.65, 0.385], [Math.PI / 2, 0, 0], 40);
  cylinder("dark", 0.169, 0.008, [-1.29, 1.65, 0.426], undefined, 36);
  for (const x of [-1.48, -1.1]) {
    cylinder("brass", 0.043, 0.16, [x, 1.36, 0.55]);
    cylinder("brass", 0.048, 0.115, [x, 1.36, 0.65], undefined, 6);
    box("red", [0.19, 0.022, 0.042], [x, 1.43, 0.55], 0.008);
  }
  cylinder("brass", 0.033, 0.12, [-1.61, 1.45, 0.27], [0, 0, 0]);
  put("brass", new SphereGeometry(0.042, 12, 8), [-1.61, 1.52, 0.27]);

  const merged = Object.fromEntries(finishes.map((finish) => {
    const geometry = mergeGeometries(buckets[finish], false)!;
    buckets[finish].forEach((part) => part.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return [finish, geometry];
  })) as Record<PartFinish, BufferGeometry>;
  // Separate textured surfaces share the same material-reveal uniforms as the body.
  const badge = new PlaneGeometry(1.36, 0.39, 1, 12);
  const positions = badge.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const angle = positions.getY(i) / dims.tankRadius;
    positions.setY(i, dims.tankY + Math.sin(angle) * (dims.tankRadius + 0.004));
    positions.setZ(i, Math.cos(angle) * (dims.tankRadius + 0.004));
  }
  badge.computeVertexNormals();
  const dial = new CircleGeometry(0.16, 40);
  dial.translate(-1.29, 1.65, 0.435);
  return { ...merged, badge, dial };
}
export type CompressorGeometry = ReturnType<typeof buildCompressorGeometry>;
export function disposeCompressorGeometry(parts: CompressorGeometry) { Object.values(parts).forEach((part) => part.dispose()); }

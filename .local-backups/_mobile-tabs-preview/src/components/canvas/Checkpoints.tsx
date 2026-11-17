"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { MeshBasicMaterial, Quaternion, Raycaster, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector3, type Group, type InstancedMesh, type Mesh, type Object3D } from "three";
import { palette, stage } from "@/config/experience";
import { dims } from "./compressorGeometry";
import type { ScanFrame, ScanPhase } from "./scanTimeline";

const finStep = (dims.fins.to - dims.fins.from) / (dims.fins.count - 1);
const finFront = dims.fins.size / 2 + 0.01;

/** Heights and alternating offsets identify the five inspection stations. */
export const checkpointPositions = [
  [-0.3, dims.fins.from, finFront],
  [0.28, dims.fins.from + finStep * 3, finFront],
  [-0.26, dims.fins.from + finStep * 7, finFront],
  [0.24, dims.fins.to, finFront],
  [0, dims.valve.y - 0.015, dims.valve.radius + 0.078],
] as const;

/** The radial boundary of a rounded slab. */
function slabRadius(x: number, z: number, size: number, radius: number) {
  const half = size / 2;
  const corner = half - radius;
  const flat = half / Math.max(Math.abs(x), Math.abs(z));
  if (Math.min(Math.abs(x * flat), Math.abs(z * flat)) <= corner) return flat;
  const projectedCorner = corner * (Math.abs(x) + Math.abs(z));
  return projectedCorner + Math.sqrt(projectedCorner ** 2 - 2 * corner ** 2 + radius ** 2);
}

/** Keep stations on the camera-near physical surface at their original scan heights. */
export function checkpointAnchor(index: number, cameraAzimuth: number, offset?: number, target: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const [x, y, z] = checkpointPositions[index];
  const angle = cameraAzimuth + (offset ?? Math.atan2(x, z));
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  // The top station is still within the head plate's Y range, outside the valve.
  const surface = index === 4 ? dims.head : dims.fins;
  const radius = slabRadius(dx, dz, surface.size, surface.radius) + 0.025;
  target[0] = dx * radius;
  target[1] = y;
  target[2] = dz * radius;
  return target;
}

/** Choose nearby clear surface locations without moving marks in front of the scene. */
export function checkpointOffset(index: number, occluded: (offset: number) => boolean, previous?: number): number {
  const [x, , z] = checkpointPositions[index];
  const nominal = Math.atan2(x, z);
  const candidates = [previous ?? nominal, nominal, nominal + 0.18, nominal - 0.18, 0, nominal + 0.36, nominal - 0.36, -0.7, 0.7, -0.95, 0.95];
  return candidates.find((offset) => !occluded(offset)) ?? nominal;
}

/** Only accessories beyond the body can occlude these exterior stations. */
export function checkpointAccessories(model: Object3D): Mesh[] {
  const accessories: Mesh[] = [];
  const body = dims.base.size / 2 + 0.01;
  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const instanced = mesh as InstancedMesh;
    if (instanced.isInstancedMesh) instanced.computeBoundingBox();
    else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = instanced.isInstancedMesh ? instanced.boundingBox : mesh.geometry.boundingBox;
    if (bounds && (bounds.min.x < -body || bounds.max.x > body || bounds.min.z < -body || bounds.max.z > body)) accessories.push(mesh);
  });
  return accessories;
}

type CheckpointTone = "dim" | "active" | "pass" | "fail";
export type CheckpointSample = { tone: CheckpointTone; checkProgress: number };

/** Geometry and authentication share one sequence; no timers survive a phase change. */
export function sampleCheckpoint(index: number, scanY: number, phaseElapsed: number, phase: ScanPhase, still: boolean): CheckpointSample {
  if (phase === "locked") return { tone: "dim", checkProgress: 0 };
  const time = Number.isFinite(phaseElapsed) ? Math.max(0, phaseElapsed) : 0;

  if (phase === "error") {
    // One quiet flash on the middle point; reduced motion keeps all five at rest.
    return { tone: !still && index === 2 && time < stage.interaction.errorFlashSeconds ? "fail" : "dim", checkProgress: 0 };
  }
  if (phase === "success") {
    const progress = still ? 1 : Math.max(0, Math.min(1,
      (time - index * stage.interaction.checkpointStepSeconds) / stage.interaction.checkpointRevealSeconds,
    ));
    return { tone: progress > 0 ? "pass" : "active", checkProgress: progress * progress * (3 - 2 * progress) };
  }

  return { tone: scanY >= checkpointPositions[index][1] ? "active" : "dim", checkProgress: 0 };
}

function createCheckpointResources() {
  const check = new Shape();
  check.moveTo(-0.032, 0.001);
  check.lineTo(-0.024, 0.009);
  check.lineTo(-0.01, -0.005);
  check.lineTo(0.024, 0.03);
  check.lineTo(0.032, 0.022);
  check.lineTo(-0.01, -0.021);
  check.closePath();

  const material = (color: string, opacity: number) => new MeshBasicMaterial({
    color, opacity, transparent: true, depthWrite: false, toneMapped: false,
  });
  return {
    ring: new TorusGeometry(0.048, 0.003, 6, 28),
    dot: new SphereGeometry(0.012, 10, 8),
    check: new ShapeGeometry(check),
    materials: {
      dim: material(palette.ti400, 0.35),
      active: material(palette.ember400, 0.9),
      pass: material(palette.pass, 0.95),
      fail: material(palette.fail, 0.95),
    },
  };
}

/** Five inspection marks rotate with the cylinder; their symbols are geometry, not text. */
export function Checkpoints({ frameRef, phase, still }: {
  frameRef: RefObject<ScanFrame>;
  phase: ScanPhase;
  still: boolean;
}) {
  const resources = useMemo(() => createCheckpointResources(), []);
  const root = useRef<Group>(null);
  const stations = useRef<(Group | null)[]>([]);
  const rings = useRef<(Mesh | null)[]>([]);
  const dots = useRef<(Mesh | null)[]>([]);
  const checks = useRef<(Mesh | null)[]>([]);
  const vectors = useMemo(() => ({
    camera: new Vector3(), forward: new Vector3(), origin: new Vector3(), direction: new Vector3(), world: new Vector3(),
    inverse: new Quaternion(), facing: new Quaternion(),
  }), []);
  const visibilityRef = useRef({
    model: null as Object3D | null,
    accessories: [] as Mesh[],
    offsets: checkpointPositions.map(([x, , z]) => Math.atan2(x, z)),
    azimuth: NaN, elevation: NaN, distance: NaN, width: 0, height: 0,
    anchor: [0, 0, 0] as [number, number, number],
    ray: new Raycaster(), point: new Vector3(), direction: new Vector3(),
  });

  useEffect(() => () => {
    resources.ring.dispose();
    resources.dot.dispose();
    resources.check.dispose();
    Object.values(resources.materials).forEach((material) => material.dispose());
  }, [resources]);

  useFrame(({ camera, size }) => {
    const visibility = visibilityRef.current;
    const group = root.current;
    if (!group) return;
    // ModelInteraction rotates at priority -0.5; follow its current transform.
    group.updateWorldMatrix(true, false);
    camera.getWorldPosition(vectors.camera);
    camera.getWorldDirection(vectors.forward);
    group.getWorldPosition(vectors.origin);
    group.getWorldQuaternion(vectors.inverse).invert();
    vectors.direction.copy(vectors.camera).sub(vectors.origin).applyQuaternion(vectors.inverse);
    const azimuth = Math.atan2(vectors.direction.x, vectors.direction.z);
    const elevation = Math.atan2(vectors.direction.y, Math.hypot(vectors.direction.x, vectors.direction.z));
    const distance = vectors.direction.length();
    vectors.facing.copy(vectors.inverse).multiply(camera.quaternion);
    const focalPixels = size.height * camera.projectionMatrix.elements[5] / 2;
    const model = group.parent?.getObjectByName("compressor-model") ?? null;
    const changed = model !== visibility.model || !Number.isFinite(visibility.azimuth)
      || Math.abs(Math.atan2(Math.sin(azimuth - visibility.azimuth), Math.cos(azimuth - visibility.azimuth))) > 0.04
      || Math.abs(elevation - visibility.elevation) > 0.04 || Math.abs(distance - visibility.distance) > 0.15
      || size.width !== visibility.width || size.height !== visibility.height;
    if (model && changed) {
      model.updateWorldMatrix(true, true);
      if (model !== visibility.model) visibility.accessories = checkpointAccessories(model);
      visibility.model = model;
      checkpointPositions.forEach((_, index) => {
        visibility.offsets[index] = checkpointOffset(index, (offset) => {
          const anchor = checkpointAnchor(index, azimuth, offset, visibility.anchor);
          visibility.point.set(anchor[0], anchor[1], anchor[2]).applyMatrix4(group.matrixWorld);
          visibility.direction.copy(visibility.point).sub(vectors.camera);
          const targetDistance = visibility.direction.length();
          visibility.ray.set(vectors.camera, visibility.direction.normalize());
          visibility.ray.far = targetDistance - 0.003;
          return visibility.ray.intersectObjects(visibility.accessories, false).length > 0;
        }, visibility.offsets[index]);
      });
      visibility.azimuth = azimuth;
      visibility.elevation = elevation;
      visibility.distance = distance;
      visibility.width = size.width;
      visibility.height = size.height;
    }
    const { scanY, phaseElapsed = 0 } = frameRef.current;
    checkpointPositions.forEach((_, index) => {
      const station = stations.current[index];
      if (station) {
        const anchor = checkpointAnchor(index, azimuth, visibility.offsets[index], visibility.anchor);
        station.position.set(anchor[0], anchor[1], anchor[2]);
        station.quaternion.copy(vectors.facing);
        vectors.world.copy(station.position).applyMatrix4(group.matrixWorld).sub(vectors.camera);
        const depth = Math.max(0.1, vectors.world.dot(vectors.forward));
        // A readable ~9 CSS px on phones, without enlarging desktop badges.
        station.scale.setScalar(Math.max(1, Math.min(2.6, 9 * depth / (0.096 * focalPixels))));
      }
      const { tone, checkProgress } = sampleCheckpoint(index, scanY, phaseElapsed, phase, still);
      const ring = rings.current[index];
      const dot = dots.current[index];
      const check = checks.current[index];
      const material = resources.materials[tone];
      if (ring) ring.material = material;
      if (dot) {
        dot.material = material;
        dot.visible = checkProgress < 1;
        dot.scale.setScalar(1 - checkProgress);
      }
      if (check) {
        check.visible = checkProgress > 0;
        check.scale.setScalar(checkProgress);
      }
    });
  }, -0.25);

  return (
    <group ref={root} name="inspection-checkpoints" dispose={null}>
      {checkpointPositions.map((position, index) => (
        <group key={index} ref={(node) => { stations.current[index] = node; }} position={position}>
          <mesh ref={(node) => { rings.current[index] = node; }} geometry={resources.ring} material={resources.materials.dim} />
          <mesh ref={(node) => { dots.current[index] = node; }} geometry={resources.dot} material={resources.materials.dim} />
          <mesh ref={(node) => { checks.current[index] = node; }} geometry={resources.check} material={resources.materials.pass} position-z={0.008} visible={false} />
        </group>
      ))}
    </group>
  );
}

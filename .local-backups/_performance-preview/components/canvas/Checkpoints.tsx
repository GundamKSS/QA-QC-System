"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, MeshBasicMaterial, Quaternion, Raycaster, RingGeometry, Shape, ShapeGeometry, SphereGeometry, Vector3, type Group, type Mesh } from "three";
import { palette } from "@/lib/config/experience";
import type { ScanFrame, ScanPhase } from "./scanTimeline";
import { checkpointPositions, sampleCheckpoint, sampleSignalWave, sampleSignalStrength, type CheckpointTone } from "./checkpointPulse";

export { checkpointPositions, sampleCheckpoint } from "./checkpointPulse";

function createResources() {
  const check = new Shape();
  check.moveTo(-0.03, 0); check.lineTo(-0.022, 0.009);check.lineTo(-0.007, -0.006);
  check.lineTo(0.025, 0.028);check.lineTo(0.033, 0.02);check.lineTo(-0.007, -0.022);check.closePath();
  const material = (color: string, opacity: number) => new MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, toneMapped: false });
  const tones: Record<CheckpointTone, MeshBasicMaterial> = {
    dim: material(palette.ti400, 0.3), active: material(palette.ember500, 0.95),
    pass: material(palette.pass, 0.95), fail: material(palette.fail, 0.95),
  };
  return {
    ring: new RingGeometry(0.047, 0.053, 36), dot: new SphereGeometry(0.016, 10, 8), check: new ShapeGeometry(check), tones,
    active: checkpointPositions.map(() => material(palette.ember500, 0.95)),
    halo: new RingGeometry(0, 0.067, 36), haloMaterial: material(palette.ember500, 0.13),
    waves: checkpointPositions.map(() => [material(palette.ember500, 0), material(palette.ember500, 0)].map((wave) => {wave.blending = AdditiveBlending; return wave;})),
  };
}

/** Markers stay on their actual component and billboard to the camera; depth hides their far side. */
export function Checkpoints({ frameRef, phase, still, hotspots, enabled }: { frameRef: RefObject<ScanFrame>; phase: ScanPhase; still: boolean; hotspots: RefObject<(HTMLButtonElement | null)[]>; enabled: boolean }) {
  const resources = useMemo(() => createResources(), []);
  const root = useRef<Group>(null);
  const stations = useRef<(Group | null)[]>([]), rings = useRef<(Mesh | null)[]>([]), dots = useRef<(Mesh | null)[]>([]), checks = useRef<(Mesh | null)[]>([]);
  const halos = useRef<(Mesh | null)[]>([]);
  const waves = useRef<(Mesh | null)[][]>(checkpointPositions.map(() => []));
  const elapsed = useRef(0);
  const raycaster = useMemo(() => new Raycaster(), []);
  const occlusion = useRef({ elapsed: 1, hidden: [false, false, false] });
  const vectors = useMemo(() => ({ inverse: new Quaternion(), facing: new Quaternion(), camera: new Vector3(), world: new Vector3(), forward: new Vector3(), projected: new Vector3(), direction: new Vector3() }), []);
  useEffect(() => () => {
    resources.ring.dispose();resources.dot.dispose();resources.check.dispose();resources.halo.dispose();resources.haloMaterial.dispose();
    Object.values(resources.tones).forEach((material) => material.dispose());
    resources.active.forEach((material) => material.dispose());
    resources.waves.flat().forEach((material) => material.dispose());
  }, [resources]);
  useFrame(({ camera, size, scene }, delta) => {
    const group = root.current;
    if (!group) return;
    group.visible = enabled;
    if (!enabled) {hotspots.current.forEach((button) => {if (button) button.style.visibility = "hidden";});return;}
    occlusion.current.elapsed += delta;
    const checkOcclusion = still || occlusion.current.elapsed > 0.12;
    if (checkOcclusion) occlusion.current.elapsed = 0;
    const body = scene.getObjectByName("compressor-model");
    if (!still) elapsed.current += Math.min(Math.max(delta, 0), 0.05);
    group.updateWorldMatrix(true, false);
    group.getWorldQuaternion(vectors.inverse).invert();vectors.facing.copy(vectors.inverse).multiply(camera.quaternion);
    camera.getWorldPosition(vectors.camera);camera.getWorldDirection(vectors.forward);
    const focal = size.height * camera.projectionMatrix.elements[5] / 2;
    const frame = frameRef.current;
    checkpointPositions.forEach((_, index) => {
      const station = stations.current[index];
      if (station) {
        station.quaternion.copy(vectors.facing);
        vectors.world.copy(station.position).applyMatrix4(group.matrixWorld).sub(vectors.camera);
        const depth = Math.max(0.1, vectors.world.dot(vectors.forward));
        station.scale.setScalar(Math.max(1, Math.min(3, 12 * depth / (0.096 * focal))));
        const button = hotspots.current[index];
        if (button) {
          station.getWorldPosition(vectors.world);
          if (checkOcclusion && body) {
            vectors.direction.copy(vectors.world).sub(vectors.camera);
            raycaster.far = Math.max(0, vectors.direction.length() - 0.04);
            raycaster.set(vectors.camera, vectors.direction.normalize());
            occlusion.current.hidden[index] = raycaster.intersectObject(body, true).length > 0;
          }
          vectors.projected.copy(vectors.world).project(camera);
          const x = (vectors.projected.x + 1) * size.width / 2;
          const y = (1 - vectors.projected.y) * size.height / 2;
          button.style.transform = `translate3d(${x - 22}px,${y - 22}px,0)`;
          const visible = !occlusion.current.hidden[index] && Math.abs(vectors.projected.x) < 0.98 && Math.abs(vectors.projected.y) < 0.98 && vectors.projected.z > -1 && vectors.projected.z < 1;
          button.style.visibility = visible ? "visible" : "hidden";
        }
      }
      const sample = sampleCheckpoint(index, frame.scanY, frame.phaseElapsed ?? 0, frame.introProgress < 1 ? "reveal" : phase, still);
      const material = sample.tone === "active" ? resources.active[index] : resources.tones[sample.tone];
      if (sample.tone === "active") material.opacity = sampleSignalStrength(elapsed.current, index, still);
      const ring = rings.current[index], dot = dots.current[index], check = checks.current[index];
      if (ring) ring.material = material;
      if (halos.current[index]) halos.current[index]!.visible = sample.tone === "active";
      if (dot) {dot.material = material;dot.visible = sample.checkProgress === 0;}
      if (check) {check.material = material;check.visible = sample.checkProgress > 0;check.scale.setScalar(sample.checkProgress);}
      for (let wave = 0; wave < 2; wave++) {
        const mesh = waves.current[index][wave];
        const signal = sampleSignalWave(elapsed.current, index, wave, sample.tone === "active" && frame.introProgress >= 1 && phase !== "submitting", still);
        if (mesh) {mesh.scale.setScalar(signal.scale);mesh.visible = signal.opacity > 0.001;}
        resources.waves[index][wave].opacity = signal.opacity;
      }
    });
  });
  return <group ref={root} name="inspection-checkpoints">
    {checkpointPositions.map((position, index) => <group key={index} ref={(node) => {stations.current[index] = node;}} position={position} name={`inspection-station-${index}`}>
      <mesh ref={(node) => {halos.current[index] = node;}} geometry={resources.halo} material={resources.haloMaterial} position-z={-0.002} />
      <mesh name={`inspection-ring-${index}`} ref={(node) => {rings.current[index] = node;}} geometry={resources.ring} material={resources.tones.active} />
      <mesh name={`inspection-dot-${index}`} ref={(node) => {dots.current[index] = node;}} geometry={resources.dot} material={resources.tones.active} />
      <mesh ref={(node) => {checks.current[index] = node;}} geometry={resources.check} material={resources.tones.pass} visible={false} />
      {[0, 1].map((wave) => <mesh key={wave} ref={(node) => {waves.current[index][wave] = node;}} name={`inspection-signal-${index}-${wave}`} geometry={resources.ring} material={resources.waves[index][wave]} visible={false} />)}
    </group>)}
  </group>;
}

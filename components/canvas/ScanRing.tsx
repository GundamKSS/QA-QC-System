"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, DoubleSide, Quaternion, RingGeometry, Shape, ShapeGeometry, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { palette, stage } from "@/lib/config/experience";
import type { ScanFrame, ScanPhase } from "./scanTimeline";
import { advanceScanOrbit, focusOrbitEnvelope, scanOrbitActive } from "./scanOrbit";

/** The scan plane becomes a face-on green seal during the existing success hold. */
export function ScanRing({ inspecting, blueprintRef, frameRef, phase, still, typing, inputFocused }: { inspecting: boolean; blueprintRef: RefObject<number>; frameRef: RefObject<ScanFrame>; phase: ScanPhase; still: boolean; typing: boolean; inputFocused: boolean }) {
  const group = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const tickRef = useRef<Mesh>(null);
  const tickMaterialRef = useRef<MeshBasicMaterial>(null);
  const orbitRef = useRef<Group>(null);
  const orbitMaterialRef = useRef<MeshBasicMaterial>(null);
  const headMaterialRef = useRef<MeshBasicMaterial>(null);
  const orbitAmountRef = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const color = phase === "success" ? palette.pass : palette.ember500;
  const orientation = useMemo(() => ({ yaw: new Quaternion(), up: new Vector3(0, 1, 0) }), []);
  const flat = useMemo(() => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), []);
  const geometry = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-0.62, 0.02);
    shape.lineTo(-0.42, 0.2);
    shape.lineTo(-0.12, -0.12);
    shape.lineTo(0.53, 0.58);
    shape.lineTo(0.73, 0.4);
    shape.lineTo(-0.12, -0.5);
    shape.closePath();
    return {
      tick: new ShapeGeometry(shape),
      // An asymmetric arc makes rotation visible; a full torus alone looks stationary.
      orbit: new RingGeometry(stage.scan.ringRadius - 0.014, stage.scan.ringRadius + 0.014, 64, 1, -Math.PI * 0.42, Math.PI * 0.42),
    };
  }, []);
  useEffect(() => () => { geometry.tick.dispose(); geometry.orbit.dispose(); }, [geometry]);
  useEffect(() => { invalidate(); }, [phase, still, typing, inputFocused, invalidate]);

  useFrame(({ camera, scene }, delta) => {
    const sample = frameRef.current;
    const success = phase === "success";
    const time = sample.phaseElapsed ?? 0;
    const raw = Math.max(0, Math.min(1, (time - stage.interaction.sealStartSeconds) / (stage.interaction.sealEndSeconds - stage.interaction.sealStartSeconds)));
    const seal = success ? still ? 1 : raw * raw * (3 - 2 * raw) : 0;
    const orbitActive = stage.scan.focusOrbitEnabled && scanOrbitActive(phase, inputFocused);
    const damping = still ? 1 : 1 - Math.exp(-4 * Math.min(delta, 0.05));
    orbitAmountRef.current += ((orbitActive ? 1 : 0) - orbitAmountRef.current) * damping;
    if (group.current) {
      group.current.visible = !inspecting;
      group.current.position.y = success ? sample.scanY * (1 - seal) + stage.camera.target[1] * seal : sample.scanY;
      // The elliptical orbit turns with the horizontal tank, including drag and idle yaw.
      const yaw = scene.getObjectByName("compressor-interaction")?.rotation.y ?? 0;
      orientation.yaw.setFromAxisAngle(orientation.up, yaw);
      group.current.quaternion.copy(orientation.yaw).multiply(flat).slerp(camera.quaternion, seal);
      const shrink = 1 - 0.3 * seal;
      const focus = orbitAmountRef.current * (1 - seal);
      const widthScale = 1 + (focusOrbitEnvelope.radiusX / stage.scan.ringRadius - 1) * focus;
      const depthScale = 0.52 + (focusOrbitEnvelope.radiusZ / stage.scan.ringRadius - 0.52) * focus;
      group.current.scale.set(shrink * widthScale, shrink * (depthScale + (1 - depthScale) * seal), shrink);
    }
    const ringOpacity = sample.ringOpacity * (1 - blueprintRef.current);
    if (core.current) core.current.opacity = success ? (1 - seal) * 0.8 : ringOpacity;
    if (glow.current) glow.current.opacity = (success ? (1 - seal) * 0.8 : ringOpacity) * 0.13;
    if (tickRef.current) { tickRef.current.visible = success; tickRef.current.scale.setScalar(0.75 + seal * 0.25); }
    if (tickMaterialRef.current) tickMaterialRef.current.opacity = seal;
    if (orbitRef.current) {
      orbitRef.current.visible = phase !== "success" && phase !== "locked" && orbitAmountRef.current > 0.001;
      orbitRef.current.rotation.z = advanceScanOrbit(orbitRef.current.rotation.z, delta, orbitActive && !still);
    }
    const orbitOpacity = orbitAmountRef.current * (typing ? 0.95 : 0.8);
    if (orbitMaterialRef.current) orbitMaterialRef.current.opacity = orbitOpacity;
    if (headMaterialRef.current) headMaterialRef.current.opacity = orbitOpacity;
  }, -0.25);

  return (
    // Draw translucent laser surfaces after the machine has populated the depth buffer.
    // Depth testing then hides the rear arc instead of blending it over painted parts.
    <group ref={group} name="inspection-laser" rotation-x={-Math.PI / 2} renderOrder={1}>
      <mesh>
        <torusGeometry args={[stage.scan.ringRadius, 0.008, 8, 128]} />
        <meshBasicMaterial ref={core} color={color} transparent depthTest depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={orbitRef} name="inspection-focus-orbit" visible={false} renderOrder={1}>
        <mesh geometry={geometry.orbit}>
          <meshBasicMaterial ref={orbitMaterialRef} color={palette.ember400} transparent opacity={0} side={DoubleSide} depthTest depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh name="inspection-focus-head" position={[stage.scan.ringRadius, 0, 0]}>
          <sphereGeometry args={[0.026, 12, 8]} />
          <meshBasicMaterial ref={headMaterialRef} color={palette.ember400} transparent opacity={0} depthTest depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={tickRef} name="inspection-success-seal" geometry={geometry.tick} visible={false} renderOrder={20}>
        <meshBasicMaterial ref={tickMaterialRef} color={palette.pass} transparent opacity={0} side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[stage.scan.ringRadius, 0.045, 8, 96]} />
        <meshBasicMaterial ref={glow} color={color} transparent opacity={0.13} depthTest depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}

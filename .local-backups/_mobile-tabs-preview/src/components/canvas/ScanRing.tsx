"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AdditiveBlending, DoubleSide, Quaternion, RingGeometry, Shape, ShapeGeometry, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { palette, stage } from "@/config/experience";
import type { ScanFrame, ScanPhase } from "./scanTimeline";

/** The scan plane becomes a face-on green seal during the existing success hold. */
export function ScanRing({ frameRef, phase, still, typing }: { frameRef: RefObject<ScanFrame>; phase: ScanPhase; still: boolean; typing: boolean }) {
  const group = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const tickRef = useRef<Mesh>(null);
  const tickMaterialRef = useRef<MeshBasicMaterial>(null);
  const pressureRef = useRef<Mesh>(null);
  const pressureAmountRef = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const color = phase === "success" ? palette.pass : palette.ember500;
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
    return { tick: new ShapeGeometry(shape), pressure: new RingGeometry(stage.scan.ringRadius - 0.007, stage.scan.ringRadius + 0.007, 128) };
  }, []);
  useEffect(() => () => { geometry.tick.dispose(); geometry.pressure.dispose(); }, [geometry]);
  useEffect(() => { invalidate(); }, [phase, still, typing, invalidate]);

  useFrame(({ camera }, delta) => {
    const sample = frameRef.current;
    const success = phase === "success";
    const time = sample.phaseElapsed ?? 0;
    const raw = Math.max(0, Math.min(1, (time - stage.interaction.sealStartSeconds) / (stage.interaction.sealEndSeconds - stage.interaction.sealStartSeconds)));
    const seal = success ? still ? 1 : raw * raw * (3 - 2 * raw) : 0;
    const filling = typing && phase === "focus";
    if (group.current) {
      group.current.position.y = success ? sample.scanY * (1 - seal) + stage.camera.target[1] * seal : sample.scanY;
      group.current.quaternion.copy(flat).slerp(camera.quaternion, seal);
      group.current.scale.setScalar(1 - 0.3 * seal);
    }
    if (core.current) core.current.opacity = success ? (1 - seal) * 0.8 : filling ? 0 : sample.ringOpacity;
    if (glow.current) glow.current.opacity = (success ? (1 - seal) * 0.8 : sample.ringOpacity) * (filling ? 0.04 : 0.13);
    if (tickRef.current) { tickRef.current.visible = success; tickRef.current.scale.setScalar(0.75 + seal * 0.25); }
    if (tickMaterialRef.current) tickMaterialRef.current.opacity = seal;
    const damping = still ? 1 : 1 - Math.exp(-4 * Math.min(delta, 0.05));
    pressureAmountRef.current += ((filling ? 1 : 0) - pressureAmountRef.current) * damping;
    if (pressureRef.current) {
      pressureRef.current.visible = filling && !success;
      const count = geometry.pressure.index?.count ?? 0;
      geometry.pressure.setDrawRange(0, Math.floor(count * pressureAmountRef.current / 6) * 6);
    }
  }, -1);

  return (
    <group ref={group} name="inspection-laser" rotation-x={-Math.PI / 2}>
      <mesh>
        <torusGeometry args={[stage.scan.ringRadius, 0.008, 8, 128]} />
        <meshBasicMaterial ref={core} color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={pressureRef} name="inspection-pressure" geometry={geometry.pressure} visible={false}>
        <meshBasicMaterial color={palette.ember400} transparent opacity={0.75} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={tickRef} name="inspection-success-seal" geometry={geometry.tick} visible={false} renderOrder={20}>
        <meshBasicMaterial ref={tickMaterialRef} color={palette.pass} transparent opacity={0} side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[stage.scan.ringRadius, 0.045, 8, 96]} />
        <meshBasicMaterial ref={glow} color={color} transparent opacity={0.13} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}

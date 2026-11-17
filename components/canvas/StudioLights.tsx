"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { stage } from "@/lib/config/experience";

const AIM: [number, number, number] = [0, 1.1, 0];

/**
 * A studio built from light panels (docs/07 §2.4): no HDRI download. Rendered into the
 * environment map once (frames = 1); metal takes all its light and reflections from it,
 * so the panels are large — most of what polished metal shows is its surroundings.
 */
export function StudioLights() {
  const { key, top, strips, fill, wall, rim } = stage.lights;
  return (
    <Environment resolution={256} frames={1}>
      {/* Long softbox overhead, slightly to the camera's left. */}
      <Lightformer
        form="rect"
        color={key.color}
        intensity={key.intensity}
        position={[-1, 6, 1.5]}
        scale={[9, 3, 1]}
        target={AIM}
      />
      {/* Above and behind: the fin tops and the head's top face mirror this. */}
      <Lightformer
        form="rect"
        color={top.color}
        intensity={top.intensity}
        position={[-3, 5, -4.5]}
        scale={[10, 4, 1]}
        target={AIM}
      />
      {/* Tall strips either side: the long vertical highlights on the barrel and fin edges. */}
      <Lightformer
        form="rect"
        color={strips.color}
        intensity={strips.intensity}
        position={[-5, 1.8, 2.5]}
        scale={[1.4, 9, 1]}
        target={AIM}
      />
      <Lightformer
        form="rect"
        color={strips.color}
        intensity={strips.intensity * 0.55}
        position={[5, 1.8, 1.5]}
        scale={[0.9, 9, 1]}
        target={AIM}
      />
      {/* Large dim panel behind the camera. */}
      <Lightformer
        form="rect"
        color={fill.color}
        intensity={fill.intensity}
        position={[6, 3, 7]}
        scale={[12, 6, 1]}
        target={AIM}
      />
      {/* Faint backdrop wall. */}
      <Lightformer form="rect" color={wall.color} intensity={wall.intensity} position={[0, 2, -9]} scale={[24, 8, 1]} />
      {/* Warm ember rim from behind-right. */}
      <Lightformer
        form="rect"
        color={rim.color}
        intensity={rim.intensity}
        position={[4, 1.6, -5]}
        scale={[3.5, 1.2, 1]}
        target={AIM}
      />
    </Environment>
  );
}

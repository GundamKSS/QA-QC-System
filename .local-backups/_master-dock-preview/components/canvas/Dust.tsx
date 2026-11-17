"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, type Points } from "three";
import { stage } from "@/lib/config/experience";

/** Deterministic pseudo-random so motes land in the same places every render. */
function seeded(seed: number) {
  let value = seed;
  return () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/**
 * Slow dust motes catching the light (docs/07 §3). One draw call; positions wrap inside a box
 * in the vertex shader, so there is no per-frame CPU work. Still (reduced motion) = frozen.
 */
export function Dust({ still, count = stage.quality.high.dust }: { still: boolean; count?: number }) {
  const points = useRef<Points>(null);
  const { geometry, material } = useMemo(() => {
    const random = seeded(7);
    const [w, h, d] = stage.dust.box;
    const position = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      position.set([(random() - 0.5) * w, random() * h, (random() - 0.5) * d], i * 3);
      seed[i] = random();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("seed", new BufferAttribute(seed, 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        box: { value: stage.dust.box },
        size: { value: stage.dust.size },
        opacity: { value: stage.dust.opacity },
        color: { value: [0.9, 0.62, 0.45] },
      },
      vertexShader: /* glsl */ `
        uniform float time; uniform vec3 box; uniform float size;
        attribute float seed;
        varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + time * (0.4 + seed) , box.y);
          p.x += sin(time * 0.6 + seed * 40.0) * 0.08;
          p.z += cos(time * 0.5 + seed * 25.0) * 0.08;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * (0.6 + seed) * (6.0 / -mv.z) * 3.0;
          // Fade near the top and bottom of the box so motes never pop.
          float t = p.y / box.y;
          vFade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.85, 1.0, t)) * (0.4 + seed * 0.6);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float opacity;
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vFade * opacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(color, a);
        }
      `,
    });
    return { geometry, material };
  }, [count]);
  const materialRef = useRef(material);
  useEffect(() => { materialRef.current = material; }, [material]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame((_, delta) => {
    if (still) return;
    materialRef.current.uniforms.time.value += Math.min(delta, 0.05) * stage.dust.driftPerSec * 10;
  });

  if (count <= 0) return null;
  return <points ref={points} name="inspection-dust" geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

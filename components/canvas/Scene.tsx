"use client";

import { ContactShadows, PerformanceMonitor } from "@react-three/drei";
import { Canvas, events, useFrame, useThree, type RootState } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { AgXToneMapping } from "three";
import { palette, stage } from "@/lib/config/experience";
import { AirCompressor } from "./AirCompressor";
import { StudioLights } from "./StudioLights";
import { ScanRing } from "./ScanRing";
import { createScanUniforms, type ScanUniforms } from "./scanReveal";
import { blendScan, getIntroDuration, sampleScan, scanBounds, scanTiming, type ScanFrame, type ScanPhase } from "./scanTimeline";
import { CameraRig } from "./CameraRig";
import { ModelInteraction } from "./ModelInteraction";
import { Checkpoints } from "./Checkpoints";
import { advanceUsernameAssembly, usernameAssemblyLayouts } from "@/components/canvas/usernameAssembly";
import { sampleCredentialPresentation } from "@/components/canvas/credentialPresentation";
import { ExplodedPart } from "./ExplodedPart";
import type { InspectionId } from "./inspectionParts";
import { Dust } from "./Dust";
import { degrade, dprFor, initialQuality, qualitySettings, type QualityLevel } from "./quality";

export type SceneProps = {
  selected: InspectionId | null;
  highlighted: string | null;
  hotspots: RefObject<(HTMLButtonElement | null)[]>;
  phase: ScanPhase;
  phaseRound: number;
  typing: boolean;
  /** Either credential field has focus; no input values enter the scene. */
  inputFocused: boolean;
  /** Presentation-only username focus; no input text enters the scene. */
  usernameExpanded: boolean;
  /** Presentation-only password focus opens the detailed assemblies. */
  passwordExpanded: boolean;
  eventSource: HTMLElement;
  onFade: (opacity: number) => void;
  /** Reduced motion: no idle turn, and frames render only when something changes. */
  still: boolean;
  /** The first frame has been drawn — the canvas can fade in over the static stage. */
  onReady: () => void;
  /** The GPU dropped the context; fall back to the static stage. */
  onLost: () => void;
};

// Stable object: R3F reconfigures the renderer when `gl` props change identity.
const glProps = {
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
  toneMapping: AgXToneMapping,
  toneMappingExposure: stage.lights.exposure,
} as const;

// These one-frame bakes must not restart when the form changes phase or typing state.
const StaticStudio = memo(function StaticStudio() {
  const gl = useThree((state) => state.gl);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    // A restored context has empty render targets; bake again only for that event.
    const restored = () => setRevision((value) => value + 1);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => gl.domElement.removeEventListener("webglcontextrestored", restored);
  }, [gl]);
  return (
    <group key={revision} name="inspection-static-studio">
      <StudioLights />
      <ContactShadows
        position={[0, 0.002, 0]}
        scale={6}
        resolution={512}
        frames={1}
        opacity={stage.shadow.opacity}
        blur={stage.shadow.blur}
        far={stage.shadow.far}
        color={palette.carbon950}
      />
    </group>
  );
});

/** Account for the canvas rectangle when the page scrolls; form overlays never hit 3D. */
const stageEvents: typeof events = (state) => ({
  ...events(state),
  compute(event, root) {
    const blocked = event.target instanceof Element && event.target.closest("[data-stage-block], form, button, input, a, select, textarea");
    const bounds = root.gl.domElement.getBoundingClientRect();
    root.pointer.set(blocked ? 10 : ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      blocked ? 10 : -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    root.raycaster.setFromCamera(root.pointer, root.camera);
  },
});

function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return initialQuality({
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    forced: new URLSearchParams(window.location.search).get("quality"),
  });
}

const INTRO_KEY = "qcheck:login:intro-day";
const factoryDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

function introDuration() {
  try { return getIntroDuration(localStorage.getItem(INTRO_KEY), factoryDay()); }
  catch { return getIntroDuration(null, factoryDay()); }
}

function subscribeVisible(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function ScanController({ inspecting, blueprintActive, exploded, blueprintRef, assemblyRef, still, phase, phaseRound, introSeconds, frameRef, uniformsRef }: {
  inspecting: boolean; blueprintActive: boolean; exploded: boolean; blueprintRef: RefObject<number>; assemblyRef: RefObject<number>; still: boolean; phase: ScanPhase; phaseRound: number; introSeconds: number;
  frameRef: RefObject<ScanFrame>; uniformsRef: RefObject<ScanUniforms>;
}) {
  const elapsed = useRef(0);
  const skipped = useRef(false);
  const signal = useRef({ phase, round: phaseRound, elapsed: 0 });
  const transition = useRef<{ from: ScanFrame; elapsed: number } | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const skip = () => { skipped.current = true; invalidate(); };
    if (document.activeElement?.matches("input, button")) skip();
    window.addEventListener("pointerdown", skip, { passive: true });
    window.addEventListener("keydown", skip);
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [invalidate]);
  useEffect(() => { invalidate(); }, [still, phase, phaseRound, blueprintActive, exploded, invalidate]);

  useFrame((_, delta) => {
    const step = Math.min(Math.max(delta, 0), 0.05);
    elapsed.current = Math.max(elapsed.current + step, skipped.current ? introSeconds : 0);
    if (signal.current.phase !== phase || signal.current.round !== phaseRound) {
      signal.current = { phase, round: phaseRound, elapsed: 0 };
      transition.current = still ? null : { from: frameRef.current, elapsed: 0 };
    } else {
      signal.current.elapsed += step;
      if (transition.current) transition.current.elapsed += step;
    }
    const target = sampleScan(elapsed.current, { still, phase, phaseElapsed: signal.current.elapsed, introSeconds });
    const blending = !still && transition.current;
    const frame = blending ? blendScan(blending.from, target, blending.elapsed) : target;
    frameRef.current = { ...frame, phaseElapsed: signal.current.elapsed };
    if (transition.current && (still || transition.current.elapsed >= scanTiming.phaseTransitionSeconds)) transition.current = null;
    // Preserve the drawn composition while authentication is pending; success starts from this view.
    if (phase !== "submitting" || still) {
      assemblyRef.current = advanceUsernameAssembly(assemblyRef.current, step, exploded, still, phase);
      blueprintRef.current = advanceUsernameAssembly(blueprintRef.current, step, blueprintActive, still, phase);
    }
    const blueprint = inspecting ? 1 : blueprintRef.current;
    uniformsRef.current.scanY.value = frame.scanY + (scanBounds.minY - frame.scanY) * blueprint;
    uniformsRef.current.reveal.value = frame.reveal * (1 - blueprint);
    // The surface band follows the ring: on while it sweeps, off when it fades (locked, success).
    uniformsRef.current.glow.value = phase === "success" ? 0 : (1 - blueprint) * Math.min(1, frameRef.current.ringOpacity / 0.75);
  }, -2);
  return null;
}

function FirstFrame({ onReady, onLost }: Pick<SceneProps, "onReady" | "onLost">) {
  const done = useRef(false);
  const frames = useRef(0);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const lost = () => { done.current = false; onLost(); };
    const restored = () => { done.current = false; frames.current = 0; invalidate(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, invalidate, onLost]);
  useFrame(({ scene, camera }) => {
    if (done.current || gl.getContext().isContextLost()) return;
    // Frame 1 bakes the studio environment, which changes which shader variants are needed;
    // compile on frame 2 so the warm-up matches what will actually draw.
    if (++frames.current < 2) { invalidate(); return; } // demand frameloop (reduced motion) needs the nudge
    done.current = true;
    // Warm up everything that only appears later (username assembly, success ticks, pressure
    // ring) so its first use never stalls a frame: compile its shaders and draw it once, which
    // uploads its geometry to the GPU. The canvas is still transparent (it fades in on onReady),
    // and hidden objects are hidden again before this frame's real render overwrites the draw.
    const hidden: { visible: boolean }[] = [];
    scene.traverse((object) => { if (!object.visible) { hidden.push(object); object.visible = true; } });
    const compiled = gl.compileAsync(scene, camera);
    gl.render(scene, camera);
    hidden.forEach((object) => { object.visible = false; });
    compiled.catch(() => undefined).finally(() => {
      if (gl.getContext().isContextLost()) return;
      try { localStorage.setItem(INTRO_KEY, factoryDay()); } catch { /* Storage may be blocked. */ }
      onReady();
      invalidate();
    });
  });
  return null;
}

/** The auth stage's WebGL scene. Loaded on demand by <AuthStage>; never server-rendered. */
export default function Scene({ selected, highlighted, hotspots, still, phase, phaseRound, typing, inputFocused, usernameExpanded, passwordExpanded, eventSource, onFade, onReady, onLost }: SceneProps) {
  const [quality, setQuality] = useState<QualityLevel>(detectQuality);
  const dpr = dprFor(quality, window.devicePixelRatio);
  const [introSeconds] = useState(introDuration);
  const visible = useSyncExternalStore(subscribeVisible, () => !document.hidden, () => true);
  const uniforms = useMemo(() => createScanUniforms(), []);
  const uniformsRef = useRef(uniforms);
  const frameRef = useRef(sampleScan(0, { still, introSeconds }));
  const assemblyRef = useRef(0);
  const blueprintRef = useRef(0);
  const presentation = sampleCredentialPresentation(phase, usernameExpanded, passwordExpanded, still);

  function handleCreated(state: RootState) {
    // Dev only: lets scripts read draw calls and memory (gl.info) while tuning.
    if (process.env.NODE_ENV !== "production") (window as { __qcheckStage?: RootState }).__qcheckStage = state;
  }

  return (
    <Canvas
      dpr={dpr}
      frameloop={still || !visible ? "demand" : "always"}
      gl={glProps}
      eventSource={eventSource}
      events={stageEvents}
      camera={{ fov: stage.camera.fovDeg, near: 0.5, far: 60 }}
      onCreated={handleCreated}
    >
      {/* Sustained low fps steps the level down (high → medium → low); it never climbs back. */}
      <PerformanceMonitor onDecline={() => setQuality(degrade)} />
      <ScanController inspecting={!!selected} blueprintActive={presentation.blueprint} exploded={presentation.exploded} blueprintRef={blueprintRef} assemblyRef={assemblyRef} still={still} phase={phase} phaseRound={phaseRound} introSeconds={introSeconds} frameRef={frameRef} uniformsRef={uniformsRef} />
      <CameraRig frameRef={frameRef} phase={phase} still={still} credentialExpanded={presentation.zoomed} passwordExpanded={presentation.exploded} selected={selected} eventSource={eventSource} onFade={onFade} />
      <StaticStudio />
      <ambientLight intensity={0.35} />
      <ModelInteraction still={still} active={visible && !selected} pointerEnabled={!inputFocused && !selected} phase={phase}>
        <AirCompressor uniforms={uniforms} inspecting={!!selected} still={still} assemblyRef={assemblyRef} />
        {usernameAssemblyLayouts.map(({id, offset}) => <ExplodedPart key={`username-${id}`} selected={id} highlighted={null} still={still} spreadRef={assemblyRef} offset={offset} />)}
        {selected && <ExplodedPart key={selected} selected={selected} highlighted={highlighted} still={still} />}
        <Checkpoints frameRef={frameRef} phase={phase} still={still} hotspots={hotspots} enabled={!selected && !inputFocused} />
      </ModelInteraction>
      <Dust still={still} count={qualitySettings(quality).dust} />
      <ScanRing inspecting={!!selected} blueprintRef={blueprintRef} frameRef={frameRef} phase={phase} still={still} typing={typing} inputFocused={inputFocused} />
      <FirstFrame onReady={onReady} onLost={onLost} />
    </Canvas>
  );
}

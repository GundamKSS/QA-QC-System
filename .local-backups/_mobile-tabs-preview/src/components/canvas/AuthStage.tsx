"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useRef, useState, type ReactNode } from "react";
import { stage } from "@/config/experience";
import { useReducedMotion } from "@/hooks/useBrowserState";
import { useAfterLoadIdle, useStageTier } from "@/hooks/useStageTier";
import { useAuthStage } from "@/lib/auth-stage";

// three + R3F + drei live in their own chunk, fetched only after the form is ready.
const Scene = dynamic(() => import("./Scene"), { ssr: false });

/** Anything that goes wrong inside WebGL leaves the static stage in place. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[stage] 3D disabled:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The backdrop of every auth screen (docs/07 §0, §8): `children` is the static stage
 * (server-rendered, always there); the WebGL canvas fades in over it when the device can take
 * it and the page has settled. Pointer events come from the shared parent so the HTML form
 * stays on top and the decorative canvas does not intercept its controls.
 */
export function AuthStage({ children }: { children: ReactNode }) {
  const tier = useStageTier();
  const settled = useAfterLoadIdle();
  const reducedMotion = useReducedMotion();
  const signal = useAuthStage();
  const root = useRef<HTMLDivElement>(null);
  const lastOpacity = useRef(1);
  const [eventSource, setEventSource] = useState<HTMLElement | null>(null);
  const attachRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    setEventSource(node?.parentElement ?? null);
  }, []);

  // Set on the DOM directly: React doesn't manage `data-ready`, so no re-render is needed.
  const setReady = (ready: boolean) => root.current?.toggleAttribute("data-ready", ready);
  const setFade = useCallback((opacity: number) => {
    if (lastOpacity.current === opacity) return;
    lastOpacity.current = opacity;
    root.current?.style.setProperty("--stage-opacity", String(opacity));
  }, []);

  return (
    <div ref={attachRoot} aria-hidden="true" data-phase={signal.phase} data-username-focused={signal.usernameFocused || undefined} className="group/stage pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {children}
      {tier === "static" && <StaticPoster />}
      {tier === "3d" && settled && eventSource && (
        <StageBoundary>
          <div
            className="absolute inset-x-0 top-0 h-svh opacity-0 transition-opacity ease-out group-data-ready/stage:opacity-[var(--stage-opacity,1)]"
            style={{ transitionDuration: signal.phase === "success" ? "0ms" : `${stage.fadeInMs}ms` }}
          >
            <Scene still={reducedMotion} phase={signal.phase} phaseRound={signal.round} typing={signal.typing} usernameExpanded={signal.usernameFocused} eventSource={eventSource} onFade={setFade} onReady={() => setReady(true)} onLost={() => setReady(false)} />
          </div>
        </StageBoundary>
      )}
      <StageFinish />
    </div>
  );
}

const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Vignette + film grain above the scene, below the form. Static: no per-frame cost. */
function StageFinish() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 45%, rgb(0 0 0 / ${stage.finish.vignette}) 100%)` }}
      />
      <div className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: GRAIN, opacity: stage.finish.grain }} />
    </>
  );
}

/**
 * The Static tier's picture of the scene (docs/07 §8): a still rendered from the real 3D stage,
 * so devices without WebGL, Save-Data or ≤ 2 GB RAM still see the machine. Only fetched on that
 * tier; the lens shift is baked in, so it frames like the live canvas does (landscape vs portrait).
 */
function StaticPoster() {
  return (
    <picture>
      <source media="(min-aspect-ratio: 1/1)" srcSet="/auth/poster-landscape.avif" type="image/avif" />
      <img src="/auth/poster-portrait.avif" alt="" decoding="async" fetchPriority="low" className="absolute inset-x-0 top-0 h-svh w-full object-cover object-top" />
    </picture>
  );
}

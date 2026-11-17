"use client";

import { useEffect, useRef } from "react";
import { bindExpandingSurface } from "./expandingSurface";

type Part = { dx: number; dy: number; turn?: number };
/** Exploded-view offset of each part at full scroll, in viewBox units (and degrees). */
const PARTS = {
  tank: { dx: 0, dy: 8 },
  wheelLeft: { dx: -26, dy: 12, turn: -90 },
  wheelRight: { dx: 26, dy: 12, turn: 90 },
  block: { dx: -6, dy: -30 },
  pulleyLeft: { dx: -22, dy: -40, turn: -120 },
  pulleyRight: { dx: 14, dy: -44, turn: 120 },
  motor: { dx: 34, dy: -22, turn: 6 },
  pipes: { dx: 0, dy: -14 },
  gauge: { dx: -30, dy: -6, turn: -10 },
  plate: { dx: 0, dy: 12 },
} satisfies Record<string, Part>;

const part = ({ dx, dy, turn = 0 }: Part) => ({ "--dx": dx, "--dy": dy, "--turn": `${turn}deg` }) as React.CSSProperties;

/**
 * A light, decorative compressor drawing for the workspace's cutting-mat header. Scrolling the page down
 * pulls its parts apart like an exploded view and lets the green mat (.home-welcome) grow out to the
 * content area's edges and the top bar; scrolling back up puts both back. Still when the user prefers
 * reduced motion. The progress (--apart) and the gaps to grow into are set on the card, so its CSS can use them.
 */
export function WorkspaceDrawing() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    return bindExpandingSurface(ref.current?.parentElement ?? null);
  }, []);

  return (
    <svg ref={ref} className="workspace-drawing" viewBox="0 0 320 250" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 154h269M28 150v8m264-8v8M30 220h260M38 215v10m246-10v10" opacity=".45" strokeDasharray="3 5" />
        <path d="M21 30h32m-16-16v32m221 1h30m-15-15v30" opacity=".3" />
        <g className="wd-part" style={part(PARTS.tank)}>
          <path d="M58 148c-27 0-30 58 0 58h205c29 0 29-58 0-58H58Z" />
          <path d="M63 148c-13 17-13 41 0 58m193-58c14 16 14 42 0 58" opacity=".55" />
          <path d="M70 142h185v-7H70zm-8-7-14-6c-9-5-11 11-3 12l18 2m200-8 14-6c10-5 12 11 3 12l-18 2" />
        </g>
        <g className="wd-part" style={part(PARTS.plate)}>
          <path d="M103 172h99v17h-99z" opacity=".45" />
        </g>
        <g className="wd-part" style={part(PARTS.wheelLeft)}>
          <circle cx="78" cy="214" r="13" /><circle cx="78" cy="214" r="5" />
        </g>
        <g className="wd-part" style={part(PARTS.wheelRight)}>
          <circle cx="248" cy="214" r="13" /><circle cx="248" cy="214" r="5" />
        </g>
        <g className="wd-part" style={part(PARTS.block)}>
          <path d="M81 91v35h55V91m-47 42v-7m40 7v-7M108 93 87 62m26 31 21-31" />
          <path d="m72 54 23-12 23 44-23 12Zm57 31 21-42 23 12-22 43Z" />
          {[0, 1, 2, 3, 4].map(i => <path key={i} d={`m${79 + i * 3.8} ${60 + i * 7.2} 23-12m${143 - i * 3.8} ${60 + i * 7.2} 23 12`} opacity=".65" />)}
        </g>
        <g className="wd-part" style={part(PARTS.pulleyLeft)}>
          <circle cx="77" cy="44" r="13" />
        </g>
        <g className="wd-part" style={part(PARTS.pulleyRight)}>
          <circle cx="164" cy="45" r="13" />
        </g>
        <g className="wd-part" style={part(PARTS.motor)}>
          <path d="M180 102c0-22 46-22 46 0v20c0 12-46 12-46 0Z" />
          <ellipse cx="225" cy="110" rx="17" ry="23" />
          {[0, 1, 2, 3].map(i => <path key={i} d={`M${187 + i * 7} 95v30`} opacity=".55" />)}
          <path d="M187 132v-7m34 7v-7m-24-40v-8h21v9" />
          <circle cx="225" cy="110" r="3" fill="#f0a15c" stroke="none" />
        </g>
        <g className="wd-part" style={part(PARTS.pipes)}>
          <path d="M60 117v-33c0-8 5-13 13-16m110-8h51c11 0 22 9 22 22v45" opacity=".5" />
        </g>
        <g className="wd-part" style={part(PARTS.gauge)}>
          <circle cx="58" cy="126" r="12" /><path d="M58 138v9m0-21-5-6" />
          <circle cx="58" cy="126" r="3" fill="#f0a15c" stroke="none" />
        </g>
        <path d="M133 149v-12h9v12" />
      </g>
      <g fill="currentColor" fontFamily="monospace" fontSize="7" letterSpacing="1.4" opacity=".65">
        <text x="46" y="20">TRW × PUMA</text><text x="47" y="242">QUALITY / INSPECTION WORKSPACE</text>
      </g>
    </svg>
  );
}

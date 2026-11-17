"use client";

import { inferItemAnimationType } from "@/lib/inspections/rules";
import type { AnimationType, InspectionItem } from "@/lib/inspections/types";

type Props = {
  item: InspectionItem;
  status?: "NORMAL" | "FAIL" | "NA" | null;
  totalSteps?: number;
};

/**
 * Lightweight Minimalist Vector Animation per Checklist Step (Mobile-First, 60fps CSS/SVG, <5KB).
 * Zero WebGL overhead — designed for low battery consumption and instant rendering on field devices.
 */
export function StepMinimalAnimation({ item, status }: Props) {
  const animType: AnimationType = inferItemAnimationType(item);

  const isPass = status === "NORMAL";
  const isFail = status === "FAIL";
  const isNA = status === "NA";

  const bgTone = isPass
    ? "bg-pass/8"
    : isFail
    ? "bg-fail/8"
    : isNA
    ? "bg-amber-500/8"
    : "bg-carbon-900/40";

  const bracketColor = isPass
    ? "#34d399"
    : isFail
    ? "#dc7665"
    : isNA
    ? "#fbbf24"
    : "#94a3b8";

  const strokeAccent = isPass ? "#34d399" : isFail ? "#f87171" : isNA ? "#fbbf24" : "#f59e0b";

  return (
    <div
      className={`relative overflow-hidden rounded-xl px-4 py-2 transition-colors duration-300 ${bgTone}`}
    >
      {/* Minimalist Vector Stage with Corner Brackets */}
      <div className="relative flex h-28 sm:h-32 w-full items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 260 100"
          className="h-full w-full max-w-[300px]"
        >
          {/* Viewfinder HUD corners */}
          <path
            d="M14 24 V12 H28 M246 24 V12 H232 M14 76 V88 H28 M246 76 V88 H232"
            fill="none"
            stroke={bracketColor}
            strokeWidth="1.6"
            strokeOpacity="0.65"
            strokeLinecap="round"
          />

          {animType === "SCAN_PUMP" && <ScanPumpVector strokeAccent={strokeAccent} />}
          {animType === "PISTON_HEAD" && <PistonHeadVector strokeAccent={strokeAccent} />}
          {animType === "MOTOR_BELT" && <MotorBeltVector strokeAccent={strokeAccent} />}
          {animType === "PRESSURE_GAUGE" && <PressureGaugeVector strokeAccent={strokeAccent} />}
          {animType === "AIR_TANK" && <AirTankVector strokeAccent={strokeAccent} />}
          {animType === "VALVE_LEAK" && <ValveLeakVector strokeAccent={strokeAccent} />}
          {animType === "GENERAL_CHECK" && <GeneralCheckVector strokeAccent={strokeAccent} />}
        </svg>
      </div>

      <style jsx>{`
        @keyframes scanBeam {
          0%, 100% {
            transform: translateY(-24px);
            opacity: 0.35;
          }
          50% {
            transform: translateY(26px);
            opacity: 0.95;
          }
        }
        @keyframes pistonMoveA {
          0%, 100% {
            transform: translateY(-8px);
          }
          50% {
            transform: translateY(8px);
          }
        }
        @keyframes pistonMoveB {
          0%, 100% {
            transform: translateY(8px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @keyframes wheelSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes beltDash {
          to {
            stroke-dashoffset: -24;
          }
        }
        @keyframes needleSweep {
          0%, 100% {
            transform: rotate(-35deg);
          }
          50% {
            transform: rotate(38deg);
          }
        }
        @keyframes pulseRing {
          0% {
            transform: scale(0.75);
            opacity: 0.85;
          }
          100% {
            transform: scale(1.45);
            opacity: 0;
          }
        }
        .anim-scan-beam {
          animation: scanBeam 2.4s ease-in-out infinite;
        }
        .anim-piston-a {
          animation: pistonMoveA 1.3s ease-in-out infinite;
        }
        .anim-piston-b {
          animation: pistonMoveB 1.3s ease-in-out infinite;
        }
        .anim-spin {
          transform-box: fill-box;
          transform-origin: center;
          animation: wheelSpin 3s linear infinite;
        }
        .anim-belt {
          animation: beltDash 0.9s linear infinite;
        }
        .anim-needle {
          transform-origin: 130px 64px;
          animation: needleSweep 2.6s ease-in-out infinite;
        }
        .anim-pulse-ring {
          transform-box: fill-box;
          transform-origin: center;
          animation: pulseRing 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
}

function ScanPumpVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Air Compressor Tank & Pump Outline */}
      <rect
        x="62"
        y="46"
        width="136"
        height="32"
        rx="16"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="2"
      />
      {/* Pump Head & Motor on top */}
      <rect x="82" y="22" width="32" height="24" rx="4" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      <rect x="142" y="26" width="38" height="20" rx="5" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      {/* Wheels / Legs */}
      <circle cx="88" cy="84" r="6" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      <circle cx="172" cy="84" r="6" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      {/* QR / Serial Tag on Tank */}
      <rect
        x="114"
        y="54"
        width="32"
        height="16"
        rx="2"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="1.6"
      />
      <line x1="119" y1="58" x2="119" y2="66" stroke={strokeAccent} strokeWidth="1.5" />
      <line x1="124" y1="58" x2="124" y2="66" stroke={strokeAccent} strokeWidth="2" />
      <line x1="130" y1="58" x2="130" y2="66" stroke={strokeAccent} strokeWidth="1.2" />
      <line x1="135" y1="58" x2="135" y2="66" stroke={strokeAccent} strokeWidth="2" />
      <line x1="141" y1="58" x2="141" y2="66" stroke={strokeAccent} strokeWidth="1.5" />

      {/* Sweeping Laser Scan Line */}
      <g className="anim-scan-beam">
        <line
          x1="46"
          y1="50"
          x2="214"
          y2="50"
          stroke={strokeAccent}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <rect
          x="52"
          y="44"
          width="156"
          height="12"
          fill={strokeAccent}
          fillOpacity="0.12"
        />
      </g>
    </g>
  );
}

function PistonHeadVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Left & Right Cylinder Barrels */}
      <rect x="78" y="20" width="40" height="58" rx="4" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      <rect x="142" y="20" width="40" height="58" rx="4" fill="none" stroke="#94a3b8" strokeWidth="1.8" />
      {/* Cooling Fins */}
      <line x1="74" y1="30" x2="122" y2="30" stroke="#64748b" strokeWidth="1.5" />
      <line x1="74" y1="38" x2="122" y2="38" stroke="#64748b" strokeWidth="1.5" />
      <line x1="138" y1="30" x2="186" y2="30" stroke="#64748b" strokeWidth="1.5" />
      <line x1="138" y1="38" x2="186" y2="38" stroke="#64748b" strokeWidth="1.5" />

      {/* Animated Piston A */}
      <g className="anim-piston-a">
        <rect x="84" y="36" width="28" height="16" rx="2" fill={strokeAccent} fillOpacity="0.25" stroke={strokeAccent} strokeWidth="1.8" />
        <line x1="98" y1="52" x2="98" y2="76" stroke={strokeAccent} strokeWidth="2.2" />
      </g>

      {/* Animated Piston B */}
      <g className="anim-piston-b">
        <rect x="148" y="36" width="28" height="16" rx="2" fill={strokeAccent} fillOpacity="0.25" stroke={strokeAccent} strokeWidth="1.8" />
        <line x1="162" y1="52" x2="162" y2="76" stroke={strokeAccent} strokeWidth="2.2" />
      </g>

      {/* Base Crankcase Line */}
      <line x1="64" y1="78" x2="196" y2="78" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

function MotorBeltVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Large Pump Flywheel (Left) */}
      <circle cx="88" cy="50" r="28" fill="none" stroke="#94a3b8" strokeWidth="2" />
      <g className="anim-spin">
        <circle cx="88" cy="50" r="8" fill="none" stroke={strokeAccent} strokeWidth="1.8" />
        <line x1="88" y1="22" x2="88" y2="78" stroke="#94a3b8" strokeWidth="1.6" />
        <line x1="60" y1="50" x2="116" y2="50" stroke="#94a3b8" strokeWidth="1.6" />
      </g>

      {/* Small Motor Pulley (Right) */}
      <circle cx="178" cy="56" r="16" fill="none" stroke="#94a3b8" strokeWidth="2" />
      <g className="anim-spin">
        <circle cx="178" cy="56" r="5" fill="none" stroke={strokeAccent} strokeWidth="1.8" />
        <line x1="178" y1="40" x2="178" y2="72" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="162" y1="56" x2="194" y2="56" stroke="#94a3b8" strokeWidth="1.5" />
      </g>

      {/* Animated V-Belt Connecting Pulleys */}
      <path
        d="M88 22 L178 40 A16 16 0 0 1 178 72 L88 78 A28 28 0 0 1 88 22 Z"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="2.2"
        strokeDasharray="6 6"
        className="anim-belt"
      />
    </g>
  );
}

function PressureGaugeVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Gauge Outer Dial */}
      <circle cx="130" cy="54" r="36" fill="none" stroke="#94a3b8" strokeWidth="2" />
      {/* Scale Arc */}
      <path
        d="M104 68 A28 28 0 1 1 156 68"
        fill="none"
        stroke="#64748b"
        strokeWidth="3"
        strokeDasharray="4 4"
      />
      {/* Active Pressure Zone Arc */}
      <path
        d="M130 26 A28 28 0 0 1 156 68"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Animated Gauge Needle */}
      <g className="anim-needle">
        <line
          x1="130"
          y1="64"
          x2="130"
          y2="30"
          stroke={strokeAccent}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
      <circle cx="130" cy="64" r="4.5" fill={strokeAccent} />
      <text x="130" y="80" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
        BAR / PSI
      </text>
    </g>
  );
}

function AirTankVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Tank Body */}
      <rect x="56" y="30" width="148" height="42" rx="21" fill="none" stroke="#94a3b8" strokeWidth="2" />
      {/* Weld Seam Lines */}
      <line x1="86" y1="30" x2="86" y2="72" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />
      <line x1="174" y1="30" x2="174" y2="72" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" />

      {/* Sight Glass / Inspection Point in Center */}
      <circle cx="130" cy="51" r="13" fill="none" stroke={strokeAccent} strokeWidth="2" />
      <circle
        cx="130"
        cy="51"
        r="13"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="1.5"
        className="anim-pulse-ring"
      />
      {/* Oil Level Wave inside Sight Glass */}
      <path
        d="M119 52 Q125 48 130 52 T141 52"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="2"
      />
    </g>
  );
}

function ValveLeakVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      {/* Pipe & Check Valve Manifold */}
      <path
        d="M64 52 H112 M148 52 H196 M130 24 V36"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Valve Hex Body */}
      <rect
        x="112"
        y="36"
        width="36"
        height="32"
        rx="6"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="2"
      />
      {/* Leak Detection Pulse Rings */}
      <circle
        cx="130"
        cy="52"
        r="18"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="1.5"
        className="anim-pulse-ring"
      />
      <circle cx="130" cy="52" r="5" fill={strokeAccent} />
    </g>
  );
}

function GeneralCheckVector({ strokeAccent }: { strokeAccent: string }) {
  return (
    <g>
      <rect x="98" y="18" width="64" height="66" rx="6" fill="none" stroke="#94a3b8" strokeWidth="2" />
      <line x1="112" y1="36" x2="148" y2="36" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <line x1="112" y1="48" x2="148" y2="48" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M116 64 L126 72 L146 56"
        fill="none"
        stroke={strokeAccent}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

import { authPolicy } from "./auth";

/**
 * Every tunable for the login experience lives here (docs/07 §12).
 * UI colours are also declared as Tailwind tokens in app/globals.css —
 * keep the two lists in sync (WebGL reads these hex values, CSS reads the tokens).
 */
export const palette = {
  carbon950: "#08090A",
  carbon900: "#0E0F11",
  carbon850: "#121417",
  carbon800: "#16181B",
  carbon750: "#1C1E23",
  carbon700: "#212328",
  carbon600: "#2E3137",
  carbon500: "#3D414A",
  ti50: "#F2F1EE",
  ti100: "#E2E0D8",
  ti200: "#CFCDC7",
  ti300: "#B4B2AA",
  ti400: "#9A9890",
  ti500: "#85837C",
  ti600: "#6B6A64",
  ti700: "#55544E",
  tiMetal: "#8C8A84",
  ember200: "#FFD0B8",
  ember300: "#FFB088",
  ember400: "#FF8A55",
  ember500: "#FF6B2C",
  ember600: "#E0541A",
  ember950: "#2A0F05",
  pass: "#3FD08A",
  fail: "#F2546B",
} as const;

export const motion = {
  /** How long the welcome message stays before navigating (ms). */
  successHoldMs: 650,
  successHoldReducedMs: 150,
  /** Horizontal shake on a failed attempt (skipped under reduced motion). */
  shake: {
    offsetsPx: [0, -6, 6, -4, 0],
    durationMs: 380,
    easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)",
  },
  /** Title words fade up one after another on the login page. */
  thaiReveal: {
    stepMs: 70,
    /** The sheet itself rises first (700ms `rise`); words follow it. */
    startMs: 250,
    /** Each line starts this long after the previous one. */
    lineGapMs: 120,
  },
} as const;

/**
 * The 3D stage on the auth screens (docs/07 §2.4, §3). Lengths are scene units:
 * the complete V-twin compressor is about 2.6 units tall.
 */
export const stage = {
  /** Idle turn of the machine (docs/07 §2.5: ≈ 3°/s). 0 under reduced motion. */
  idleTurnDegPerSec: 3,
  /** Let the machine settle while the user concentrates on credentials. */
  focusTurnDegPerSec: 0,
  /** Canvas fade-in once the first frame is drawn. */
  fadeInMs: 350,
  /** Starting three-quarter view of the tank label, pump and motor. */
  initialYawDeg: -12,

  scan: {
    firstIntroSeconds: 1.4,
    repeatIntroSeconds: 0.45,
    idleCycleSeconds: 6,
    topHoldSeconds: 0.45,
    submittingSweepSeconds: 0.9,
    successSeconds: 0.6,
    phaseTransitionSeconds: 0.18,
    ringRadius: 2.2,
    /** Credential views show the completed blueprint instead of another orbiting scanner. */
    focusOrbitEnabled: false,
    /** A visible scanner head circles the model while a credential input has focus. */
    focusOrbitSeconds: 4.2,
  },

  /** Film finish over the whole stage (docs/07 §8): CSS only, so every tier gets it for free. */
  finish: {
    /** 0–1 darkening at the corners. */
    vignette: 0.5,
    /** Static noise opacity; kept low so Thai text over it stays crisp. */
    grain: 0.07,
  },

  /** docs/07 §8 quality levels. The Scene starts at the best level the device suggests and steps down when fps drops. */
  quality: {
    high: { maxDpr: 1.75, dust: 220 },
    medium: { maxDpr: 1.5, dust: 80 },
    low: { maxDpr: 1, dust: 0 },
    /** Devices at or below these start at Medium (phones, low-core machines). */
    mediumBelow: { cores: 6, memoryGb: 4 },
  },

  /** Dust motes drifting in the studio light (docs/07 §3). Per-level counts live in `quality`. */
  dust: {
    /** Box the motes live in, centred on the model: [width, height, depth]. */
    box: [3.6, 3.2, 3.6] as const,
    size: 2.2,
    opacity: 0.55,
    driftPerSec: 0.035,
  },

  interaction: {
    maxDragDeg: 35,
    parallaxDeg: 2.5,
    dragRadiansPerPx: 0.006,
    returnDamping: 5,
    dragDamping: 14,
    inertiaDamping: 7,
    cameraDamping: 7,
    focusPush: 0.06,
    /** Username zooms into the scanned blueprint before Password moves closer to the assemblies. */
    usernameBackdrop: {
      height: 0.94,
      centerX: 0.5,
      centerY: 0.48,
      opacity: 0.5,
      /** Portrait screens keep the expanded assemblies in the area above the form. */
      compactHeight: 0.32,
      compactWidth: 0.98,
      compactCenterY: 0.18,
    },
    /** Fill the viewport with the exploded upper assemblies, using the Username view as the entry. */
    passwordBackdrop: {
      zoomFactor: 0.62,
      centerY: 0.5,
      compactCenterY: 0.24,
      aimY: 1.9,
      opacity: 0.62,
    },
    /**
     * Stiffness (rad/s) of the critically damped spring that moves framing, zoom and fade
     * between states. It starts from rest and keeps its speed if the target changes mid-way,
     * so switching fields never kicks the view. ≈ 5 settles in about one second.
     */
    viewSpring: 5,
    lockedPull: 0.04,
    checkpointStepSeconds: 0.1,
    checkpointRevealSeconds: 0.12,
    errorFlashSeconds: 0.3,
    successFlyStartSeconds: 0.3,
    successFadeStartSeconds: 0.49,
    successEndSeconds: 0.64,
    sealStartSeconds: 0.18,
    sealEndSeconds: 0.5,
  },

  camera: {
    fovDeg: 28,
    /** Where the camera looks from, relative to the object's centre (normalised). */
    direction: [0.32, 0.25, 1] as const,
    /** Point of the object kept at the framing centre. */
    target: [0, 1.3, 0] as const,
  },

  /**
   * Framing per layout (docs/07 §6), as fractions of the canvas. The canvas covers the
   * viewport; the lens is shifted so the object sits in the stage area, not the middle.
   * `height` / `width` reserve a viewport fraction, keeping the wide tank clear of the form.
   */
  framing: {
    laptop: { centerX: 0.29, centerY: 0.52, height: 0.6, width: 0.48 },
    tablet: { centerX: 0.5, centerY: 0.17, height: 0.25, width: 0.82 },
    phone: { centerX: 0.5, centerY: 0.17, height: 0.23, width: 0.86 },
    /** ≤ 700px tall: the stage area shrinks to 20svh (globals.css `short-portrait`). */
    phoneShort: { centerX: 0.5, centerY: 0.105, height: 0.14, width: 0.84 },
    phoneLandscape: { centerX: 0.235, centerY: 0.5, height: 0.68, width: 0.4 },
  },

  /**
   * Brushed titanium (docs/07 §2.4). For metals the colour is the reflectance (F0), so it is
   * titanium's measured F0 (≈ 0.54/0.50/0.45 linear) — far lighter than the UI token
   * `ti-metal`, which would render near-black. Hex colours are sRGB; three converts them.
   */
  titanium: {
    color: "#C3BDB5",
    roughness: 0.32,
    anisotropy: 0.65,
    clearcoat: 0.18,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1,
  },
  /** Bead-blasted fins: same metal, duller, no brushing — so the stack reads as machined. */
  fins: { color: "#A8A39C", roughness: 0.5 },
  /** Black-oxide steel fasteners. */
  steel: { color: "#3A3C41", roughness: 0.4 },
  /** The anodised ember accent on the valve cap. */
  accent: { color: palette.ember500, roughness: 0.38 },

  lights: {
    exposure: 1.1,
    /** Long softbox over the object — the main reflection on the metal. */
    key: { color: "#EEF2F8", intensity: 3 },
    /** Big softbox above and behind: what the fin tops and the head's top face mirror. */
    top: { color: "#E6E9EE", intensity: 1.8 },
    /** Vertical strips either side; they draw the long highlights down the barrel. */
    strips: { color: "#FFFFFF", intensity: 3 },
    /** Large dim panel behind the camera, so faces turned to the viewer aren't black. */
    fill: { color: "#D9DCE2", intensity: 0.55 },
    /** Faint backdrop wall: keeps faces turned away from the camera just off black. */
    wall: { color: "#9EA3AB", intensity: 0.12 },
    /** Warm ember rim from behind-right, kept low. */
    rim: { color: palette.ember500, intensity: 2.2 },
  },

  shadow: { opacity: 0.55, blur: 2.6, far: 1.2 },
} as const;

export type StageFraming = (typeof stage.framing)[keyof typeof stage.framing];

export const loginCopy = {
  pageTitle: "เข้าสู่ระบบ",
  /** English strings are marked lang="en" and set in capitals with CSS. */
  eyebrow: "Quality inspection · TRW × PUMA",
  titleLines: ["QA & QC System · ตรวจทุกเครื่อง", "ครบทุกจุด"],
  /** Optional supporting text; null leaves the title on its own. */
  lead: null as string | null,
  employeeLabel: "รหัสพนักงาน",
  employeePlaceholder: "TRW1001",
  passwordLabel: "รหัสผ่าน / PIN",
  showPassword: "แสดงรหัสผ่าน",
  hidePassword: "ซ่อนรหัสผ่าน",
  submit: "เข้าสู่ระบบ",
  submitting: "กำลังตรวจสอบ…",
  /** The button's label until the page is ready to send the form (docs/19 step 6). */
  preparing: "กำลังเตรียม…",
  /** Shown only when JavaScript is off: the form is sent by script. */
  needsScript: "ต้องเปิด JavaScript ในเบราว์เซอร์เพื่อเข้าสู่ระบบ",
  forgot: "ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ (Admin) เพื่อรีเซ็ต",
  capsLock: "Caps Lock เปิดอยู่",
  thaiLayout: "รหัสผ่านมีอักษรไทย — ตรวจว่าแป้นพิมพ์เป็นภาษาอังกฤษ",
  requiredEmployee: "กรอกรหัสพนักงาน",
  requiredPassword: "กรอกรหัสผ่าน",
  invalid: "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง",
  attemptsLeft: (left: number) =>
    `เหลืออีก ${left} ครั้ง ก่อนบัญชีถูกล็อก ${authPolicy.lockMinutes} นาที`,
  /** Static text (it sits in an alert region); the live mm:ss countdown is on the button. */
  locked: (unlockAt: string) => `บัญชีถูกล็อกชั่วคราว — ลองใหม่ได้เวลา ${unlockAt} หรือติดต่อ Admin`,
  lockedButton: (remaining: string) => `ลองใหม่ได้ในอีก ${remaining}`,
  /** Field user's PIN locked (docs/12): no timer — someone has to unlock it. */
  pinLocked: "PIN ถูกล็อกเพราะใส่ผิดหลายครั้ง — ติดต่อ Admin หรือหัวหน้า QC เพื่อปลดล็อก",
  disabled: "บัญชีนี้ถูกปิดการใช้งาน ติดต่อผู้ดูแลระบบ (Admin)",
  forbidden: (programCode = "PRG003") =>
    `คุณไม่มีสิทธิ์เข้าใช้งานโปรแกรมนี้ (${programCode}) กรุณาติดต่อผู้ดูแลระบบ`,
  unexpected: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง",
  /** FR-AUTH-08: the central login system, not the password, is the problem. */
  unavailable: "ระบบยืนยันตัวตนไม่พร้อม ลองใหม่อีกครั้งในอีกสักครู่ หรือติดต่อ IT",
  offline: "ออฟไลน์ — ต้องเชื่อมต่อเครือข่ายเพื่อเข้าสู่ระบบ",
  retry: "ลองใหม่",
  welcome: (name: string) => `ยินดีต้อนรับ, ${name}`,
  footer: "QA & QC System v1.0 · © 2026 Tirawatgroup",
} as const;

export const sessionCopy = {
  signOut: "ออกจากระบบ",
} as const;

export const changePasswordCopy = {
  pageTitle: "ตั้ง PIN ใหม่",
  title: "ตั้งรหัสผ่าน / PIN ใหม่ก่อนเริ่มใช้งาน",
  pending: "หน้าตั้งรหัสผ่านจะเปิดใช้ใน Pass 7 — ตอนนี้ออกจากระบบได้ก่อน",
  /** Field users (DEC-12): shown after a temporary PIN is issued. */
  pinIntro: "คุณได้รับ PIN ชั่วคราว กรุณาตั้ง PIN ของตัวเองก่อนเริ่มใช้งาน",
} as const;

export const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  MASTERDATA_ADMIN: "Master Data Admin",
  QC_HEAD: "QC Head",
  QC_INSPECTOR: "QC Inspector",
  QA_HEAD: "QA Head",
  QA_INSPECTOR: "QA Inspector",
  PURCHASING: "จัดซื้อ",
  PM: "PM",
  MANAGEMENT: "ผู้บริหาร",
  DEV: "Developer",
  dev: "Developer",
};

export const programRoleLabels: Record<string, string> = {
  USER: "User (ผู้ใช้ทั่วไป)",
  ADMIN: "Admin (ผู้ดูแลระบบ)",
  DEV: "Dev (นักพัฒนา — เห็นทุกหน้า)",
};

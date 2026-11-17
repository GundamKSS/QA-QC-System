import type { MetadataRoute } from "next";
import { palette } from "@/lib/config/experience";

/**
 * Web App Manifest (docs/01 "Web App (PWA)", DEC-02): what Chrome needs to offer "ติดตั้ง" and open QCheck full
 * screen from the home screen. Installing still needs https with a certificate the phone trusts. Working offline
 * (service worker, Serwist) is separate work, not part of this file.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: "QA & QC System — ตรวจรับคุณภาพปั๊มลม",
    short_name: "QA & QC System",
    description: "ระบบตรวจรับคุณภาพปั๊มลม ธีรวัฒน์ × PUMA",
    lang: "th",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: palette.carbon900,
    theme_color: palette.carbon900,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed with the logo inside the safe zone, so Android's round/squircle masks don't cut it.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

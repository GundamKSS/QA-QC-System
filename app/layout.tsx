import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai_Looped, Sarabun } from "next/font/google";
import { BfcacheGuard } from "@/components/dom/BfcacheGuard";
import { ServiceWorkerRegister } from "@/components/dom/ServiceWorkerRegister";
import { palette } from "@/lib/config/experience";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai_Looped({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-thai",
  display: "swap",
});

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "QA & QC System", template: "%s · QA & QC System" },
  description: "ระบบตรวจรับคุณภาพปั๊มลม ธีรวัฒน์ × PUMA",
  applicationName: "QA & QC System",
  // iPhone has no install prompt; "Add to Home Screen" reads these (the icon comes from app/apple-icon.png).
  appleWebApp: { capable: true, title: "QA & QC System", statusBarStyle: "black-translucent" },
  // Internal system: keep it out of search engines (docs/07 §9).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: palette.carbon900,
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} ${sarabun.variable} ${plexMono.variable}`}>
      <body>
        <BfcacheGuard />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

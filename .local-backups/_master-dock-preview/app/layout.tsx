import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import { BfcacheGuard } from "@/components/dom/BfcacheGuard";
import { palette } from "@/lib/config/experience";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex-thai",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "QCheck", template: "%s · QCheck" },
  description: "ระบบตรวจรับคุณภาพปั๊มลม ธีรวัฒน์ × PUMA",
  applicationName: "QCheck",
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
    <html lang="th" className={`${plexThai.variable} ${plexMono.variable}`}>
      <body>
        <BfcacheGuard />
        {children}
      </body>
    </html>
  );
}

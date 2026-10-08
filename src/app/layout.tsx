import type { Metadata, Viewport } from "next";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/overpass/400.css";
import "@fontsource/overpass/600.css";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "Studio Brutaal", template: "%s · Studio Brutaal" },
  description: "Projectsysteem van Studio Brutaal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1e1e1e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}

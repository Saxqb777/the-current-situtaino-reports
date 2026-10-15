import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/archivo/wdth-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@fontsource/spline-sans-mono/400.css";
import "@fontsource/spline-sans-mono/600.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sea Lanes Watch",
  description: "Live situation report for GCC ports, the Strait of Hormuz, the Red Sea and Bab el-Mandeb.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies the saved theme and text size before first paint, so there is no flash.
const prefs = `try{var t=localStorage.getItem("slw-theme");if(t)document.documentElement.dataset.theme=t;var s=localStorage.getItem("slw-text");if(s)document.documentElement.dataset.text=s}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefs }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pengingat Jadwal",
  description:
    "Asisten pengingat absen harian WIB dan perencana undangan itinerary yang hangat, ringkas, dan selalu sinkron.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Terapkan tema tersimpan sebelum body dirender (default Dark Mode) tanpa menimpa pilihan Light Mode saat hydration.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem("pj_theme");
    var root = document.documentElement;
    if (saved === "light") {
      root.classList.remove("dark");
      root.dataset.theme = "light";
      root.style.colorScheme = "light";
    } else {
      root.classList.add("dark");
      root.dataset.theme = "dark";
      root.style.colorScheme = "dark";
    }
  } catch (e) {
    var root = document.documentElement;
    root.classList.add("dark");
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

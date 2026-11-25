import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ClipForge AI — AI-Powered Short-Form Clip Generator",
  description:
    "Turn long YouTube podcasts, interviews, and uploaded videos into viral vertical shorts with AI hook detection, face-tracking 9:16 crop, and animated word-by-word captions.",
  authors: [{ name: "rakeshhh.b" }],
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0D1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${inter.variable} dark`}>
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="font-sans antialiased text-[#F8FAFC] selection:bg-emerald-500/30 selection:text-emerald-200">
        <a
          href="#main-content"
          className="visually-hidden fixed left-4 top-4 z-50 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-semibold text-[#042117] shadow-lg"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

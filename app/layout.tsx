import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

// Inter - The quintessential Silicon Valley font (used by Linear, Vercel, Stripe, etc.)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// JetBrains Mono for code/monospace elements
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vicu — pausado",
  description: "Vicu se pausó en abril 2026. Gracias a quienes lo usaron.",
  openGraph: {
    title: "Vicu — pausado",
    description: "Vicu se pausó en abril 2026. Gracias a quienes lo usaron.",
    url: "https://vicu.vercel.app",
    siteName: "Vicu",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Vicu — pausado",
    description: "Vicu se pausó en abril 2026. Gracias a quienes lo usaron.",
  },
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/vicu-logo.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

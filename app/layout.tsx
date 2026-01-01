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
  title: "Vicu - Logra tus metas, un día a la vez",
  description: "Tu compañero para lograr metas con pequeños pasos diarios",
  openGraph: {
    title: "Vicu - Logra tus metas, un día a la vez",
    description: "Tu compañero para lograr metas con pequeños pasos diarios",
    url: "https://vicu.vercel.app",
    siteName: "Vicu",
    images: [
      {
        url: "https://vicu.vercel.app/vicu-logo.png",
        width: 512,
        height: 512,
        alt: "Vicu",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Vicu - Logra tus metas, un día a la vez",
    description: "Tu compañero para lograr metas con pequeños pasos diarios",
    images: ["https://vicu.vercel.app/vicu-logo.png"],
  },
  icons: {
    icon: "/vicu-logo.png",
    apple: "/vicu-logo.png",
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

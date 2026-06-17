import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/components/theme-init-script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1C" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "SKULI - The Operating System for Ugandan Schools",
    template: "%s | SKULI",
  },
  description:
    "Manage fees, track results, send SMS alerts, and run payroll - all from one platform built for Ugandan private schools.",
  keywords: [
    "school management",
    "fee collection",
    "Uganda schools",
    "mobile money",
    "report cards",
    "attendance",
    "payroll",
    "SMS alerts",
  ],
  openGraph: {
    title: "SKULI - The Operating System for Ugandan Schools",
    description:
      "Manage fees, track results, send SMS alerts, and run payroll - all from one platform built for Ugandan private schools.",
    url: "https://skuli.app",
    siteName: "SKULI",
    locale: "en_UG",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-heading font-sans transition-colors duration-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

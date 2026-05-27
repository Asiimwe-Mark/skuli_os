import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
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

export const metadata: Metadata = {
  title: {
    default: "SKULI \u2014 The Operating System for Ugandan Schools",
    template: "%s | SKULI",
  },
  description:
    "Manage fees, track results, send SMS alerts, and run payroll \u2014 all from one platform built for Ugandan private schools.",
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
    title: "SKULI \u2014 The Operating System for Ugandan Schools",
    description:
      "Manage fees, track results, send SMS alerts, and run payroll \u2014 all from one platform built for Ugandan private schools.",
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
      className={`${jakarta.variable} ${fraunces.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy text-foreground font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

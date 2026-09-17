import type { Metadata, Viewport } from "next";
import StructuredData from "@/components/StructuredData";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://shouldibuy.it";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Should I Buy It? — AI Purchase Affordability & 90-Day Cash Flow Simulator",
    template: "%s | Should I Buy It?",
  },
  description:
    "Stop guessing if you can afford that purchase. Should I Buy It mathematically simulates your recurring payroll, essential bills, and emergency reserve buffer over the next 90 days before you spend.",
  keywords: [
    "should I buy it",
    "should I buy this",
    "can I afford this",
    "purchase affordability calculator",
    "90 day cash flow simulator",
    "financial commitment assistant",
    "impulse buy checker",
    "personal finance AI",
    "budget simulator",
    "affordability checker",
    "smart purchase advisor",
    "emergency buffer protection",
    "payment plan simulator",
  ],
  authors: [{ name: "Should I Buy It AI Team" }],
  creator: "Should I Buy It",
  publisher: "Should I Buy It",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Should I Buy It? — AI Purchase Affordability & 90-Day Simulator",
    description:
      "Mathematically verify if any purchase fits your budget without depleting your emergency reserve over the next 90 days.",
    url: siteUrl,
    siteName: "Should I Buy It?",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Should I Buy It? — AI Purchase Affordability & 90-Day Simulator",
    description:
      "Verify purchase affordability with 90-day forward liquidity simulation before committing funds.",
    creator: "@shouldibuyit",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "finance",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <StructuredData />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('theme');
                  var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#fbfbfd] text-[#1d1d1f] dark:bg-[#000000] dark:text-[#f5f5f7] select-none transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}

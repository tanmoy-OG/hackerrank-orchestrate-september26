import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buy or Wait? — AI Financial Decision Engine",
  description: "Autonomous multimodal financial intelligence platform providing mathematically verified purchase & commitment decisions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#fbfbfd] text-[#1d1d1f]">
        {children}
      </body>
    </html>
  );
}

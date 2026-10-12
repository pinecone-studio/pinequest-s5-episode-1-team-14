import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Монгол кирилл (Ө, Ү) нь cyrillic-ext дэд багцад байдаг.
const inter = Inter({ subsets: ["latin", "cyrillic", "cyrillic-ext"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "AI Front-Desk Mongolia",
  description: "Дуудлага, захиалга, бизнесийн мэдээллээ нэг дороос удирдаарай.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="mn" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}

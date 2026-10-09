import type { Metadata } from "next";
import Script from "next/script";
import "../public/theme.css";
import "./globals.css";

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
    <html lang="mn" suppressHydrationWarning>
      <body>
        {children}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}

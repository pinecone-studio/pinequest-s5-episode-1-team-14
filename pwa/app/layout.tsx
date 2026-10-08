import type { Metadata } from "next";
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
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}

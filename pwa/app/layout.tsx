import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Front-Desk Mongolia",
  description: "Backup web channel + dashboard for the AI front-desk agent",
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

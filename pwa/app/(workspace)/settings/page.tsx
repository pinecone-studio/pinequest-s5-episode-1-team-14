import type { Metadata } from "next";
import SettingsPage from "@/components/settings-page";

export const metadata: Metadata = { title: "Тохиргоо · AI Front-Desk Mongolia" };

export default function Page() {
  return <SettingsPage />;
}
import type { Metadata } from "next";
import SettingsPage from "@/components/settings-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Тохиргоо · CallAI" };

export default async function Page() {
  return <SettingsPage {...await getSettings()} />;
}

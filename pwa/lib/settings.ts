import { fetchBackend, isMockMode, type DataSource } from "./data-source";

export type VoiceOption = { key: string; label: string };
export type BusinessSettings = { name: string; voice: string | null; voices: VoiceOption[]; numbers: string[] };

const demoSettings: BusinessSettings = {
  name: "Жишээ ресторан", voice: null, numbers: [],
  voices: [
    { key: "uyanga", label: "Уянга — эмэгтэй, найрсаг" },
    { key: "naran", label: "Наран — эрэгтэй, тайван" },
    { key: "oyuna", label: "Оюуна — эмэгтэй, дулаахан" },
  ],
};

export async function getSettings(): Promise<{ settings: BusinessSettings | null; source: DataSource }> {
  if (isMockMode()) return { settings: demoSettings, source: "demo" };
  const settings = await fetchBackend<BusinessSettings>("/api/settings");
  return { settings, source: settings ? "live" : "offline" };
}

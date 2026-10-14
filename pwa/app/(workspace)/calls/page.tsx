import type { Metadata } from "next";
import CallsPage from "@/components/calls-page";
import { getCalls, getTranscripts } from "@/lib/calls";

export const metadata: Metadata = { title: "Дуудлагууд · CallAI" };

export default async function Page() {
  const [calls, transcripts] = await Promise.all([getCalls(), getTranscripts()]);
  return <CallsPage {...calls} transcripts={transcripts} />;
}

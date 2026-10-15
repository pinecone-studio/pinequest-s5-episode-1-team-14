import type { Metadata } from "next";
import KnowledgePage from "@/components/knowledge-page";
import { getKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = { title: "Мэдээллийн сан · CallAI" };

export default async function Page() {
  return <KnowledgePage {...await getKnowledge()} />;
}

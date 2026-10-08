import type { Metadata } from "next";
import KnowledgePage from "@/components/knowledge-page";
import { getKnowledge } from "@/lib/knowledge";

export const metadata: Metadata = { title: "Мэдээллийн сан · AI Front-Desk Mongolia" };

export default function Page() {
  return <KnowledgePage {...getKnowledge()} />;
}

import type { Metadata } from "next";
import TestCallPage from "@/components/test-call-page";

export const metadata: Metadata = { title: "Туршилтын дуудлага · CallAI" };

export default function Page() {
  return <TestCallPage />;
}

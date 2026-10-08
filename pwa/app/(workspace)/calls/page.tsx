import type { Metadata } from "next";
import CallsPage from "@/components/calls-page";
import { getCalls } from "@/lib/calls";

export const metadata: Metadata = { title: "Дуудлагууд · AI Front-Desk Mongolia" };

export default function Page() {
  return <CallsPage {...getCalls()} />;
}

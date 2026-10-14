import type { Metadata } from "next";
import AuthForm from "@/components/auth-form";

export const metadata: Metadata = { title: "Нэвтрэх · CallAI" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return <AuthForm mode="login" next={searchParams.next} error={searchParams.error} />;
}

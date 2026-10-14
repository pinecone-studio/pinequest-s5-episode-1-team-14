import type { Metadata } from "next";
import AuthForm from "@/components/auth-form";

export const metadata: Metadata = { title: "Бүртгүүлэх · CallAI" };

export default function SignupPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return <AuthForm mode="signup" next={searchParams.next} error={searchParams.error} />;
}

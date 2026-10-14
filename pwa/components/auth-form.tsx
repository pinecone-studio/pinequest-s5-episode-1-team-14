import Image from "next/image";
import Link from "next/link";
import { safeNext } from "@/lib/session";

const ERRORS: Record<string, string> = {
  wrong: "Имэйл эсвэл нууц үг буруу байна.",
  invalid: "Мэдээллээ шалгана уу: зөв имэйл, 8-аас дээш тэмдэгттэй нууц үг, бизнесийн нэр.",
  exists: "Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна. Нэвтэрнэ үү.",
  wait: "Хэт олон оролдлого хийсэн тул түр хүлээгээд дахин оролдоно уу.",
  offline: "Сервертэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
};

// Нэвтрэх, бүртгүүлэх хоёр хуудасны нийтлэг маягт.
export default function AuthForm({ mode, next, error }: { mode: "login" | "signup"; next?: string; error?: string }) {
  const signup = mode === "signup";
  const message = error ? ERRORS[error] : undefined;
  const target = safeNext(next);
  return <main className="login">
    <form className="login-card" method="post" action="/api/login">
      <Link className="brand login-brand" href="/"><Image src="/logo-mark.png" alt="" width={36} height={36} priority /><span>Call<b>AI</b></span></Link>
      <div>
        <h1 className="page-title">{signup ? "Бүртгүүлэх" : "Нэвтрэх"}</h1>
        <p className="page-subtitle">{signup ? "Бизнесээ бүртгүүлээд өөрийн хянах самбартай болоорой." : "Өөрийн бизнесийн хянах самбарт нэвтэрнэ үү."}</p>
      </div>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={target} />
      {signup && <label className="login-field">
        <span>Бизнесийн нэр</span>
        <input className="input" name="businessName" autoComplete="organization" maxLength={80} required autoFocus />
      </label>}
      <label className="login-field">
        <span>Имэйл</span>
        <input className="input" type="email" name="email" autoComplete="email" required autoFocus={!signup} />
      </label>
      <label className="login-field">
        <span>Нууц үг</span>
        <input className="input" type="password" name="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
        {signup && <small className="muted">Хамгийн багадаа 8 тэмдэгт.</small>}
      </label>
      {message && <p className="login-error" role="alert">{message}</p>}
      <button className="btn btn-primary" type="submit">{signup ? "Бүртгүүлэх" : "Нэвтрэх"}</button>
      <p className="login-switch muted">
        {signup ? "Бүртгэлтэй юу? " : "Бүртгэл байхгүй юу? "}
        <Link href={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(target)}`}>{signup ? "Нэвтрэх" : "Бүртгүүлэх"}</Link>
      </p>
    </form>
  </main>;
}

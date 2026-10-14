import DashboardShell from "@/components/dashboard-shell";
import { Icon } from "@/components/ui";
import { fetchBackend, isMockMode } from "@/lib/data-source";

type Me = { email: string; business: { id: string; name: string }; numbers?: string[] };

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const me = isMockMode() ? null : await fetchBackend<Me>("/api/me");
  // Дугаар холбогдоогүй бизнест анхааруулна (дугаар сонгох хэсэг удахгүй).
  const noLine = me !== null && !me.numbers?.length;
  return <DashboardShell account={me ? { email: me.email, business: me.business.name, numbers: me.numbers ?? [] } : null}>
    {noLine && <p className="banner"><Icon name="phone" />Танай бизнест утасны дугаар хараахан холбогдоогүй байна. Дугаар холбогдсоны дараа дуудлага, захиалга энд харагдана.</p>}
    {children}
  </DashboardShell>;
}

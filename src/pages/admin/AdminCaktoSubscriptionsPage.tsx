import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, CalendarDays, CreditCard, Loader2, RefreshCw, Search, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { veloToast as toast } from "@/components/ui/velo-toast";

type Order = {
  id: string;
  email: string;
  customer_name: string | null;
  plan: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  provider_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const planName = (plan: string) => ({ base: "Base", pro: "Pro", business: "Business" }[plan] ?? plan);
const statusName = (status: string) => ({ paid: "Ativo", expired: "Expirado", cancelled: "Cancelado", refunded: "Reembolsado", chargeback: "Chargeback", pending: "Pendente", failed: "Falhou" }[status] ?? status);

export default function AdminCaktoSubscriptionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const owner = user?.email?.toLowerCase() === "alicegplima10@gmail.com";

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("cakto-admin", { body: { action: "list" } });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível carregar as compras.");
      setOrders((data?.orders ?? []) as Order[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar assinaturas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((item) => [item.email, item.customer_name, item.plan, item.payment_method, item.provider_payment_id].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [orders, search]);

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter((item) => item.status === "paid" && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())).length,
    expired: orders.filter((item) => item.status === "expired").length,
    revenue: orders.filter((item) => ["paid", "expired"].includes(item.status)).reduce((sum, item) => sum + item.amount_cents, 0),
  }), [orders]);

  const cancel = async (order: Order) => {
    if (!window.confirm(`Encerrar o plano ${planName(order.plan)} de ${order.email}? O acesso será removido imediatamente.`)) return;
    setWorking(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("cakto-admin", {
        body: { action: "cancel", order_id: order.id, reason: "Encerrado manualmente pelo painel administrativo" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível encerrar o plano.");
      toast.success("Plano encerrado e acesso revogado.");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao encerrar plano.");
    } finally {
      setWorking(null);
    }
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center bg-[#08090D] text-white"><Loader2 className="animate-spin" size={22} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!owner) return <Navigate to="/dashboard" replace />;

  return (
    <AdminShell active="plans" userId={user.id} title="Assinaturas Cakto" subtitle="Acompanhe pagamentos, validade e controle de acesso dos clientes.">
      <div className="space-y-5 text-white">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Compras registradas" value={String(stats.total)} icon={<CreditCard size={17} />} />
          <Metric label="Planos ativos" value={String(stats.active)} icon={<ShieldCheck size={17} />} />
          <Metric label="Planos expirados" value={String(stats.expired)} icon={<CalendarDays size={17} />} />
          <Metric label="Volume de compras" value={money(stats.revenue)} icon={<Activity size={17} />} />
        </div>

        <section className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#11141b] shadow-[0_18px_50px_rgba(0,0,0,.24)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-white">Clientes e pagamentos</h2>
              <p className="mt-1 text-xs text-white/40">Dados recebidos e confirmados pela Cakto.</p>
            </div>
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1 md:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, e-mail ou plano" className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-blue-400/50" />
              </label>
              <button onClick={() => void load(true)} disabled={refreshing} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06] disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Atualizar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center text-blue-300"><Loader2 className="animate-spin" size={22} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <UserRound className="mx-auto text-white/25" size={26} />
              <p className="mt-3 text-sm font-semibold text-white/75">Nenhuma compra encontrada</p>
              <p className="mt-1 text-xs text-white/35">As próximas compras aprovadas aparecerão automaticamente aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-[12px]">
                <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-white/35">
                  <tr>
                    <th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Pagamento</th><th className="px-4 py-3">Compra</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const active = item.status === "paid" && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now());
                    return (
                      <tr key={item.id} className="border-t border-white/[0.055] align-middle transition hover:bg-white/[0.025]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white">{item.customer_name || "Cliente"}</p>
                          <p className="mt-1 text-[11px] text-white/40">{item.email}</p>
                        </td>
                        <td className="px-4 py-4"><span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-semibold text-white/80">{planName(item.plan)}</span></td>
                        <td className="px-4 py-4 font-semibold tabular-nums text-white">{money(item.amount_cents)}</td>
                        <td className="px-4 py-4 text-white/65">{item.payment_method || "Não informado"}</td>
                        <td className="px-4 py-4 text-white/60">{date(item.paid_at || item.created_at)}</td>
                        <td className="px-4 py-4 text-white/60">{item.expires_at ? date(item.expires_at) : item.plan === "business" ? "Vitalício" : "—"}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.07] text-white/45"}`}>{statusName(item.status)}</span></td>
                        <td className="px-4 py-4 text-right">
                          {active ? <button onClick={() => void cancel(item)} disabled={working === item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-2 text-[11px] font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50">{working === item.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Encerrar plano</button> : <span className="text-[11px] text-white/25">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="text-[11px] leading-5 text-white/30">O encerramento manual revoga o acesso imediatamente. Reembolsos, chargebacks e cancelamentos enviados pela Cakto também atualizam o status automaticamente quando o webhook estiver configurado para esses eventos.</p>
      </div>
    </AdminShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-[16px] border border-white/[0.08] bg-[#11141b] p-4 shadow-[0_14px_36px_rgba(0,0,0,.18)]"><div className="flex items-center justify-between text-white/40"><span className="text-[11px] font-medium">{label}</span><span className="text-blue-300">{icon}</span></div><p className="mt-3 text-[25px] font-semibold tracking-[-0.04em] text-white">{value}</p></div>;
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { CalendarDays, ShoppingBag, TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Period = "7" | "30" | "90" | "all";
type Sale = { id: string; date: string; amount: number; quantity: number; source: "Mercado Livre" | "Loja"; };
const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dateLabel = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export default function SalesDashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30");
  const { data: sales = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sales-dashboard", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Sale[]> => {
      const [ml, store] = await Promise.all([
        supabase.from("ml_orders_view").select("id,created_at,ordered_at,total_amount,sale_price,quantity,status,user_id").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(2000),
        supabase.from("store_orders").select("id,created_at,total,quantity,payment_status,user_id").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(2000),
      ]);
      if (ml.error) throw ml.error;
      if (store.error) throw store.error;
      const paid = new Set(["paid", "approved", "completed", "delivered", "shipped", "in_transit"]);
      const mlSales: Sale[] = (ml.data ?? []).filter((r: any) => paid.has(String(r.status ?? "").toLowerCase())).map((r: any) => ({
        id: "ml-" + r.id, date: r.ordered_at || r.created_at,
        amount: Number(r.total_amount ?? (Number(r.sale_price ?? 0) * Number(r.quantity ?? 1))),
        quantity: Number(r.quantity ?? 1), source: "Mercado Livre",
      })).filter((r) => !!r.date && Number.isFinite(r.amount));
      const storeSales: Sale[] = (store.data ?? []).filter((r: any) => paid.has(String(r.payment_status ?? "").toLowerCase())).map((r: any) => ({
        id: "store-" + r.id, date: r.created_at, amount: Number(r.total ?? 0),
        quantity: Number(r.quantity ?? 1), source: "Loja",
      })).filter((r) => !!r.date && Number.isFinite(r.amount));
      return [...mlSales, ...storeSales];
    },
  });
  const filtered = useMemo(() => {
    if (period === "all") return sales;
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (Number(period) - 1));
    return sales.filter((sale) => new Date(sale.date) >= start);
  }, [sales, period]);
  const metrics = useMemo(() => ({
    revenue: filtered.reduce((sum, sale) => sum + sale.amount, 0),
    orders: filtered.length, units: filtered.reduce((sum, sale) => sum + sale.quantity, 0),
    ticket: filtered.length ? filtered.reduce((sum, sale) => sum + sale.amount, 0) / filtered.length : 0,
  }), [filtered]);
  const chartData = useMemo(() => {
    const days = period === "7" ? 7 : 30;
    const grouped = new Map<string, { date: string; revenue: number; orders: number }>();
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
      grouped.set(key, { date: key, revenue: 0, orders: 0 });
    }
    filtered.forEach((sale) => {
      const d = new Date(sale.date);
      const key = [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
      const item = grouped.get(key); if (item) { item.revenue += sale.amount; item.orders += 1; }
    });
    return Array.from(grouped.values()).map((item) => ({ ...item, label: dateLabel(item.date) }));
  }, [filtered, period]);
  const sourceTotals = useMemo(() => [
    { name: "Mercado Livre", total: filtered.filter(s => s.source === "Mercado Livre").reduce((n,s)=>n+s.amount,0) },
    { name: "Loja", total: filtered.filter(s => s.source === "Loja").reduce((n,s)=>n+s.amount,0) },
  ], [filtered]);
  const periodLabel = period === "all" ? "Todo o período disponível" : period === "7" ? "Últimos 7 dias" : period === "30" ? "Últimos 30 dias" : "Últimos 90 dias";

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Desempenho da loja</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe suas vendas e resultados por período.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"><CalendarDays size={16}/><select aria-label="Período das vendas" value={period} onChange={e=>setPeriod(e.target.value as Period)} className="bg-transparent font-medium text-foreground outline-none"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="all">Todo período</option></select></div>
        <button onClick={()=>void refetch()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><RefreshCw size={15} className={isFetching ? "animate-spin" : ""}/> Atualizar</button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{periodLabel} · vendas confirmadas do Mercado Livre e da sua loja</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Faturamento", value: money(metrics.revenue), icon: Wallet, hint: "Total vendido no período" },
        { label: "Pedidos", value: metrics.orders.toLocaleString("pt-BR"), icon: ShoppingBag, hint: "Vendas confirmadas" },
        { label: "Ticket médio", value: money(metrics.ticket), icon: TrendingUp, hint: "Valor médio por pedido" },
        { label: "Unidades vendidas", value: metrics.units.toLocaleString("pt-BR"), icon: CalendarDays, hint: "Quantidade de itens" },
      ].map((card) => <div key={card.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{card.label}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><card.icon size={18}/></span></div><div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{isLoading ? "—" : card.value}</div><p className="mt-1 text-xs text-muted-foreground">{card.hint}</p></div>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-5"><h2 className="text-base font-semibold text-foreground">Vendas ao longo do tempo</h2><p className="mt-1 text-xs text-muted-foreground">Faturamento diário · {periodLabel.toLowerCase()}</p></div>
        {isLoading ? <div className="h-[280px] animate-pulse rounded-xl bg-muted"/> : <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:8,right:8,left:4,bottom:0}}><defs><linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))"/><XAxis dataKey="label" tick={{fontSize:11,fill:"#888"}} axisLine={false} tickLine={false} minTickGap={18}/><YAxis tick={{fontSize:11,fill:"#888"}} axisLine={false} tickLine={false} tickFormatter={(v)=>"R$"+(v>=1000?(v/1000).toFixed(1)+"k":v)}/><Tooltip formatter={(v:any)=>money(Number(v))} labelStyle={{color:"#111827"}}/><Area type="monotone" dataKey="revenue" name="Faturamento" stroke="#3B82F6" strokeWidth={2.5} fill="url(#salesGradient)" activeDot={{r:5}}/></AreaChart></ResponsiveContainer></div>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="text-base font-semibold text-foreground">Vendas por canal</h2><p className="mt-1 text-xs text-muted-foreground">Faturamento em cada origem</p><div className="mt-5 space-y-5">{sourceTotals.map(s=><div key={s.name}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{s.name}</span><strong className="font-semibold text-foreground">{money(s.total)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-500" style={{width:metrics.revenue ? Math.min(100,s.total/metrics.revenue*100)+"%" : "0%"}}/></div></div>)}</div><div className="mt-7 rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Total de faturamento</p><p className="mt-1 text-xl font-semibold text-foreground">{money(metrics.revenue)}</p></div></section>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4"><h2 className="text-base font-semibold text-foreground">Quantidade de pedidos</h2><p className="mt-1 text-xs text-muted-foreground">Pedidos confirmados por dia</p></div><div className="h-[230px] w-full">{isLoading ? <div className="h-full animate-pulse rounded-xl bg-muted"/> : <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))"/><XAxis dataKey="label" tick={{fontSize:11,fill:"#888"}} axisLine={false} tickLine={false} minTickGap={18}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:"#888"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:any)=>[v,"Pedidos"]}/><Bar dataKey="orders" name="Pedidos" fill="#3B82F6" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer>}</div>{!isLoading && filtered.length===0 && <p className="pt-3 text-center text-sm text-muted-foreground">Nenhuma venda confirmada neste período.</p>}</section>
  </div>;
}

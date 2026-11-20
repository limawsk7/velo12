import { useMemo, useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";

const base = [120,185,240,190,310,275,420,360,250];
const money = (n:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);

export default function AdminSimulatorPage() {
  const [gross,setGross] = useState(2350);
  const [approved,setApproved] = useState(31);
  const [churn,setChurn] = useState(2);
  const [exits,setExits] = useState(8);
  const values = useMemo(() => base.map((v,i) => ({day:String(i+1).padStart(2,"0"),gross:Math.round(v*gross/2360),net:Math.round(v*gross/2360*.9)})),[gross]);
  const net = Math.round(gross*.9);
  const card = "rounded-2xl border border-white/10 bg-white/[0.04] p-5";
  const randomize = () => { const g=2100+Math.floor(Math.random()*600); setGross(g); setApproved(24+Math.floor(Math.random()*18)); setChurn(1+Math.floor(Math.random()*4)); setExits(4+Math.floor(Math.random()*9)); };
  return <AdminShell active="dashboard" title="Simulador" subtitle="Indicadores demonstrativos com números fictícios.">
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
        <div className="flex items-center gap-3"><FlaskConical className="text-amber-300"/><div><p className="font-semibold text-amber-200">Modo de simulação ativo</p><p className="text-xs text-slate-400">Dados fictícios; não alteram o financeiro ou as vendas reais.</p></div></div>
        <div className="flex gap-2"><button onClick={()=>{setGross(2350);setApproved(31);setChurn(2);setExits(8)}} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"><RotateCcw size={15}/> Restaurar</button><button onClick={randomize} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Gerar novos números</button></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[["Receita bruta",money(gross),"Faturamento simulado"],["Receita líquida",money(net),"90% da receita bruta"],["Vendas aprovadas",String(approved),"Pagamentos confirmados"],["Churn",churn+"%", "Cancelamentos simulados"],["Saídas",String(exits),"Abandonos simulados"]].map(([label,value,hint])=><div key={label} className={card}><p className="text-xs text-slate-400">{label}</p><p className="mt-3 text-2xl font-bold text-white">{value}</p><p className="mt-2 text-xs text-slate-500">{hint}</p></div>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={card}><h2 className="font-semibold text-white">Receita bruta x líquida</h2><p className="mb-6 mt-1 text-xs text-slate-400">Evolução diária proporcional • valores em R$</p><div className="flex h-64 items-end gap-2 border-b border-white/10 pb-2">{values.map(v=><div key={v.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-[88%] w-full items-end justify-center gap-1"><div title={"Bruta "+money(v.gross)} className="w-1/2 rounded-t bg-violet-500" style={{height:(v.gross/gross*100*2.2)+"%"}}/><div title={"Líquida "+money(v.net)} className="w-1/2 rounded-t bg-emerald-400" style={{height:(v.net/gross*100*2.2)+"%"}}/></div><span className="text-[10px] text-slate-500">{v.day}</span></div>)}</div><div className="mt-4 flex gap-5 text-xs text-slate-400"><span>🟣 Receita bruta</span><span>🟢 Receita líquida</span></div></section>
        <section className={card}><h2 className="font-semibold text-white">Vendas aprovadas</h2><p className="mb-6 mt-1 text-xs text-slate-400">Distribuição de aprovações no período</p><div className="flex h-64 items-end gap-3 border-b border-white/10 pb-2">{values.slice(0,7).map((v,i)=>{const count=Math.max(1,Math.round(approved*[.08,.12,.16,.1,.2,.17,.17][i]));return <div key={v.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="flex w-full items-end justify-center" style={{height:"88%"}}><div className="w-full max-w-10 rounded-t-md bg-violet-500" style={{height:(count/Math.max(1,approved*.22)*100)+"%"}}/></div><span className="text-[10px] text-slate-500">{v.day}</span></div>})}</div><p className="mt-4 text-xs text-slate-400">{approved} vendas aprovadas no cenário</p></section>
      </div>
      <section className={card}><h2 className="font-semibold text-white">Churn e saídas</h2><p className="mb-5 mt-1 text-xs text-slate-400">Indicadores de cancelamento e abandono, proporcionais ao cenário</p><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-rose-400/10 p-4"><p className="text-sm text-rose-200">Churn</p><p className="mt-2 text-3xl font-bold text-white">{churn}%</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-rose-400" style={{width:Math.min(churn*10,100)+"%"}}/></div></div><div className="rounded-xl bg-amber-400/10 p-4"><p className="text-sm text-amber-200">Saídas</p><p className="mt-2 text-3xl font-bold text-white">{exits}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400" style={{width:Math.min(exits*6,100)+"%"}}/></div></div></div></section>
      <p className="text-center text-[11px] text-slate-500">Simulador visual • Dados temporários • Não representam resultados reais</p>
    </div>
  </AdminShell>;
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowCircleLeft,
  Bank,
  CaretRight,
  ChartLine,
  FileMagnifyingGlass,
  House,
  type Icon as PhosphorIcon,
  Lifebuoy,
  Receipt,
  Robot,
  Sparkle,
  Stethoscope,
  Tray,
  User,
} from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadSupportTickets } from "@/hooks/useUnreadSupportTickets";
import { preloadAdminPage } from "@/pages/admin/adminPages";

type NavChild = { label: string; to: string };
type NavItem = { label: string; icon: PhosphorIcon; to: string; badge?: number; badgeLabel?: string; children?: NavChild[] };
type NavSection = { id: string; label?: string; items: NavItem[] };

const matchesPath = (pathname: string, to: string) => {
  const target = to.replace(/\/$/, "");
  return pathname === target || pathname.startsWith(`${target}/`);
};

export const AdminNewSidebar = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: unreadTickets = 0 } = useUnreadSupportTickets();
  const [simulationOn, setSimulationOn] = useState(() => {
    try { return window.localStorage.getItem("fornece:admin-simulation") === "on"; } catch { return false; }
  });

  const toggleSimulation = () => {
    const next = !simulationOn;
    setSimulationOn(next);
    try { window.localStorage.setItem("fornece:admin-simulation", next ? "on" : "off"); } catch { /* storage indisponível */ }
    window.dispatchEvent(new CustomEvent("fornece:admin-simulation-change", { detail: next }));
  };

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel("admin-sidebar-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-sidebar-open-support-tickets"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets-crm"] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const sections: NavSection[] = [
    { id: "principal", items: [
      { label: "Início", icon: House, to: "/admin/painel" },
      { label: "Vendas", icon: Receipt, to: "/admin/vendas" },
      ...(user?.email?.toLowerCase() === "alicegplima10@gmail.com" ? [{ label: "Assinaturas", icon: Receipt, to: "/admin/assinaturas" }] : []),
      { label: "Usuários", icon: User, to: "/admin/usuarios" },
      { label: "Financeiro", icon: Bank, to: "/admin/comissoes", children: [
        { label: "Afiliados", to: "/admin/comissoes" }, { label: "Reembolsos", to: "/admin/reembolsos" },
      ]},
      { label: "Suporte", icon: Tray, to: "/admin/suporte", badge: unreadTickets, badgeLabel: "não lidos" },
      { label: "Assistente IA", icon: Sparkle, to: "/admin/assistente-ia" },
      { label: "Rastreio", icon: ChartLine, to: "/admin/rastreio" },
    ]},
    { id: "operacao", label: "Operação", items: [
      { label: "Evidências", icon: FileMagnifyingGlass, to: "/admin/evidencias" },
      { label: "Consulta", icon: Stethoscope, to: "/admin/consulta" },
      { label: "Automação BOT", icon: Robot, to: "/admin/automacao-bot" },
    ]},
    { id: "conteudo", label: "Conteúdo", items: [
      { label: "Central de ajuda", icon: Lifebuoy, to: "/admin/central-de-ajuda" },
    ]},
  ];

  const isItemActive = (item: NavItem) => item.children
    ? item.children.some(child => matchesPath(pathname, child.to))
    : matchesPath(pathname, item.to);

  const renderItem = (item: NavItem) => {
    const active = isItemActive(item);
    const Icon = item.icon;
    return <li key={item.to + item.label}>
      <Link to={item.to} aria-current={active && !item.children ? "page" : undefined}
        data-active={active || undefined} className="admin-nav-item"
        onMouseEnter={() => preloadAdminPage(item.to, queryClient)}
        onFocus={() => preloadAdminPage(item.to, queryClient)}>
        {active ? <motion.span layoutId="admin-nav-pill" aria-hidden="true" className="admin-nav-pill"
          transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.9 }} /> : null}
        <Icon aria-hidden="true" weight="fill" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge && item.badge > 0 ? <span className="admin-nav-badge" aria-label={`${item.badge} ${item.badgeLabel ?? "em aberto"}`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
      </Link>
      <AnimatePresence initial={false}>
        {active && item.children ? <motion.ul key="subitens" className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {item.children.map(child => <li key={child.to}><Link to={child.to}
            aria-current={matchesPath(pathname, child.to) ? "page" : undefined}
            className="admin-nav-subitem" onMouseEnter={() => preloadAdminPage(child.to, queryClient)}
            onFocus={() => preloadAdminPage(child.to, queryClient)}>{child.label}</Link></li>)}
        </motion.ul> : null}
      </AnimatePresence>
    </li>;
  };

  return <aside className="admin-nav relative hidden h-full w-[252px] shrink-0 flex-col md:flex" data-admin-native>
    <nav aria-label="Navegação principal do admin" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 pl-[18px] pr-[23px] pt-5">
      {sections.map(section => <section key={section.id} aria-label={section.label ?? "Menu principal"} className={section.label ? "mt-6" : ""}>
        {section.label ? <p className="admin-nav-section"><span>{section.label}</span><CaretRight aria-hidden="true" weight="bold" /></p> : null}
        <ul>{section.items.map(renderItem)}</ul>
      </section>)}
      <div className="mt-7 border-t border-current/10 pt-4">
        <p className="admin-nav-section mb-2"><span>EXTRAS</span></p>
        <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <ChartLine aria-hidden="true" weight="fill" className={simulationOn ? "text-violet-400" : ""} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">Simulação</p>
              <p className="text-[11px] text-current/55">{simulationOn ? "Modo ON" : "Modo OFF"}</p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={simulationOn}
            aria-label={simulationOn ? "Desativar modo de simulação" : "Ativar modo de simulação"}
            onClick={toggleSimulation}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${simulationOn ? "bg-violet-500" : "bg-white/20"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${simulationOn ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>
      <ul className="mt-6"><li><Link to="/dashboard" className="admin-nav-item">
        <ArrowCircleLeft aria-hidden="true" weight="fill" /><span className="min-w-0 flex-1 truncate">Voltar ao Fornece Cloud</span>
      </Link></li></ul>
    </nav>
  </aside>;
};

export default AdminNewSidebar;

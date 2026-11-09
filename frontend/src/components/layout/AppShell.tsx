"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Award,
  BarChart3,
  Bookmark,
  Box,
  Cloud,
  Columns3,
  Database,
  Folder,
  FolderKanban,
  Gauge,
  Headphones,
  LogOut,
  Menu,
  Moon,
  Palette,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Table2,
  UserCheck,
  Users,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { NexformLogo } from "@/components/brand/NexformLogo";
import { useAuth } from "@/context/AuthContext";
import { usersApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export type RailModuleKey =
  | "content"
  | "people"
  | "files"
  | "insights"
  | "cloud"
  | "settings";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchSection?: string;
  matchLayout?: string;
  badge?: string;
}

/**
 * Mapeamento determinístico 1:1 — cada rota pertence a um único módulo da barra lateral.
 */
function inferModuleFromRoute(
  pathname: string,
  section: string | null,
  layout: string | null
): RailModuleKey {
  if (
    pathname.startsWith("/analysts") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/sectors")
  ) {
    return "people";
  }

  if (pathname.startsWith("/calls")) {
    return "files";
  }

  if (pathname.startsWith("/benchmarks")) {
    return "insights";
  }

  if (
    pathname.startsWith("/customers") ||
    pathname.startsWith("/flows") ||
    pathname.startsWith("/integrations")
  ) {
    return "cloud";
  }

  if (pathname.startsWith("/studio")) {
    if (section === "content") {
      if (layout === "activity") return "insights";
      return "files";
    }
    return "settings";
  }

  // /dashboard, /evaluations, /forms
  return "content";
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isGestor, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSection = searchParams.get("section");
  const currentLayout = searchParams.get("layout");

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [analystSidebarSearch, setAnalystSidebarSearch] = useState("");

  const [activeModule, setActiveModule] = useState<RailModuleKey>(() =>
    inferModuleFromRoute(pathname, currentSection, currentLayout)
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, currentSection, currentLayout]);

  const handleSelectModule = (
    mod: RailModuleKey,
    defaultHref: string,
    keepMobileDrawerOpen = false
  ) => {
    setActiveModule(mod);
    if (!keepMobileDrawerOpen) {
      router.push(defaultHref);
    }
  };

  // Sincroniza sempre o módulo ativo com a rota atual (sem misturar seções)
  useEffect(() => {
    if (!user) return;
    if (!isGestor) {
      setActiveModule("content");
      return;
    }
    setActiveModule(
      inferModuleFromRoute(pathname, currentSection, currentLayout)
    );
  }, [pathname, currentSection, currentLayout, isGestor, user]);

  const { data: analysts = [] } = useQuery({
    queryKey: ["analysts-sidebar-list", user?.id],
    queryFn: () => usersApi.list("ROLE_ANALISTA", true),
    enabled: !!user && isGestor,
  });

  if (!user) {
    return null;
  }

  const moduleHeaderMeta: Record<
    RailModuleKey,
    { title: string; subtitle: string }
  > = {
    content: {
      title: "NEXFORM",
      subtitle: isGestor ? "Monitoria & Qualidade" : "Portal do Analista",
    },
    people: {
      title: "NEXFORM",
      subtitle: "Pessoas & Setores",
    },
    files: {
      title: "NEXFORM",
      subtitle: "Gravações & Fila",
    },
    insights: {
      title: "NEXFORM",
      subtitle: "Indicadores & Relatórios",
    },
    cloud: {
      title: "NEXFORM",
      subtitle: "Integrações & Automação",
    },
    settings: {
      title: "NEXFORM",
      subtitle: "Configurações",
    },
  };

  // 1. MONITORIA & QUALIDADE (Somente Dashboard, Avaliações e Formulários)
  const contentOverviewItems: NavItem[] = isGestor
    ? [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: Gauge,
        },
        {
          label: "Avaliações",
          href: "/evaluations",
          icon: BarChart3,
        },
      ]
    : [
        {
          label: "Meu Dashboard",
          href: "/dashboard",
          icon: Gauge,
        },
        {
          label: "Minhas Avaliações",
          href: "/evaluations",
          icon: BarChart3,
        },
      ];

  const contentFormsItems: NavItem[] = [
    {
      label: "Formulários",
      href: "/forms",
      icon: FolderKanban,
    },
    {
      label: "Novo Formulário",
      href: "/forms?action=new",
      icon: PlusCircle,
    },
  ];

  // 2. PESSOAS & SETORES (Somente Analistas, Usuários e Setores)
  const peopleModuleItems: NavItem[] = [
    {
      label: "Analistas",
      href: "/analysts",
      icon: Users,
    },
    {
      label: "Usuários",
      href: "/users",
      icon: UserCheck,
    },
    {
      label: "Setores",
      href: "/sectors",
      icon: Folder,
    },
  ];

  // 3. GRAVAÇÕES & FILA (Somente Gravações, Fila Kanban e Explorador)
  const filesModuleItems: NavItem[] = [
    {
      label: "Gravações",
      href: "/calls",
      icon: Headphones,
    },
    {
      label: "Fila Kanban",
      href: "/studio?section=content&layout=kanban",
      icon: Columns3,
      matchSection: "content",
      matchLayout: "kanban",
    },
    {
      label: "Explorador de Dados",
      href: "/studio?section=content&layout=table",
      icon: Table2,
      matchSection: "content",
      matchLayout: "table",
    },
  ];

  // 4. INDICADORES & RELATÓRIOS (Somente Benchmarks e Trilha de Auditoria)
  const insightsModuleItems: NavItem[] = [
    {
      label: "Benchmarks",
      href: "/benchmarks",
      icon: Award,
    },
    {
      label: "Trilha de Auditoria",
      href: "/studio?section=content&layout=activity",
      icon: Activity,
      matchSection: "content",
      matchLayout: "activity",
    },
  ];

  // 5. INTEGRAÇÕES & AUTOMAÇÃO (Somente Clientes CRM, Fluxos e Webhooks n8n)
  const cloudModuleItems: NavItem[] = [
    {
      label: "Busca de Clientes",
      href: "/customers",
      icon: Search,
    },
    {
      label: "Fluxos de Automação",
      href: "/flows",
      icon: Zap,
    },
    {
      label: "Webhooks & n8n",
      href: "/integrations/n8n",
      icon: Webhook,
    },
  ];

  // 6. CONFIGURAÇÕES (Somente Governança, Modelo de Dados e Sistema)
  const settingsItems: NavItem[] = [
    {
      label: "Políticas de Acesso",
      href: "/studio?section=access-policies",
      icon: ShieldCheck,
      matchSection: "access-policies",
    },
    {
      label: "Modelo de Dados",
      href: "/studio?section=data-model",
      icon: Database,
      matchSection: "data-model",
    },
    {
      label: "Parâmetros Gerais",
      href: "/studio?section=settings",
      icon: SlidersHorizontal,
      matchSection: "settings",
    },
    {
      label: "Aparência",
      href: "/studio?section=appearance",
      icon: Palette,
      matchSection: "appearance",
    },
    {
      label: "Favoritos & Filtros",
      href: "/studio?section=bookmarks",
      icon: Bookmark,
      matchSection: "bookmarks",
    },
    {
      label: "Módulos",
      href: "/studio?section=marketplace",
      icon: Box,
      matchSection: "marketplace",
    },
  ];

  const isNavItemActive = (item: NavItem) => {
    if (item.href === "/forms?action=new") {
      return (
        pathname === "/forms/new" ||
        (pathname === "/forms" && searchParams.get("action") === "new")
      );
    }
    if (item.href === "/forms") {
      return pathname === "/forms" && searchParams.get("action") !== "new";
    }
    if (item.matchSection && pathname.startsWith("/studio")) {
      const effectiveSection = currentSection || "data-model";
      if (item.matchLayout) {
        return (
          effectiveSection === item.matchSection &&
          (currentLayout || "table") === item.matchLayout
        );
      }
      return effectiveSection === item.matchSection;
    }
    return pathname === item.href;
  };

  const getHeaderTitle = () => {
    if (pathname.startsWith("/dashboard"))
      return isGestor ? "Dashboard" : "Meu Desempenho";
    if (pathname.startsWith("/analysts")) return "Analistas";
    if (pathname.startsWith("/users")) return "Usuários";
    if (pathname.startsWith("/sectors")) return "Setores";
    if (pathname.startsWith("/flows")) return "Fluxos de Automação";
    if (pathname.startsWith("/studio")) {
      const sec = currentSection || "data-model";
      if (sec === "content") {
        if (currentLayout === "kanban") return "Fila Kanban";
        if (currentLayout === "activity") return "Trilha de Auditoria";
        return "Explorador de Dados";
      }
      const map: Record<string, string> = {
        "data-model": "Modelo de Dados",
        "access-policies": "Políticas de Acesso",
        settings: "Parâmetros Gerais",
        appearance: "Aparência",
        bookmarks: "Favoritos & Filtros",
      };
      return map[sec] || "Configurações";
    }
    if (pathname.startsWith("/benchmarks")) return "Benchmarks";
    if (pathname.startsWith("/customers")) return "Busca de Clientes";
    if (pathname.startsWith("/calls")) return "Gravações";
    if (pathname.startsWith("/evaluations"))
      return isGestor ? "Avaliações" : "Minhas Avaliações";
    if (pathname.startsWith("/forms")) return "Formulários";
    if (pathname.startsWith("/integrations")) return "Webhooks & n8n";
    return "NEXFORM";
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isNavItemActive(item);
    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        onClick={() => setMobileMenuOpen(false)}
        className={cn(
          "flex items-center justify-between gap-2.5 px-2.5 py-2 md:py-1.5 rounded-lg text-xs transition-colors",
          active
            ? "bg-zinc-800/90 text-zinc-50 font-semibold"
            : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-100"
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </span>
        {item.badge && (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 shrink-0">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const renderDualSidebarContent = (isMobileDrawer = false) => (
    <>
      {/* COLUNA 1: TRILHO DE ÍCONES À ESQUERDA (56px - SEMPRE ESCURO) */}
      <div className="w-14 h-full bg-[#070709] border-r border-zinc-800/80 flex flex-col items-center justify-between py-2.5 shrink-0">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() =>
              handleSelectModule("content", "/dashboard", isMobileDrawer)
            }
            className="flex items-center justify-center mb-1.5"
            title="NEXFORM Início"
          >
            <NexformLogo size="md" iconOnly />
          </button>

          {/* 1. Monitoria & Qualidade */}
          <button
            type="button"
            onClick={() =>
              handleSelectModule("content", "/dashboard", isMobileDrawer)
            }
            title="Monitoria & Qualidade"
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
              activeModule === "content"
                ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
            )}
          >
            <Box className="h-5 w-5" />
          </button>

          {isGestor && (
            <>
              {/* 2. Pessoas & Setores */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("people", "/analysts", isMobileDrawer)
                }
                title="Pessoas & Setores"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "people"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Users className="h-5 w-5" />
              </button>

              {/* 3. Gravações & Fila */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("files", "/calls", isMobileDrawer)
                }
                title="Gravações & Fila"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "files"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Folder className="h-5 w-5" />
              </button>

              {/* 4. Indicadores & Relatórios */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("insights", "/benchmarks", isMobileDrawer)
                }
                title="Indicadores & Relatórios"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "insights"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Sparkles className="h-5 w-5" />
              </button>

              {/* 5. Integrações & Automação */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("cloud", "/customers", isMobileDrawer)
                }
                title="Integrações & Automação"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "cloud"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Cloud className="h-5 w-5" />
              </button>

              {/* 6. Configurações */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule(
                    "settings",
                    "/studio?section=access-policies",
                    isMobileDrawer
                  )
                }
                title="Configurações"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "settings"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={logout}
          title="Sair da conta"
          className="h-9 w-9 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* COLUNA 2: PAINEL CONTEXTUAL À DIREITA (SEMPRE ESCURO) */}
      <div className="w-56 sm:w-60 md:w-56 h-full bg-[#0d0d10] text-zinc-100 flex flex-col justify-between overflow-hidden">
        <div className="h-14 px-4 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-wider text-zinc-100 leading-tight truncate">
              {moduleHeaderMeta[activeModule].title}
            </p>
            <p className="text-[11px] text-zinc-500 leading-tight truncate mt-0.5">
              {moduleHeaderMeta[activeModule].subtitle}
            </p>
          </div>
          {isMobileDrawer && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 px-2.5 py-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 1. MONITORIA & QUALIDADE */}
          {activeModule === "content" && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {isGestor ? "Monitoria" : "Minhas Áreas"}
                </p>
                <nav className="space-y-0.5">
                  {contentOverviewItems.map(renderNavItem)}
                </nav>
              </div>

              {isGestor && (
                <div className="border-t border-zinc-800/80 pt-3">
                  <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Formulários
                  </p>
                  <nav className="space-y-0.5">
                    {contentFormsItems.map(renderNavItem)}
                  </nav>
                </div>
              )}
            </div>
          )}

          {/* 2. PESSOAS & SETORES */}
          {activeModule === "people" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Estrutura & Equipe
                </p>
                <nav className="space-y-0.5">
                  {peopleModuleItems.map(renderNavItem)}
                </nav>
              </div>

              <div className="border-t border-zinc-800/80 pt-3">
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Avaliar Analista ({analysts.length})
                </p>
                <div className="px-1.5 mb-2">
                  <div className="relative">
                    <Search className="h-3 w-3 text-zinc-500 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={analystSidebarSearch}
                      onChange={(e) => setAnalystSidebarSearch(e.target.value)}
                      placeholder="Buscar analista..."
                      className="w-full h-7 pl-7 pr-6 rounded-md border border-zinc-800 bg-[#09090b] text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                    {analystSidebarSearch && (
                      <button
                        type="button"
                        onClick={() => setAnalystSidebarSearch("")}
                        className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <nav className="space-y-0.5">
                  {analysts
                    .filter((a) => {
                      const q = analystSidebarSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        a.name.toLowerCase().includes(q) ||
                        a.email.toLowerCase().includes(q) ||
                        (a.department && a.department.toLowerCase().includes(q))
                      );
                    })
                    .map((analyst) => {
                      const href = `/analysts/${analyst.id}`;
                      const active = pathname === href;
                      return (
                        <Link
                          key={analyst.id}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center justify-between gap-2 px-2.5 py-2 md:py-1.5 rounded-lg text-xs transition-colors",
                            active
                              ? "bg-zinc-800/90 text-zinc-50 font-semibold"
                              : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-100"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            <span className="truncate">{analyst.name}</span>
                          </span>
                        </Link>
                      );
                    })}
                </nav>
              </div>
            </div>
          )}

          {/* 3. GRAVAÇÕES & FILA */}
          {activeModule === "files" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Central de Áudios
                </p>
                <nav className="space-y-0.5">
                  {filesModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 4. INDICADORES & RELATÓRIOS */}
          {activeModule === "insights" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Performance
                </p>
                <nav className="space-y-0.5">
                  {insightsModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 5. INTEGRAÇÕES & AUTOMAÇÃO */}
          {activeModule === "cloud" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  CRM & Fluxos
                </p>
                <nav className="space-y-0.5">
                  {cloudModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 6. CONFIGURAÇÕES */}
          {activeModule === "settings" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Sistema & Governança
                </p>
                <nav className="space-y-0.5">
                  {settingsItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Usuário */}
        <div className="p-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {user.name}
            </p>
            <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
          </div>
          {isMobileDrawer && (
            <button
              type="button"
              onClick={logout}
              className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300 hover:text-white shrink-0"
            >
              Sair
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-zinc-100 dark:bg-[#050506] text-zinc-900 dark:text-zinc-100 p-0 sm:p-2.5 transition-colors">
      <div className="h-full w-full rounded-none sm:rounded-2xl border-0 sm:border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0b0b0d] flex overflow-hidden shadow-2xl relative">
        <aside className="hidden md:flex h-full shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 overflow-hidden select-none">
          {renderDualSidebarContent(false)}
        </aside>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 280 }}
                onClick={(e) => e.stopPropagation()}
                className="h-full flex shrink-0 border-r border-zinc-800 bg-[#0b0b0d] shadow-2xl overflow-hidden select-none"
              >
                {renderDualSidebarContent(true)}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-[#0b0b0d] overflow-hidden">
          <header
            className={cn(
              "h-14 px-3 sm:px-6 border-b border-zinc-200 dark:border-zinc-800/80 items-center justify-between gap-2 sm:gap-4 shrink-0 bg-white/95 dark:bg-[#0b0b0d]/95 backdrop-blur z-20",
              pathname.startsWith("/analysts/") ? "flex md:hidden" : "flex"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-zinc-700 dark:text-zinc-200 shrink-0"
                aria-label="Abrir menu de navegação"
              >
                <Menu className="h-4 w-4" />
              </button>

              <h2 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                {getHeaderTitle()}
              </h2>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0 whitespace-nowrap">
                {isAdmin
                  ? "Diretor Admin"
                  : isGestor
                  ? "Gestora QA"
                  : "Analista"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {mounted && (
                <button
                  type="button"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title="Alternar modo Escuro / Claro"
                  className="p-2 sm:p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </button>
              )}

              {isGestor && (
                <Link
                  href="/analysts"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 text-xs font-semibold shadow-sm transition-colors"
                >
                  <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden xs:inline sm:inline">
                    Nova Avaliação
                  </span>
                  <span className="xs:hidden sm:hidden">Avaliar</span>
                </Link>
              )}
            </div>
          </header>

          <nav className="md:hidden flex items-center gap-1.5 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-[#09090b] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
            {isGestor ? (
              <>
                {(
                  [
                    {
                      mod: "content" as RailModuleKey,
                      label: "Monitoria",
                      href: "/dashboard",
                      icon: Box,
                    },
                    {
                      mod: "people" as RailModuleKey,
                      label: "Pessoas",
                      href: "/analysts",
                      icon: Users,
                    },
                    {
                      mod: "files" as RailModuleKey,
                      label: "Gravações",
                      href: "/calls",
                      icon: Folder,
                    },
                    {
                      mod: "insights" as RailModuleKey,
                      label: "Indicadores",
                      href: "/benchmarks",
                      icon: Sparkles,
                    },
                    {
                      mod: "cloud" as RailModuleKey,
                      label: "Integrações",
                      href: "/customers",
                      icon: Cloud,
                    },
                    {
                      mod: "settings" as RailModuleKey,
                      label: "Config.",
                      href: "/studio?section=access-policies",
                      icon: Settings,
                    },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = activeModule === m.mod;
                  return (
                    <button
                      key={m.mod}
                      type="button"
                      onClick={() => handleSelectModule(m.mod, m.href)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                        active
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold shadow-sm"
                          : "bg-white dark:bg-[#121216] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0",
                    pathname.startsWith("/dashboard")
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                      : "bg-white dark:bg-[#121216] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                  )}
                >
                  <Gauge className="h-3.5 w-3.5 shrink-0" />
                  <span>Meu Dashboard</span>
                </Link>
                <Link
                  href="/evaluations"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0",
                    pathname.startsWith("/evaluations")
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                      : "bg-white dark:bg-[#121216] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
                  )}
                >
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                  <span>Minhas Avaliações</span>
                </Link>
              </>
            )}
          </nav>

          <main
            className={cn(
              "flex-1 bg-zinc-50/40 dark:bg-[#0b0b0d]",
              pathname.startsWith("/analysts/")
                ? "overflow-hidden p-0 flex flex-col min-h-0"
                : "overflow-y-auto p-3.5 sm:p-6"
            )}
          >
            <div
              className={cn(
                "mx-auto w-full",
                pathname.startsWith("/analysts/")
                  ? "flex-1 flex flex-col min-h-0"
                  : "max-w-7xl"
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] w-full bg-[#0b0b0d] flex items-center justify-center text-xs font-mono text-zinc-500">
          Carregando espaço de trabalho NEXFORM...
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

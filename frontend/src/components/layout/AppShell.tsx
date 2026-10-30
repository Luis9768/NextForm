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
  BadgeCheck,
  BarChart3,
  Blocks,
  Bookmark,
  Box,
  Bug,
  Cloud,
  Columns3,
  Database,
  Folder,
  FolderKanban,
  Gauge,
  Headphones,
  Languages,
  ListChecks,
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
  Store,
  Sun,
  Table2,
  TrendingUp,
  UploadCloud,
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

function inferModuleFromRoute(
  pathname: string,
  section: string | null,
  layout: string | null
): RailModuleKey {
  if (
    pathname.startsWith("/analysts") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/sectors")
  )
    return "people";
  if (pathname.startsWith("/calls")) return "files";
  if (pathname.startsWith("/benchmarks")) return "insights";
  if (
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/customers")
  ) {
    return "cloud";
  }
  if (pathname.startsWith("/flows")) return "settings";
  if (pathname.startsWith("/studio")) {
    if (section === "content") {
      if (layout === "kanban") return "files";
      if (layout === "activity") return "insights";
      return "content";
    }
    return "settings";
  }
  return "content";
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { user, isGestor, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSection = searchParams.get("section");
  const currentLayout = searchParams.get("layout");

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeModule, setActiveModule] = useState<RailModuleKey>(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(
        "nexform_rail_module"
      ) as RailModuleKey | null;
      if (saved) return saved;
    }
    return inferModuleFromRoute(pathname, currentSection, currentLayout);
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fecha o drawer mobile automaticamente ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, currentSection, currentLayout]);

  // Alterna módulo no trilho de ícones à esquerda
  const handleSelectModule = (
    mod: RailModuleKey,
    defaultHref: string,
    keepMobileDrawerOpen = false
  ) => {
    setActiveModule(mod);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nexform_rail_module", mod);
    }
    if (!keepMobileDrawerOpen) {
      router.push(defaultHref);
    }
  };

  // Mantém activeModule sincronizado com mudanças de rota
  useEffect(() => {
    if (!user) {
      return;
    }
    if (!isGestor) {
      setActiveModule("content");
      return;
    }
    const isRouteCompatibleWithModule = (mod: RailModuleKey): boolean => {
      if (mod === "content") {
        return (
          pathname.startsWith("/dashboard") ||
          pathname.startsWith("/evaluations") ||
          pathname.startsWith("/forms") ||
          (pathname.startsWith("/studio") && currentSection === "content")
        );
      }
      if (mod === "people") {
        return (
          pathname.startsWith("/analysts") ||
          pathname.startsWith("/users") ||
          pathname.startsWith("/sectors") ||
          pathname.startsWith("/benchmarks")
        );
      }
      if (mod === "files") {
        return (
          pathname.startsWith("/calls") ||
          pathname.startsWith("/analysts") ||
          pathname.startsWith("/evaluations") ||
          (pathname.startsWith("/studio") &&
            currentSection === "content" &&
            currentLayout === "kanban")
        );
      }
      if (mod === "insights") {
        return (
          pathname.startsWith("/benchmarks") ||
          pathname.startsWith("/dashboard") ||
          (pathname.startsWith("/studio") &&
            currentSection === "content" &&
            currentLayout === "activity")
        );
      }
      if (mod === "cloud") {
        return (
          pathname.startsWith("/integrations") ||
          pathname.startsWith("/customers") ||
          pathname.startsWith("/flows")
        );
      }
      if (mod === "settings") {
        return (
          pathname.startsWith("/flows") ||
          (pathname.startsWith("/studio") && currentSection !== "content")
        );
      }
      return false;
    };

    const savedMod = (typeof window !== "undefined"
      ? window.sessionStorage.getItem("nexform_rail_module")
      : null) as RailModuleKey | null;

    if (savedMod && isRouteCompatibleWithModule(savedMod)) {
      setActiveModule(savedMod);
    } else {
      const nextMod = inferModuleFromRoute(
        pathname,
        currentSection,
        currentLayout
      );
      setActiveModule(nextMod);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("nexform_rail_module", nextMod);
      }
    }
  }, [pathname, currentSection, currentLayout, isGestor, user]);

  // Busca lista de analistas para exibir diretamente no módulo "Pessoas & Analistas"
  const { data: analysts = [] } = useQuery({
    queryKey: ["analysts-sidebar-list", user?.id],
    queryFn: () => usersApi.list("ROLE_ANALISTA"),
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
      subtitle: isGestor ? "Monitoria & Conteúdo" : "Portal do Analista",
    },
    people: {
      title: "NEXFORM",
      subtitle: "Pessoas & Analistas",
    },
    files: {
      title: "NEXFORM",
      subtitle: "Gravações & Áudios",
    },
    insights: {
      title: "NEXFORM",
      subtitle: "Indicadores & Benchmarks",
    },
    cloud: {
      title: "NEXFORM",
      subtitle: "Integrações & CRM",
    },
    settings: {
      title: "NEXFORM",
      subtitle: "Configurações & Automação",
    },
  };

  // 1. MÓDULO MONITORIA & CONTEÚDO
  const contentModuleItems: NavItem[] = isGestor
    ? [
        {
          label: "Dashboard Geral",
          href: "/dashboard",
          icon: Gauge,
        },
        {
          label: "Avaliações Realizadas",
          href: "/evaluations",
          icon: BarChart3,
        },
        {
          label: "Edição de Formulários",
          href: "/forms",
          icon: FolderKanban,
        },
        {
          label: "Novo Formulário QA",
          href: "/forms?action=new",
          icon: PlusCircle,
        },
        {
          label: "Explorador de Dados",
          href: "/studio?section=content&layout=table",
          icon: Table2,
          matchSection: "content",
          matchLayout: "table",
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

  // 2. MÓDULO PESSOAS & ANALISTAS
  const peopleModuleItems: NavItem[] = [
    {
      label: "Diretório de Analistas",
      href: "/analysts",
      icon: Users,
    },
    {
      label: "Edição de Formulários",
      href: "/forms",
      icon: FolderKanban,
    },
    {
      label: "Gestão de Usuários",
      href: "/users",
      icon: UserCheck,
    },
    {
      label: "Gestão de Setores",
      href: "/sectors",
      icon: Folder,
    },
    {
      label: "Ranking & Meta 80% (RH)",
      href: "/benchmarks",
      icon: Award,
    },
  ];

  // 3. MÓDULO GRAVAÇÕES & ÁUDIOS
  const filesModuleItems: NavItem[] = [
    {
      label: "Central de Gravações",
      href: "/calls",
      icon: Headphones,
    },
    {
      label: "Fila Kanban de Auditoria",
      href: "/studio?section=content&layout=kanban",
      icon: Columns3,
      matchSection: "content",
      matchLayout: "kanban",
    },
    {
      label: "Anexar Áudio de Ligação",
      href: "/analysts",
      icon: UploadCloud,
    },
    {
      label: "Ligações já Avaliadas",
      href: "/evaluations",
      icon: ListChecks,
    },
  ];

  // 4. MÓDULO INDICADORES & BENCHMARKS
  const insightsModuleItems: NavItem[] = [
    {
      label: "Benchmarks & Performance",
      href: "/benchmarks",
      icon: TrendingUp,
    },
    {
      label: "KPIs Executivos & Curva",
      href: "/dashboard",
      icon: Gauge,
    },
    {
      label: "Trilha de Auditoria",
      href: "/studio?section=content&layout=activity",
      icon: Activity,
      matchSection: "content",
      matchLayout: "activity",
    },
  ];

  // 5. MÓDULO INTEGRAÇÕES & CRM
  const cloudModuleItems: NavItem[] = [
    {
      label: "Webhooks & Agente n8n",
      href: "/integrations/n8n",
      icon: Webhook,
    },
    {
      label: "Busca de Clientes (CRM)",
      href: "/customers",
      icon: Search,
    },
    {
      label: "Fluxos de Automação",
      href: "/flows",
      icon: Zap,
    },
  ];

  // 6. MÓDULO CONFIGURAÇÕES & AUTOMAÇÃO (5 Grupos / 12 Itens)
  const settingsGroups: NavItem[][] = [
    [
      {
        label: "Modelo de Dados",
        href: "/studio?section=data-model",
        icon: Database,
        matchSection: "data-model",
      },
      {
        label: "Fluxos de Automação",
        href: "/flows",
        icon: Zap,
        matchSection: "flows",
      },
    ],
    [
      {
        label: "Políticas de Acesso",
        href: "/studio?section=access-policies",
        icon: ShieldCheck,
        matchSection: "access-policies",
      },
    ],
    [
      {
        label: "Configurações",
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
        label: "Traduções",
        href: "/studio?section=translations",
        icon: Languages,
        matchSection: "translations",
      },
    ],
    [
      {
        label: "Catálogo de Módulos",
        href: "/studio?section=marketplace",
        icon: Store,
        matchSection: "marketplace",
      },
      {
        label: "Extensões Instaladas",
        href: "/studio?section=extensions",
        icon: Blocks,
        matchSection: "extensions",
      },
    ],
    [
      {
        label: "Reportar Problema",
        href: "/studio?section=report-bug",
        icon: Bug,
        matchSection: "report-bug",
      },
      {
        label: "Solicitar Funcionalidade",
        href: "/studio?section=request-feature",
        icon: BadgeCheck,
        matchSection: "request-feature",
      },
    ],
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
    if (item.matchSection === "flows" && pathname.startsWith("/flows")) {
      return true;
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
      return isGestor ? "Dashboard de Qualidade" : "Meu Desempenho & Notas";
    if (pathname.startsWith("/analysts"))
      return "Pessoas & Avaliação de Analistas";
    if (pathname.startsWith("/flows")) return "Fluxos de Automação";
    if (pathname.startsWith("/studio")) {
      const sec = currentSection || "data-model";
      const map: Record<string, string> = {
        "data-model": "Modelo de Dados",
        flows: "Fluxos de Automação",
        "user-roles": "Perfis de Usuário",
        "access-policies": "Políticas de Acesso",
        settings: "Configurações do Sistema",
        appearance: "Aparência & Tema",
        bookmarks: "Favoritos & Filtros Salvos",
        translations: "Dicionário de Traduções",
        marketplace: "Catálogo de Módulos",
        extensions: "Extensões Instaladas",
        "report-bug": "Reportar Problema",
        "request-feature": "Solicitar Funcionalidade",
        content: "Explorador de Dados",
      };
      return map[sec] || "Configurações do Sistema";
    }
    if (pathname.startsWith("/benchmarks")) return "Indicadores & Benchmarks";
    if (pathname.startsWith("/customers")) return "Busca de Clientes (CRM)";
    if (pathname.startsWith("/calls")) return "Central de Gravações";
    if (pathname.startsWith("/evaluations"))
      return isGestor ? "Avaliações de Ligações" : "Minhas Avaliações";
    if (pathname.startsWith("/forms")) return "Matrizes de Formulários";
    if (pathname.startsWith("/integrations"))
      return "Webhooks & Integrações";
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
            ? "bg-zinc-200/90 dark:bg-zinc-800/90 text-zinc-950 dark:text-zinc-50 font-semibold"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/80 hover:text-zinc-900 dark:hover:text-zinc-100"
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

  // Renderizador compartilhado do conteúdo da Barra Lateral Dupla (usado no Desktop e no Drawer Mobile)
  const renderDualSidebarContent = (isMobileDrawer = false) => (
    <>
      {/* COLUNA 1: TRILHO DE ÍCONES À ESQUERDA (56px) */}
      <div className="w-14 h-full bg-zinc-900 dark:bg-[#070709] border-r border-zinc-800/80 flex flex-col items-center justify-between py-2.5 shrink-0">
        <div className="flex flex-col items-center gap-2">
          {/* Logo NEXFORM */}
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

          {/* Módulo 1: Monitoria & Conteúdo */}
          <button
            type="button"
            onClick={() =>
              handleSelectModule("content", "/dashboard", isMobileDrawer)
            }
            title="Monitoria & Conteúdo"
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
              {/* Módulo 2: Pessoas & Analistas */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("people", "/analysts", isMobileDrawer)
                }
                title="Pessoas & Analistas"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "people"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Users className="h-5 w-5" />
              </button>

              {/* Módulo 3: Gravações & Áudios */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("files", "/calls", isMobileDrawer)
                }
                title="Gravações & Áudios"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "files"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Folder className="h-5 w-5" />
              </button>

              {/* Módulo 4: Indicadores & Benchmarks */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule("insights", "/benchmarks", isMobileDrawer)
                }
                title="Indicadores & Benchmarks"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "insights"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Sparkles className="h-5 w-5" />
              </button>

              {/* Módulo 5: Integrações & CRM */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule(
                    "cloud",
                    "/integrations/n8n",
                    isMobileDrawer
                  )
                }
                title="Integrações & CRM"
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  activeModule === "cloud"
                    ? "bg-zinc-800 text-zinc-50 ring-1 ring-zinc-700 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                <Cloud className="h-5 w-5" />
              </button>

              {/* Módulo 6: Configurações & Automação */}
              <button
                type="button"
                onClick={() =>
                  handleSelectModule(
                    "settings",
                    "/studio?section=data-model",
                    isMobileDrawer
                  )
                }
                title="Configurações & Automação"
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

        {/* Botão Sair */}
        <button
          type="button"
          onClick={logout}
          title="Sair da conta"
          className="h-9 w-9 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* COLUNA 2: PAINEL CONTEXTUAL À DIREITA */}
      <div className="w-56 sm:w-60 md:w-56 h-full bg-zinc-50 dark:bg-[#0d0d10] flex flex-col justify-between overflow-hidden">
        {/* Cabeçalho NEXFORM */}
        <div className="h-14 px-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-wider text-zinc-900 dark:text-zinc-100 leading-tight truncate">
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

        {/* Lista de Navegação Contextual */}
        <div className="flex-1 px-2.5 py-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 1. MÓDULO: MONITORIA & CONTEÚDO */}
          {activeModule === "content" && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {isGestor ? "Monitoria & Formulários" : "Minhas Áreas"}
                </p>
                <nav className="space-y-0.5">
                  {contentModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 2. MÓDULO: PESSOAS & ANALISTAS */}
          {activeModule === "people" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Gestão de Analistas
                </p>
                <nav className="space-y-0.5">
                  {peopleModuleItems.map(renderNavItem)}
                </nav>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800/80 pt-3">
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Avaliar Analista ({analysts.length})
                </p>
                <nav className="space-y-0.5">
                  {analysts.map((analyst) => {
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
                            ? "bg-zinc-200/90 dark:bg-zinc-800/90 text-zinc-950 dark:text-zinc-50 font-semibold"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/80 hover:text-zinc-900 dark:hover:text-zinc-100"
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

          {/* 3. MÓDULO: GRAVAÇÕES & ÁUDIOS */}
          {activeModule === "files" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Arquivos de Áudio & Fila
                </p>
                <nav className="space-y-0.5">
                  {filesModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 4. MÓDULO: INDICADORES & BENCHMARKS */}
          {activeModule === "insights" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Métricas & Telemetria
                </p>
                <nav className="space-y-0.5">
                  {insightsModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 5. MÓDULO: INTEGRAÇÕES & CRM */}
          {activeModule === "cloud" && isGestor && (
            <div className="space-y-4">
              <div>
                <p className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Conectores & APIs
                </p>
                <nav className="space-y-0.5">
                  {cloudModuleItems.map(renderNavItem)}
                </nav>
              </div>
            </div>
          )}

          {/* 6. MÓDULO: CONFIGURAÇÕES & AUTOMAÇÃO */}
          {activeModule === "settings" && isGestor && (
            <div className="space-y-1.5">
              {settingsGroups.map((group, groupIdx) => (
                <React.Fragment key={groupIdx}>
                  {groupIdx > 0 && (
                    <div className="border-t border-zinc-200 dark:border-zinc-800/80 my-1.5" />
                  )}
                  <div className="space-y-0.5">{group.map(renderNavItem)}</div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé do Usuário */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
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
        {/* DESKTOP: BARRA LATERAL DUPLA UNIFICADA NEXFORM (md+) */}
        <aside className="hidden md:flex h-full shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 overflow-hidden select-none">
          {renderDualSidebarContent(false)}
        </aside>

        {/* MOBILE / TABLET: DRAWER DESLIZANTE COMPLETO (< md) */}
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

        {/* COLUNA CENTRAL DE CONTEÚDO */}
        <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-[#0b0b0d] overflow-hidden">
          {/* Barra Superior Responsiva */}
          <header className="h-14 px-3 sm:px-6 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-2 sm:gap-4 shrink-0 bg-white/95 dark:bg-[#0b0b0d]/95 backdrop-blur z-20">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Botão Hamburger Mobile */}
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
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
                {isGestor ? "Gestora QA" : "Analista"}
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

          {/* Barra Rápida de Módulos no Mobile (< md) */}
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
                      label: "Analistas",
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
                      label: "Benchmarks",
                      href: "/benchmarks",
                      icon: Sparkles,
                    },
                    {
                      mod: "cloud" as RailModuleKey,
                      label: "Integrações",
                      href: "/integrations/n8n",
                      icon: Cloud,
                    },
                    {
                      mod: "settings" as RailModuleKey,
                      label: "Configurações",
                      href: "/studio?section=data-model",
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
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                        active
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                          : "text-zinc-600 dark:text-zinc-400 bg-white dark:bg-[#101013] border border-zinc-200 dark:border-zinc-800"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </>
            ) : (
              contentModuleItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                      isActive
                        ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                        : "text-zinc-500 hover:text-zinc-200"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })
            )}
          </nav>

          {/* Área Principal com Padding Responsivo */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
            <div className="max-w-7xl w-full mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-[100dvh] w-full bg-[#050506]" />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

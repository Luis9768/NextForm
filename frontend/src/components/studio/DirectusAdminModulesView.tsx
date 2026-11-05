"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  BadgeCheck,
  Blocks,
  Bookmark,
  Bug,
  Check,
  Code2,
  ExternalLink,
  Languages,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { studioApi } from "@/lib/api";
import { StudioPolicyRule } from "@/types";

export type DirectusAdminSectionKey =
  | "user-roles"
  | "access-policies"
  | "settings"
  | "appearance"
  | "bookmarks"
  | "translations"
  | "marketplace"
  | "extensions"
  | "report-bug"
  | "request-feature";

const COLLECTION_LABELS: Record<string, string> = {
  sectors: "Setores",
  users: "Usuários",
  call_records: "Gravações",
  evaluations: "Avaliações",
  evaluation_form_templates: "Formulários",
  customers: "Clientes",
  sys_flows: "Fluxos",
};

function formatHumanFilterRule(rawRule: string, roleCode: string): string {
  const trimmed = (rawRule || "").trim();
  if (!trimmed || trimmed === "{}") {
    return "Acesso Irrestrito";
  }
  if (trimmed.includes("_none")) {
    return "Sem Acesso";
  }
  if (trimmed.includes("$CURRENT_USER")) {
    return "Escopo Próprio";
  }
  if (trimmed.includes("$ALLOWED_SECTORS")) {
    return "Setores Autorizados";
  }
  if (trimmed.includes("channel") || roleCode === "ROLE_N8N_WEBHOOK") {
    return "X-API-KEY";
  }
  return "Filtro Ativo";
}

export function DirectusAdminModulesView({
  section,
}: {
  section: DirectusAdminSectionKey;
}) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const { data: policies = [] } = useQuery({
    queryKey: ["studio-policies"],
    queryFn: studioApi.listPolicies,
    enabled: section === "access-policies" || section === "user-roles",
  });

  const { data: bookmarks = [] } = useQuery({
    queryKey: ["studio-bookmarks"],
    queryFn: studioApi.listBookmarks,
    enabled: section === "bookmarks",
  });

  const { data: translations = [] } = useQuery({
    queryKey: ["studio-translations"],
    queryFn: studioApi.listTranslations,
    enabled: section === "translations",
  });

  const { data: extensions = [] } = useQuery({
    queryKey: ["studio-extensions"],
    queryFn: studioApi.listExtensions,
    enabled: section === "marketplace" || section === "extensions",
  });

  const { data: feedbackList = [] } = useQuery({
    queryKey: ["studio-feedback"],
    queryFn: studioApi.listFeedback,
    enabled: section === "report-bug" || section === "request-feature",
  });

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [collectionSearch, setCollectionSearch] = useState<string>("");
  const [selectedRuleModal, setSelectedRuleModal] = useState<{
    roleCode: string;
    policyName: string;
    rule: StudioPolicyRule;
  } | null>(null);

  const [projectName, setProjectName] = useState("NEXFORM");
  const [passingTarget, setPassingTarget] = useState("80");
  const [n8nKey, setN8nKey] = useState("n8n-secret-api-key-2026");
  const [customCss, setCustomCss] = useState(
    ":root {\n  --nexform-bg: #0b0b0d;\n  --nexform-card: #101013;\n}"
  );
  const [savedToast, setSavedToast] = useState(false);

  const [bmName, setBmName] = useState("");
  const [bmCollection, setBmCollection] = useState("call_records");
  const [bmLayout, setBmLayout] = useState("table");
  const [bmFilter, setBmFilter] = useState('{ "status": { "_eq": "PENDENTE" } }');

  const [trKey, setTrKey] = useState("");
  const [trPt, setTrPt] = useState("");
  const [trEn, setTrEn] = useState("");
  const [trEs, setTrEs] = useState("");
  const [trSearch, setTrSearch] = useState("");

  const [fbTitle, setFbTitle] = useState("");
  const [fbModule, setFbModule] = useState("Fluxos de Automação");
  const [fbSeverity] = useState("MEDIUM");
  const [fbDesc, setFbDesc] = useState("");

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      studioApi.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-settings"] });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    },
  });

  const createBookmarkMutation = useMutation({
    mutationFn: () =>
      studioApi.createBookmark({
        name: bmName.trim() || "Novo Filtro",
        collection: bmCollection,
        layout: bmLayout,
        filterJson: bmFilter,
        scope: "ROLE_GESTOR",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-bookmarks"] });
      setBmName("");
    },
  });

  const deleteBookmarkMutation = useMutation({
    mutationFn: (id: string) => studioApi.deleteBookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-bookmarks"] });
    },
  });

  const createTranslationMutation = useMutation({
    mutationFn: () =>
      studioApi.createTranslation({
        key: trKey.trim() || "$t:custom.chave",
        ptBR: trPt.trim(),
        enUS: trEn.trim(),
        esES: trEs.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-translations"] });
      setTrKey("");
      setTrPt("");
      setTrEn("");
      setTrEs("");
    },
  });

  const deleteTranslationMutation = useMutation({
    mutationFn: (id: string) => studioApi.deleteTranslation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-translations"] });
    },
  });

  const toggleExtensionMutation = useMutation({
    mutationFn: (id: string) => studioApi.toggleExtension(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-extensions"] });
    },
  });

  const createFeedbackMutation = useMutation({
    mutationFn: (type: "BUG" | "FEATURE") =>
      studioApi.createFeedback({
        type,
        title: fbTitle.trim() || "Novo registro",
        module: fbModule,
        severity: fbSeverity,
        description: fbDesc.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-feedback"] });
      setFbTitle("");
      setFbDesc("");
    },
  });

  const upvoteMutation = useMutation({
    mutationFn: (id: string) => studioApi.upvoteFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-feedback"] });
    },
  });

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) =>
      selectedRoleFilter === "ALL" ? true : p.roleCode === selectedRoleFilter
    );
  }, [policies, selectedRoleFilter]);

  if (section === "user-roles") {
    return null;
  }

  // 2. POLÍTICAS DE ACESSO
  if (section === "access-policies") {
    const renderPermissionBadge = (val: string, roleCode: string) => {
      if (val === "FULL") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/35 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span>Total</span>
          </span>
        );
      }
      if (val === "IMMUTABLE") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-950/35 border border-sky-800/60 text-sky-300 text-[11px] font-medium whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
            <span>Imutável</span>
          </span>
        );
      }
      if (val === "SOFT") {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-[11px] font-medium whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
            <span>Inativar</span>
          </span>
        );
      }
      if (val === "CUSTOM") {
        const label =
          roleCode === "ROLE_ANALISTA"
            ? "Escopo Próprio"
            : roleCode === "ROLE_GESTOR"
            ? "Por Setor"
            : "Restrito";
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/35 border border-amber-800/60 text-amber-300 text-[11px] font-medium whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>{label}</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/70 border border-zinc-800/80 text-zinc-500 text-[11px] font-medium whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 shrink-0" />
          <span>Bloqueado</span>
        </span>
      );
    };

    return (
      <div className="space-y-5 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Políticas de Acesso
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/users"
              className="h-9 px-3.5 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs font-medium text-zinc-200 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <span>Usuários</span>
              <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
            <Link
              href="/sectors"
              className="h-9 px-3.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Setores</span>
            </Link>
          </div>
        </div>

        {/* Filtro por Perfil e Busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11]">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedRoleFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedRoleFilter === "ALL"
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
            >
              Todos ({policies.length})
            </button>
            {policies.map((pol) => (
              <button
                key={pol.id}
                type="button"
                onClick={() => setSelectedRoleFilter(pol.roleCode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-colors ${
                  selectedRoleFilter === pol.roleCode
                    ? "bg-zinc-100 text-zinc-950 font-semibold"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                }`}
              >
                {pol.roleCode}
              </button>
            ))}
          </div>

          <div className="relative sm:w-60 shrink-0">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
              placeholder="Filtrar coleção..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Tabelas de Políticas */}
        <div className="space-y-4">
          {filteredPolicies.map((pol) => {
            const visibleRules = pol.rules.filter((r) => {
              if (!collectionSearch.trim()) return true;
              const q = collectionSearch.toLowerCase();
              const label = (COLLECTION_LABELS[r.collection] || "").toLowerCase();
              return r.collection.toLowerCase().includes(q) || label.includes(q);
            });

            return (
              <div
                key={pol.id}
                className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-zinc-800/80 bg-[#111115] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-zinc-100 text-zinc-950 whitespace-nowrap">
                      {pol.roleCode}
                    </span>
                    <h2 className="text-sm font-semibold text-zinc-100">
                      {pol.name}
                    </h2>
                  </div>
                </div>

                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800/80 text-[11px] font-mono uppercase tracking-wider text-zinc-500 bg-[#0a0a0d]">
                        <th className="py-2.5 px-4">Coleção</th>
                        <th className="py-2.5 px-2 text-center">Criar</th>
                        <th className="py-2.5 px-2 text-center">Ler</th>
                        <th className="py-2.5 px-2 text-center">Editar</th>
                        <th className="py-2.5 px-2 text-center">Excluir</th>
                        <th className="py-2.5 px-4 text-right">Escopo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {visibleRules.map((rule) => {
                        const humanFilter = formatHumanFilterRule(
                          rule.filterRule,
                          pol.roleCode
                        );

                        return (
                          <tr
                            key={rule.collection}
                            onClick={() =>
                              setSelectedRuleModal({
                                roleCode: pol.roleCode,
                                policyName: pol.name,
                                rule,
                              })
                            }
                            className="hover:bg-zinc-900/40 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4">
                              <span className="font-mono font-semibold text-zinc-100">
                                {rule.collection}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              {renderPermissionBadge(rule.create, pol.roleCode)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {renderPermissionBadge(rule.read, pol.roleCode)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {renderPermissionBadge(rule.update, pol.roleCode)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {renderPermissionBadge(rule.delete, pol.roleCode)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded border border-zinc-800 bg-[#09090b] text-[11px] font-mono text-zinc-300">
                                  {humanFilter}
                                </span>
                                <Code2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        {selectedRuleModal && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedRuleModal(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-semibold text-zinc-100 font-mono">
                  {selectedRuleModal.roleCode} •{" "}
                  {selectedRuleModal.rule.collection}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedRuleModal(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <pre className="p-3.5 rounded-lg bg-[#09090b] border border-zinc-800 text-xs font-mono text-zinc-200 overflow-x-auto">
                {selectedRuleModal.rule.filterRule}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. CONFIGURAÇÕES DO SISTEMA
  if (section === "settings") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
            <span>Configurações</span>
          </h1>

          <button
            type="button"
            onClick={() =>
              saveSettingsMutation.mutate({
                projectName,
                passingScoreTarget: Number(passingTarget),
                n8nApiKey: n8nKey,
              })
            }
            className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Check className="h-4 w-4" />
            <span>{savedToast ? "Salvo!" : "Salvar"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Nome da Plataforma
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Meta de Aprovação (%)
              </label>
              <input
                type="number"
                value={passingTarget}
                onChange={(e) => setPassingTarget(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
              />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Chave de Integração (X-API-KEY)
              </label>
              <input
                type="text"
                value={n8nKey}
                onChange={(e) => setN8nKey(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. APARÊNCIA
  if (section === "appearance") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Palette className="h-4 w-4 text-zinc-400" />
            <span>Aparência</span>
          </h1>

          <button
            type="button"
            onClick={() =>
              saveSettingsMutation.mutate({
                themePreset: theme,
                customCss,
              })
            }
            className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Check className="h-4 w-4" />
            <span>{savedToast ? "Aplicado!" : "Aplicar"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">Tema</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                  theme === "dark"
                    ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                    : "border-zinc-800 bg-[#0b0b0d] text-zinc-300"
                }`}
              >
                <span className="text-xs font-semibold">Escuro</span>
                {theme === "dark" && <Check className="h-4 w-4 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                  theme === "light"
                    ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                    : "border-zinc-800 bg-[#0b0b0d] text-zinc-300"
                }`}
              >
                <span className="text-xs font-semibold">Claro</span>
                {theme === "light" && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-3">
            <h2 className="text-sm font-bold text-zinc-100">CSS Customizado</h2>
            <textarea
              rows={5}
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              className="w-full p-3 rounded-xl border border-zinc-800 bg-[#0b0b0d] font-mono text-xs text-zinc-200"
            />
          </div>
        </div>
      </div>
    );
  }

  // 5. FAVORITOS & FILTROS SALVOS
  if (section === "bookmarks") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-zinc-400" />
            <span>Favoritos & Filtros</span>
          </h1>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#101013] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">Nome</label>
            <input
              type="text"
              value={bmName}
              onChange={(e) => setBmName(e.target.value)}
              placeholder="Ex: Ligações Retenção"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">Coleção</label>
            <select
              value={bmCollection}
              onChange={(e) => setBmCollection(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
            >
              <option value="call_records">call_records</option>
              <option value="evaluations">evaluations</option>
              <option value="evaluation_form_templates">
                evaluation_form_templates
              </option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-zinc-400 mb-1">Filtro</label>
            <input
              type="text"
              value={bmFilter}
              onChange={(e) => setBmFilter(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => createBookmarkMutation.mutate()}
              className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Salvar</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/70 overflow-hidden">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="p-4 sm:px-5 sm:py-3.5 hover:bg-zinc-900/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <Bookmark className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-sm font-semibold text-zinc-100">
                  {bm.name}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#141418] border border-zinc-800 text-zinc-400 whitespace-nowrap">
                  {bm.collection}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 shrink-0">
                <Link
                  href={bm.targetHref || "/calls"}
                  className="h-8 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <span>Abrir</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => deleteBookmarkMutation.mutate(bm.id)}
                  className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#121215] hover:border-red-900/60 text-zinc-500 hover:text-red-400 inline-flex items-center justify-center transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. TRADUÇÕES
  if (section === "translations") {
    const filteredTr = translations.filter(
      (t) =>
        !trSearch.trim() ||
        t.key.toLowerCase().includes(trSearch.toLowerCase()) ||
        t.ptBR.toLowerCase().includes(trSearch.toLowerCase()) ||
        t.enUS.toLowerCase().includes(trSearch.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Languages className="h-4 w-4 text-zinc-400" />
            <span>Traduções</span>
          </h1>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={trSearch}
              onChange={(e) => setTrSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-9 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#101013] text-xs text-zinc-100"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-[#101013] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">Chave</label>
            <input
              type="text"
              value={trKey}
              onChange={(e) => setTrKey(e.target.value)}
              placeholder="$t:qa.criterio"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">pt-BR</label>
            <input
              type="text"
              value={trPt}
              onChange={(e) => setTrPt(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">en-US</label>
            <input
              type="text"
              value={trEn}
              onChange={(e) => setTrEn(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">es-ES</label>
            <input
              type="text"
              value={trEs}
              onChange={(e) => setTrEs(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => createTranslationMutation.mutate()}
              className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[540px]">
              <thead>
                <tr className="border-b border-zinc-800 font-mono text-zinc-500 bg-[#0b0b0d]">
                  <th className="py-3 px-4">Chave</th>
                  <th className="py-3 px-4">pt-BR</th>
                  <th className="py-3 px-4">en-US</th>
                  <th className="py-3 px-4">es-ES</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredTr.map((tr) => (
                  <tr key={tr.id} className="hover:bg-zinc-900/40">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-100 whitespace-nowrap">
                      {tr.key}
                    </td>
                    <td className="py-3 px-4 text-zinc-200">{tr.ptBR}</td>
                    <td className="py-3 px-4 text-zinc-400">{tr.enUS}</td>
                    <td className="py-3 px-4 text-zinc-400">{tr.esES}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => deleteTranslationMutation.mutate(tr.id)}
                        className="p-1.5 rounded text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 7. MÓDULOS & 8. EXTENSÕES — DESIGN EDITORIAL MINIMALISTA (SEM TRUNCAMENTO)
  if (section === "marketplace" || section === "extensions") {
    const typeLabelMap: Record<string, string> = {
      interface: "Interface",
      operation: "Automação",
      endpoint: "Conector API",
      layout: "Visualização",
      panel: "Relatório",
    };

    const displayedExtensions =
      section === "extensions"
        ? extensions.filter((e) => e.installed)
        : extensions;

    const activeCount = displayedExtensions.filter(
      (e) => e.installed && e.enabled
    ).length;

    return (
      <div className="space-y-5 pb-12">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              Módulos do Sistema
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
              {activeCount} de {displayedExtensions.length} ativos
            </span>
          </div>
        </div>

        {/* Lista Editorial de Módulos (Largura Completa, Sem Cortar Títulos) */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/70 overflow-hidden">
          {displayedExtensions.map((ext) => {
            const isEnabled = ext.installed && ext.enabled;
            const categoryLabel =
              typeLabelMap[ext.type.toLowerCase()] || ext.type;

            return (
              <div
                key={ext.id}
                className="p-4 sm:px-5 sm:py-4 hover:bg-zinc-900/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <span
                    className={`mt-1.5 sm:mt-0 h-2 w-2 rounded-full shrink-0 ${
                      isEnabled ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-sm font-semibold text-zinc-100 leading-snug">
                        {ext.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider bg-[#141418] border border-zinc-800 text-zinc-400 whitespace-nowrap">
                        {categoryLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleExtensionMutation.mutate(ext.id)}
                    className={`h-8 px-4 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
                      isEnabled
                        ? "bg-emerald-950/35 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/60"
                        : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isEnabled ? "bg-emerald-400" : "bg-zinc-950"
                      }`}
                    />
                    <span>{isEnabled ? "Ativo" : "Ativar"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 9. REPORTAR PROBLEMA & 10. SOLICITAR FUNCIONALIDADE
  const isBugView = section === "report-bug";
  const items = feedbackList.filter((f) =>
    isBugView ? f.type === "BUG" : f.type === "FEATURE"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          {isBugView ? (
            <Bug className="h-4 w-4 text-zinc-400" />
          ) : (
            <BadgeCheck className="h-4 w-4 text-zinc-400" />
          )}
          <span>
            {isBugView ? "Reportar Problema" : "Solicitar Funcionalidade"}
          </span>
        </h1>
      </div>

      <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Título *</label>
            <input
              type="text"
              value={fbTitle}
              onChange={(e) => setFbTitle(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Módulo</label>
            <select
              value={fbModule}
              onChange={(e) => setFbModule(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-200"
            >
              <option value="Modelo de Dados">Modelo de Dados</option>
              <option value="Fluxos de Automação">Fluxos de Automação</option>
              <option value="Player de Áudio">Player de Áudio</option>
              <option value="Avaliação Ponderada">Avaliação Ponderada</option>
              <option value="Indicadores & RH">Indicadores & RH</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Descrição</label>
          <textarea
            rows={3}
            value={fbDesc}
            onChange={(e) => setFbDesc(e.target.value)}
            className="w-full p-3 rounded-xl border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              createFeedbackMutation.mutate(isBugView ? "BUG" : "FEATURE")
            }
            className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Enviar</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl border border-zinc-800 bg-[#101013] flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
                {item.module}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-950 font-bold">
                {item.status}
              </span>
              <h3 className="text-sm font-semibold text-zinc-100 truncate">
                {item.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => upvoteMutation.mutate(item.id)}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-[#0b0b0d] hover:bg-zinc-900 text-xs font-mono text-zinc-200 inline-flex items-center gap-1.5 shrink-0"
            >
              <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-bold">{item.votes}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

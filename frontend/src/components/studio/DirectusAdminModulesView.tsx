"use client";

import React, { useState } from "react";
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
  ExternalLink,
  Languages,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  Users,
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

export function DirectusAdminModulesView({
  section,
}: {
  section: DirectusAdminSectionKey;
}) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  // Consultas
  const { data: roles = [] } = useQuery({
    queryKey: ["studio-roles"],
    queryFn: studioApi.listRoles,
    enabled: section === "user-roles",
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["studio-policies"],
    queryFn: studioApi.listPolicies,
    enabled: section === "access-policies" || section === "user-roles",
  });

  const { data: settingsData = {} } = useQuery({
    queryKey: ["studio-settings"],
    queryFn: studioApi.getSettings,
    enabled: section === "settings" || section === "appearance",
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

  // Estados locais
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("ROLE_SUPERVISOR");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [selectedRuleModal, setSelectedRuleModal] =
    useState<StudioPolicyRule | null>(null);

  const [projectName, setProjectName] = useState("NEXFORM");
  const [projectDesc, setProjectDesc] = useState(
    "Plataforma de Monitoria de Qualidade & Desenvolvimento RH"
  );
  const [passingTarget, setPassingTarget] = useState("80");
  const [n8nKey, setN8nKey] = useState("n8n-secret-api-key-2026");
  const [customCss, setCustomCss] = useState(
    "/* Estilização Personalizada NEXFORM */\n:root {\n  --nexform-bg: #0b0b0d;\n  --nexform-card: #101013;\n}"
  );
  const [savedToast, setSavedToast] = useState(false);

  // Favorito / Filtro
  const [bmName, setBmName] = useState("");
  const [bmCollection, setBmCollection] = useState("call_records");
  const [bmLayout, setBmLayout] = useState("table");
  const [bmFilter, setBmFilter] = useState('{ "status": { "_eq": "PENDENTE" } }');

  // Traduções
  const [trKey, setTrKey] = useState("");
  const [trPt, setTrPt] = useState("");
  const [trEn, setTrEn] = useState("");
  const [trEs, setTrEs] = useState("");
  const [trSearch, setTrSearch] = useState("");

  // Problemas / Sugestões
  const [fbTitle, setFbTitle] = useState("");
  const [fbModule, setFbModule] = useState("Fluxos de Automação");
  const [fbSeverity, setFbSeverity] = useState("MEDIUM");
  const [fbDesc, setFbDesc] = useState("");

  // Mutations
  const createRoleMutation = useMutation({
    mutationFn: () =>
      studioApi.createRole({
        name: newRoleName.trim() || "Supervisor de Qualidade",
        code: newRoleCode.trim() || "ROLE_SUPERVISOR",
        description:
          newRoleDesc.trim() || "Acesso de supervisão intermediária.",
        adminAccess: false,
        appAccess: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-roles"] });
      setNewRoleName("");
      setNewRoleDesc("");
    },
  });

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
        name: bmName.trim() || "Novo Filtro Salvo",
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

  // 1. REDIRECIONA PERFIS DE USUÁRIO (REMOVIDO) PARA GESTÃO DE USUÁRIOS
  if (section === "user-roles") {
    return null;
  }

  // 2. POLÍTICAS DE ACESSO (ACCESS POLICIES)
  if (section === "access-policies") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações / Políticas de Acesso
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <ShieldCheck className="h-4 w-4 text-zinc-400" />
              <span>Políticas de Acesso & Matriz de Permissões RBAC</span>
            </h1>
          </div>
        </div>

        <div className="space-y-5">
          {policies.map((pol) => (
            <div
              key={pol.id}
              className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden"
            >
              <div className="p-5 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-100 text-zinc-950">
                      {pol.roleCode}
                    </span>
                    <h2 className="text-sm font-bold text-zinc-100">
                      {pol.name}
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {pol.description}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  Faixa IP: {pol.ipAccess}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 bg-[#0b0b0d]">
                      <th className="py-3 px-5">Coleção</th>
                      <th className="py-3 px-4 text-center">Criar (+)</th>
                      <th className="py-3 px-4 text-center">Ler (👁)</th>
                      <th className="py-3 px-4 text-center">Editar (✎)</th>
                      <th className="py-3 px-4 text-center">Excluir (🗑)</th>
                      <th className="py-3 px-4 text-center">Compartilhar</th>
                      <th className="py-3 px-5 text-right">Regra de Filtro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {pol.rules.map((rule) => {
                      const renderBadge = (val: string) => {
                        if (val === "FULL")
                          return (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-[10px]">
                              ✓ Total
                            </span>
                          );
                        if (
                          val === "CUSTOM" ||
                          val === "IMMUTABLE" ||
                          val === "SOFT"
                        )
                          return (
                            <span className="px-2 py-0.5 rounded bg-amber-950/50 border border-amber-800 text-amber-300 text-[10px]">
                              ● {val === "CUSTOM" ? "Escopo Próprio" : val}
                            </span>
                          );
                        return (
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px]">
                            ✕ Bloqueado
                          </span>
                        );
                      };

                      return (
                        <tr
                          key={rule.collection}
                          onClick={() => setSelectedRuleModal(rule)}
                          className="hover:bg-zinc-900/40 cursor-pointer"
                        >
                          <td className="py-3 px-5 font-bold text-zinc-100">
                            {rule.collection}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {renderBadge(rule.create)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {renderBadge(rule.read)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {renderBadge(rule.update)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {renderBadge(rule.delete)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {renderBadge(rule.share)}
                          </td>
                          <td className="py-3 px-5 text-right text-[11px] text-zinc-400">
                            {rule.filterRule}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {selectedRuleModal && (
          <div className="p-4 rounded-xl border border-zinc-700 bg-[#0b0b0d] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-zinc-100">
                Regra de Filtro da Coleção • {selectedRuleModal.collection}
              </span>
              <button
                type="button"
                onClick={() => setSelectedRuleModal(null)}
                className="text-xs text-zinc-400 hover:text-zinc-100"
              >
                Fechar
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-[#101013] border border-zinc-800 text-xs font-mono text-emerald-300">
              {selectedRuleModal.filterRule}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // 3. CONFIGURAÇÕES DO SISTEMA (SETTINGS)
  if (section === "settings") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações / Parâmetros Gerais
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
              <span>Configurações do Sistema NEXFORM</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              saveSettingsMutation.mutate({
                projectName,
                projectDescriptor: projectDesc,
                passingScoreTarget: Number(passingTarget),
                n8nApiKey: n8nKey,
              })
            }
            className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            <span>{savedToast ? "Salvo!" : "Salvar Configurações"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">
              Identidade & Armazenamento
            </h2>
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
                Subtítulo Institucional
              </label>
              <input
                type="text"
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Driver de Streaming de Áudio
              </label>
              <input
                type="text"
                readOnly
                value={String(
                  settingsData.storageDriver || "local-fs-http-range-206"
                )}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-400"
              />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">
              Motor de Qualidade & Segurança
            </h2>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Meta Corporativa de Aprovação (%)
              </label>
              <input
                type="number"
                value={passingTarget}
                onChange={(e) => setPassingTarget(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Chave de Integração n8n (X-API-KEY)
              </label>
              <input
                type="text"
                value={n8nKey}
                onChange={(e) => setN8nKey(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
              />
            </div>
            <div className="p-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] flex items-center justify-between text-xs">
              <span className="text-zinc-300">
                Vínculo Obrigatório de Ligação & Nota Zero por Erro Grave
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-950 font-mono font-bold text-[10px]">
                OBRIGATÓRIO
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. APARÊNCIA (APPEARANCE)
  if (section === "appearance") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações / Aparência
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <Palette className="h-4 w-4 text-zinc-400" />
              <span>Aparência & Personalização Visual</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              saveSettingsMutation.mutate({
                themePreset: theme,
                customCss,
              })
            }
            className="h-9 px-4 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            <span>{savedToast ? "Aplicado!" : "Aplicar Tema"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">
              Esquema de Cores
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  theme === "dark"
                    ? "border-zinc-100 bg-[#09090b]"
                    : "border-zinc-800 bg-[#0b0b0d]"
                }`}
              >
                <p className="text-xs font-bold text-zinc-100">
                  Escuro Neutro (Padrão)
                </p>
                <p className="text-[11px] text-zinc-500">
                  #09090b / #101013 / Zinc 800
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  theme === "light"
                    ? "border-zinc-100 bg-zinc-900"
                    : "border-zinc-800 bg-[#0b0b0d]"
                }`}
              >
                <p className="text-xs font-bold text-zinc-100">Claro Neutro</p>
                <p className="text-[11px] text-zinc-500">
                  Modo claro de alto contraste
                </p>
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#0b0b0d] space-y-1 text-xs">
              <p className="font-semibold text-zinc-200">
                Travamento de Viewport & Barra Lateral
              </p>
              <p className="text-zinc-500 font-mono text-[11px]">
                h-[100dvh] overflow-hidden • Barra Lateral Dupla Fixa
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-3">
            <h2 className="text-sm font-bold text-zinc-100">
              CSS Personalizado
            </h2>
            <textarea
              rows={6}
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              className="w-full p-3 rounded-xl border border-zinc-800 bg-[#0b0b0d] font-mono text-xs text-zinc-200"
            />
          </div>
        </div>
      </div>
    );
  }

  // 5. FAVORITOS & FILTROS SALVOS (BOOKMARKS)
  if (section === "bookmarks") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações / Favoritos & Filtros
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <Bookmark className="h-4 w-4 text-zinc-400" />
              <span>Favoritos & Filtros Salvos</span>
            </h1>
          </div>
        </div>

        {/* Criar Favorito */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#101013] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">
              Título do Favorito
            </label>
            <input
              type="text"
              value={bmName}
              onChange={(e) => setBmName(e.target.value)}
              placeholder="Ex: Ligações Campanha Retenção"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">
              Coleção Alvo
            </label>
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
            <label className="block text-xs text-zinc-400 mb-1">
              Regra de Filtro JSON
            </label>
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
              className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Salvar Filtro</span>
            </button>
          </div>
        </div>

        {/* Lista de Favoritos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="p-4 rounded-xl border border-zinc-800 bg-[#101013] flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-3.5 w-3.5 text-zinc-300" />
                  <span className="text-sm font-bold text-zinc-100">
                    {bm.name}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {bm.collection}
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-400">
                  Filtro: {bm.filterJson}
                </p>
                <p className="text-[11px] font-mono text-zinc-500">
                  Visualização: {bm.layout} • Escopo: {bm.scope}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={bm.targetHref || "/calls"}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>Abrir</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => deleteBookmarkMutation.mutate(bm.id)}
                  className="p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-red-400"
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

  // 6. TRADUÇÕES (TRANSLATIONS)
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
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações / Traduções
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <Languages className="h-4 w-4 text-zinc-400" />
              <span>Dicionário de Traduções & Termos</span>
            </h1>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={trSearch}
              onChange={(e) => setTrSearch(e.target.value)}
              placeholder="Buscar chave ou texto..."
              className="h-9 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#101013] text-xs text-zinc-100"
            />
          </div>
        </div>

        {/* Adicionar Chave */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#101013] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">
              Chave ($t:)
            </label>
            <input
              type="text"
              value={trKey}
              onChange={(e) => setTrKey(e.target.value)}
              placeholder="$t:qa.criterio_aprovado"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">
              pt-BR (Português Brasil)
            </label>
            <input
              type="text"
              value={trPt}
              onChange={(e) => setTrPt(e.target.value)}
              placeholder="Critério Aprovado"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">
              en-US (Inglês)
            </label>
            <input
              type="text"
              value={trEn}
              onChange={(e) => setTrEn(e.target.value)}
              placeholder="Approved Criterion"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">
              es-ES (Espanhol)
            </label>
            <input
              type="text"
              value={trEs}
              onChange={(e) => setTrEs(e.target.value)}
              placeholder="Criterio Aprobado"
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => createTranslationMutation.mutate()}
              className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5"
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
                    <td className="py-3 px-4 font-mono font-bold text-zinc-100">
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

  // 7. CATÁLOGO DE MÓDULOS & 8. EXTENSÕES INSTALADAS
  if (section === "marketplace" || section === "extensions") {
    const displayedExtensions =
      section === "extensions"
        ? extensions.filter((e) => e.installed)
        : extensions;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-xs font-mono text-zinc-500">
              Configurações /{" "}
              {section === "marketplace"
                ? "Catálogo de Módulos"
                : "Extensões Instaladas"}
            </p>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              {section === "marketplace" ? (
                <Store className="h-4 w-4 text-zinc-400" />
              ) : (
                <Blocks className="h-4 w-4 text-zinc-400" />
              )}
              <span>
                {section === "marketplace"
                  ? "Catálogo de Módulos & Conectores NEXFORM"
                  : "Extensões Instaladas no Sistema"}
              </span>
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedExtensions.map((ext) => (
            <div
              key={ext.id}
              className="p-5 rounded-xl border border-zinc-800 bg-[#101013] flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {ext.type}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    v{ext.version} • {ext.downloads.toLocaleString()} instalações
                  </span>
                </div>
                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                  <span>{ext.name}</span>
                  {ext.verified && (
                    <BadgeCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                </h2>
                <p className="text-[11px] font-mono text-zinc-500">
                  {ext.packageName}
                </p>
                <p className="text-xs text-zinc-400">{ext.description}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                <span className="text-[11px] text-zinc-500">
                  Por <strong className="text-zinc-300">{ext.author}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => toggleExtensionMutation.mutate(ext.id)}
                  className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition-colors ${
                    ext.installed && ext.enabled
                      ? "bg-zinc-900 border border-zinc-700 text-emerald-400 hover:bg-zinc-800"
                      : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                  }`}
                >
                  {!ext.installed
                    ? "Instalar Módulo"
                    : ext.enabled
                    ? "✓ Ativo (Clique para Desativar)"
                    : "Inativo (Clique para Ativar)"}
                </button>
              </div>
            </div>
          ))}
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
        <div>
          <p className="text-xs font-mono text-zinc-500">
            Configurações /{" "}
            {isBugView ? "Reportar Problema" : "Solicitar Funcionalidade"}
          </p>
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
            {isBugView ? (
              <Bug className="h-4 w-4 text-zinc-400" />
            ) : (
              <BadgeCheck className="h-4 w-4 text-zinc-400" />
            )}
            <span>
              {isBugView
                ? "Reportar Problema & Diagnóstico Técnico"
                : "Solicitar Funcionalidade & Votação de Melhorias"}
            </span>
          </h1>
        </div>
      </div>

      {/* Formulário de Envio */}
      <div className="p-5 rounded-xl border border-zinc-800 bg-[#101013] space-y-4">
        <h2 className="text-sm font-bold text-zinc-100">
          {isBugView
            ? "Registrar Relato Técnico (Anexa Telemetria do Ambiente Automaticamente)"
            : "Propor Nova Funcionalidade para o NEXFORM"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Título *</label>
            <input
              type="text"
              value={fbTitle}
              onChange={(e) => setFbTitle(e.target.value)}
              placeholder={
                isBugView
                  ? "Descreva o comportamento inesperado..."
                  : "Ex: Integração direta com Microsoft Teams para alertas de Erro Grave..."
              }
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Módulo Relacionado
            </label>
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
          <label className="block text-xs text-zinc-400 mb-1">
            Descrição Detalhada / Passos
          </label>
          <textarea
            rows={3}
            value={fbDesc}
            onChange={(e) => setFbDesc(e.target.value)}
            className="w-full p-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
          />
        </div>

        {isBugView && (
          <div className="p-3 rounded-lg border border-zinc-800 bg-[#09090b] font-mono text-[11px] text-zinc-400">
            Diagnóstico Anexado: NEXFORM v2.4 • Java 21 • Spring Boot 3.3.4 •
            Next.js 14 • Banco de Dados ATIVO
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              createFeedbackMutation.mutate(isBugView ? "BUG" : "FEATURE")
            }
            className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs"
          >
            {isBugView ? "Enviar Relato de Problema" : "Enviar Sugestão"}
          </button>
        </div>
      </div>

      {/* Lista de Itens */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl border border-zinc-800 bg-[#101013] flex items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 border border-zinc-700 text-zinc-200">
                  {item.status}
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  [{item.module}]
                </span>
                <h3 className="text-sm font-bold text-zinc-100">
                  {item.title}
                </h3>
              </div>
              <p className="text-xs text-zinc-400">{item.description}</p>
              <p className="text-[11px] text-zinc-500">
                Enviado por {item.author}
              </p>
            </div>

            <button
              type="button"
              onClick={() => upvoteMutation.mutate(item.id)}
              className="px-3 py-2 rounded-xl border border-zinc-800 bg-[#0b0b0d] hover:bg-zinc-900 text-xs font-mono text-zinc-100 flex flex-col items-center shrink-0"
              title="Votar nesta melhoria"
            >
              <ArrowUp className="h-3.5 w-3.5 text-zinc-300" />
              <span className="font-bold">{item.votes}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

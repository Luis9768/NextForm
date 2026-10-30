"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Database,
  FolderKanban,
  GripVertical,
  KeyRound,
  Layers,
  Lock,
  Plus,
  Search,
  Settings2,
  Square,
  X,
} from "lucide-react";
import { studioApi } from "@/lib/api";
import { StudioCollection, StudioField } from "@/types";

interface DirectusDataModelViewProps {
  collections: StudioCollection[];
  onInspectCollectionData?: (collectionKey: string) => void;
}

const SYSTEM_COLLECTIONS = [
  {
    collection: "sys_activity",
    note: "Trilha imutável de auditoria, submissões de avaliação e execuções de fluxos",
    fieldsCount: 9,
  },
  {
    collection: "sys_collections",
    note: "Metadados de tabelas, ícones, traduções e configurações de exibição",
    fieldsCount: 14,
  },
  {
    collection: "sys_fields",
    note: "Configuração de componentes, exibições, larguras (50%/100%) e validações",
    fieldsCount: 18,
  },
  {
    collection: "sys_flows",
    note: "Definições de automação, gatilhos (Eventos, Webhook, Cron) e status",
    fieldsCount: 11,
  },
  {
    collection: "sys_operations",
    note: "Nós encadeados (Sucesso/Falha) pertencentes aos fluxos de qualidade",
    fieldsCount: 12,
  },
  {
    collection: "sys_policies",
    note: "Políticas granulares de controle de acesso RBAC (Criar, Ler, Editar, Excluir)",
    fieldsCount: 10,
  },
  {
    collection: "sys_presets",
    note: "Favoritos, filtros salvos e preferências de visualização por usuário/perfil",
    fieldsCount: 13,
  },
  {
    collection: "sys_roles",
    note: "Perfis de acesso (ROLE_GESTOR, ROLE_ANALISTA, ROLE_N8N_WEBHOOK)",
    fieldsCount: 8,
  },
  {
    collection: "sys_settings",
    note: "Configurações globais do NEXFORM, tema, armazenamento de áudio e chaves de API",
    fieldsCount: 22,
  },
  {
    collection: "sys_translations",
    note: "Dicionário multilíngue (pt-BR, en-US, es-ES) do sistema",
    fieldsCount: 5,
  },
  {
    collection: "sys_webhooks",
    note: "Gatilhos HTTP de saída para n8n, RH e CRM externo",
    fieldsCount: 9,
  },
];

export function DirectusDataModelView({
  collections,
  onInspectCollectionData,
}: DirectusDataModelViewProps) {
  const queryClient = useQueryClient();

  const [selectedCollectionKey, setSelectedCollectionKey] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSystemCollections, setShowSystemCollections] = useState(false);

  // Modal Nova Coleção
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [newColKey, setNewColKey] = useState("");
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [newColPkType, setNewColPkType] = useState("uuid");

  // Drawer Novo Campo
  const [isCreateFieldOpen, setIsCreateFieldOpen] = useState(false);
  const [activeFieldTab, setActiveFieldTab] = useState<
    "schema" | "interface" | "validation"
  >("schema");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldSqlType, setNewFieldSqlType] = useState("varchar(180)");
  const [newFieldInterface, setNewFieldInterface] = useState("input");
  const [newFieldWidth, setNewFieldWidth] = useState<"half" | "full">("half");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldDesc, setNewFieldDesc] = useState("");

  // Drawer Inspecionar Campo Existente
  const [inspectedField, setInspectedField] = useState<StudioField | null>(
    null
  );
  const [fieldWidths, setFieldWidths] = useState<Record<string, "half" | "full">>(
    {}
  );

  const selectedCollection = useMemo(
    () =>
      collections.find((c) => c.collection === selectedCollectionKey) || null,
    [collections, selectedCollectionKey]
  );

  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();
    return collections.filter(
      (c) =>
        c.collection.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [collections, searchQuery]);

  const createCollectionMutation = useMutation({
    mutationFn: () =>
      studioApi.createCollection({
        collection: newColKey.trim() || "nova_colecao",
        displayName: newColName.trim() || newColKey.trim() || "Nova Coleção",
        description:
          newColDesc.trim() || "Coleção criada no Modelo de Dados NEXFORM.",
        primaryKeyType: newColPkType,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["studio-collections"] });
      queryClient.invalidateQueries({ queryKey: ["studio-activity"] });
      setIsCreateCollectionOpen(false);
      setNewColKey("");
      setNewColName("");
      setNewColDesc("");
      setSelectedCollectionKey(created.collection);
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: () => {
      if (!selectedCollectionKey) throw new Error("Selecione uma coleção");
      return studioApi.addFieldToCollection(selectedCollectionKey, {
        field: newFieldKey.trim() || "novo_campo",
        type: newFieldSqlType,
        interfaceType: newFieldInterface,
        width: newFieldWidth,
        required: newFieldRequired,
        description:
          newFieldDesc.trim() ||
          `Componente: ${newFieldInterface} (${
            newFieldWidth === "full" ? "100%" : "50%"
          })`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-collections"] });
      queryClient.invalidateQueries({ queryKey: ["studio-activity"] });
      setIsCreateFieldOpen(false);
      setNewFieldKey("");
      setNewFieldDesc("");
    },
  });

  const toggleWidth = (fieldKey: string) => {
    setFieldWidths((prev) => ({
      ...prev,
      [fieldKey]: prev[fieldKey] === "full" ? "half" : "full",
    }));
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Modelo de Dados */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          {selectedCollection && (
            <button
              type="button"
              onClick={() => setSelectedCollectionKey(null)}
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-800 flex items-center justify-center text-zinc-300"
              title="Voltar para lista de coleções"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
              <span>Configurações</span>
              <span>/</span>
              <span
                className={
                  selectedCollection
                    ? "cursor-pointer hover:text-zinc-300"
                    : "text-zinc-300"
                }
                onClick={() => setSelectedCollectionKey(null)}
              >
                Modelo de Dados
              </span>
              {selectedCollection && (
                <>
                  <span>/</span>
                  <span className="text-zinc-100 font-semibold">
                    {selectedCollection.collection}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5">
              <Database className="h-4 w-4 text-zinc-400" />
              <span>
                {selectedCollection
                  ? `Modelo de Dados: ${selectedCollection.collection}`
                  : "Modelo de Dados & Coleções"}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {!selectedCollection ? (
            <>
              <div className="relative flex-1 sm:flex-initial">
                <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar coleções..."
                  className="w-full sm:w-52 h-9 pl-8 pr-3 rounded-lg border border-zinc-800 bg-[#101013] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCollectionOpen(true)}
                className="h-9 px-3.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Coleção</span>
              </button>
            </>
          ) : (
            <>
              {onInspectCollectionData &&
                [
                  "call_records",
                  "evaluations",
                  "evaluation_form_templates",
                ].includes(selectedCollection.collection) && (
                  <button
                    type="button"
                    onClick={() =>
                      onInspectCollectionData(selectedCollection.collection)
                    }
                    className="h-9 px-3.5 rounded-lg border border-zinc-800 bg-[#101013] hover:bg-zinc-900 text-xs text-zinc-200 font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <FolderKanban className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Abrir Registros no Explorador</span>
                  </button>
                )}
              <button
                type="button"
                onClick={() => setIsCreateFieldOpen(true)}
                className="h-9 px-3.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Campo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VISÃO 1: LISTA DE COLEÇÕES */}
      {!selectedCollection && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800/90 bg-[#101013] divide-y divide-zinc-800/80 overflow-hidden">
            {filteredCollections.map((col) => (
              <div
                key={col.collection}
                onClick={() => setSelectedCollectionKey(col.collection)}
                className="px-4 py-3.5 hover:bg-zinc-900/60 cursor-pointer transition-colors flex items-center justify-between gap-4 group overflow-hidden"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <GripVertical className="h-4 w-4 text-zinc-600 shrink-0" />
                  <div className="h-8 w-8 rounded-lg border border-zinc-800 bg-[#0b0b0d] flex items-center justify-center shrink-0">
                    <Database className="h-4 w-4 text-zinc-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-zinc-100 group-hover:text-white break-all sm:break-normal">
                        {col.collection}
                      </span>
                      <span className="text-xs text-zinc-400 hidden lg:inline">
                        — {col.displayName}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 whitespace-nowrap shrink-0">
                        {col.fields.length} campos
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 whitespace-nowrap shrink-0">
                        {col.itemCount} itens
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {col.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-zinc-500 hidden xl:inline whitespace-nowrap">
                    Configurar Campos & Layout
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200 transition-transform group-hover:translate-x-0.5 shrink-0" />
                </div>
              </div>
            ))}
          </div>

          {/* Acordeão de Coleções Internas do Sistema */}
          <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSystemCollections(!showSystemCollections)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                {showSystemCollections ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span>
                  Coleções Internas do Sistema ({SYSTEM_COLLECTIONS.length})
                </span>
              </span>
              <span className="text-[11px] text-zinc-500">
                 Tabelas internas NEXFORM
              </span>
            </button>

            {showSystemCollections && (
              <div className="divide-y divide-zinc-800/60 border-t border-zinc-800/80">
                {SYSTEM_COLLECTIONS.map((sys) => (
                  <div
                    key={sys.collection}
                    className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs bg-[#0b0b0d]/60"
                  >
                    <div className="flex items-center gap-3">
                      <Lock className="h-3.5 w-3.5 text-zinc-600" />
                      <span className="font-mono text-zinc-300 font-medium">
                        {sys.collection}
                      </span>
                      <span className="text-zinc-500 hidden sm:inline">
                        — {sys.note}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {sys.fieldsCount} campos
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISÃO 2: CAMPOS & LAYOUT DA COLEÇÃO SELECIONADA */}
      {selectedCollection && (
        <div className="space-y-6">
          {/* Resumo da Coleção */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-[#101013] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-700 text-zinc-200">
                  TABELA
                </span>
                <span className="text-sm font-semibold text-zinc-100">
                  {selectedCollection.displayName}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {selectedCollection.description}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span>
                Criar:{" "}
                <strong className="text-zinc-200">
                  {selectedCollection.permissions.create}
                </strong>
              </span>
              <span>•</span>
              <span>
                Ler:{" "}
                <strong className="text-zinc-200">
                  {selectedCollection.permissions.read}
                </strong>
              </span>
              <span>•</span>
              <span>
                Editar:{" "}
                <strong className="text-zinc-200">
                  {selectedCollection.permissions.update}
                </strong>
              </span>
            </div>
          </div>

          {/* Grid de Campos em 2 Colunas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Campos & Layout ({selectedCollection.fields.length})
              </h2>
              <span className="text-[11px] text-zinc-500">
                Clique em qualquer campo para inspecionar ou alterne a largura
                (50% / 100%)
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {selectedCollection.fields.map((field) => {
                const defaultFull =
                  field.field === "audio_url" ||
                  field.field === "items" ||
                  field.type.includes("(full)");
                const width =
                  fieldWidths[field.field] || (defaultFull ? "full" : "half");

                return (
                  <div
                    key={field.field}
                    onClick={() => setInspectedField(field)}
                    className={`${
                      width === "full" ? "xl:col-span-2" : "xl:col-span-1"
                    } p-3.5 rounded-xl border border-zinc-800/90 bg-[#101013] hover:border-zinc-600 cursor-pointer transition-all flex items-center justify-between gap-3 group`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GripVertical className="h-4 w-4 text-zinc-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {field.primaryKey ? (
                            <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Layers className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          )}
                          <span className="font-mono text-xs font-bold text-zinc-100">
                            {field.field}
                          </span>
                          {field.required && (
                            <span className="text-xs text-zinc-400 font-bold">
                              *
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0b0b0d] border border-zinc-800 text-zinc-400">
                            {field.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {field.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => toggleWidth(field.field)}
                        title="Alternar largura no formulário (50% / 100%)"
                        className="px-2 py-1 rounded border border-zinc-800 bg-[#0b0b0d] hover:bg-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1"
                      >
                        {width === "full" ? (
                          <>
                            <Square className="h-3 w-3" />
                            <span>100%</span>
                          </>
                        ) : (
                          <>
                            <Columns2 className="h-3 w-3" />
                            <span>50%</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectedField(field)}
                        className="p-1.5 rounded border border-zinc-800 bg-[#0b0b0d] hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botão Inferior "+ Novo Campo" */}
            <button
              type="button"
              onClick={() => setIsCreateFieldOpen(true)}
              className="w-full py-3 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-600 bg-[#0b0b0d]/60 hover:bg-[#101013] text-xs font-semibold text-zinc-300 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Campo em {selectedCollection.collection}</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL: NOVA COLEÇÃO */}
      <AnimatePresence>
        {isCreateCollectionOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsCreateCollectionOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#101013] p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase text-zinc-500">
                    Modelo de Dados NEXFORM
                  </span>
                  <h3 className="text-base font-bold text-zinc-100">
                    Criar Nova Coleção
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateCollectionOpen(false)}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Chave da Tabela (Banco de Dados) *
                  </label>
                  <input
                    type="text"
                    value={newColKey}
                    onChange={(e) => setNewColKey(e.target.value)}
                    placeholder="ex: sessoes_calibracao"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Nome de Exibição
                  </label>
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="ex: Sessões de Calibração QA"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Tipo de Chave Primária
                  </label>
                  <select
                    value={newColPkType}
                    onChange={(e) => setNewColPkType(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                  >
                    <option value="uuid">UUID Gerado Automaticamente</option>
                    <option value="integer">Inteiro Auto-Incremento</option>
                    <option value="varchar(64)">Texto Informado Manualmente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Descrição / Finalidade
                  </label>
                  <input
                    type="text"
                    value={newColDesc}
                    onChange={(e) => setNewColDesc(e.target.value)}
                    placeholder="Descrição da finalidade da coleção..."
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>

                <div className="p-3 rounded-xl border border-zinc-800 bg-[#0b0b0d] space-y-2">
                  <p className="text-[11px] font-mono text-zinc-400">
                    Campos de Sistema (Criados Automaticamente):
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 font-mono">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked readOnly /> status
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked readOnly />{" "}
                      created_at
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked readOnly /> sort
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked readOnly />{" "}
                      user_created
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCollectionOpen(false)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={createCollectionMutation.isPending}
                  onClick={() => createCollectionMutation.mutate()}
                  className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    {createCollectionMutation.isPending
                      ? "Criando..."
                      : "Concluir Criação"}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER: NOVO CAMPO NA COLEÇÃO */}
      <AnimatePresence>
        {isCreateFieldOpen && selectedCollection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
            onClick={() => setIsCreateFieldOpen(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#0e0e11] border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {selectedCollection.collection}
                  </span>
                  <h3 className="text-base font-bold text-zinc-100">
                    Novo Campo em {selectedCollection.collection}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateFieldOpen(false)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Abas do Campo */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#09090b] border border-zinc-800">
                {(
                  [
                    { key: "schema", label: "1. Coluna & Tipo" },
                    { key: "interface", label: "2. Componente Visual" },
                    { key: "validation", label: "3. Validação & Regras" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveFieldTab(tab.key)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeFieldTab === tab.key
                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Nome da Coluna (Chave) *
                  </label>
                  <input
                    type="text"
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    placeholder="ex: indice_sentimento"
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Tipo SQL no Banco
                    </label>
                    <select
                      value={newFieldSqlType}
                      onChange={(e) => setNewFieldSqlType(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                    >
                      <option value="varchar(180)">Texto Curto (varchar)</option>
                      <option value="text">Texto Longo (text)</option>
                      <option value="integer">Inteiro (int4)</option>
                      <option value="numeric(5,2)">Decimal (numeric)</option>
                      <option value="boolean">Booleano (bool)</option>
                      <option value="timestamp">Data e Hora (timestamptz)</option>
                      <option value="uuid">Relação UUID (M2O)</option>
                      <option value="jsonb">Objeto JSON (jsonb)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Componente de Interface
                    </label>
                    <select
                      value={newFieldInterface}
                      onChange={(e) => setNewFieldInterface(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-mono text-zinc-200"
                    >
                      <option value="input">Campo de Texto</option>
                      <option value="boolean">Chave Booleana (Sim/Não)</option>
                      <option value="select-dropdown">Lista Suspensa</option>
                      <option value="weight-stepper">
                        Seletor de Peso QA (1-10 pts)
                      </option>
                      <option value="file-audio-range">
                        Player de Áudio HTTP 206
                      </option>
                      <option value="select-dropdown-m2o">
                        Relação Muitos-para-Um (M2O)
                      </option>
                      <option value="datetime">Seletor de Data/Hora</option>
                      <option value="input-code">Editor JSON / Código</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Largura no Formulário
                    </label>
                    <select
                      value={newFieldWidth}
                      onChange={(e) =>
                        setNewFieldWidth(e.target.value as "half" | "full")
                      }
                      className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-200"
                    >
                      <option value="half">Meia Largura (50%)</option>
                      <option value="full">Largura Total (100%)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newFieldRequired}
                        onChange={(e) => setNewFieldRequired(e.target.checked)}
                      />
                      <span>Campo Obrigatório</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Observação / Texto de Ajuda
                  </label>
                  <input
                    type="text"
                    value={newFieldDesc}
                    onChange={(e) => setNewFieldDesc(e.target.value)}
                    placeholder="Instrução exibida abaixo do campo..."
                    className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreateFieldOpen(false)}
                  className="h-9 px-4 rounded-lg border border-zinc-800 text-xs text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={createFieldMutation.isPending}
                  onClick={() => createFieldMutation.mutate()}
                  className="h-9 px-5 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs"
                >
                  {createFieldMutation.isPending
                    ? "Salvando..."
                    : "Salvar Campo"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER: INSPECIONAR CAMPO EXISTENTE */}
      <AnimatePresence>
        {inspectedField && selectedCollection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
            onClick={() => setInspectedField(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0e0e11] border-l border-zinc-800 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {selectedCollection.collection}
                  </span>
                  <h3 className="text-base font-bold font-mono text-zinc-100">
                    {inspectedField.field}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedField(null)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#101013] space-y-1">
                  <span className="text-zinc-500 font-mono">
                    Tipo & Componente:
                  </span>
                  <p className="font-mono font-semibold text-zinc-100">
                    {inspectedField.type}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-800 bg-[#101013] space-y-1">
                  <span className="text-zinc-500 font-mono">Descrição:</span>
                  <p className="text-zinc-200">{inspectedField.description}</p>
                </div>

                <div>
                  <span className="block text-zinc-400 font-mono mb-1.5 flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    Metadados JSON do Campo:
                  </span>
                  <pre className="p-4 rounded-xl bg-[#09090b] border border-zinc-800 font-mono text-[11px] text-zinc-200 overflow-x-auto">
                    {JSON.stringify(
                      {
                        collection: selectedCollection.collection,
                        field: inspectedField.field,
                        type: inspectedField.type,
                        schema: {
                          name: inspectedField.field,
                          table: selectedCollection.collection,
                          is_primary_key: inspectedField.primaryKey,
                          is_nullable: !inspectedField.required,
                        },
                        meta: {
                          interface: inspectedField.type.includes("•")
                            ? inspectedField.type.split("•")[1].trim()
                            : "input",
                          width: fieldWidths[inspectedField.field] || "half",
                          required: inspectedField.required,
                          note: inspectedField.description,
                        },
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

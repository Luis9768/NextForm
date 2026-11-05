"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Edit3,
  FolderKanban,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import {
  dashboardApi,
  extractErrorMessage,
  formsApi,
  sectorsApi,
  usersApi,
} from "@/lib/api";
import { FormTemplate, SectorItem, UserSummary } from "@/types";

function getInitials(name: string): string {
  return (name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

function isManagerLinkedToSector(
  user: UserSummary,
  sectorName: string
): boolean {
  if (user.role !== "ROLE_GESTOR" && user.role !== "ROLE_ADMIN") {
    return false;
  }
  if (user.role === "ROLE_ADMIN") {
    return true;
  }
  if (!user.allowedSectors || user.allowedSectors.length === 0) {
    return true;
  }
  const target = sectorName.trim().toLowerCase();
  return user.allowedSectors.some((s) => s.trim().toLowerCase() === target);
}

function isAnalystLinkedToSector(
  user: UserSummary,
  sectorName: string
): boolean {
  if (user.role !== "ROLE_ANALISTA") {
    return false;
  }
  return (
    (user.department || "").trim().toLowerCase() ===
    sectorName.trim().toLowerCase()
  );
}

async function assignFormToSector(
  targetSectorName: string,
  newFormId: string,
  allForms: FormTemplate[]
) {
  const normalizedTarget = targetSectorName.trim().toLowerCase();

  // Desvincula formulários que antes apontavam para este setor (se trocou ou removeu)
  const previouslyLinked = allForms.filter(
    (f) =>
      f.sector &&
      f.sector.trim().toLowerCase() === normalizedTarget &&
      f.id !== newFormId
  );

  for (const prev of previouslyLinked) {
    await formsApi.update(prev.id, {
      name: prev.name,
      description: prev.description || "",
      sector: "Geral",
      passingScorePercentage: Number(prev.passingScorePercentage),
      active: prev.active,
      items: prev.items.map((it, idx) => ({
        label: it.label,
        description: it.description || "",
        category: it.category || "Geral",
        fatalError: it.fatalError,
        weight: it.fatalError ? 0 : it.points || it.weight || 1,
        displayOrder: it.displayOrder || idx + 1,
      })),
    });
  }

  // Vincula o novo formulário selecionado ao setor
  if (newFormId && newFormId !== "NONE") {
    const chosen = allForms.find((f) => f.id === newFormId);
    if (
      chosen &&
      (chosen.sector || "").trim().toLowerCase() !== normalizedTarget
    ) {
      await formsApi.update(chosen.id, {
        name: chosen.name,
        description: chosen.description || "",
        sector: targetSectorName.trim(),
        passingScorePercentage: Number(chosen.passingScorePercentage),
        active: chosen.active,
        items: chosen.items.map((it, idx) => ({
          label: it.label,
          description: it.description || "",
          category: it.category || "Geral",
          fatalError: it.fatalError,
          weight: it.fatalError ? 0 : it.points || it.weight || 1,
          displayOrder: it.displayOrder || idx + 1,
        })),
      });
    }
  }
}

export default function SectorsManagementPage() {
  const { isAdmin, isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Popup 1: Visualizar Gestores, Analistas e Matriz ao clicar no Card do Setor
  const [selectedSectorForMembers, setSelectedSectorForMembers] =
    useState<SectorItem | null>(null);
  const [memberModalFormId, setMemberModalFormId] = useState<string>("NONE");

  // Popup 2: Criar / Editar Setor + Trocar Matriz Vinculada
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<SectorItem | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [sectorActive, setSectorActive] = useState(true);
  const [selectedFormId, setSelectedFormId] = useState<string>("NONE");

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ["sectors-list"],
    queryFn: () => sectorsApi.list(false),
    enabled: isGestor,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["sectors-all-users"],
    queryFn: () => usersApi.list(),
    enabled: isGestor,
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["sectors-forms-list"],
    queryFn: () => formsApi.list(true),
    enabled: isGestor,
  });

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.getSummary(),
    enabled: isGestor,
  });

  const filteredSectors = useMemo(() => {
    if (!searchQuery.trim()) return sectors;
    const q = searchQuery.toLowerCase();
    return sectors.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [sectors, searchQuery]);

  const findLinkedFormForSector = (sectorName: string): FormTemplate | null => {
    const target = sectorName.trim().toLowerCase();
    return (
      forms.find(
        (f) => f.sector && f.sector.trim().toLowerCase() === target
      ) || null
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let savedSector: SectorItem;
      if (editingSector) {
        savedSector = await sectorsApi.update(editingSector.id, {
          name,
          code,
          description,
          active: sectorActive,
        });
      } else {
        savedSector = await sectorsApi.create({
          name,
          code,
          description,
          active: sectorActive,
        });
      }

      await assignFormToSector(savedSector.name, selectedFormId, forms);
      return savedSector;
    },
    onSuccess: () => {
      setErrorMsg(null);
      setIsEditModalOpen(false);
      setEditingSector(null);
      setName("");
      setCode("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["sectors-list"] });
      queryClient.invalidateQueries({ queryKey: ["sectors-forms-list"] });
      queryClient.invalidateQueries({ queryKey: ["active-forms"] });
      queryClient.invalidateQueries({ queryKey: ["forms-all"] });
    },
    onError: (err) => setErrorMsg(extractErrorMessage(err)),
  });

  const linkFormFromMembersModalMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSectorForMembers) return;
      await assignFormToSector(
        selectedSectorForMembers.name,
        memberModalFormId,
        forms
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectors-forms-list"] });
      queryClient.invalidateQueries({ queryKey: ["active-forms"] });
      queryClient.invalidateQueries({ queryKey: ["forms-all"] });
    },
    onError: (err) => setErrorMsg(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sectorsApi.remove(id),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["sectors-list"] });
    },
    onError: (err) => setErrorMsg(extractErrorMessage(err)),
  });

  const openMembersModal = (sec: SectorItem) => {
    const linked = findLinkedFormForSector(sec.name);
    setMemberModalFormId(linked ? linked.id : "NONE");
    setSelectedSectorForMembers(sec);
  };

  const openCreateModal = () => {
    setEditingSector(null);
    setName("");
    setCode("");
    setDescription("");
    setSectorActive(true);
    setSelectedFormId("NONE");
    setErrorMsg(null);
    setIsEditModalOpen(true);
  };

  const openEditModal = (sec: SectorItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const linked = findLinkedFormForSector(sec.name);
    setEditingSector(sec);
    setName(sec.name);
    setCode(sec.code);
    setDescription(sec.description || "");
    setSectorActive(sec.active);
    setSelectedFormId(linked ? linked.id : "NONE");
    setErrorMsg(null);
    setIsEditModalOpen(true);
  };

  const handleDeleteSector = (secId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate(secId);
  };

  const sectorMembers = useMemo(() => {
    if (!selectedSectorForMembers) {
      return { managers: [], analysts: [] };
    }
    const secName = selectedSectorForMembers.name;
    const managers = allUsers.filter((u) =>
      isManagerLinkedToSector(u, secName)
    );
    const analysts = allUsers.filter((u) =>
      isAnalystLinkedToSector(u, secName)
    );
    return { managers, analysts };
  }, [allUsers, selectedSectorForMembers]);

  const totalAnalystsCount = useMemo(
    () => allUsers.filter((u) => u.role === "ROLE_ANALISTA" && u.active).length,
    [allUsers]
  );

  return (
    <AppShell>
      <div className="space-y-4 pb-14 w-full overflow-x-hidden">
        {/* Strip de Resumo Executivo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Setores Ativos</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {sectors.filter((s) => s.active).length}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Analistas Ativos</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {totalAnalystsCount}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Matrizes Disponíveis</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {forms.length}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Média Operacional</span>
            <span className="text-lg font-semibold font-mono text-emerald-400">
              {summary
                ? `${Number(summary.averageScorePercentage).toFixed(1)}%`
                : "-"}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl border border-red-900/60 bg-red-950/30 text-xs text-red-200 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-red-300 hover:text-white font-mono text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Barra de Ferramentas Unificada */}
        <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar setor ou código..."
              className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="h-8 px-3.5 rounded-md bg-zinc-100 hover:bg-zinc-200 active:scale-[0.98] text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Setor</span>
            </button>
          )}
        </div>

        {/* Bento Grid Minimalista de Setores */}
        {isLoading ? (
          <div className="py-12 text-center text-xs text-zinc-500 rounded-xl border border-zinc-800/80 bg-[#0e0e11]">
            Carregando setores...
          </div>
        ) : filteredSectors.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 rounded-xl border border-zinc-800/80 bg-[#0e0e11]">
            Nenhum setor encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSectors.map((sec) => {
              const linkedManagers = allUsers.filter((u) =>
                isManagerLinkedToSector(u, sec.name)
              );
              const linkedAnalysts = allUsers.filter((u) =>
                isAnalystLinkedToSector(u, sec.name)
              );
              const sectorPerf = summary?.sectorAverages?.find(
                (sp) =>
                  sp.sector.trim().toLowerCase() ===
                  sec.name.trim().toLowerCase()
              );
              const linkedForm = findLinkedFormForSector(sec.name);

              return (
                <div
                  key={sec.id}
                  onClick={() => openMembersModal(sec)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openMembersModal(sec);
                    }
                  }}
                  className="group rounded-xl border border-zinc-800/80 bg-[#0e0e11] hover:border-zinc-600 transition-all p-5 flex flex-col justify-between gap-4 cursor-pointer text-left"
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-xs font-mono font-semibold text-zinc-200 shrink-0">
                        {sec.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-zinc-100 tracking-tight group-hover:text-white">
                            {sec.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[10px] font-mono text-zinc-400">
                            {sec.code}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 truncate mt-0.5">
                          <FolderKanban className="h-3 w-3 text-zinc-500 shrink-0" />
                          <span className="truncate">
                            {linkedForm
                              ? `${linkedForm.name} (${linkedForm.maxPossiblePoints} pts)`
                              : "Sem matriz vinculada (clique para vincular)"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/35 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Ativo</span>
                    </span>
                  </div>

                  {/* Métricas do Setor */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-lg bg-[#09090b] border border-zinc-800/80">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                        Gestores
                      </span>
                      <span className="text-sm font-semibold font-mono text-zinc-100 mt-0.5 block">
                        {linkedManagers.length}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#09090b] border border-zinc-800/80">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                        Analistas
                      </span>
                      <span className="text-sm font-semibold font-mono text-zinc-100 mt-0.5 block">
                        {linkedAnalysts.length}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#09090b] border border-zinc-800/80">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                        Nota Média
                      </span>
                      <span className="text-sm font-semibold font-mono text-zinc-100 mt-0.5 block">
                        {sectorPerf
                          ? `${Number(sectorPerf.averageScore).toFixed(1)}%`
                          : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-3 border-t border-zinc-800/70 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {[...linkedManagers, ...linkedAnalysts]
                          .slice(0, 4)
                          .map((member) => (
                            <div
                              key={member.id}
                              title={`${member.name} (${member.email})`}
                              className="h-6 w-6 rounded-full bg-[#16161c] border border-zinc-700 flex items-center justify-center text-[9px] font-mono font-semibold text-zinc-200"
                            >
                              {getInitials(member.name)}
                            </div>
                          ))}
                      </div>
                      <span className="text-xs text-zinc-400 group-hover:text-zinc-200 inline-flex items-center gap-1 transition-colors">
                        <span>Ver gestores, analistas e matriz</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => openEditModal(sec, e)}
                          className="h-7 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-[11px] font-medium text-zinc-200 inline-flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="h-3 w-3 text-zinc-400" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSector(sec.id, e)}
                          className="h-7 w-7 rounded-md border border-zinc-800 bg-[#141418] hover:border-red-900/70 hover:bg-red-950/40 text-zinc-400 hover:text-red-300 inline-flex items-center justify-center transition-colors"
                          aria-label={`Excluir setor ${sec.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ====================================================================
            POPUP 1: INTEGRANTES (NOME + EMAIL) & TROCA DIRETA DA MATRIZ DO SETOR
           ==================================================================== */}
        <AnimatePresence>
          {selectedSectorForMembers && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setSelectedSectorForMembers(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-5 shadow-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden"
              >
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-base font-semibold text-zinc-100 truncate">
                      {selectedSectorForMembers.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[10px] font-mono text-zinc-400 shrink-0">
                      {selectedSectorForMembers.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          const target = selectedSectorForMembers;
                          setSelectedSectorForMembers(null);
                          openEditModal(target, e);
                        }}
                        className="h-8 px-3 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Editar Setor</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedSectorForMembers(null)}
                      className="h-8 w-8 rounded-md border border-zinc-800 bg-[#141418] text-zinc-400 hover:text-zinc-100 flex items-center justify-center"
                      aria-label="Fechar popup"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Bloco 1: Seletor Direto da Matriz / Formulário Vinculado ao Setor */}
                <div className="p-3.5 rounded-lg border border-zinc-800/80 bg-[#09090b] space-y-2.5 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <FolderKanban className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span>Matriz Vinculada</span>
                    </span>
                    <Link
                      href="/forms"
                      className="text-[11px] font-mono text-zinc-400 hover:text-zinc-100 shrink-0"
                    >
                      Abrir /forms →
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                    <select
                      value={memberModalFormId}
                      onChange={(e) => setMemberModalFormId(e.target.value)}
                      className="w-full min-w-0 h-9 px-3 rounded-md border border-zinc-800 bg-[#121215] text-xs text-zinc-100 truncate focus:outline-none focus:border-zinc-600"
                    >
                      <option value="NONE">Sem matriz vinculada</option>
                      {forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.maxPossiblePoints} pts)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={linkFormFromMembersModalMutation.isPending}
                      onClick={() => linkFormFromMembersModalMutation.mutate()}
                      className="h-9 px-3.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>
                        {linkFormFromMembersModalMutation.isPending
                          ? "Salvando..."
                          : "Salvar"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Bloco 2: Gestores Atrelados (Nome + E-mail) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                    <span>
                      Gestores Vinculados ({sectorMembers.managers.length})
                    </span>
                  </span>

                  {sectorMembers.managers.length === 0 ? (
                    <div className="p-3.5 rounded-lg border border-zinc-800/80 bg-[#09090b] text-xs text-zinc-500">
                      Nenhum gestor vinculado a este setor.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-zinc-800/80 bg-[#09090b] divide-y divide-zinc-800/60 overflow-hidden">
                      {sectorMembers.managers.map((mgr) => (
                        <div
                          key={mgr.id}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                              {getInitials(mgr.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-zinc-100 truncate">
                                {mgr.name}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400 flex items-center gap-1 truncate mt-0.5">
                                <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
                                <span className="truncate">{mgr.email}</span>
                              </p>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#141418] border border-zinc-800 text-zinc-300 shrink-0">
                            {mgr.role === "ROLE_ADMIN" ? "Admin" : "Gestor"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bloco 3: Analistas Atrelados (Nome + E-mail) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-zinc-400" />
                    <span>
                      Analistas Vinculados ({sectorMembers.analysts.length})
                    </span>
                  </span>

                  {sectorMembers.analysts.length === 0 ? (
                    <div className="p-3.5 rounded-lg border border-zinc-800/80 bg-[#09090b] text-xs text-zinc-500">
                      Nenhum analista vinculado a este setor.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-zinc-800/80 bg-[#09090b] divide-y divide-zinc-800/60 overflow-hidden">
                      {sectorMembers.analysts.map((an) => (
                        <div
                          key={an.id}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                              {getInitials(an.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-zinc-100 truncate">
                                {an.name}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400 flex items-center gap-1 truncate mt-0.5">
                                <Mail className="h-3 w-3 text-zinc-500 shrink-0" />
                                <span className="truncate">{an.email}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Link
                              href={`/analysts/${an.id}`}
                              className="h-7 px-2.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>Avaliar</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ====================================================================
            POPUP 2: MODAL ESPECÍFICO DE EDIÇÃO / CRIAÇÃO DE SETOR + MATRIZ
           ==================================================================== */}
        <AnimatePresence>
          {isAdmin && isEditModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setIsEditModalOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-semibold text-zinc-100">
                    {editingSector
                      ? `Editar Setor • ${editingSector.name}`
                      : "Novo Setor"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Nome do Setor *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Aquisição, Retenção, SAC..."
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Código Identificador
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Ex: AQUISICAO"
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Matriz / Formulário Vinculado ao Setor
                    </label>
                    <select
                      value={selectedFormId}
                      onChange={(e) => setSelectedFormId(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    >
                      <option value="NONE">Sem matriz vinculada</option>
                      {forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.maxPossiblePoints} pts)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="h-8 px-3.5 rounded-md border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!name.trim() || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                    className="h-8 px-4 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold disabled:opacity-50"
                  >
                    {saveMutation.isPending ? "Salvando..." : "Salvar Setor"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

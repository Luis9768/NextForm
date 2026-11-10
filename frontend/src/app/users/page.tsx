"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TablePagination } from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";
import {
  directusApi,
  extractErrorMessage,
  sectorsApi,
  usersApi,
} from "@/lib/api";
import { Role, UserSummary } from "@/types";

function getInitials(name: string): string {
  return (name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export default function UsersManagementPage() {
  const { isAdmin, isGestor } = useAuth();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Modal Novo Colaborador
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("ROLE_ANALISTA");
  const [newDepartment, setNewDepartment] = useState("SAC");

  // Modal Definir Setores (Admin -> Gestor)
  const [editingManager, setEditingManager] = useState<UserSummary | null>(
    null
  );
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  // Modal Trocar Senha (Gestor -> Analista | Admin -> Gestor/Analista)
  const [passwordTargetUser, setPasswordTargetUser] =
    useState<UserSummary | null>(null);
  const [targetNewPassword, setTargetNewPassword] = useState("");
  const [targetConfirmPassword, setTargetConfirmPassword] = useState("");
  const [showTargetPassword, setShowTargetPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forceChangeNextLogin, setForceChangeNextLogin] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-management", roleFilter, statusFilter],
    queryFn: () =>
      usersApi.list(
        roleFilter === "ALL" ? undefined : (roleFilter as Role),
        statusFilter === "ALL" ? undefined : statusFilter === "ACTIVE"
      ),
    enabled: isGestor,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["sectors-list"],
    queryFn: () => sectorsApi.list(false),
    enabled: isGestor,
  });

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, safePage, pageSize]);

  const metrics = useMemo(() => {
    const total = users.length;
    const activeCount = users.filter((u) => u.active).length;
    const managersCount = users.filter((u) => u.role !== "ROLE_ANALISTA").length;
    const analystsCount = users.filter((u) => u.role === "ROLE_ANALISTA").length;
    return { total, activeCount, managersCount, analystsCount };
  }, [users]);

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.toggleStatus(id, active),
    onSuccess: () => {
      setFeedbackError(null);
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analysts-sidebar-list"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        department: newDepartment,
      }),
    onSuccess: () => {
      setFeedbackError(null);
      setShowCreateModal(false);
      setNewName("");
      setNewEmail("");
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      queryClient.invalidateQueries({ queryKey: ["analysts-sidebar-list"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const updateAllowedSectorsMutation = useMutation({
    mutationFn: ({ id, allowed }: { id: string; allowed: string[] }) =>
      usersApi.updateAllowedSectors(id, allowed),
    onSuccess: () => {
      setFeedbackError(null);
      setEditingManager(null);
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => {
      if (!passwordTargetUser) throw new Error("Usuário não selecionado.");
      return usersApi.changePassword(passwordTargetUser.id, {
        newPassword: targetNewPassword.trim(),
        confirmPassword: targetConfirmPassword.trim(),
        forceChangeOnNextLogin: forceChangeNextLogin,
      });
    },
    onSuccess: (updated) => {
      setFeedbackError(null);
      setFeedbackSuccess(
        `Senha de ${updated.name} alterada com sucesso!`
      );
      setPasswordTargetUser(null);
      setTargetNewPassword("");
      setTargetConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const resetFirstAccessMutation = useMutation({
    mutationFn: () => {
      if (!passwordTargetUser) throw new Error("Usuário não selecionado.");
      return usersApi.resetFirstAccess(passwordTargetUser.id);
    },
    onSuccess: (updated) => {
      setFeedbackError(null);
      setFeedbackSuccess(
        `Credencial de 1º acesso restaurada para ${updated.name}!`
      );
      setPasswordTargetUser(null);
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const syncDirectusUsersMutation = useMutation({
    mutationFn: () => directusApi.syncUsers(),
    onSuccess: (res) => {
      setFeedbackError(null);
      setFeedbackSuccess(
        `Sincronização Directus concluída: ${res.syncedUsersCount} usuários ativos nos setores!`
      );
      queryClient.invalidateQueries({ queryKey: ["users-management"] });
      queryClient.invalidateQueries({ queryKey: ["analysts-sidebar-list"] });
    },
    onError: (err) => setFeedbackError(extractErrorMessage(err)),
  });

  const openManagerSectorsModal = (manager: UserSummary) => {
    setEditingManager(manager);
    setSelectedSectors(manager.allowedSectors || []);
  };

  const openPasswordModal = (targetUser: UserSummary) => {
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setPasswordTargetUser(targetUser);
    setTargetNewPassword("");
    setTargetConfirmPassword("");
    setForceChangeNextLogin(false);
  };

  const toggleSectorInList = (sectorName: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorName)
        ? prev.filter((s) => s !== sectorName)
        : [...prev, sectorName]
    );
  };

  const renderRoleBadge = (r: Role) => {
    if (r === "ROLE_ADMIN") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-zinc-100 text-zinc-950">
          Admin
        </span>
      );
    }
    if (r === "ROLE_GESTOR") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-medium bg-zinc-800/90 border border-zinc-700 text-zinc-200">
          Gestor
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-zinc-400 bg-[#141418] border border-zinc-800">
        Analista
      </span>
    );
  };

  return (
    <AppShell>
      <div className="space-y-4 pb-14 w-full overflow-x-hidden">
        {/* Strip de Resumo Executivo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Total</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {metrics.total}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Ativos</span>
            <span className="text-lg font-semibold font-mono text-emerald-400">
              {metrics.activeCount}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Gestão & Admin</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {metrics.managersCount}
            </span>
          </div>
          <div className="px-4 py-3.5 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">Analistas</span>
            <span className="text-lg font-semibold font-mono text-zinc-100">
              {metrics.analystsCount}
            </span>
          </div>
        </div>

        {feedbackError && (
          <div className="p-3 rounded-xl border border-red-900/60 bg-red-950/30 text-xs text-red-200 flex items-center justify-between">
            <span>{feedbackError}</span>
            <button
              type="button"
              onClick={() => setFeedbackError(null)}
              className="text-red-300 hover:text-white font-mono text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {feedbackSuccess && (
          <div className="p-3 rounded-xl border border-emerald-800/60 bg-emerald-950/25 text-xs text-emerald-200 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              {feedbackSuccess}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackSuccess(null)}
              className="text-emerald-300 hover:text-white font-mono text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Barra de Ferramentas Unificada */}
        <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#0e0e11] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <div className="relative w-full sm:w-56">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar colaborador..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
              {[
                { key: "ALL", label: "Todos" },
                { key: "ROLE_ADMIN", label: "Admin" },
                { key: "ROLE_GESTOR", label: "Gestores" },
                { key: "ROLE_ANALISTA", label: "Analistas" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRoleFilter(tab.key)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                    roleFilter === tab.key
                      ? "bg-zinc-100 text-zinc-950 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#09090b] border border-zinc-800/80">
              {[
                { key: "ALL", label: "Todos" },
                { key: "ACTIVE", label: "Ativos" },
                { key: "INACTIVE", label: "Inativos" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setStatusFilter(st.key)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === st.key
                      ? "bg-zinc-800 text-zinc-100 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                disabled={syncDirectusUsersMutation.isPending}
                onClick={() => syncDirectusUsersMutation.mutate()}
                className="h-8 px-3 rounded-md border border-zinc-700 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-100 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-zinc-300 ${
                    syncDirectusUsersMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                <span>
                  {syncDirectusUsersMutation.isPending
                    ? "Sincronizando..."
                    : "Sincronizar Directus"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3.5 rounded-md bg-zinc-100 hover:bg-zinc-200 active:scale-[0.98] text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Colaborador</span>
            </button>
          </div>
        </div>

        {/* Tabela de Colaboradores Padronizada em Grid (Alinhamento Vertical Estrito) */}
        <div className="rounded-xl border border-zinc-800/80 bg-[#0e0e11] divide-y divide-zinc-800/60 overflow-hidden">
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.5fr)_90px_minmax(0,1.25fr)_110px_280px] lg:items-center lg:gap-3 px-5 py-2.5 bg-[#09090b] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Colaborador & E-mail</span>
            <span>Perfil</span>
            <span>Setor / Escopo</span>
            <span className="text-center">Status</span>
            <span className="text-right">Ações</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Carregando colaboradores...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Nenhum colaborador encontrado.
            </div>
          ) : (
            paginatedUsers.map((u) => {
              const canManageTarget = isAdmin || u.role === "ROLE_ANALISTA";
              const sectorsList =
                u.role === "ROLE_GESTOR"
                  ? u.allowedSectors && u.allowedSectors.length > 0
                    ? u.allowedSectors
                    : ["Todos os Setores"]
                  : [u.department || "Geral"];

              return (
                <div
                  key={u.id}
                  className="p-4 sm:px-5 sm:py-3 hover:bg-zinc-900/35 transition-colors flex flex-col lg:grid lg:grid-cols-[minmax(0,1.5fr)_90px_minmax(0,1.25fr)_110px_280px] lg:items-center gap-3"
                >
                  {/* Coluna 1: Avatar + Nome + E-mail */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                      {getInitials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-100 truncate">
                        {u.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono truncate mt-0.5">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  {/* Coluna 2: Perfil */}
                  <div className="flex items-center">
                    {renderRoleBadge(u.role)}
                  </div>

                  {/* Coluna 3: Setor / Escopo Autorizado */}
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {sectorsList.map((sec) => (
                      <span
                        key={sec}
                        className="px-2 py-0.5 rounded-md bg-[#141418] border border-zinc-800/90 text-[10px] font-mono text-zinc-300"
                      >
                        {sec}
                      </span>
                    ))}
                    {u.mustChangePassword && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-950/35 border border-amber-800/50 text-[10px] font-mono text-amber-300">
                        1º Acesso
                      </span>
                    )}
                  </div>

                  {/* Coluna 4: Status Centralizado */}
                  <div className="flex items-center justify-between lg:justify-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                      Status
                    </span>
                    {u.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/35 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>Ativo</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 text-[11px] font-medium whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                        <span>Inativo</span>
                      </span>
                    )}
                  </div>

                  {/* Coluna 5: Ações Alinhadas à Direita */}
                  <div className="flex items-center justify-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/50">
                    {isAdmin && u.role === "ROLE_GESTOR" && (
                      <button
                        type="button"
                        onClick={() => openManagerSectorsModal(u)}
                        className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Setores</span>
                      </button>
                    )}

                    {canManageTarget && (
                      <button
                        type="button"
                        onClick={() => openPasswordModal(u)}
                        className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Trocar Senha</span>
                      </button>
                    )}

                    {canManageTarget && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleStatusMutation.mutate({
                            id: u.id,
                            active: !u.active,
                          })
                        }
                        className={`h-8 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                          u.active
                            ? "border-zinc-800 bg-[#141418] text-zinc-300 hover:border-red-900/70 hover:bg-red-950/40 hover:text-red-300"
                            : "border-emerald-900/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-950/60"
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>{u.active ? "Inativar" : "Reativar"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <TablePagination
            currentPage={safePage}
            totalItems={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="colaboradores"
          />
        </div>

        {/* Modal: Trocar Senha de Colaborador (Gestor -> Analista | Admin -> Gestor/Analista) */}
        {passwordTargetUser && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPasswordTargetUser(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100 truncate">
                    Trocar Senha • {passwordTargetUser.name}
                  </h2>
                  <p className="text-[11px] font-mono text-zinc-500 truncate">
                    {passwordTargetUser.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordTargetUser(null)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-zinc-400">
                    Senha *
                  </label>
                  <button
                    type="button"
                    disabled={resetFirstAccessMutation.isPending}
                    onClick={() => resetFirstAccessMutation.mutate()}
                    className="text-[11px] font-mono text-zinc-400 hover:text-zinc-100"
                  >
                    {resetFirstAccessMutation.isPending
                      ? "Redefinindo..."
                      : "Redefinir para 1º Acesso"}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showTargetPassword ? "text" : "password"}
                    value={targetNewPassword}
                    onChange={(e) => setTargetNewPassword(e.target.value)}
                    placeholder="Digite a nova senha..."
                    className="w-full h-9 pl-3 pr-9 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={
                      showTargetPassword ? "Ocultar senha" : "Ver senha"
                    }
                    onClick={() => setShowTargetPassword((v) => !v)}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    {showTargetPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={targetConfirmPassword}
                      onChange={(e) => setTargetConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha..."
                      className="w-full h-9 pl-3 pr-9 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        showConfirmPassword
                          ? "Ocultar confirmação de senha"
                          : "Ver confirmação de senha"
                      }
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceChangeNextLogin}
                    onChange={(e) => setForceChangeNextLogin(e.target.checked)}
                    className="h-4 w-4 accent-zinc-100"
                  />
                  <span className="text-xs text-zinc-300">
                    Exigir que o usuário troque a senha no próximo acesso
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPasswordTargetUser(null)}
                  className="h-8 px-3.5 rounded-md border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    !targetNewPassword.trim() ||
                    !targetConfirmPassword.trim() ||
                    changePasswordMutation.isPending
                  }
                  onClick={() => changePasswordMutation.mutate()}
                  className="h-8 px-4 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold disabled:opacity-50"
                >
                  {changePasswordMutation.isPending
                    ? "Salvando..."
                    : "Salvar Senha"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Novo Colaborador */}
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Novo Colaborador
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Fernanda Lima"
                    className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    E-mail Corporativo *
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="fernanda.lima@headsetbrasil.com"
                    className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Perfil *
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as Role)}
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    >
                      <option value="ROLE_ANALISTA">Analista</option>
                      {isAdmin && <option value="ROLE_GESTOR">Gestor</option>}
                      {isAdmin && (
                        <option value="ROLE_ADMIN">Administrador</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Setor *
                    </label>
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                    >
                      {sectors.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Senha Inicial *
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-zinc-800 bg-[#09090b] text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-8 px-3.5 rounded-md border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!newName || !newEmail || createUserMutation.isPending}
                  onClick={() => createUserMutation.mutate()}
                  className="h-8 px-4 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Admin: Definir Setores Liberados para Gestor */}
        {editingManager && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setEditingManager(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#0e0e11] p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Setores Autorizados • {editingManager.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingManager(null)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {sectors.map((sec) => {
                  const checked = selectedSectors.includes(sec.name);
                  return (
                    <label
                      key={sec.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-zinc-800 bg-[#09090b] hover:border-zinc-700 cursor-pointer"
                    >
                      <span className="text-xs font-medium text-zinc-200">
                        {sec.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSectorInList(sec.name)}
                        className="h-4 w-4 accent-zinc-100"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingManager(null)}
                  className="h-8 px-3.5 rounded-md border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateAllowedSectorsMutation.mutate({
                      id: editingManager.id,
                      allowed: selectedSectors,
                    })
                  }
                  className="h-8 px-4 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

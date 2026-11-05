"use client";

import React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Phone,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { dashboardApi, usersApi } from "@/lib/api";

const AVAILABLE_SECTORS = [
  "SAC",
  "Cobrança & Retenção",
  "Suporte N1",
  "Retenção & Ouvidoria",
];

export default function AnalystsDirectoryPage() {
  const { isGestor } = useAuth();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.getSummary(),
    enabled: isGestor,
  });

  const changeSectorMutation = useMutation({
    mutationFn: ({
      analystId,
      newSector,
    }: {
      analystId: string;
      newSector: string;
    }) =>
      usersApi.changeSector(analystId, {
        newSector,
        reason: "Alteração de setor pela gestão (histórico preservado)",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analysts-sidebar-list"] });
    },
  });

  if (!isGestor) {
    return (
      <AppShell>
        <div className="p-6 rounded-2xl border border-red-800 bg-red-950/40 text-red-200 text-sm">
          Acesso restrito ao perfil <strong>ROLE_GESTOR</strong>.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-zinc-400 shrink-0" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Analistas
            </h1>
          </div>
        </motion.div>

        {isLoading || !summary ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-56 rounded-2xl border border-zinc-800 shadcn-kpi-card animate-pulse p-6"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
            {summary.analystRanking.map((analyst, idx) => (
              <motion.div
                key={analyst.analystId}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.06 * idx }}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800/90 shadcn-kpi-card p-5 sm:p-6 flex flex-col justify-between hover:border-zinc-500 dark:hover:border-zinc-600 transition-all group overflow-hidden"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center font-bold text-sm text-zinc-900 dark:text-zinc-100 shrink-0">
                        {analyst.analystName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-white truncate">
                          {analyst.analystName}
                        </h2>
                        <p className="text-xs text-zinc-500 truncate">
                          {analyst.analystEmail}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0">
                      {Number(analyst.averageScore).toFixed(1)}%
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      <span>Setor</span>
                    </label>
                    <select
                      value={analyst.department}
                      disabled={changeSectorMutation.isPending}
                      onChange={(e) =>
                        changeSectorMutation.mutate({
                          analystId: analyst.analystId,
                          newSector: e.target.value,
                        })
                      }
                      className="w-full h-8 px-2.5 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs font-medium text-zinc-200 focus:outline-none focus:border-zinc-600"
                    >
                      {!AVAILABLE_SECTORS.includes(analyst.department) && (
                        <option value={analyst.department}>
                          {analyst.department}
                        </option>
                      )}
                      {AVAILABLE_SECTORS.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800/80 text-center">
                    <div className="p-2.5 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase block whitespace-nowrap">
                        Avaliadas
                      </span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                        {analyst.evaluatedCalls}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-center gap-1 whitespace-nowrap">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span>Aprov.</span>
                      </span>
                      <span className="text-sm font-bold text-emerald-500 mt-0.5 block">
                        {analyst.approvedCount}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/60 overflow-hidden">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-center gap-1 whitespace-nowrap">
                        <ShieldAlert className="h-3 w-3 text-red-400 shrink-0" />
                        <span>Fatal</span>
                      </span>
                      <span className="text-sm font-bold text-red-400 mt-0.5 block">
                        {analyst.fatalErrorCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800/80">
                  <Link
                    href={`/analysts/${analyst.analystId}`}
                    className="w-full h-10 px-4 rounded-xl bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>Avaliar</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

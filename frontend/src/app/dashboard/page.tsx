"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Headphones,
  Layers,
  PhoneCall,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { TablePagination } from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";
import { dashboardApi } from "@/lib/api";
import { formatDateTime, getEvaluationStatusBadge } from "@/lib/utils";
import { Evaluation } from "@/types";

/**
 * Gera um caminho SVG suave (Catmull-Rom / Cubic Bezier) para gráficos estilo Shadcn UI
 */
function buildSmoothSvgPath(
  points: { x: number; y: number }[],
  closeArea = false,
  height = 220
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return closeArea
      ? `M 0,${height} L 0,${p.y} L ${p.x},${p.y} L ${p.x},${height} Z`
      : `M 0,${p.y} L ${p.x},${p.y}`;
  }

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const ctrlX1 = curr.x + (next.x - curr.x) * 0.45;
    const ctrlY1 = curr.y;
    const ctrlX2 = curr.x + (next.x - curr.x) * 0.55;
    const ctrlY2 = next.y;
    d += ` C ${ctrlX1.toFixed(1)},${ctrlY1.toFixed(1)} ${ctrlX2.toFixed(
      1
    )},${ctrlY2.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
  }

  if (closeArea) {
    const last = points[points.length - 1];
    const first = points[0];
    d += ` L ${last.x.toFixed(1)},${height} L ${first.x.toFixed(
      1
    )},${height} Z`;
  }
  return d;
}

export default function DashboardPage() {
  const { user, isGestor } = useAuth();
  const [selectedEvaluationModal, setSelectedEvaluationModal] =
    useState<Evaluation | null>(null);
  const [activeTab, setActiveTab] = useState<"evaluations" | "ranking">(
    "evaluations"
  );
  const [chartView, setChartView] = useState<"area" | "sectors" | "criteria">(
    "area"
  );
  const [sectorFilter, setSectorFilter] = useState("");
  const [analystIdFilter, setAnalystIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "APROVADO" | "REPROVADO" | "ZERADO_ERRO_GRAVE"
  >("ALL");
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [evalPage, setEvalPage] = useState(1);
  const [evalPageSize, setEvalPageSize] = useState(15);
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingPageSize, setRankingPageSize] = useState(15);

  const { data: summary, isLoading } = useQuery({
    queryKey: [
      "dashboard-summary",
      user?.id,
      sectorFilter,
      analystIdFilter,
    ],
    queryFn: () =>
      dashboardApi.getSummary({
        sector: sectorFilter || undefined,
        analystId: analystIdFilter || undefined,
      }),
    enabled: !!user,
  });

  // Dados reais extraídos do sistema para alimentar os gráficos animados
  const avgScore = Number(summary?.averageScorePercentage ?? 0);
  const approvalRate = Number(summary?.approvalRatePercentage ?? 0);
  const fatalRate = Number(summary?.fatalErrorRatePercentage ?? 0);
  const fatalCount = summary?.fatalErrorCount ?? 0;
  const approvedCount = summary?.approvedCount ?? 0;
  const failedCount = summary?.failedCount ?? 0;
  const totalCalls = summary?.totalCalls ?? 0;
  const pendingCalls = summary?.pendingCalls ?? 0;
  const evaluatedCalls = summary?.evaluatedCalls ?? 0;
  const coverageRate =
    totalCalls > 0 ? (evaluatedCalls / totalCalls) * 100 : 0;

  // Série cronológica de avaliações reais para o Area Chart principal e Sparkline (últimas 15 para legibilidade)
  const chronologicalEvaluations = useMemo(() => {
    const list = [...(summary?.recentEvaluations ?? [])];
    list.sort(
      (a, b) =>
        new Date(a.evaluatedAt).getTime() - new Date(b.evaluatedAt).getTime()
    );
    return list.slice(-15);
  }, [summary?.recentEvaluations]);

  const sortedAnalystsDropdown = useMemo(() => {
    return [...(summary?.analystRanking ?? [])].sort((a, b) =>
      a.analystName.localeCompare(b.analystName, "pt-BR")
    );
  }, [summary?.analystRanking]);

  // Pontos normalizados do gráfico principal (SVG 720x220)
  const mainChartData = useMemo(() => {
    const width = 720;
    const height = 210;
    const padX = 28;
    const padTop = 20;
    const padBottom = 24;
    const usableW = width - padX * 2;
    const usableH = height - padTop - padBottom;

    if (chronologicalEvaluations.length > 0) {
      return chronologicalEvaluations.map((ev, idx) => {
        const count = Math.max(1, chronologicalEvaluations.length - 1);
        const x =
          chronologicalEvaluations.length === 1
            ? width / 2
            : padX + (idx / count) * usableW;
        const finalScore = Number(ev.finalScorePercentage);
        const rawScore = Number(ev.rawScorePercentage);
        const yFinal = padTop + usableH - (finalScore / 100) * usableH;
        const yRaw = padTop + usableH - (rawScore / 100) * usableH;

        return {
          x,
          y: yFinal,
          yRaw,
          score: finalScore,
          rawScore,
          label: `#${ev.callRecord.externalCallId}`,
          analystName: ev.analyst.name,
          sector: ev.analystSectorSnapshot || ev.analyst.department || "Geral",
          status: ev.status,
          dateLabel: formatDateTime(ev.evaluatedAt),
        };
      });
    }

    const timeline = summary?.scoreTimeline ?? [];
    return timeline.map((pt, idx) => {
      const count = Math.max(1, timeline.length - 1);
      const x = timeline.length === 1 ? width / 2 : padX + (idx / count) * usableW;
      const sc = Number(pt.averageScore);
      const y = padTop + usableH - (sc / 100) * usableH;
      return {
        x,
        y,
        yRaw: y,
        score: sc,
        rawScore: sc,
        label: pt.label,
        analystName: `${pt.evaluationsCount} avaliação(ões)`,
        sector: sectorFilter || "Geral",
        status: sc >= 75 ? "APROVADO" : "REPROVADO",
        dateLabel: pt.label,
      };
    });
  }, [chronologicalEvaluations, summary?.scoreTimeline, sectorFilter]);

  // Sparkline 1: Curva das notas reais (220x52)
  const sparklineScorePoints = useMemo(() => {
    const w = 220;
    const h = 48;
    const vals =
      chronologicalEvaluations.length > 0
        ? chronologicalEvaluations.map((e) => Number(e.finalScorePercentage))
        : [avgScore];
    if (vals.length === 1) {
      const y = h - (vals[0] / 100) * (h - 10) - 5;
      return [
        { x: 4, y },
        { x: w - 4, y },
      ];
    }
    return vals.map((v, idx) => ({
      x: 4 + (idx / (vals.length - 1)) * (w - 8),
      y: h - (Math.max(0, Math.min(100, v)) / 100) * (h - 12) - 6,
    }));
  }, [chronologicalEvaluations, avgScore]);

  const filteredEvaluationsTable = useMemo(() => {
    return (summary?.recentEvaluations ?? []).filter((ev) =>
      statusFilter === "ALL" ? true : ev.status === statusFilter
    );
  }, [summary?.recentEvaluations, statusFilter]);

  const evalTotalPages = Math.max(
    1,
    Math.ceil(filteredEvaluationsTable.length / evalPageSize)
  );
  const safeEvalPage = Math.min(evalPage, evalTotalPages);
  const paginatedEvalTable = useMemo(() => {
    const start = (safeEvalPage - 1) * evalPageSize;
    return filteredEvaluationsTable.slice(start, start + evalPageSize);
  }, [filteredEvaluationsTable, safeEvalPage, evalPageSize]);

  const rankingList = summary?.analystRanking ?? [];
  const rankingTotalPages = Math.max(
    1,
    Math.ceil(rankingList.length / rankingPageSize)
  );
  const safeRankingPage = Math.min(rankingPage, rankingTotalPages);
  const paginatedRankingTable = useMemo(() => {
    const start = (safeRankingPage - 1) * rankingPageSize;
    return rankingList.slice(start, start + rankingPageSize);
  }, [rankingList, safeRankingPage, rankingPageSize]);

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* ====================================================================
            TOP BAR: FILTROS DINÂMICOS (ESTILO SHADCN DASHBOARD)
           ==================================================================== */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100">
              <Activity className="h-4 w-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100">
              {isGestor ? "Dashboard" : "Meu Desempenho"}
            </h1>
          </div>

          {isGestor && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  aria-label="Filtrar por setor"
                  className="bg-transparent text-xs text-zinc-100 focus:outline-none"
                >
                  <option value="" className="bg-[#0b0b0d]">
                    Todos os Setores
                  </option>
                  <option value="SAC" className="bg-[#0b0b0d]">
                    SAC
                  </option>
                  <option value="Cobrança & Retenção" className="bg-[#0b0b0d]">
                    Cobrança & Retenção
                  </option>
                  <option value="Aquisição" className="bg-[#0b0b0d]">
                    Aquisição
                  </option>
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-800 bg-[#0b0b0d] text-xs text-zinc-300">
                <Users className="h-3.5 w-3.5 text-zinc-500" />
                <select
                  value={analystIdFilter}
                  onChange={(e) => setAnalystIdFilter(e.target.value)}
                  aria-label="Filtrar por analista"
                  className="bg-transparent text-xs text-zinc-100 focus:outline-none"
                >
                  <option value="" className="bg-[#0b0b0d]">
                    Todos os Analistas
                  </option>
                  {sortedAnalystsDropdown.map((a) => (
                    <option
                      key={a.analystId}
                      value={a.analystId}
                      className="bg-[#0b0b0d]"
                    >
                      {a.analystName} ({a.department})
                    </option>
                  ))}
                </select>
              </div>

              {(sectorFilter || analystIdFilter || statusFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSectorFilter("");
                    setAnalystIdFilter("");
                    setStatusFilter("ALL");
                  }}
                  className="h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-300"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          )}
        </div>

        {isLoading || !summary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] animate-pulse p-5"
              />
            ))}
          </div>
        ) : (
          <>
            {/* ================================================================
                ROW 1: 4 CARTÕES COM MINI-GRÁFICOS ANIMADOS (SHADCN CARDS)
               ================================================================ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1: Média Geral + Sparkline de Área Animado */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Média Geral de Qualidade
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {evaluatedCalls} aval.
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 font-mono">
                    {avgScore.toFixed(1)}%
                  </p>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Meta: 75.0%
                  </span>
                </div>

                {/* Animated Sparkline SVG */}
                <div className="h-12 w-full pt-1">
                  <svg
                    viewBox="0 0 220 48"
                    className="w-full h-full overflow-visible"
                  >
                    <defs>
                      <linearGradient
                        id="sparkScoreGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#f4f4f5"
                          stopOpacity="0.32"
                        />
                        <stop
                          offset="100%"
                          stopColor="#f4f4f5"
                          stopOpacity="0.0"
                        />
                      </linearGradient>
                    </defs>
                    <motion.path
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6 }}
                      d={buildSmoothSvgPath(sparklineScorePoints, true, 48)}
                      fill="url(#sparkScoreGrad)"
                    />
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.85, ease: "easeOut" }}
                      d={buildSmoothSvgPath(sparklineScorePoints, false, 48)}
                      fill="none"
                      stroke="#f4f4f5"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </motion.div>

              {/* Card 2: Taxa de Aprovação + Barra Multi-Segmento Animada */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
                className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Taxa de Aprovação
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {approvedCount}/{evaluatedCalls} aprov.
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 font-mono">
                    {approvalRate.toFixed(1)}%
                  </p>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {failedCount} reprov.
                  </span>
                </div>

                {/* Animated Segmented Distribution Bar */}
                <div className="space-y-2 pt-1">
                  <div className="h-2.5 w-full rounded-full bg-zinc-900 overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800/80">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          evaluatedCalls > 0
                            ? (approvedCount / evaluatedCalls) * 100
                            : 0
                        }%`,
                      }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className="h-full bg-zinc-100 rounded-l-full"
                      title={`Aprovadas: ${approvedCount}`}
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          evaluatedCalls > 0
                            ? (failedCount / evaluatedCalls) * 100
                            : 0
                        }%`,
                      }}
                      transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
                      className="h-full bg-zinc-500"
                      title={`Reprovadas: ${failedCount}`}
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${
                          evaluatedCalls > 0
                            ? (fatalCount / evaluatedCalls) * 100
                            : 0
                        }%`,
                      }}
                      transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                      className="h-full bg-red-500/80 rounded-r-full"
                      title={`Erro Grave: ${fatalCount}`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span>Aprov: {approvedCount}</span>
                    <span>Reprov: {failedCount}</span>
                    <span>Fatal: {fatalCount}</span>
                  </div>
                </div>
              </motion.div>

              {/* Card 3: Cobertura de Auditoria + Mini Barras por Analista */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Cobertura de Ligações
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {coverageRate.toFixed(0)}% auditado
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 font-mono">
                    {totalCalls}
                  </p>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {pendingCalls} pendentes
                  </span>
                </div>

                {/* Mini Animated Bar Sparkline per Analyst */}
                <div className="h-12 flex items-end gap-1.5 pt-1">
                  {(summary.analystRanking.length > 0
                    ? summary.analystRanking
                    : [
                        {
                          analystId: "1",
                          analystName: "Geral",
                          totalCalls: totalCalls || 1,
                          evaluatedCalls,
                        },
                      ]
                  )
                    .slice(0, 6)
                    .map((a, idx) => {
                      const pct =
                        a.totalCalls > 0
                          ? Math.max(
                              15,
                              Math.round((a.evaluatedCalls / a.totalCalls) * 100)
                            )
                          : 20;
                      return (
                        <div
                          key={a.analystId}
                          className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                          title={`${a.analystName}: ${a.evaluatedCalls}/${a.totalCalls} auditadas`}
                        >
                          <div className="w-full h-8 bg-zinc-900 rounded-sm flex items-end overflow-hidden border border-zinc-800/80">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${pct}%` }}
                              transition={{
                                duration: 0.55,
                                delay: idx * 0.07,
                              }}
                              className="w-full bg-zinc-200 rounded-t-sm"
                            />
                          </div>
                          <span className="text-[9px] font-mono text-zinc-500 truncate max-w-full">
                            {a.analystName.split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </motion.div>

              {/* Card 4: Índice de Conformidade (Sem Erro Grave) + Gauge Radial Animado */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.15 }}
                className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    Incidência de Erro Grave
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {fatalCount} ocorr.
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 font-mono">
                      {fatalRate.toFixed(1)}%
                    </p>
                    <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
                      {(100 - fatalRate).toFixed(1)}% sem falha grave
                    </span>
                  </div>

                  {/* Animated Circular Ring Gauge */}
                  <div className="relative h-14 w-14 shrink-0 flex items-center justify-center">
                    <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        stroke="#27272a"
                        strokeWidth="5"
                      />
                      <motion.circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        stroke={fatalCount > 0 ? "#f87171" : "#f4f4f5"}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 22}
                        initial={{ strokeDashoffset: 2 * Math.PI * 22 }}
                        animate={{
                          strokeDashoffset:
                            2 * Math.PI * 22 * (1 - fatalRate / 100),
                        }}
                        transition={{ duration: 0.85, ease: "easeOut" }}
                      />
                    </svg>
                    <span className="absolute text-[10px] font-mono font-bold text-zinc-200">
                      {fatalCount}x
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/70">
                  <span>Zera nota se acionado</span>
                  <span>{evaluatedCalls - fatalCount} íntegras</span>
                </div>
              </motion.div>
            </div>

            {/* ================================================================
                ROW 2: SHADCN MAIN INTERACTIVE CHART (8 COLS) + RANKING (4 COLS)
               ================================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left 8 Cols: Interactive Animated Chart (Area / Sectors / Criteria) */}
              <div className="lg:col-span-8 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-zinc-100">
                      {chartView === "area"
                        ? "Curva Interativa de Notas das Avaliações"
                        : chartView === "sectors"
                        ? "Desempenho Médio Comparativo por Setor"
                        : "Taxa de Aderência por Critério do Formulário"}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {chartView === "area"
                        ? "Passe o mouse sobre os pontos para inspecionar cada ligação avaliada"
                        : chartView === "sectors"
                        ? "Clique em qualquer setor para filtrar todo o dashboard"
                        : "Percentual de conformidade consolidado a partir dos snapshots"}
                    </p>
                  </div>

                  {/* Shadcn Segmented Chart Switcher */}
                  <div className="inline-flex items-center rounded-lg bg-[#121215] p-1 border border-zinc-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setChartView("area")}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        chartView === "area"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Curva (Área)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartView("sectors")}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        chartView === "sectors"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Setores
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartView("criteria")}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        chartView === "criteria"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Critérios
                    </button>
                  </div>
                </div>

                {/* CHART BODY */}
                {chartView === "area" && (
                  <div className="relative pt-2">
                    {mainChartData.length === 0 ? (
                      <div className="h-56 flex items-center justify-center text-xs font-mono text-zinc-500">
                        Nenhuma avaliação registrada para este filtro.
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Floating Shadcn Tooltip on Hover */}
                        {hoveredPointIdx !== null &&
                          mainChartData[hoveredPointIdx] && (
                            <div className="absolute top-0 right-2 z-10 p-3 rounded-xl border border-zinc-700 bg-[#121215]/95 shadow-xl text-xs space-y-1 pointer-events-none">
                              <div className="flex items-center justify-between gap-4">
                                <span className="font-mono font-bold text-zinc-100">
                                  {mainChartData[hoveredPointIdx].label}
                                </span>
                                <span className="font-mono font-bold text-zinc-100">
                                  {mainChartData[hoveredPointIdx].score.toFixed(
                                    1
                                  )}
                                  %
                                </span>
                              </div>
                              <p className="text-zinc-300 font-medium">
                                {mainChartData[hoveredPointIdx].analystName}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400">
                                {mainChartData[hoveredPointIdx].sector} •{" "}
                                {mainChartData[hoveredPointIdx].dateLabel}
                              </p>
                            </div>
                          )}

                        <svg
                          viewBox="0 0 720 220"
                          className="w-full h-56 overflow-visible"
                        >
                          <defs>
                            <linearGradient
                              id="shadcnAreaFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#e4e4e7"
                                stopOpacity="0.28"
                              />
                              <stop
                                offset="85%"
                                stopColor="#e4e4e7"
                                stopOpacity="0.03"
                              />
                              <stop
                                offset="100%"
                                stopColor="#e4e4e7"
                                stopOpacity="0.0"
                              />
                            </linearGradient>
                          </defs>

                          {/* Horizontal Grid Lines (0%, 25%, 50%, 75%, 100%) */}
                          {[0, 25, 50, 75, 100].map((val) => {
                            const y = 20 + 166 - (val / 100) * 166;
                            return (
                              <g key={val}>
                                <line
                                  x1="28"
                                  y1={y}
                                  x2="692"
                                  y2={y}
                                  stroke={val === 75 ? "#52525b" : "#1f1f23"}
                                  strokeDasharray={val === 75 ? "4 4" : undefined}
                                  strokeWidth="1"
                                />
                                <text
                                  x="2"
                                  y={y + 3}
                                  fill="#71717a"
                                  fontSize="9"
                                  fontFamily="monospace"
                                >
                                  {val}%
                                </text>
                              </g>
                            );
                          })}

                          {/* Secondary Dashed Line: Nota Bruta (Antes de Erro Grave) */}
                          <motion.path
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.45 }}
                            transition={{ duration: 0.9, ease: "easeOut" }}
                            d={buildSmoothSvgPath(
                              mainChartData.map((p) => ({ x: p.x, y: p.yRaw })),
                              false,
                              186
                            )}
                            fill="none"
                            stroke="#a1a1aa"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />

                          {/* Primary Area Fill */}
                          <motion.path
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.65 }}
                            d={buildSmoothSvgPath(mainChartData, true, 186)}
                            fill="url(#shadcnAreaFill)"
                          />

                          {/* Primary Smooth Curve Line */}
                          <motion.path
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.95, ease: "easeOut" }}
                            d={buildSmoothSvgPath(mainChartData, false, 186)}
                            fill="none"
                            stroke="#fafafa"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />

                          {/* Interactive Data Points */}
                          {mainChartData.map((pt, idx) => {
                            const isHovered = hoveredPointIdx === idx;
                            return (
                              <g
                                key={pt.label + idx}
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredPointIdx(idx)}
                                onMouseLeave={() => setHoveredPointIdx(null)}
                              >
                                {isHovered && (
                                  <line
                                    x1={pt.x}
                                    y1={20}
                                    x2={pt.x}
                                    y2={186}
                                    stroke="#71717a"
                                    strokeDasharray="2 2"
                                    strokeWidth="1"
                                  />
                                )}
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isHovered ? 6 : 4}
                                  fill="#09090b"
                                  stroke="#fafafa"
                                  strokeWidth={isHovered ? 2.5 : 2}
                                />
                                <text
                                  x={pt.x}
                                  y={206}
                                  textAnchor="middle"
                                  fill="#a1a1aa"
                                  fontSize="9"
                                  fontFamily="monospace"
                                >
                                  {pt.label}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    )}

                    {/* Legend Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-zinc-100" />
                          Nota Final (%)
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-3 bg-zinc-400 inline-block" />
                          Pontuação Bruta (%)
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0.5 w-3 border-t border-dashed border-zinc-500 inline-block" />
                          Linha de Meta (75%)
                        </span>
                      </div>
                      <span>{mainChartData.length} ponto(s) plotados</span>
                    </div>
                  </div>
                )}

                {chartView === "sectors" && (
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(summary.sectorAverages ?? []).map((sec, idx) => {
                        const isSelected =
                          sectorFilter.toLowerCase() ===
                          sec.sector.toLowerCase();
                        const avg = Number(sec.averageScore);
                        const appr = Number(sec.approvalRatePercentage);
                        return (
                          <button
                            key={sec.sector}
                            type="button"
                            onClick={() =>
                              setSectorFilter(isSelected ? "" : sec.sector)
                            }
                            className={`text-left p-4 rounded-xl border transition-all space-y-3 ${
                              isSelected
                                ? "border-zinc-300 bg-zinc-900/80"
                                : "border-zinc-800 bg-[#121215] hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-zinc-100">
                                {sec.sector}
                              </span>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {sec.evaluationsCount} aval.
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between">
                              <span className="text-2xl font-bold font-mono text-zinc-100">
                                {avg.toFixed(1)}%
                              </span>
                              <span className="text-[11px] font-mono text-zinc-400">
                                Aprov: {appr.toFixed(0)}%
                              </span>
                            </div>

                            <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.min(100, Math.max(4, avg))}%`,
                                }}
                                transition={{
                                  duration: 0.65,
                                  delay: idx * 0.08,
                                }}
                                className="h-full bg-zinc-100 rounded-full"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chartView === "criteria" && (
                  <div className="space-y-3 pt-1">
                    {(summary.criteriaComparison ?? []).map((crit, idx) => {
                      const rate = Number(crit.complianceRatePercentage);
                      return (
                        <div
                          key={crit.category}
                          className="p-3.5 rounded-xl border border-zinc-800 bg-[#121215] space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-100">
                              {crit.category}
                            </span>
                            <span className="font-mono text-zinc-300">
                              {rate.toFixed(1)}% ({crit.compliantCount}/
                              {crit.totalEvaluated})
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${Math.min(100, Math.max(4, rate))}%`,
                              }}
                              transition={{
                                duration: 0.65,
                                delay: idx * 0.06,
                              }}
                              className="h-full bg-zinc-200 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 4 Cols: Shadcn "Recent Sales" Style Ranking & Quick Evaluate */}
              <div className="lg:col-span-4 rounded-xl border border-zinc-800/90 bg-[#0b0b0d] p-5 flex flex-col space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-zinc-100">
                      Desempenho por Analista
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Ranking atualizado em tempo real
                    </p>
                  </div>
                  {isGestor && (
                    <Link
                      href="/analysts"
                      className="text-xs font-mono text-zinc-400 hover:text-zinc-100 inline-flex items-center gap-1"
                    >
                      <span>Todos</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {summary.analystRanking.map((analyst, idx) => {
                    const score = Number(analyst.averageScore);
                    return (
                      <div
                        key={analyst.analystId}
                        className="p-3 rounded-xl border border-zinc-800/80 bg-[#121215] space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-100 shrink-0">
                              {analyst.analystName
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-zinc-100 truncate">
                                {analyst.analystName}
                              </p>
                              <p className="text-[11px] font-mono text-zinc-400 truncate">
                                {analyst.department} • {analyst.evaluatedCalls}{" "}
                                aval.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-bold text-zinc-100">
                              {score.toFixed(1)}%
                            </span>
                            {isGestor && (
                              <Link
                                href={`/analysts/${analyst.analystId}`}
                                className="h-7 px-2.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-[11px] font-semibold inline-flex items-center"
                              >
                                Avaliar
                              </Link>
                            )}
                          </div>
                        </div>

                        {/* Animated Score Bar */}
                        <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100, Math.max(4, score))}%`,
                            }}
                            transition={{
                              duration: 0.7,
                              delay: idx * 0.08,
                              ease: "easeOut",
                            }}
                            className="h-full bg-zinc-200 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isGestor && (
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                    <Link
                      href="/calls?status=PENDENTE"
                      className="w-full h-9 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 text-xs font-semibold inline-flex items-center justify-center gap-2"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      <span>Auditar Fila Pendente ({pendingCalls})</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* ================================================================
                ROW 3: TABELA INTERATIVA SHADCN (AVALIAÇÕES RECENTES & RANKING)
               ================================================================ */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-xl bg-[#0b0b0d] p-1 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setActiveTab("evaluations")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeTab === "evaluations"
                          ? "bg-zinc-100 text-zinc-950 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Avaliações Recentes ({filteredEvaluationsTable.length})
                    </button>
                    {isGestor && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("ranking")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          activeTab === "ranking"
                            ? "bg-zinc-100 text-zinc-950 font-semibold"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        Tabela de Analistas ({summary.analystRanking.length})
                      </button>
                    )}
                  </div>

                  {activeTab === "evaluations" && (
                    <div className="inline-flex items-center rounded-xl bg-[#0b0b0d] p-1 border border-zinc-800">
                      {(
                        [
                          { id: "ALL", label: "Todas" },
                          { id: "APROVADO", label: "Aprovadas" },
                          { id: "REPROVADO", label: "Reprovadas" },
                          { id: "ZERADO_ERRO_GRAVE", label: "Erro Grave" },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setStatusFilter(st.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                            statusFilter === st.id
                              ? "bg-zinc-800 text-zinc-100 font-semibold"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Link
                  href="/evaluations"
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-100"
                >
                  Abrir Central de Avaliações →
                </Link>
              </div>

              {activeTab === "evaluations" ? (
                <div className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="hidden lg:grid lg:grid-cols-[176px_minmax(0,1.45fr)_minmax(0,1.25fr)_96px_138px_56px_168px] lg:items-center lg:gap-3 px-5 py-2.5 bg-[#09090b] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    <span>Código / ID</span>
                    <span>Operador & Setor</span>
                    <span>Matriz & Data</span>
                    <span className="text-right">Pontos</span>
                    <span className="text-center">Status</span>
                    <span className="text-right">Nota</span>
                    <span className="text-right">Ações</span>
                  </div>

                  {paginatedEvalTable.map((ev) => {
                    const badge = getEvaluationStatusBadge(ev.status);
                    const sectorLabel =
                      ev.analystSectorSnapshot ||
                      ev.analyst.department ||
                      "Geral";
                    const initials = (ev.analyst.name || "OP")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("");

                    return (
                      <div
                        key={ev.id}
                        className="p-4 sm:px-5 sm:py-3 hover:bg-zinc-900/40 transition-colors flex flex-col lg:grid lg:grid-cols-[176px_minmax(0,1.45fr)_minmax(0,1.25fr)_96px_138px_56px_168px] lg:items-center gap-3"
                      >
                        {/* Coluna 1: Código / ID */}
                        <div className="min-w-0">
                          <span
                            title={`#${ev.callRecord.externalCallId}`}
                            className="inline-block max-w-full truncate px-2.5 py-1 rounded-md bg-[#141418] border border-zinc-800 font-mono text-[11px] font-semibold text-zinc-200"
                          >
                            #{ev.callRecord.externalCallId}
                          </span>
                        </div>

                        {/* Coluna 2: Operador & Setor */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-zinc-100 truncate">
                              {ev.analyst.name}
                            </p>
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-[#141418] border border-zinc-800/90 text-[10px] font-mono text-zinc-400 truncate max-w-full">
                              {sectorLabel}
                            </span>
                          </div>
                        </div>

                        {/* Coluna 3: Matriz & Data */}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate">
                            {ev.formNameSnapshot}
                          </p>
                          <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                            {formatDateTime(ev.evaluatedAt)}
                          </p>
                        </div>

                        {/* Coluna 4: Pontos */}
                        <div className="flex items-center justify-between lg:justify-end">
                          <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                            Pontos
                          </span>
                          <span className="font-mono text-xs text-zinc-400">
                            {ev.obtainedPoints}/{ev.maxPossiblePoints} pts
                          </span>
                        </div>

                        {/* Coluna 5: Status */}
                        <div className="flex items-center justify-between lg:justify-center">
                          <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                            Status
                          </span>
                          <span
                            className={`inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] whitespace-nowrap ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Coluna 6: Nota */}
                        <div className="flex items-center justify-between lg:justify-end">
                          <span className="text-[10px] font-mono uppercase text-zinc-500 lg:hidden">
                            Nota
                          </span>
                          <span className="font-mono font-bold text-sm text-zinc-100">
                            {Number(ev.finalScorePercentage).toFixed(0)}%
                          </span>
                        </div>

                        {/* Coluna 7: Ações */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/50">
                          <button
                            type="button"
                            onClick={() => setSelectedEvaluationModal(ev)}
                            className="h-8 px-2.5 rounded-md border border-zinc-800 bg-[#141418] hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition-colors inline-flex items-center gap-1.5"
                          >
                            <Headphones className="h-3.5 w-3.5" />
                            <span>Ouvir</span>
                          </button>
                          <Link
                            href={`/evaluations/${ev.id}`}
                            className="h-8 px-2.5 rounded-md bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-zinc-200 transition-colors inline-flex items-center gap-1.5"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Espelho</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}

                  <TablePagination
                    currentPage={safeEvalPage}
                    totalItems={filteredEvaluationsTable.length}
                    pageSize={evalPageSize}
                    onPageChange={setEvalPage}
                    onPageSizeChange={(size) => {
                      setEvalPageSize(size);
                      setEvalPage(1);
                    }}
                    itemLabel="avaliações"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800/90 bg-[#0b0b0d] divide-y divide-zinc-800/60 overflow-hidden">
                  <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.5fr)_140px_100px_100px_100px_90px_110px] lg:items-center lg:gap-3 px-5 py-2.5 bg-[#09090b] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    <span>Operador</span>
                    <span>Setor</span>
                    <span className="text-right">Avaliadas</span>
                    <span className="text-right">Aprovadas</span>
                    <span className="text-right">Falta Grave</span>
                    <span className="text-right">Média</span>
                    <span className="text-right">Ação</span>
                  </div>

                  {paginatedRankingTable.map((analyst) => {
                    const initials = (analyst.analystName || "OP")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("");

                    return (
                      <div
                        key={analyst.analystId}
                        className="p-4 sm:px-5 sm:py-3 hover:bg-zinc-900/40 transition-colors flex flex-col lg:grid lg:grid-cols-[minmax(0,1.5fr)_140px_100px_100px_100px_90px_110px] lg:items-center gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-[#15151a] border border-zinc-800 flex items-center justify-center text-[11px] font-mono font-semibold text-zinc-200 shrink-0">
                            {initials}
                          </div>
                          <span className="font-semibold text-zinc-100 text-xs truncate">
                            {analyst.analystName}
                          </span>
                        </div>

                        <div>
                          <span className="px-2 py-0.5 rounded bg-[#141418] border border-zinc-800 text-[10px] font-mono text-zinc-300">
                            {analyst.department}
                          </span>
                        </div>

                        <div className="text-right font-mono text-xs tabular-nums text-zinc-300">
                          {analyst.evaluatedCalls}
                        </div>

                        <div className="text-right font-mono text-xs tabular-nums text-emerald-400">
                          {analyst.approvedCount}
                        </div>

                        <div className="text-right font-mono text-xs tabular-nums text-zinc-400">
                          {analyst.fatalErrorCount}
                        </div>

                        <div className="text-right font-mono font-bold text-sm tabular-nums text-zinc-100">
                          {Number(analyst.averageScore).toFixed(1)}%
                        </div>

                        <div className="flex justify-end">
                          <Link
                            href={`/analysts/${analyst.analystId}`}
                            className="h-8 px-3 rounded-md bg-zinc-100 text-zinc-950 font-semibold text-xs hover:bg-zinc-200 transition-colors inline-flex items-center"
                          >
                            Avaliar
                          </Link>
                        </div>
                      </div>
                    );
                  })}

                  <TablePagination
                    currentPage={safeRankingPage}
                    totalItems={rankingList.length}
                    pageSize={rankingPageSize}
                    onPageChange={setRankingPage}
                    onPageSizeChange={(size) => {
                      setRankingPageSize(size);
                      setRankingPage(1);
                    }}
                    itemLabel="operadores"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Modal de Avaliação */}
        <AnimatePresence>
          {selectedEvaluationModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setSelectedEvaluationModal(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0b0b0d] border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-y-auto shadow-2xl p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-200">
                        #{selectedEvaluationModal.callRecord.externalCallId}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs ${
                          getEvaluationStatusBadge(
                            selectedEvaluationModal.status
                          ).className
                        }`}
                      >
                        {
                          getEvaluationStatusBadge(
                            selectedEvaluationModal.status
                          ).label
                        }
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-100 mt-1.5">
                      {selectedEvaluationModal.formNameSnapshot} (v
                      {selectedEvaluationModal.formVersionSnapshot})
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Analista: {selectedEvaluationModal.analyst.name} •
                      Avaliador: {selectedEvaluationModal.evaluator.name}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEvaluationModal(null)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <CallAudioPlayer
                  audioUrl={selectedEvaluationModal.callRecord.audioUrl}
                  externalCallId={
                    selectedEvaluationModal.callRecord.externalCallId
                  }
                  durationSeconds={
                    selectedEvaluationModal.callRecord.durationSeconds
                  }
                />

                {selectedEvaluationModal.generalFeedback && (
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200">
                    <strong className="block text-zinc-400 uppercase mb-1">
                      Feedback do Gestor:
                    </strong>
                    {selectedEvaluationModal.generalFeedback}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-zinc-400">
                    Snapshot das Perguntas (
                    {selectedEvaluationModal.obtainedPoints}/
                    {selectedEvaluationModal.maxPossiblePoints} pts • Nota
                    Final:{" "}
                    {Number(
                      selectedEvaluationModal.finalScorePercentage
                    ).toFixed(1)}
                    %)
                  </p>
                  <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
                    {selectedEvaluationModal.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-zinc-900/40 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-medium text-zinc-100 block">
                            {item.label}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {item.category} •{" "}
                            {item.fatalError
                              ? "Erro Grave (Zera Nota)"
                              : `Peso: ${item.points} pt(s)`}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 font-semibold shrink-0">
                          {item.fatalError ? (
                            item.checked ? (
                              <span className="text-red-400 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Acionado
                              </span>
                            ) : (
                              <span className="text-zinc-400">Não ocorreu</span>
                            )
                          ) : item.checked ? (
                            <span className="text-zinc-100 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Conforme
                            </span>
                          ) : (
                            <span className="text-zinc-500 flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5" />
                              Não conforme
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

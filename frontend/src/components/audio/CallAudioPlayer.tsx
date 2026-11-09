"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { API_BASE_URL, callsApi } from "@/lib/api";
import { formatDuration } from "@/lib/utils";

interface CallAudioPlayerProps {
  audioUrl: string;
  externalCallId: string;
  durationSeconds?: number;
  onDurationDetected?: (seconds: number) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export function CallAudioPlayer({
  audioUrl,
  externalCallId,
  durationSeconds = 30,
  onDurationDetected,
}: CallAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 30);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [usingFallbackStream, setUsingFallbackStream] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const isRealBackendAudio =
    Boolean(audioUrl) &&
    (audioUrl.includes("/audio/files/") ||
      audioUrl.includes("/audio/directus/") ||
      audioUrl.includes("crm-directus") ||
      audioUrl.includes("r2.cloudflarestorage.com") ||
      (externalCallId && externalCallId.startsWith("directus_")));

  const fallbackStreamUrl = `${API_BASE_URL}/audio/${encodeURIComponent(
    externalCallId || "call_demo"
  )}.wav?duration=${Math.min(Math.max(durationSeconds || 25, 10), 45)}`;

  const isMockExternalHost =
    audioUrl.includes("storage.empresa.com") ||
    audioUrl.includes("example.com");

  const resolvedAudioUrl = (() => {
    if (!audioUrl) return fallbackStreamUrl;
    if (audioUrl.startsWith("http://localhost:8080/api/v1")) {
      return `${API_BASE_URL}${audioUrl.substring("http://localhost:8080/api/v1".length)}`;
    }
    if (audioUrl.startsWith("/api/v1")) {
      return `${API_BASE_URL}${audioUrl.substring("/api/v1".length)}`;
    }
    return audioUrl;
  })();

  const effectiveSrc =
    !isRealBackendAudio && (usingFallbackStream || isMockExternalHost)
      ? fallbackStreamUrl
      : resolvedAudioUrl;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(durationSeconds || 30);
    setUsingFallbackStream(false);
    setAudioUnavailable(false);
  }, [audioUrl, externalCallId, durationSeconds]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || audioUnavailable) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch {
      if (isRealBackendAudio) {
        setAudioUnavailable(true);
        setIsPlaying(false);
      } else if (!usingFallbackStream) {
        setUsingFallbackStream(true);
      }
    }
  };

  const skipSeconds = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(
      0,
      Math.min(audio.duration || duration, audio.currentTime + delta)
    );
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audio) {
      audio.currentTime = newTime;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
    }
  };

  const progressPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="bg-[#0b0b0d] text-zinc-100 rounded-xl p-3.5 border border-zinc-800 space-y-3 overflow-hidden">
      <audio
        ref={audioRef}
        src={effectiveSrc}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (el.duration && isFinite(el.duration) && el.duration > 0) {
            const realSecs = Math.round(el.duration);
            setDuration(realSecs);
            setAudioUnavailable(false);
            onDurationDetected?.(realSecs);
            if (
              externalCallId &&
              Math.abs(realSecs - (durationSeconds || 0)) > 2
            ) {
              callsApi
                .syncDetectedDuration(externalCallId, realSecs)
                .catch(() => {});
            }
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          if (isRealBackendAudio) {
            setAudioUnavailable(true);
            setIsPlaying(false);
          } else if (!usingFallbackStream) {
            setUsingFallbackStream(true);
          }
        }}
      />

      {audioUnavailable && (
        <div className="px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-300 font-medium">
          Arquivo de áudio histórico ausente no armazenamento local do servidor Directus de origem.
        </div>
      )}

      {/* Linha 1: Controles Principais + Identificação + Velocidade/Volume */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => skipSeconds(-10)}
            title="Retroceder 10 segundos"
            className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
            className="h-9 w-9 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-950 transition-all shrink-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 ml-0.5 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipSeconds(10)}
            title="Avançar 10 segundos"
            className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors shrink-0"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0 ml-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100 truncate">
              <Headphones className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="truncate font-mono">#{externalCallId}</span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono whitespace-nowrap">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>
          </div>
        </div>

        {/* Velocidade, Volume e Link Externo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleSpeedChange(rate)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium transition-colors whitespace-nowrap ${
                  playbackRate === rate
                    ? "bg-zinc-100 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Ativar som" : "Silenciar"}
              className="p-1 text-zinc-400 hover:text-zinc-100"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume do áudio"
              className="w-14 accent-zinc-100 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>

          <a
            href={effectiveSrc}
            target="_blank"
            rel="noreferrer"
            title="Abrir arquivo de áudio em nova aba"
            className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Abrir</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      </div>

      {/* Linha 2: Barra de Progresso Dedicada (Sem colisão de texto) */}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Progresso da gravação"
          className="flex-1 accent-zinc-100 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
        />
        <span className="text-[11px] text-zinc-400 font-mono w-9 text-right shrink-0">
          {progressPercent.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

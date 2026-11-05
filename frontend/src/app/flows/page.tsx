"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DirectusStudioWorkspace } from "@/components/studio/DirectusStudioWorkspace";

export default function FlowsAutomationPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Fluxos & Automação...
          </div>
        }
      >
        <DirectusStudioWorkspace defaultSection="flows" />
      </Suspense>
    </AppShell>
  );
}

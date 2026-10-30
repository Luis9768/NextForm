"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DirectusStudioWorkspace } from "@/app/studio/page";

export default function DirectusFlowsPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Directus Flows...
          </div>
        }
      >
        <DirectusStudioWorkspace defaultSection="flows" />
      </Suspense>
    </AppShell>
  );
}

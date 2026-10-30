"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FormsManagementWorkspace } from "@/app/forms/page";

export default function NewFormMatrixPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="p-8 text-xs text-zinc-500">
            Carregando Criador de Matriz QA...
          </div>
        }
      >
        <FormsManagementWorkspace defaultCreateNew={true} />
      </Suspense>
    </AppShell>
  );
}

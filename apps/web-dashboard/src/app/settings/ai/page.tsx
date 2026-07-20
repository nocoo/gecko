"use client";

import { AiSettingsSection, PromptTemplateSection } from "@/components/ai-settings";
import { AppShell } from "@/components/layout";
import { Separator } from "@/components/ui/separator";

export default function AiSettingsPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "AI Settings" }]}>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold">AI Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your AI provider for intelligent features.
          </p>
        </div>

        <AiSettingsSection />

        <Separator />

        <PromptTemplateSection />
      </div>
    </AppShell>
  );
}

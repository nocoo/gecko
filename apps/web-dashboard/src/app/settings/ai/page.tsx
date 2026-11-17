"use client";

import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Separator } from "@nocoo/basalt/components/separator";
import { AiSettingsSection, PromptTemplateSection } from "@/components/ai-settings";

export default function AiSettingsPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        title="AI Settings"
        description="Configure your AI provider for intelligent features."
      />

      <AiSettingsSection />

      <Separator />

      <PromptTemplateSection />
    </div>
  );
}

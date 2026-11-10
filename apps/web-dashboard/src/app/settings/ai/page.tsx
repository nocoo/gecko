"use client";

import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AiSettingsSection, PromptTemplateSection } from "@/components/ai-settings";
import { Separator } from "@/components/ui/separator";

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

"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nocoo/basalt/components/dropdown-menu";
import { InputArea } from "@nocoo/basalt/components/input-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import {
  type AuthType,
  BUILTIN_PROVIDERS,
  type BuiltinProvider,
  CUSTOM_PROVIDER_INFO,
  type SdkType,
} from "@nocoo/next-ai";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Plug,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PROMPT_SECTION_1,
  DEFAULT_PROMPT_SECTION_2,
  DEFAULT_PROMPT_SECTION_3,
  DEFAULT_PROMPT_SECTION_4,
  PROMPT_TEMPLATE_VARIABLES,
} from "@/services/prompt-defaults";

/** All valid provider IDs (including "custom"). */
const ALL_PROVIDER_IDS = [...Object.keys(BUILTIN_PROVIDERS), "custom"] as const;
type AiProvider = (typeof ALL_PROVIDER_IDS)[number];

interface AiSettings {
  provider: AiProvider | "";
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  baseURL: string;
  sdkType: SdkType | "";
  authType: AuthType | "";
}

type TestStatus = "idle" | "testing" | "success" | "error";

/** Special value used in the model dropdown to indicate custom input. */
const CUSTOM_MODEL_VALUE = "__custom__";

export function AiSettingsSection() {
  const [settings, setSettings] = useState<AiSettings>({
    provider: "",
    apiKey: "",
    hasApiKey: false,
    model: "",
    baseURL: "",
    sdkType: "",
    authType: "",
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const modelFocusPending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void isCustomModel;
    if (modelFocusPending.current) {
      modelFocusPending.current = false;
      document.getElementById("ai-model")?.focus();
    }
  }, [isCustomModel]);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data: AiSettings) => {
        setSettings(data);
        setApiKeyInput(data.apiKey); // masked key

        // Determine if the saved model is a custom one (not in presets)
        if (data.provider && data.provider !== "custom" && data.model) {
          const info = BUILTIN_PROVIDERS[data.provider as BuiltinProvider];
          if (info && !info.models.includes(data.model)) {
            setIsCustomModel(true);
            setCustomModelInput(data.model);
          }
        } else if (data.provider === "custom" && data.model) {
          setCustomModelInput(data.model);
        }

        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Get provider info for current selection
  const isCustomProvider = settings.provider === "custom";
  const providerInfo =
    settings.provider && !isCustomProvider
      ? BUILTIN_PROVIDERS[settings.provider as BuiltinProvider]
      : null;
  const presetModels = providerInfo?.models ?? [];

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        provider: settings.provider,
        model: settings.model,
      };
      // Only send apiKey if user actually changed it
      if (apiKeyChanged) {
        body.apiKey = apiKeyInput;
      }
      // Custom-provider fields: when the user is on custom, send the
      // current values; otherwise send empty strings so any stale value
      // left over from a previous custom config gets cleared in DB.
      // (Built-in providers don't read these, but stale rows can leak
      // into other call sites later.)
      if (isCustomProvider) {
        body.baseURL = settings.baseURL;
        body.sdkType = settings.sdkType;
        body.authType = settings.authType;
      } else {
        body.baseURL = "";
        body.sdkType = "";
        body.authType = "";
      }
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setApiKeyInput(data.apiKey);
        setApiKeyChanged(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [settings, apiKeyInput, apiKeyChanged, isCustomProvider]);

  const handleTest = useCallback(async () => {
    // Always save first so the test route reads the latest provider,
    // model, baseURL, sdkType, and authType — not just whichever apiKey
    // the user typed. PUT is idempotent so this is cheap.
    await handleSave();
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/settings/ai/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
    setTimeout(() => setTestStatus("idle"), 4000);
  }, [handleSave]);

  /** Handle provider change — reset model to first preset or empty. */
  const handleProviderChange = useCallback((value: string) => {
    const provider = value as AiProvider | "";
    setTestStatus("idle");
    setIsCustomModel(false);
    setCustomModelInput("");

    if (!provider) {
      setSettings((s) => ({
        ...s,
        provider: "",
        model: "",
        baseURL: "",
        sdkType: "",
        authType: "",
      }));
      return;
    }

    if (provider === "custom") {
      setSettings((s) => ({
        ...s,
        provider: "custom",
        model: "",
        sdkType: s.sdkType || "openai",
        authType: s.authType || "apiKey",
      }));
      return;
    }

    const info = BUILTIN_PROVIDERS[provider as BuiltinProvider];
    setSettings((s) => ({
      ...s,
      provider,
      model: info?.defaultModel ?? "",
      authType: "",
    }));
  }, []);

  /** Handle model dropdown change. */
  const handleModelSelect = useCallback(
    (value: string) => {
      if (value === CUSTOM_MODEL_VALUE) {
        modelFocusPending.current = true;
        setIsCustomModel(true);
        setSettings((s) => ({ ...s, model: customModelInput }));
      } else {
        setIsCustomModel(false);
        setCustomModelInput("");
        setSettings((s) => ({ ...s, model: value }));
      }
    },
    [customModelInput],
  );

  if (!loaded) {
    return (
      <div className="rounded-2xl bg-basalt-secondary p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-basalt-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-basalt-secondary p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-basalt-background">
          <Bot className="h-5 w-5 text-basalt-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-sm font-medium text-basalt-foreground">AI Configuration</h2>
          <p className="text-xs text-basalt-muted-foreground">
            Configure LLM provider for AI-powered features.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Provider */}
        <div>
          <Label htmlFor="ai-provider" className="text-sm">
            Provider
          </Label>
          <Select
            value={settings.provider || "none"}
            onValueChange={(value) => handleProviderChange(value === "none" ? "" : value)}
          >
            <SelectTrigger id="ai-provider" className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a provider...</SelectItem>
              {ALL_PROVIDER_IDS.map((id) => {
                const label =
                  id === "custom"
                    ? CUSTOM_PROVIDER_INFO.label
                    : BUILTIN_PROVIDERS[id as BuiltinProvider].label;
                return (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Model — dropdown with presets + custom option (built-in providers) */}
        {!isCustomProvider && (
          <div>
            <Label htmlFor="ai-model" className="text-sm">
              Model
            </Label>
            {presetModels.length > 0 && !isCustomModel ? (
              <Select
                value={presetModels.includes(settings.model) ? settings.model : CUSTOM_MODEL_VALUE}
                onValueChange={handleModelSelect}
              >
                <SelectTrigger id="ai-model" className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presetModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_MODEL_VALUE}>Custom model...</SelectItem>
                </SelectContent>
              </Select>
            ) : presetModels.length > 0 && isCustomModel ? (
              <div className="mt-1 flex gap-1">
                <Input
                  id="ai-model"
                  value={customModelInput}
                  onChange={(e) => {
                    setCustomModelInput(e.target.value);
                    setSettings((s) => ({ ...s, model: e.target.value }));
                  }}
                  placeholder="Enter model name"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2"
                  aria-label="Use preset model"
                  onClick={() => {
                    modelFocusPending.current = true;
                    setIsCustomModel(false);
                    setCustomModelInput("");
                    setSettings((s) => ({
                      ...s,
                      model: presetModels[0] ?? "",
                    }));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Input
                id="ai-model"
                value={settings.model}
                onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                placeholder={providerInfo?.defaultModel ?? "Select provider first"}
                className="mt-1"
              />
            )}
          </div>
        )}

        {/* Model — free text for custom provider */}
        {isCustomProvider && (
          <div>
            <Label htmlFor="ai-model" className="text-sm">
              Model
            </Label>
            <Input
              id="ai-model"
              value={settings.model}
              onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
              placeholder="Enter model name"
              className="mt-1"
            />
          </div>
        )}

        {/* Custom provider: Base URL */}
        {isCustomProvider && (
          <div>
            <Label htmlFor="ai-base-url" className="text-sm">
              Base URL
            </Label>
            <Input
              id="ai-base-url"
              value={settings.baseURL}
              onChange={(e) => setSettings((s) => ({ ...s, baseURL: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="mt-1"
            />
          </div>
        )}

        {/* Custom provider: SDK Type */}
        {isCustomProvider && (
          <div>
            <Label htmlFor="ai-sdk" className="text-sm">
              SDK Protocol
            </Label>
            <Select
              value={settings.sdkType}
              onValueChange={(value) =>
                setSettings((s) => ({
                  ...s,
                  sdkType: value as SdkType | "",
                }))
              }
            >
              <SelectTrigger id="ai-sdk" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom provider: Auth Type — for LLM gateways like manifest.build
            that require Authorization: Bearer instead of x-api-key. */}
        {isCustomProvider && (
          <div>
            <Label htmlFor="ai-auth" className="text-sm">
              Auth Header
            </Label>
            <Select
              value={settings.authType || "apiKey"}
              onValueChange={(value) =>
                setSettings((s) => ({
                  ...s,
                  authType: value as AuthType | "",
                }))
              }
            >
              <SelectTrigger id="ai-auth" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apiKey">Default (x-api-key / Bearer)</SelectItem>
                <SelectItem value="bearer">Force Bearer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* API Key */}
        <div className="sm:col-span-2">
          <Label htmlFor="ai-key" className="text-sm">
            API Key
          </Label>
          <Input
            id="ai-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value);
              setApiKeyChanged(true);
            }}
            placeholder="Enter your API key"
            className="mt-1"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !settings.provider}
          className="gap-2"
          size="sm"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          {saved ? "Saved" : "Save"}
        </Button>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={
            testStatus === "testing" ||
            !settings.provider ||
            (!settings.hasApiKey && !apiKeyChanged)
          }
          className="gap-2"
          size="sm"
        >
          {testStatus === "testing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          Test Connection
        </Button>

        {testStatus === "success" && (
          <Badge variant="outline" className="text-xs text-basalt-success border-basalt-success">
            <Check className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        )}
        {testStatus === "error" && (
          <Badge variant="destructive" className="text-xs">
            <X className="mr-1 h-3 w-3" />
            {testError}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt Template Section
// ---------------------------------------------------------------------------

const SECTION_META = [
  {
    key: "section1" as const,
    label: "Role & Context",
    description: "Define the AI's role and overall task.",
    default: DEFAULT_PROMPT_SECTION_1,
    hasVariables: false,
  },
  {
    key: "section2" as const,
    label: "Data Injection",
    description: "Data fed to the AI. Use {{variable}} to insert dynamic values.",
    default: DEFAULT_PROMPT_SECTION_2,
    hasVariables: true,
  },
  {
    key: "section3" as const,
    label: "Analysis Rules",
    description: "Instructions for how the AI should analyze the data.",
    default: DEFAULT_PROMPT_SECTION_3,
    hasVariables: false,
  },
  {
    key: "section4" as const,
    label: "Output Format",
    description: "Specify the structure of the AI's response.",
    default: DEFAULT_PROMPT_SECTION_4,
    hasVariables: false,
    warning: "Modifying the output format may cause analysis results to display incorrectly.",
  },
] as const;

type SectionKey = "section1" | "section2" | "section3" | "section4";

interface PromptSections {
  section1: string;
  section2: string;
  section3: string;
  section4: string;
}

/** Insert text at the cursor position of a textarea. */
function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const newValue = before + text + after;
  // We need to set value via native setter to trigger React's onChange
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  nativeSet?.call(textarea, newValue);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  // Restore cursor position after the inserted text
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  });
}

export function PromptTemplateSection() {
  const [sections, setSections] = useState<PromptSections>({
    section1: "",
    section2: "",
    section3: "",
    section4: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  const insertingVariable = useRef(false);

  const textareaRefs = useRef<Record<SectionKey, HTMLTextAreaElement | null>>({
    section1: null,
    section2: null,
    section3: null,
    section4: null,
  });

  // Load prompt sections on mount — empty from API means "use default"
  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then(
        (data: {
          promptSection1: string;
          promptSection2: string;
          promptSection3: string;
          promptSection4: string;
        }) => {
          setSections({
            section1: data.promptSection1 || DEFAULT_PROMPT_SECTION_1,
            section2: data.promptSection2 || DEFAULT_PROMPT_SECTION_2,
            section3: data.promptSection3 || DEFAULT_PROMPT_SECTION_3,
            section4: data.promptSection4 || DEFAULT_PROMPT_SECTION_4,
          });
          setLoaded(true);
        },
      )
      .catch(() => setLoaded(true));
  }, []);

  const handleChange = useCallback((key: SectionKey, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Send empty string when content matches default (tells API to delete override)
      const toPayload = (value: string, def: string) => (value === def ? "" : value);
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptSection1: toPayload(sections.section1, DEFAULT_PROMPT_SECTION_1),
          promptSection2: toPayload(sections.section2, DEFAULT_PROMPT_SECTION_2),
          promptSection3: toPayload(sections.section3, DEFAULT_PROMPT_SECTION_3),
          promptSection4: toPayload(sections.section4, DEFAULT_PROMPT_SECTION_4),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSections({
          section1: data.promptSection1 || DEFAULT_PROMPT_SECTION_1,
          section2: data.promptSection2 || DEFAULT_PROMPT_SECTION_2,
          section3: data.promptSection3 || DEFAULT_PROMPT_SECTION_3,
          section4: data.promptSection4 || DEFAULT_PROMPT_SECTION_4,
        });
        setSaved(true);
        setDirty(false);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [sections]);

  const handleResetSection = useCallback((key: SectionKey) => {
    const meta = SECTION_META.find((m) => m.key === key);
    if (!meta) return;
    setSections((prev) => ({ ...prev, [key]: meta.default }));
    setDirty(true);
  }, []);

  const handleInsertVariable = useCallback((variableKey: string) => {
    insertingVariable.current = true;
    const textarea = textareaRefs.current.section2;
    if (textarea) {
      insertAtCursor(textarea, `{{${variableKey}}}`);
    }
    setOpenDropdown(false);
  }, []);

  if (!loaded) {
    return (
      <div className="rounded-2xl bg-basalt-secondary p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-basalt-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-basalt-secondary p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-basalt-background">
          <FileText className="h-5 w-5 text-basalt-muted-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-sm font-medium text-basalt-foreground">Prompt Template</h2>
          <p className="text-xs text-basalt-muted-foreground">Customize the AI analysis prompt.</p>
        </div>
      </div>

      {/* Section editors */}
      <div className="space-y-4">
        {SECTION_META.map((meta) => (
          <div key={meta.key}>
            {/* Section header */}
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label htmlFor={`prompt-${meta.key}`} className="text-sm">
                  {meta.label}
                </Label>
                <p className="text-xs text-basalt-muted-foreground">{meta.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Per-section reset — only show when content differs from default */}
                {sections[meta.key] !== meta.default && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleResetSection(meta.key)}
                    className="gap-1 text-xs text-basalt-muted-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </Button>
                )}
                {/* Variable insertion dropdown — only for section2 */}
                {meta.hasVariables && (
                  <DropdownMenu open={openDropdown} onOpenChange={setOpenDropdown}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="xs" className="whitespace-nowrap">
                        <Plus className="h-3 w-3" />
                        Insert Variable
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
                      onCloseAutoFocus={(event) => {
                        if (insertingVariable.current) {
                          event.preventDefault();
                          insertingVariable.current = false;
                        }
                      }}
                    >
                      {PROMPT_TEMPLATE_VARIABLES.map((v) => (
                        <DropdownMenuItem
                          key={v.key}
                          onSelect={() => handleInsertVariable(v.key)}
                          className="flex-col items-start"
                        >
                          <code className="font-mono text-xs">{`{{${v.key}}}`}</code>
                          <span>{v.description}</span>
                          <span className="whitespace-pre-wrap text-xs text-basalt-muted-foreground">
                            e.g. {v.example}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Warning for section4 */}
            {"warning" in meta && meta.warning && (
              <div className="mb-1.5 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{meta.warning}</span>
              </div>
            )}

            {/* Textarea — shows actual text (default or custom) */}
            <InputArea
              id={`prompt-${meta.key}`}
              ref={(el) => {
                textareaRefs.current[meta.key] = el;
              }}
              value={sections[meta.key]}
              onChange={(e) => handleChange(meta.key, e.target.value)}
              rows={meta.key === "section2" ? 12 : meta.key === "section4" ? 8 : 4}
              className="resize-y font-mono text-xs leading-relaxed"
            />
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2" size="sm">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          {saved ? "Saved" : "Save Prompt"}
        </Button>
      </div>
    </div>
  );
}

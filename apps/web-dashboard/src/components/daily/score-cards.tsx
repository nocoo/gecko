/**
 * Score cards component for the daily review page.
 *
 * Displays 4 dimension score cards (focus, deepWork, switchRate, concentration)
 * plus a weighted overall score.
 * Color coding: <40 red, 40-70 amber, >70 green.
 *
 * Design: basalt L2 card (rounded-card bg-secondary), inner elements
 * step back to L1 (rounded-widget border border-border bg-card).
 */

"use client";

import type { DailyScores } from "@/services/daily-stats";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreCardsProps {
  scores: DailyScores;
  className?: string;
}

interface ScoreDimension {
  key: keyof DailyScores;
  label: string;
  description: string;
  weight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  {
    key: "focus",
    label: "Focus",
    description: "Active time / total span",
    weight: 0.3,
  },
  {
    key: "deepWork",
    label: "Deep Work",
    description: "Extended sessions (30min+)",
    weight: 0.3,
  },
  {
    key: "switchRate",
    label: "Switch Rate",
    description: "App switching frequency",
    weight: 0.2,
  },
  {
    key: "concentration",
    label: "Concentration",
    description: "Top 3 apps % of total",
    weight: 0.2,
  },
];

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Get score color based on value: <40 red, 40-70 amber, >70 green. */
export function getScoreColor(score: number): {
  text: string;
  bg: string;
  ring: string;
  stroke: string;
} {
  if (score > 70) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      ring: "ring-emerald-200 dark:ring-emerald-800",
      stroke: "#10b981",
    };
  }
  if (score >= 40) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      ring: "ring-amber-200 dark:ring-amber-800",
      stroke: "#f59e0b",
    };
  }
  return {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    ring: "ring-red-200 dark:ring-red-800",
    stroke: "#ef4444",
  };
}

/** Get score label based on value. */
export function getScoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 40) return "Needs Work";
  return "Poor";
}

// ---------------------------------------------------------------------------
// SVG Ring (lightweight score visualization)
// ---------------------------------------------------------------------------

function ScoreRing({
  score,
  size = 72,
  strokeWidth = 5,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const dashOffset = circumference - (progress / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500"
        />
      </svg>
      <span
        className={`absolute text-base font-semibold font-display tracking-tight ${color.text}`}
      >
        {score}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function DimensionCard({
  dimension,
  score,
}: {
  dimension: ScoreDimension;
  score: number;
}) {
  const color = getScoreColor(score);

  return (
    <div className="rounded-widget border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">
          {dimension.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {Math.round(dimension.weight * 100)}%
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-semibold font-display tracking-tight ${color.text}`}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {dimension.description}
      </p>
    </div>
  );
}

export function ScoreCards({ scores, className = "" }: ScoreCardsProps) {
  const overallColor = getScoreColor(scores.overall);

  return (
    <div className={`rounded-card bg-secondary p-4 md:p-5 ${className}`}>
      <h3 className="text-sm font-normal text-muted-foreground mb-3">
        Productivity Score
      </h3>

      {/* Overall score */}
      <div className="flex items-center gap-4 mb-4">
        <ScoreRing score={scores.overall} size={72} strokeWidth={6} />
        <div>
          <p className={`text-xl md:text-2xl font-semibold font-display tracking-tight ${overallColor.text}`}>
            {getScoreLabel(scores.overall)}
          </p>
          <p className="text-xs text-muted-foreground">
            Overall weighted score
          </p>
        </div>
      </div>

      {/* Dimension cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {SCORE_DIMENSIONS.map((dim) => (
          <DimensionCard
            key={dim.key}
            dimension={dim}
            score={scores[dim.key]}
          />
        ))}
      </div>
    </div>
  );
}

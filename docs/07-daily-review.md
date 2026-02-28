# 07 — Daily Review Page

> **Status**: Complete
> **Route**: `/daily/:date` (e.g. `/daily/2026-02-27`)

Left-right split layout: rule-based visualization (left) + AI analysis in Markdown (right).
Date picker at top (arrow nav + calendar popup). Today is excluded (incomplete data).

---

## Module Map

| # | Module | Type | Key Files | Status |
|---|--------|------|-----------|--------|
| M1 | DB Migration | infra | `drizzle/0005_daily_summaries.sql` | [x] |
| M2 | Daily Stats Service | service | `src/services/daily-stats.ts` | [x] |
| M3 | Daily Summary Repo | repo | `src/lib/daily-summary-repo.ts` | [x] |
| M4 | API GET /api/daily/:date | route | `src/app/api/daily/[date]/route.ts` | [x] |
| M5 | API POST /api/daily/:date/analyze | route | `src/app/api/daily/[date]/analyze/route.ts` | [x] |
| M6 | Gantt Chart Component | component | `src/components/daily/gantt-chart.tsx` | [x] |
| M7 | Score Cards Component | component | `src/components/daily/score-cards.tsx` | [x] |
| M8 | Daily Review Page | page | `src/app/daily/[date]/page.tsx` | [x] |

---

## M1: DB Migration — `daily_summaries`

```sql
CREATE TABLE IF NOT EXISTS daily_summaries (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  date            TEXT NOT NULL,           -- 'YYYY-MM-DD'
  stats_json      TEXT NOT NULL,           -- rule-based stats snapshot (JSON)
  ai_score        INTEGER,                -- AI overall score 1-100
  ai_result_json  TEXT,                   -- AI structured output (JSON)
  ai_model        TEXT,                   -- model used
  ai_generated_at TEXT,                   -- ISO timestamp
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_daily_summaries_user_date ON daily_summaries(user_id, date);
```

**Tests**: SQL syntax validation in UT.

---

## M2: Daily Stats Service — Scoring Engine

**Input**: All `focus_sessions` for a given user + date range (via D1 query).

**Output**: `DailyStats` object with scores, top apps, and raw sessions for the Gantt chart.

### Scoring Rules (4 dimensions, 0-100 each)

| Dimension | Formula | Weight |
|-----------|---------|--------|
| **Focus** | `min(100, totalDuration / activeSpan × 100)` | 0.30 |
| **Deep Work** | Merge adjacent same-app sessions (gap <5min), count segments >30min, map to score | 0.30 |
| **Switch Rate** | `switches/hour` → inverse scale (fewer = better) | 0.20 |
| **Concentration** | `top3AppsDuration / totalDuration × 100` | 0.20 |

**Overall** = weighted sum, rounded.

### Deep Work mapping

| Segments ≥30min | Score |
|-----------------|-------|
| 0 | 0 |
| 1 | 40 |
| 2 | 60 |
| 3 | 75 |
| 4 | 85 |
| 5+ | 100 |

### Switch Rate mapping

| Switches/hour | Score |
|--------------|-------|
| ≤4 | 100 |
| 5–8 | 80 |
| 9–15 | 60 |
| 16–25 | 40 |
| >25 | 20 |

**Tests**: 28+ UT cases covering empty/single/multi-app/boundary scenarios.

---

## M3: Daily Summary Repo — CRUD

```ts
findByUserAndDate(userId, date): Promise<Row | null>
upsertStats(userId, date, statsJson): Promise<void>
upsertAiResult(userId, date, aiScore, aiResultJson, aiModel): Promise<void>
```

Uses `INSERT OR REPLACE` with composite unique index `(user_id, date)`.

**Tests**: UT with mock D1 verifying correct SQL generation.

---

## M4: API GET /api/daily/:date

1. Validate date format (`YYYY-MM-DD`) + reject today or future.
2. Check `daily_summaries` cache → hit: return directly.
3. Miss: call `DailyStatsService.compute()` → write cache → return.
4. Response: `{ stats: DailyStats, ai: AiResult | null }`.

**Tests**: UT (date validation, cache hit/miss) + E2E (HTTP round-trip).

---

## M5: API POST /api/daily/:date/analyze

1. Load sessions for the date (with `window_title`, `url`).
2. Load AI config from settings.
3. Build prompt (Chinese output, structured JSON response).
4. Call `generateText()` (non-streaming).
5. Parse JSON response → write to `daily_summaries`.
6. Return `{ success, ai: AiResult }`.

### AI Output Structure

```ts
interface AiResult {
  score: number;            // 1-100
  highlights: string[];     // positive observations
  improvements: string[];   // suggestions
  summary: string;          // 2-3 sentence Markdown overview
}
```

### Prompt Template

System: productivity analyst. Input: session data as JSON.
Output: Chinese, valid JSON with `score`, `highlights[]`, `improvements[]`, `summary` (Markdown).

**Tests**: UT (prompt build, JSON parse, error handling) + E2E (real LLM, `skipIf` no creds).

---

## M6: Gantt Chart Component

Recharts horizontal `BarChart` simulating Gantt:
- Y-axis: one row per unique App (sorted by total duration desc)
- X-axis: auto-range from first session start to last session end
- Each session = one colored bar segment (color via `getHashColor`)
- Idle gaps = white space (no fill)
- Tooltip: app name, window title, time range, duration

**Tests**: UT (render, empty state, single/multi-app).

---

## M7: Score Cards Component

4 dimension cards + overall score ring:
- Each card: icon + name + score + progress bar
- Overall: large font + color coding (<40 red, 40-70 amber, >70 green)

**Tests**: UT (render, boundary scores, color mapping).

---

## M8: Daily Review Page — Full Assembly

```
<AppShell>
  <DatePicker />                         // top: ← date → + calendar popup
  <div className="flex gap-6">
    <div className="flex-[3]">           // left ~60%
      <ScoreCards scores={...} />
      <GanttChart sessions={...} />
    </div>
    <div className="flex-[2]">           // right ~40%
      <AiAnalysisPanel result={...} />   // Markdown rendered
    </div>
  </div>
</AppShell>
```

**Behavior**:
- Page load → `GET /api/daily/:date` → render left side.
- If `ai === null` → auto-trigger `POST /api/daily/:date/analyze`.
- If `ai !== null` → render directly, show "Reanalyze" button.
- Date change → navigate to `/daily/:newDate`.

**Sidebar**: Add `CalendarDays` icon + "Daily Review" to Overview group.

**Calendar library**: `react-day-picker` for date popup.

**Tests**: UT (render, loading, error) + E2E (page load, date nav, AI trigger).

---

## Commit Sequence

| Step | Module | Commit | Tests |
|------|--------|--------|-------|
| 1 | M1 | `feat(db): add daily_summaries migration` | UT |
| 2 | M2 | `feat: add daily stats calculation service` | UT |
| 3 | M3 | `feat: add daily summary repository` | UT |
| 4 | M4 | `feat(api): add GET /api/daily/:date endpoint` | UT + E2E |
| 5 | M5 | `feat(api): add POST /api/daily/:date/analyze` | UT + E2E |
| 6 | M7 | `feat(ui): add score cards component` | UT |
| 7 | M6 | `feat(ui): add gantt chart component` | UT |
| 8 | M8 | `feat: assemble daily review page with sidebar nav` | UT + E2E |
| 9 | — | `chore: lint clean + final E2E pass` | Full suite |

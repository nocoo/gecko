#!/usr/bin/env python3
"""Repeatable 6DQ L1 pre-commit gate probes (web lane + hook hardening).

Creates an isolated git clone with linked node_modules, exercises negative and
healthy scenarios against the index snapshot, prints a JSON summary, and removes
all temporary state on exit.
"""

from __future__ import annotations

import concurrent.futures
import importlib.util
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack, contextmanager
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE_PATH = ROOT / "scripts" / "pre-commit.py"


def load_gate():
    spec = importlib.util.spec_from_file_location("gate", GATE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


gate = load_gate()

PROBE_TMP = ROOT / "build" / "l1-gate-probes"
PROBE_FIXTURES = PROBE_TMP / "fixtures"


@dataclass
class ProbeResult:
    name: str
    expect: str
    outcome: str
    detail: str = ""
    seconds: float | None = None


@dataclass
class Summary:
    platform: str
    probes: list[ProbeResult] = field(default_factory=list)
    web_timing_seconds: dict[str, float] = field(default_factory=dict)
    web_coverage: dict[str, float] = field(default_factory=dict)
    native_lane: str = "unverified"
    missing_tool_check: dict[str, object] = field(default_factory=dict)

    def add(self, result: ProbeResult):
        self.probes.append(result)

    def failed(self) -> list[ProbeResult]:
        return [p for p in self.probes if p.outcome != p.expect]


def run_git(args: list[str], cwd: Path, *, check: bool = False, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, text=True, check=check, **kwargs)


def ensure_fixture() -> Path:
    PROBE_TMP.mkdir(parents=True, exist_ok=True)
    PROBE_FIXTURES.mkdir(parents=True, exist_ok=True)
    head = run_git(
        ["rev-parse", "--verify", "HEAD^{commit}"], ROOT, check=True, capture_output=True
    ).stdout.strip()
    fixture = PROBE_FIXTURES / f"{head}.git"

    def verify() -> Path:
        if fixture.is_symlink():
            raise RuntimeError(f"Invalid pinned fixture: {fixture}")
        actual = run_git(
            ["rev-parse", "--verify", "HEAD^{commit}"], fixture,
            check=True, capture_output=True,
        ).stdout.strip()
        if actual != head:
            raise RuntimeError(f"Pinned fixture mismatch: expected {head}, got {actual}")
        return fixture

    if fixture.exists():
        return verify()

    with tempfile.TemporaryDirectory(prefix=f".fixture-{head[:12]}-", dir=PROBE_FIXTURES) as temporary:
        candidate = Path(temporary) / "fixture.git"
        run_git(["clone", "--bare", "--no-hardlinks", str(ROOT), str(candidate)], ROOT, check=True)
        candidate_head = run_git(
            ["rev-parse", "--verify", "HEAD^{commit}"], candidate,
            check=True, capture_output=True,
        ).stdout.strip()
        if candidate_head != head:
            raise RuntimeError(
                f"Fixture source changed while cloning: expected {head}, got {candidate_head}"
            )
        try:
            candidate.rename(fixture)
        except FileExistsError:
            pass
        except OSError:
            if not fixture.exists() and not fixture.is_symlink():
                raise
    return verify()


@contextmanager
def probe_repo(fixture: Path):
    repo = Path(tempfile.mkdtemp(prefix="gecko-l1-probe-", dir=PROBE_TMP))
    try:
        run_git(["clone", "--no-hardlinks", str(fixture), str(repo)], PROBE_TMP, check=True)
        for relative in gate.DEPENDENCIES:
            target = repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() or target.is_symlink():
                target.unlink() if target.is_symlink() else shutil.rmtree(target)
            os.symlink((ROOT / relative).resolve(), target, target_is_directory=True)
        yield repo
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def reset_index(repo: Path):
    run_git(["reset", "--hard", "HEAD"], repo, check=True)
    run_git(["clean", "-fdx", "-e", "node_modules", "-e", "apps/web-dashboard/node_modules"], repo, check=True)


def stage(repo: Path, relative: str, content: str):
    path = repo / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    run_git(["add", "--", relative], repo, check=True)


@contextmanager
def quiet_l1_env():
    prior = os.environ.get("GECKO_L1_QUIET")
    changed = prior != "1"
    if changed:
        os.environ["GECKO_L1_QUIET"] = "1"
    try:
        yield
    finally:
        if changed:
            if prior is None:
                os.environ.pop("GECKO_L1_QUIET", None)
            else:
                os.environ["GECKO_L1_QUIET"] = prior


def expect_reject(repo: Path) -> str:
    with quiet_l1_env():
        with tempfile.TemporaryDirectory(prefix=gate.PREFIX) as temporary:
            output = Path(temporary)
            try:
                snapshot = gate.materialize_snapshot(repo, temporary)
                gate.web_checks(repo, snapshot, output)
            except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError, KeyError):
                return "reject"
        return "accept"


def expect_accept(repo: Path) -> str:
    return "accept" if expect_reject(repo) == "accept" else "reject"


def run_web_timing(repo: Path) -> dict[str, float]:
    timings: dict[str, float] = {}
    for label in ("cold", "warm"):
        reset_index(repo)
        start = time.monotonic()
        assert expect_accept(repo) == "accept"
        timings[label] = round(time.monotonic() - start, 2)
    return timings


def read_coverage_from_vitest() -> dict[str, float]:
    web = ROOT / "apps" / "web-dashboard"
    proc = subprocess.run(
        ["bun", "run", "test:coverage", "--allowOnly=false", "--silent", "--reporter=dot"],
        cwd=web,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError("Could not collect web coverage for summary")
    metrics: dict[str, float] = {}
    for line in proc.stdout.splitlines():
        table_match = re.match(
            r"^\s*All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|",
            line,
        )
        if table_match:
            metrics["statements"] = float(table_match.group(1))
            metrics["branches"] = float(table_match.group(2))
            metrics["functions"] = float(table_match.group(3))
            metrics["lines"] = float(table_match.group(4))
            break
        match = re.match(r"\s*(Statements|Branches|Functions|Lines)\s*:\s*([\d.]+)%", line)
        if match:
            metrics[match.group(1).lower()] = float(match.group(2))
    return metrics


def missing_tool_probe(fixture: Path) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="gecko-l1-path-") as directory:
        tool_path = Path(directory)
        web_tools: dict[str, Path] = {}
        for name in gate.WEB_TOOLS:
            executable = shutil.which(name)
            if executable is None:
                raise AssertionError(f"Missing probe prerequisite: {name}")
            web_tools[name] = Path(executable).resolve()
            (tool_path / name).symlink_to(web_tools[name])
        for name, executable in web_tools.items():
            assert Path(shutil.which(name, path=str(tool_path))).resolve() == executable
        assert all(shutil.which(name, path=str(tool_path)) is None for name in gate.NATIVE_TOOLS)

        with probe_repo(fixture) as repo:
            reset_index(repo)
            stage(repo, "apps/mac-client/Gecko/Sources/Views/L1Probe.swift", "// l1 gate probe\n")
            environment = dict(os.environ)
            environment["PATH"] = str(tool_path)
            environment["GECKO_L1_QUIET"] = "1"
            proc = subprocess.run(
                [sys.executable, "-B", str(GATE_PATH)],
                cwd=repo,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            expected = "pre-commit failed: Missing required tool: swiftlint"
            stderr = proc.stderr.strip()
            specific_failure = proc.returncode == 1 and stderr == expected and not proc.stdout.strip()
            return {
                "exit_code": proc.returncode,
                "stderr": stderr,
                "expected_stderr": expected,
                "outcome": "reject" if specific_failure else "accept",
            }


def gate_unit_tests() -> ProbeResult:
    proc = subprocess.run(
        [sys.executable, "-B", str(ROOT / "scripts" / "test_pre_commit.py")],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    return ProbeResult(
        "gate_unit_tests",
        "accept",
        "accept" if proc.returncode == 0 else "reject",
        proc.stderr.strip() or proc.stdout.strip()[-200:],
    )


def main() -> int:
    summary = Summary(platform=sys.platform)
    fixture = ensure_fixture()

    summary.add(gate_unit_tests())

    tool = missing_tool_probe(fixture)
    summary.missing_tool_check = tool
    summary.add(ProbeResult(
        "missing_native_tools",
        "reject",
        tool["outcome"],
        str(tool.get("stderr", "")),
    ))

    with quiet_l1_env():
        with probe_repo(fixture) as repo:
            summary.web_timing_seconds = run_web_timing(repo)
            summary.add(ProbeResult(
                "healthy_web_index",
                "accept",
                "accept",
                seconds=summary.web_timing_seconds["warm"],
            ))

            reset_index(repo)
            old = gate.DEADLINE
            start = time.monotonic()
            try:
                with tempfile.TemporaryDirectory(prefix=gate.PREFIX) as temporary:
                    snapshot = gate.materialize_snapshot(repo, temporary)
                    gate.DEADLINE = time.monotonic() + 0.05
                    try:
                        gate.run([sys.executable, "-c", "import time; time.sleep(30)"], snapshot)
                        outcome = "accept"
                    except subprocess.TimeoutExpired:
                        outcome = "reject"
                timeout_probe = ProbeResult(
                    "gate_timeout",
                    "reject",
                    outcome,
                    seconds=round(time.monotonic() - start, 2),
                )
            finally:
                gate.DEADLINE = old

        negative_specs: list[tuple[str, Callable[[Path], None]]] = [
            (
                "ut_failure",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/__tests__/l1-probe-fail.test.ts",
                    'import { expect, test } from "vitest";\ntest("l1 probe fail", () => { expect(1).toBe(2); });\n',
                ),
            ),
            (
                "coverage_shortfall",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/vitest.config.ts",
                    (r / "apps/web-dashboard/vitest.config.ts").read_text().replace(
                        "statements: 80",
                        "statements: 100",
                    ),
                ),
            ),
            (
                "lint_error",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/__tests__/l1-probe-lint.test.ts",
                    "const unterminated\n",
                ),
            ),
            (
                "lint_warning",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/__tests__/l1-probe-warn.test.ts",
                    'const unused = 1;\nexport {};\n',
                ),
            ),
            (
                "type_error",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/lib/l1-probe-types.ts",
                    'export const broken: number = "x";\n',
                ),
            ),
            (
                "focused_test",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/__tests__/l1-probe-only.test.ts",
                    'import { expect, it } from "vitest";\nit.only("focused", () => { expect(1).toBe(1); });\n',
                ),
            ),
            (
                "skipped_test",
                lambda r: stage(
                    r,
                    "apps/web-dashboard/src/__tests__/l1-probe-skip.test.ts",
                    'import { test } from "vitest";\ntest.skip("skipped", () => {});\n',
                ),
            ),
            (
                "staged_bad_unstaged_good",
                staged_bad_unstaged_good,
            ),
        ]

        pool_size = min(4, len(negative_specs))
        with ExitStack() as stack:
            repo_queue: queue.Queue[Path] = queue.Queue()
            for _ in range(pool_size):
                repo_queue.put(stack.enter_context(probe_repo(fixture)))

            def run_negative(name: str, mutate: Callable[[Path], None]) -> ProbeResult:
                worker_repo = repo_queue.get()
                try:
                    reset_index(worker_repo)
                    mutate(worker_repo)
                    start = time.monotonic()
                    outcome = expect_reject(worker_repo)
                    return ProbeResult(name, "reject", outcome, seconds=round(time.monotonic() - start, 2))
                finally:
                    repo_queue.put(worker_repo)

            with concurrent.futures.ThreadPoolExecutor(max_workers=pool_size + 1) as executor:
                cov_future = executor.submit(read_coverage_from_vitest)
                probe_futures = [
                    executor.submit(run_negative, name, mutate)
                    for name, mutate in negative_specs
                ]
                for future in probe_futures:
                    summary.add(future.result())
                try:
                    summary.web_coverage = cov_future.result()
                except RuntimeError as error:
                    summary.web_coverage = {"error": str(error)}

        summary.add(timeout_probe)

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "tests.json"
        path.write_text("not-json")
        try:
            gate.check_tests(path)
            summary.add(ProbeResult("malformed_test_report", "reject", "accept"))
        except ValueError:
            summary.add(ProbeResult("malformed_test_report", "reject", "reject"))

    if sys.platform == "darwin" and all(shutil.which(t) for t in gate.NATIVE_TOOLS):
        summary.native_lane = "unverified: macOS tools present; native negative probes not yet automated in CI"
    else:
        summary.native_lane = "unverified (requires macOS + Xcode + SwiftLint)"

    payload = {
        "platform": summary.platform,
        "web_timing_seconds": summary.web_timing_seconds,
        "web_coverage_percent": summary.web_coverage,
        "missing_tool_check": summary.missing_tool_check,
        "native_lane": summary.native_lane,
        "probes": [p.__dict__ for p in summary.probes],
    }
    report_path = PROBE_TMP / "last-run.json"
    report_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2))

    failures = summary.failed()
    if failures:
        for item in failures:
            print(f"L1 gate selftest: {item.name} expected {item.expect}, got {item.outcome} ({item.detail})",
                  file=sys.stderr)
        return 1
    return 0


def staged_bad_unstaged_good(repo: Path):
    rel = "apps/web-dashboard/src/lib/l1-probe-index.ts"
    bad = 'export const broken: number = "bad";\n'
    good = "export const ok = 1;\n"
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(bad)
    run_git(["add", "--", rel], repo, check=True)
    path.write_text(good)


if __name__ == "__main__":
    # gate_l1_selftest runs unittest-style gate helpers via the same module.
    sys.exit(main())

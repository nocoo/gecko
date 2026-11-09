import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

DEADLINE = time.monotonic() + 480
ENV = {key: value for key, value in os.environ.items() if key in (
    "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DEVELOPER_DIR", "SDKROOT",
)}
ENV.setdefault("DEVELOPER_DIR", "/Applications/Xcode.app/Contents/Developer")
ENV["CI"] = "1"
ENV["NEXT_TELEMETRY_DISABLED"] = "1"

WEB_TOOLS = ("git", "bun", "node")
NATIVE_TOOLS = ("swiftlint", "xcodebuild", "xcrun")
TOOLS = WEB_TOOLS + NATIVE_TOOLS
PREFIX = "gecko-l1-"
DEPENDENCIES = ("node_modules", "apps/web-dashboard/node_modules")

NATIVE_LINE_FLOOR = 26
NATIVE_FUNCTION_FLOOR = 38


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


def require_tools(names=TOOLS):
    missing = [name for name in names if shutil.which(name, path=ENV["PATH"]) is None]
    if missing:
        raise RuntimeError(f"Missing required tool: {missing[0]}")


def run(args, cwd, capture=False):
    if os.environ.get("GECKO_L1_QUIET") != "1":
        print("pre-commit: " + " ".join(map(str, args)), flush=True)
    environment = dict(ENV)
    if args[0] in ("git", "gitleaks"):
        environment.update({k: v for k, v in os.environ.items() if k.startswith("GIT_")})
    quiet = os.environ.get("GECKO_L1_QUIET") == "1"
    child = subprocess.Popen(
        args,
        cwd=cwd,
        env=environment,
        start_new_session=True,
        stdout=subprocess.PIPE if capture or quiet else None,
        stderr=subprocess.PIPE if quiet and not capture else None,
        text=True,
    )
    try:
        output, _ = child.communicate(timeout=max(0.01, DEADLINE - time.monotonic()))
        if child.returncode:
            raise subprocess.CalledProcessError(child.returncode, args)
        return output
    finally:
        # Descendants can outlive the command, including after cancellation.
        try:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=3)
        except ProcessLookupError:
            pass
        except subprocess.TimeoutExpired:
            pass
        finally:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()


def copy_tree(source, target):
    if not source.is_dir():
        raise RuntimeError(f"Missing prerequisite: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        run(["cp", "-cR", str(source), str(target)], source.parent)
    else:
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)


def link_dependencies(source, target, root, snapshot):
    root = root.resolve()
    snapshot = snapshot.resolve()
    if not source.is_dir():
        raise RuntimeError(f"Missing dependencies: {source}")
    target.mkdir(parents=True, exist_ok=True)
    for entry in source.iterdir():
        if entry.name.startswith(".") and entry.name not in (".bin", ".bun"):
            continue
        destination = target / entry.name
        if entry.name.startswith("@") and entry.is_dir():
            link_dependencies(entry, destination, root, snapshot)
            continue
        resolved = entry.resolve()
        if resolved.is_relative_to(root) and "node_modules" not in resolved.relative_to(root).parts:
            resolved = snapshot / resolved.relative_to(root)
        destination.symlink_to(resolved, target_is_directory=entry.is_dir())


def check_tests(path):
    report = json.loads(path.read_text())
    if not report.get("success") or not report.get("numTotalTests"):
        raise RuntimeError("Missing successful nonempty unit-test report")
    if report.get("numPendingTests", 0) or report.get("numTodoTests", 0):
        raise RuntimeError("Required unit tests were skipped")


def check_native(path, target_name, line_floor, function_floor):
    report = json.loads(path)
    target = next(t for t in report["targets"] if t["name"] == target_name)
    functions = [f for source in target["files"] for f in source["functions"]]
    if not target["executableLines"] or not functions:
        raise RuntimeError("Empty native coverage report")
    lines = 100 * target["coveredLines"] / target["executableLines"]
    covered = sum(f["executionCount"] > 0 for f in functions)
    percent = 100 * covered / len(functions)
    print(f"Native coverage: lines={lines:.2f}%, functions={percent:.2f}%; "
          "statements/branches unavailable in Swift toolchain", flush=True)
    if lines < line_floor or percent < function_floor:
        raise RuntimeError("Native coverage regressed below interim floors; S target remains 95%")


def check_native_tests(result, native, allowed_skips):
    report = json.loads(run(["xcrun", "xcresulttool", "get", "test-results", "summary",
                             "--path", str(result)], native, True))
    if report.get("result") != "Passed" or not report.get("passedTests") or report.get("runtimeWarnings"):
        raise RuntimeError("Native tests failed, were empty, or produced runtime warnings")
    tree = json.loads(run(["xcrun", "xcresulttool", "get", "test-results", "tests",
                           "--path", str(result)], native, True))

    def visit(node):
        if isinstance(node, dict):
            if node.get("nodeType") == "Test Case" and node.get("result") == "Skipped":
                if node.get("nodeIdentifier") not in allowed_skips:
                    raise RuntimeError(f"Required native test skipped: {node.get('name')}")
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(tree)


def staged_paths(root):
    text = run(["git", "diff-index", "--cached", "--name-only", "HEAD"], root, True)
    return [line for line in text.splitlines() if line.strip()]


def native_lane_required(staged):
    return any(path.startswith("apps/mac-client/") for path in staged)


def native_tools_available():
    return all(shutil.which(name, path=ENV["PATH"]) for name in NATIVE_TOOLS)


def materialize_snapshot(root, temporary):
    snapshot = Path(temporary) / "source"
    snapshot.mkdir()
    run(["git", "checkout-index", "--all", "--force", f"--prefix={snapshot}/"], root)
    for relative in DEPENDENCIES:
        link_dependencies(root / relative, snapshot / relative, root, snapshot)
    return snapshot


def web_checks(root, snapshot, output):
    web = snapshot / "apps/web-dashboard"
    run(["bun", "run", "lint"], web)
    run(["bun", "run", "typecheck"], web)
    report = output / "tests.json"
    reporters = ["--reporter=json", f"--outputFile={report}"]
    if os.environ.get("GECKO_L1_QUIET") == "1":
        reporters.append("--silent")
    else:
        reporters[:0] = ["--reporter=default"]
    run(["bun", "run", "test:coverage", "--allowOnly=false", *reporters], web)
    check_tests(report)


def native_checks(root, snapshot, output):
    native = snapshot / "apps/mac-client"
    run(["swiftlint", "lint", "--strict", "--cache-path", str(output / "swiftlint")], native)
    packages = sorted((Path.home() / "Library/Developer/Xcode/DerivedData").glob("Gecko-*/SourcePackages"))
    packages = [p for p in packages if (p / "checkouts/GRDB.swift").is_dir()]
    if not packages:
        raise RuntimeError("Resolve Gecko Swift packages with Xcode before committing")
    copy_tree(packages[0], output / "SourcePackages")
    result = output / "Tests.xcresult"
    run(["xcodebuild", "test", "-project", "Gecko.xcodeproj", "-scheme", "Gecko",
         "-configuration", "Debug", "-destination", f"platform=macOS,arch={os.uname().machine}", "-quiet",
         "-only-testing:GeckoTests", "-derivedDataPath", str(output / "DerivedData"),
         "-clonedSourcePackagesDirPath", str(output / "SourcePackages"),
         "-disableAutomaticPackageResolution", "-skipPackageUpdates",
         "-resultBundlePath", str(result), "-enableCodeCoverage", "YES",
         "CODE_SIGN_IDENTITY=-", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGNING_ALLOWED=NO"], native)
    check_native_tests(result, native, set())
    coverage = run(["xcrun", "xccov", "view", "--report", "--json", str(result)], native, True)
    check_native(coverage, "Gecko.app", NATIVE_LINE_FLOOR, NATIVE_FUNCTION_FLOOR)


def checks(root, snapshot, output, staged):
    web_checks(root, snapshot, output)
    if native_lane_required(staged):
        require_tools(NATIVE_TOOLS)
        native_checks(root, snapshot, output)
    elif native_tools_available():
        native_checks(root, snapshot, output)


def main():
    require_tools(WEB_TOOLS)
    root = Path(run(["git", "rev-parse", "--show-toplevel"], Path.cwd(), True).strip())
    staged = staged_paths(root)
    if native_lane_required(staged):
        require_tools(NATIVE_TOOLS)
    with tempfile.TemporaryDirectory(prefix=PREFIX) as temporary:
        snapshot = materialize_snapshot(root, temporary)
        run([sys.executable, "-B", "scripts/test_pre_commit.py"], snapshot)
        checks(root, snapshot, Path(temporary), staged)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        main()
    except (OSError, ValueError, KeyError, StopIteration, RuntimeError,
            subprocess.SubprocessError) as error:
        print(f"pre-commit failed: {error}", file=sys.stderr)
        sys.exit(1)

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("gate", Path(__file__).with_name("pre-commit.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

selftest_spec = importlib.util.spec_from_file_location(
    "gate_l1_selftest", Path(__file__).with_name("gate_l1_selftest.py")
)
gate_l1_selftest = importlib.util.module_from_spec(selftest_spec)
sys.modules[selftest_spec.name] = gate_l1_selftest
selftest_spec.loader.exec_module(gate_l1_selftest)


class GateTests(unittest.TestCase):
    def test_workspace_links_and_caches_stay_in_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repo"
            snapshot = Path(directory) / "snapshot"
            modules = root / "node_modules"
            modules.mkdir(parents=True)
            package = root / "packages/api"
            package.mkdir(parents=True)
            (modules / "workspace").symlink_to(package)
            ((modules / "library").resolve()).mkdir()
            (modules / ".cache").mkdir()
            (modules / ".vite-temp").mkdir()
            gate.link_dependencies(modules, snapshot / "node_modules", root, snapshot)
            self.assertEqual((snapshot / "node_modules/workspace").readlink(), (snapshot / "packages/api").resolve())
            self.assertEqual((snapshot / "node_modules/library").resolve(), (modules / "library").resolve())
            self.assertFalse((snapshot / "node_modules/.cache").exists())
            self.assertFalse((snapshot / "node_modules/.vite-temp").exists())

    def test_failed_command_and_timeout_reject(self):
        with self.assertRaises(subprocess.CalledProcessError):
            gate.run([sys.executable, "-c", "raise SystemExit(7)"], Path.cwd())
        old = gate.DEADLINE
        try:
            gate.DEADLINE = time.monotonic() + 0.05
            with self.assertRaises(subprocess.TimeoutExpired):
                gate.run([sys.executable, "-c", "import time; time.sleep(60)"], Path.cwd())
        finally:
            gate.DEADLINE = old

    def test_empty_skipped_and_malformed_reports_reject(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tests.json"
            for report in ({"success": True, "numTotalTests": 0},
                           {"success": True, "numTotalTests": 2, "numPendingTests": 1}):
                path.write_text(json.dumps(report))
                with self.assertRaises(RuntimeError):
                    gate.check_tests(path)
            path.write_text("invalid")
            with self.assertRaises(ValueError):
                gate.check_tests(path)
            path.write_text(json.dumps({"success": True, "numTotalTests": 2}))
            gate.check_tests(path)

    def test_native_metrics_block_independently(self):
        target = {"name": "App", "coveredLines": 96, "executableLines": 100,
                  "files": [{"functions": [{"executionCount": 1}]}]}
        def check():
            gate.check_native(json.dumps({"targets": [target]}), "App", 95, 95)
        check()
        target["coveredLines"] = 94
        with self.assertRaises(RuntimeError):
            check()
        target["coveredLines"] = 96
        target["files"][0]["functions"][0]["executionCount"] = 0
        with self.assertRaises(RuntimeError):
            check()

    def test_selftest_fixture_stays_pinned_across_revisions(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = self.create_git_repo(base / "repo")
            probe_tmp = base / "probe-cache"
            with patch.object(gate_l1_selftest, "ROOT", root), \
                    patch.object(gate_l1_selftest, "PROBE_TMP", probe_tmp), \
                    patch.object(gate_l1_selftest, "PROBE_FIXTURES", probe_tmp / "fixtures"):
                self.git(root, "config", "commit.gpgsign", "true")
                self.git(root, "config", "gpg.program", str(base / "missing-signer"))
                self.commit_file(root, "first.txt", "first\n", "first")
                first_head = self.git(root, "rev-parse", "HEAD")
                first_fixture = gate_l1_selftest.ensure_fixture()

                self.commit_file(root, "second.txt", "second\n", "second")
                second_head = self.git(root, "rev-parse", "HEAD")
                second_fixture = gate_l1_selftest.ensure_fixture()

                self.assertEqual(first_fixture.name, f"{first_head}.git")
                self.assertEqual(second_fixture.name, f"{second_head}.git")
                self.assertNotEqual(first_fixture, second_fixture)
                with gate_l1_selftest.probe_repo(first_fixture) as first_repo:
                    self.assertEqual(self.git(first_repo, "rev-parse", "HEAD"), first_head)
                with gate_l1_selftest.probe_repo(second_fixture) as second_repo:
                    self.assertEqual(self.git(second_repo, "rev-parse", "HEAD"), second_head)

    def test_selftest_main_reuses_one_fixture(self):
        fixture = Path("/fixture/pinned.git")
        seen: list[Path] = []
        revision = ["first"]

        class StopAtWebProbe(Exception):
            pass

        def missing_tool_probe(received: Path):
            seen.append(received)
            revision[0] = "second"
            return {"outcome": "reject", "stderr": "expected"}

        def probe_repo(received: Path):
            seen.append(received)
            raise StopAtWebProbe

        with patch.object(gate_l1_selftest, "ensure_fixture", return_value=fixture) as ensure, \
                patch.object(gate_l1_selftest, "gate_unit_tests"), \
                patch.object(gate_l1_selftest, "missing_tool_probe", side_effect=missing_tool_probe), \
                patch.object(gate_l1_selftest, "probe_repo", side_effect=probe_repo), \
                self.assertRaises(StopAtWebProbe):
            gate_l1_selftest.main()

        self.assertEqual(revision[0], "second")
        ensure.assert_called_once_with()
        self.assertEqual(seen, [fixture, fixture])

    def test_selftest_entrypoint_preserves_peer_on_early_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            shutil.copy2(Path(__file__).with_name("pre-commit.py"), scripts)
            shutil.copy2(Path(__file__).with_name("gate_l1_selftest.py"), scripts)
            peer = root / "build/l1-gate-probes/gecko-l1-probe-peer"
            peer.mkdir(parents=True)
            (peer / "keep.txt").write_text("peer\n")

            proc = subprocess.run(
                [sys.executable, "-B", str(scripts / "gate_l1_selftest.py")],
                cwd=root, text=True, capture_output=True, check=False,
            )

            self.assertNotEqual(proc.returncode, 0)
            self.assertEqual((peer / "keep.txt").read_text(), "peer\n")

    def test_selftest_probe_cleanup_leaves_peer_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = self.create_git_repo(base / "repo")
            probe_tmp = base / "probe-cache"
            with patch.object(gate_l1_selftest, "ROOT", root), \
                    patch.object(gate_l1_selftest, "PROBE_TMP", probe_tmp), \
                    patch.object(gate_l1_selftest, "PROBE_FIXTURES", probe_tmp / "fixtures"):
                self.commit_file(root, "source.txt", "source\n", "initial")
                fixture = gate_l1_selftest.ensure_fixture()
                peer = probe_tmp / "gecko-l1-probe-peer"
                with gate_l1_selftest.probe_repo(fixture) as owned:
                    peer.mkdir()
                    (peer / "keep.txt").write_text("peer\n")
                    owned_path = Path(owned)
                    self.assertTrue(owned_path.is_dir())
                self.assertFalse(owned_path.exists())
                self.assertEqual((peer / "keep.txt").read_text(), "peer\n")

    def create_git_repo(self, root: Path) -> Path:
        root.mkdir(parents=True)
        self.git(root, "init")
        for relative in gate.DEPENDENCIES:
            (root / relative).mkdir(parents=True)
        return root

    def commit_file(self, root: Path, relative: str, content: str, message: str):
        (root / relative).write_text(content)
        self.git(root, "add", "--", relative)
        self.git(
            root, "-c", "user.name=L1 Probe", "-c", "user.email=l1-probe@example.invalid",
            "-c", "commit.gpgsign=false", "commit", "-m", message,
        )

    def git(self, root: Path, *args: str) -> str:
        result = subprocess.run(
            ["git", *args], cwd=root, text=True, capture_output=True, check=True,
        )
        return result.stdout.strip()


if __name__ == "__main__":
    unittest.main()

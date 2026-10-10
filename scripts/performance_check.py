"""Measure the 1,000-person API, visible graph, and hidden-person search in Chromium."""

import os, time, json, tempfile, subprocess, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8012"
RESULT = ROOT / "artifacts" / "performance.json"
with tempfile.TemporaryDirectory(prefix="divergent-performance-") as tmp:
    env = dict(
        os.environ,
        DATABASE_URL="sqlite:///" + str(Path(tmp) / "large.db"),
        APP_ENV="development",
        AUTH_MODE="development",
        SEED_SAMPLE="false",
    )
    subprocess.run(
        [
            str(ROOT / ".venv/bin/python"),
            "-c",
            "from backend.db import Database; from backend.sample import sample_state; d=Database(); d.save(sample_state(1000),0,'test','seed-synthetic-performance',setting=('synthetic',True))",
        ],
        cwd=ROOT,
        env=env,
        check=True,
    )
    log = open(ROOT / "artifacts" / "performance-server.log", "w")
    proc = subprocess.Popen(
        [
            str(ROOT / ".venv/bin/python"),
            "-m",
            "uvicorn",
            "backend.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8012",
        ],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
    )
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(BASE + "/api/health", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        results = {}
        start = time.perf_counter()
        response = urllib.request.urlopen(BASE + "/api/organization").read()
        results["apiSeconds"] = round(time.perf_counter() - start, 3)
        results["apiBytes"] = len(response)
        assert len(json.loads(response)["employees"]) == 1000
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=os.getenv("CHROMIUM_PATH", "/usr/bin/chromium"),
                headless=True,
                args=["--no-sandbox"],
            )
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            start = time.perf_counter()
            page.goto(BASE)
            page.get_by_role(
                "button", name="Select Lukas Czinger", exact=True
            ).wait_for()
            results["initialRenderSeconds"] = round(time.perf_counter() - start, 3)
            assert page.locator(".chart-count").inner_text().startswith("1 of 1000")
            results["initialDOMNodes"] = page.locator(".react-flow__node").count()
            start = time.perf_counter()
            page.get_by_role("button", name="Select Lukas Czinger", exact=True).click()
            expect(page.locator(".chart-count")).to_contain_text("4 of 1000")
            results["expandSeconds"] = round(time.perf_counter() - start, 3)
            start = time.perf_counter()
            page.get_by_role("textbox", name="Search organization").fill(
                "Sample Person 1000"
            )
            page.get_by_role("option").filter(has_text="Sample Person 1000").click()
            expect(page.locator(".profile h2")).to_have_text("Sample Person 1000")
            results["searchSelectSeconds"] = round(time.perf_counter() - start, 3)
            page.wait_for_timeout(800)
            expect(
                page.get_by_role("button", name="Select Sample Person 1000", exact=True)
            ).to_be_visible()
            results["visibleCountAfterSearch"] = page.locator(
                ".chart-count"
            ).inner_text()
            results["mountedDOMNodesAfterSearch"] = page.locator(
                ".react-flow__node"
            ).count()
            assert results["mountedDOMNodesAfterSearch"] < 1000
            page.screenshot(
                path=str(ROOT / "artifacts" / "performance-1000.png"), full_page=True
            )
            assert not errors
            results["browserErrors"] = errors
            browser.close()
        RESULT.write_text(json.dumps(results, indent=2))
        print(json.dumps(results, indent=2))
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        log.close()

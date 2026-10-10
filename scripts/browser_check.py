"""Browser acceptance checks. Uses an isolated temporary database and local Chromium."""

import os, sys, time, json, subprocess, tempfile, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:8011"
checks = []


def mark(s):
    checks.append(s)
    print("PASS", s, flush=True)


with tempfile.TemporaryDirectory(prefix="divergent-browser-") as tmp:
    env = dict(
        os.environ,
        DATABASE_URL="sqlite:///" + str(Path(tmp) / "browser.db"),
        AUTH_MODE="development",
        APP_ENV="development",
        SEED_SAMPLE="true",
    )
    log = open(ARTIFACTS / "browser-server.log", "w")
    process = subprocess.Popen(
        [
            str(ROOT / ".venv/bin/python"),
            "-m",
            "uvicorn",
            "backend.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8011",
        ],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
    )
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(BASE + "/api/health", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=os.getenv("CHROMIUM_PATH", "/usr/bin/chromium"),
                headless=True,
                args=["--no-sandbox"],
            )
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(BASE)
            page.get_by_role(
                "heading", name="A clearer view of your organization."
            ).wait_for()
            page.wait_for_timeout(450)
            assert page.locator(".react-flow__node").count() == 1
            expect(
                page.get_by_role("button", name="Select Lukas Czinger", exact=True)
            ).to_be_visible()
            mark("Initially only the CEO is rendered")
            page.get_by_role("button", name="Select Lukas Czinger", exact=True).click()
            page.wait_for_timeout(500)
            expect(
                page.get_by_role("button", name="Select Alex Morgan", exact=True)
            ).to_be_visible()
            expect(
                page.get_by_role("button", name="Select Jordan Lee", exact=True)
            ).to_be_visible()
            expect(
                page.get_by_role("button", name="Select Taylor Brooks", exact=True)
            ).to_be_visible()
            assert page.locator(".chart-count").inner_text().startswith("4 of 30")
            mark("Selecting CEO expands exactly three direct reports")
            page.get_by_role("button", name="Select Alex Morgan", exact=True).click()
            page.wait_for_timeout(450)
            assert page.locator(".chart-count").inner_text().startswith("6 of 30")
            page.get_by_role("button", name="Fit chart to view").click()
            page.wait_for_timeout(450)
            page.get_by_role("button", name="Select Jordan Lee", exact=True).click()
            page.wait_for_timeout(450)
            assert page.locator(".chart-count").inner_text().startswith("8 of 30")
            mark(
                "Branches expand independently and preserve previously expanded branches"
            )
            page.get_by_role("button", name="Fit chart to view").click()
            page.wait_for_timeout(450)
            page.screenshot(
                path=str(ARTIFACTS / "organization-desktop.png"), full_page=True
            )
            summary_before = page.locator(".stats-grid").inner_text()
            page.get_by_role("button", name="Collapse all", exact=True).click()
            page.wait_for_timeout(400)
            assert page.locator(".chart-count").inner_text().startswith("1 of 30")
            assert page.locator(".stats-grid").inner_text() == summary_before
            page.get_by_role("textbox", name="Search organization").fill("Finn Young")
            page.get_by_role("option").filter(has_text="Finn Young").click()
            page.wait_for_timeout(700)
            expect(
                page.get_by_role("button", name="Select Finn Young", exact=True)
            ).to_be_visible()
            expect(page.locator(".profile h2")).to_have_text("Finn Young")
            mark(
                "Collapse preserves totals; search reveals a hidden ancestor path and selects its person"
            )
            page.get_by_role(
                "button", name="Focus on this organization", exact=True
            ).click()
            page.wait_for_timeout(400)
            assert "Focused on Finn Young" in page.locator(".focus-badge").inner_text()
            page.get_by_role("button", name="Show all", exact=True).click()
            mark("Focus and clear focus work")
            page.get_by_role("button", name="Organizational units", exact=True).click()
            page.wait_for_timeout(500)
            assert page.locator(".chart-count").inner_text().startswith("1 of 11")
            page.get_by_role("button", name="Select Divergent", exact=True).click()
            page.wait_for_timeout(450)
            assert page.locator(".chart-count").inner_text().startswith("4 of 11")
            mark("Independent unit hierarchy expands correctly")
            page.get_by_role("button", name="Payroll & budgets", exact=True).click()
            expect(
                page.get_by_role(
                    "heading", name="Annual resources by organizational unit"
                )
            ).to_be_visible()
            assert page.locator("tbody tr").count() == 11
            page.screenshot(path=str(ARTIFACTS / "budgets-desktop.png"), full_page=True)
            mark("Budget page displays all unit envelopes and allocations")
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            expect(
                page.get_by_role(
                    "heading", name="Shared direction. Measurable outcomes."
                )
            ).to_be_visible()
            assert page.locator(".objective-card").count() == 4
            page.get_by_role("button", name="Edit objective", exact=True).nth(1).click()
            page.get_by_role("dialog").wait_for()
            page.get_by_label("Objective Text", exact=True).fill(
                "Browser-verified platform objective"
            )
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(
                page.get_by_role("heading", name="Browser-verified platform objective")
            ).to_be_visible()
            page.reload()
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            expect(
                page.get_by_role("heading", name="Browser-verified platform objective")
            ).to_be_visible()
            mark("Objective editing persists after page reload")
            page.get_by_role("button", name="Import workbook", exact=True).click()
            sample = urllib.request.urlopen(BASE + "/api/workbooks/sample").read()
            sample_path = Path(tmp) / "sample.xlsx"
            sample_path.write_bytes(sample)
            page.locator("input[type=file]").set_input_files(str(sample_path))
            page.get_by_role("button", name="Preview changes", exact=True).click()
            expect(
                page.get_by_text("1 app-owned records conflict with workbook values.")
            ).to_be_visible()
            page.get_by_role(
                "checkbox",
                name="Preserve app-owned records and skip these conflicting rows.",
            ).check()
            page.get_by_role("button", name="Confirm import", exact=True).click()
            expect(
                page.get_by_text("Import complete. 0 changes saved atomically.")
            ).to_be_visible()
            page.get_by_role("button", name="Close import", exact=True).click()
            expect(
                page.get_by_role("heading", name="Browser-verified platform objective")
            ).to_be_visible()
            mark(
                "Workbook preview and commit preserve conflicting app-owned objective edits"
            )
            page.get_by_role("button", name="Payroll & budgets", exact=True).click()
            page.get_by_label("Currency", exact=True).select_option("EUR")
            expect(page.get_by_text("Not fully budgeted", exact=True)).to_be_visible()
            mark("Missing currency budgets remain unknown rather than zero")
            page.get_by_label("Development role").select_option("owner")
            page.wait_for_timeout(350)
            expect(page.get_by_label("Currency", exact=True)).to_have_value("USD")
            assert (
                "demo-engineering-owner"
                in page.request.get(BASE + "/api/session").text()
            )
            page.get_by_role("button", name="Payroll & budgets", exact=True).click()
            assert page.locator("tbody tr").count() == 4
            assert page.request.get(BASE + "/api/people/002/compensation").status == 403
            assert page.request.get(BASE + "/api/workbooks/export").status == 403
            mark("Owner sees engineering scope; direct pay and exports are forbidden")
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            expect(page.get_by_text("Company alignment · read only")).to_be_visible()
            page.get_by_label("Development role").select_option("viewer")
            page.wait_for_timeout(350)
            page.get_by_role("button", name="Payroll & budgets", exact=True).click()
            expect(
                page.get_by_role("heading", name="Budget access is restricted")
            ).to_be_visible()
            assert (
                page.get_by_role("button", name="Import workbook", exact=True).count()
                == 0
            )
            mark("Viewer has read-only chart access and no budget/import controls")
            page.get_by_label("Development role").select_option("admin")
            page.wait_for_timeout(300)
            page.get_by_role("button", name="Organization", exact=True).click()
            page.get_by_role("button", name="People", exact=True).click()
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(500)
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            ), "Mobile horizontal overflow"
            page.screenshot(
                path=str(ARTIFACTS / "organization-mobile.png"), full_page=True
            )
            page.get_by_role("button", name="Import workbook", exact=True).click()
            page.wait_for_timeout(100)
            page.keyboard.press("Tab")
            assert page.evaluate(
                'document.querySelector("[role=dialog]").contains(document.activeElement)'
            )
            page.keyboard.press("Escape")
            assert page.get_by_role("dialog").count() == 0
            mark(
                "Narrow layout has no horizontal overflow; dialog keyboard focus and Escape work"
            )
            assert not errors, errors
            mark("No browser runtime errors")
            browser.close()
        (ARTIFACTS / "browser-results.json").write_text(
            json.dumps({"passed": checks, "browserErrors": errors}, indent=2)
        )
    finally:
        process.terminate()
        process.wait(timeout=10)
        log.close()

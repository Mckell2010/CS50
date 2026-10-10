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
            page.get_by_role("heading", name="Organization", exact=True).wait_for()
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
            color_select = page.get_by_label("Card background tier")
            expect(color_select).to_have_value("auto")
            expect(page.get_by_label("Card background legend")).to_contain_text(
                "Auto · Tier 2"
            )
            color_select.select_option("0")
            page.wait_for_timeout(100)
            categories = page.locator(".org-node").evaluate_all(
                "els => [...new Set(els.map(e => e.dataset.colorCategory))]"
            )
            assert categories == ["company"]
            company_background = page.locator(".org-node").first.evaluate(
                "e => getComputedStyle(e).backgroundColor"
            )
            assert company_background not in ["rgb(255, 255, 255)", "rgba(0, 0, 0, 0)"]
            color_select.select_option("2")
            page.wait_for_timeout(100)
            categories = page.locator(".org-node").evaluate_all(
                "els => [...new Set(els.map(e => e.dataset.colorCategory))]"
            )
            assert "eng" in categories and "ops" in categories
            backgrounds = page.locator(
                '.org-node[data-color-category="eng"]'
            ).evaluate_all(
                "els => [...new Set(els.map(e => getComputedStyle(e).backgroundColor))]"
            )
            assert len(backgrounds) == 1 and backgrounds[0] != company_background
            page.reload()
            expect(page.get_by_label("Card background tier")).to_have_value("2")
            expect(page.get_by_label("Card background legend")).to_contain_text(
                "Tier 2 · Group"
            )
            page.get_by_label("Card background tier").select_option("auto")
            mark(
                "Person backgrounds group by selected tier, auto follows expanded layers, and selection persists"
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
            allocation_panel = page.get_by_role(
                "region", name="Company allocation", exact=True
            )
            expect(allocation_panel).to_contain_text("Company allocation not set")
            page.get_by_role(
                "button", name="Set company allocation", exact=True
            ).click()
            page.get_by_label("Divergent Percent", exact=True).select_option("75")
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(allocation_panel).to_contain_text("Divergent 75% · Czinger 25%")
            page.reload()
            expect(
                page.get_by_role("region", name="Company allocation", exact=True)
            ).to_contain_text("Divergent 75% · Czinger 25%")
            page.screenshot(
                path=str(ARTIFACTS / "contributor-allocation.png"), full_page=True
            )
            page.get_by_role("textbox", name="Search organization").fill(
                "Lukas Czinger"
            )
            page.get_by_role("option").filter(has_text="Lukas Czinger").click()
            allocation_panel = page.get_by_role(
                "region", name="Company allocation", exact=True
            )
            expect(allocation_panel).to_contain_text("Calculated team allocation")
            expect(allocation_panel).to_contain_text("contributor allocations missing")
            assert allocation_panel.get_by_role("button").count() == 0
            state_response = page.request.get(BASE + "/api/organization").json()
            allocation_version = state_response["version"]
            for employee in state_response["employees"]:
                if employee["companyAllocation"]["mode"] == "explicit":
                    response = page.request.put(
                        BASE
                        + "/api/planning/CompanyAllocations/"
                        + employee["EmployeeID"],
                        data={
                            "version": allocation_version,
                            "record": {
                                "EmployeeID": employee["EmployeeID"],
                                "DivergentPercent": "75",
                            },
                        },
                    )
                    assert response.status == 200, response.text()
                    allocation_version = response.json()["version"]
            page.reload()
            allocation_panel = page.get_by_role(
                "region", name="Company allocation", exact=True
            )
            expect(allocation_panel).to_contain_text("Divergent 75% · Czinger 25%")
            assert allocation_panel.get_by_role("button").count() == 0
            assert (
                page.request.get(BASE + "/api/organization").json()["summary"]
                == state_response["summary"]
            )
            page.screenshot(
                path=str(ARTIFACTS / "calculated-manager-allocation.png"),
                full_page=True,
            )
            page.get_by_role("textbox", name="Search organization").fill("Finn Young")
            page.get_by_role("option").filter(has_text="Finn Young").click()
            mark(
                "Contributor allocations persist; managers transition from incomplete to calculated 75/25 without changing payroll"
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
                page.get_by_role("heading", name="Payroll budgets by tier")
            ).to_be_visible()
            assert page.locator("tbody tr").count() == 1
            expect(
                page.get_by_role(
                    "button", name="Edit company budget for Divergent", exact=True
                )
            ).to_be_visible()
            page.get_by_role(
                "button", name="Expand budget tiers under Divergent", exact=True
            ).click()
            assert page.locator("tbody tr").count() == 4
            page.get_by_role("button", name="Expand budgeted tiers", exact=True).click()
            assert page.locator("tbody tr").count() == 11
            page.screenshot(path=str(ARTIFACTS / "budgets-desktop.png"), full_page=True)
            mark(
                "Budget page starts at Tier 0 and expands successive budget tiers without double counting"
            )
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            page.get_by_role(
                "button", name="Expand planned OKR tiers", exact=True
            ).click()
            expect(
                page.get_by_role("heading", name="Objectives & key results by tier")
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
            page.get_by_role(
                "button", name="Expand planned OKR tiers", exact=True
            ).click()
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
            page.get_by_role("button", name="Expand budgeted tiers", exact=True).click()
            assert page.locator("tbody tr").count() == 4
            assert page.request.get(BASE + "/api/people/002/compensation").status == 403
            assert page.request.get(BASE + "/api/workbooks/export").status == 403
            mark("Owner sees engineering scope; direct pay and exports are forbidden")
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            page.get_by_role(
                "button", name="Expand planned OKR tiers", exact=True
            ).click()
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
            page.get_by_role("button", name="Model settings", exact=True).click()
            page.get_by_role(
                "heading", name="People, roles & contributor allocations"
            ).wait_for()
            page.get_by_label("Find model people").fill("Finn Young")
            page.get_by_role("button", name="Edit person", exact=True).click()
            page.get_by_label("FTE", exact=True).fill("0.5")
            location = page.get_by_label("Location", exact=True)
            assert location.locator("option").all_text_contents() == [
                "Select…",
                "Los Angeles - HQ",
                "Los Angeles - LB",
                "Washington DC",
                "Remote",
            ]
            location.select_option("Washington DC")
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            expect(page.locator("tbody").first).to_contain_text("0.5")
            page.get_by_role("button", name="Edit person", exact=True).click()
            expect(page.get_by_label("Location", exact=True)).to_have_value(
                "Washington DC"
            )
            page.get_by_role("button", name="Close editor", exact=True).click()
            page.get_by_label("Contractor participation").select_option("false")
            page.get_by_label("Divergent executive-pool percentage").fill("90")
            page.get_by_label("Executive pool members").select_option(["001"])
            page.get_by_role(
                "button", name="Save model & refresh preview", exact=True
            ).click()
            expect(page.get_by_text("90% / 10%", exact=False)).to_be_visible()
            page.reload()
            page.get_by_role("button", name="Model settings", exact=True).click()
            expect(
                page.get_by_label("Divergent executive-pool percentage")
            ).to_have_value("90")
            expect(page.get_by_label("Contractor participation")).to_have_value("false")
            before = page.request.get(BASE + "/api/organization").json()["summary"][
                "headcount"
            ]
            page.get_by_role(
                "button", name="Add person or open role", exact=True
            ).click()
            page.get_by_label("Name", exact=True).fill("Synthetic draft position")
            page.get_by_label("Job Title", exact=True).fill("Demo role")
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            page.get_by_label("Find model people").fill("Synthetic draft position")
            expect(page.locator("tbody").first).to_contain_text("DRAFT")
            assert (
                page.request.get(BASE + "/api/organization").json()["summary"][
                    "headcount"
                ]
                == before
            )
            page.get_by_text("Department overhead breakdown", exact=True).click()
            expect(page.locator(".department-overhead table")).to_be_visible()
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            ), "Model settings mobile overflow"
            mark(
                "Model person FTE and executive settings save and persist; mobile model fits viewport"
            )
            # New budget year: parent must be saved before child actions unlock.
            page.get_by_role("button", name="Payroll & budgets", exact=True).click()
            page.get_by_label("Metrics effective date").fill("2030-01-01")
            page.get_by_label("Currency", exact=True).select_option("USD")
            expect(
                page.get_by_role(
                    "button", name="Set company budget for Divergent", exact=True
                )
            ).to_be_visible()
            page.get_by_role("button", name="Expand budgeted tiers", exact=True).click()
            page.get_by_role(
                "button", name="Expand budget tiers under Divergent", exact=True
            ).click()
            expect(
                page.locator('[data-budget-unit="eng"] button.table-edit')
            ).to_be_disabled()
            page.get_by_role(
                "button", name="Set company budget for Divergent", exact=True
            ).click()
            page.get_by_label("Approved Envelope", exact=True).fill("10000000")
            page.get_by_label("Direct Allocation", exact=True).fill("0")
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            expect(
                page.locator('[data-budget-unit="eng"] button.table-edit')
            ).to_be_enabled()
            page.locator('[data-budget-unit="eng"] button.table-edit').click()
            page.get_by_label("Approved Envelope", exact=True).fill("3000000")
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            page.get_by_role(
                "button", name="Expand budget tiers under Engineering", exact=True
            ).click()
            expect(
                page.locator('[data-budget-unit="vehicle"] button.table-edit')
            ).to_be_enabled()
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            ), "Tier budget mobile overflow"
            page.get_by_role("button", name="Objectives & KRs", exact=False).click()
            page.get_by_role("button", name="Collapse OKR tiers", exact=True).click()
            assert page.locator(".objective-card").count() == 1
            page.get_by_role(
                "button", name="Expand OKR tiers under Divergent", exact=True
            ).click()
            page.get_by_role(
                "button", name="Expand OKR tiers under Engineering", exact=True
            ).click()
            page.get_by_role(
                "button", name="Add objective for Vehicle systems", exact=True
            ).click()
            expect(page.get_by_label("Parent Objective ID", exact=True)).to_have_value(
                "o-eng"
            )
            page.get_by_label("Objective Text", exact=True).fill(
                "Synthetic tiered vehicle outcome"
            )
            page.get_by_role("button", name="Save changes", exact=True).click()
            expect(
                page.get_by_role(
                    "heading", name="Synthetic tiered vehicle outcome", exact=True
                )
            ).to_be_visible()
            expect(page.locator('[data-okr-unit="vehicle"]')).to_contain_text(
                "Contributes to: Browser-verified platform objective"
            )
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            ), "Tier OKR mobile overflow"
            mark(
                "Tiered budgets unlock after parent save; OKRs link to the parent unit objective; both work on mobile"
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

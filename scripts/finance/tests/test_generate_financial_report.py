from __future__ import annotations

import csv
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "generate_financial_report.py"
SPEC = importlib.util.spec_from_file_location("financial_report", SCRIPT)
assert SPEC and SPEC.loader
finance = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = finance
SPEC.loader.exec_module(finance)


class FinancialReportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.ledger = self.root / "ledger.csv"
        self.budget = self.root / "budget.csv"
        self.subscriptions = self.root / "subscriptions.csv"
        self.labor = self.root / "labor.csv"
        self.output = self.root / "generated"
        self.write(self.ledger, finance.LEDGER_FIELDS, [])
        self.write(
            self.budget,
            finance.BUDGET_FIELDS,
            [
                ["BASE", "RECURRING", "LOW", "OPERATIONS", "Fixed", "100.00", "FIXED", ""],
                ["BASE", "RECURRING", "CONSERVATIVE", "OPERATIONS", "Fixed", "150.00", "FIXED", ""],
            ],
        )
        self.write(self.subscriptions, finance.SUBSCRIPTION_FIELDS, [])
        self.write(self.labor, finance.LABOR_FIELDS, [])

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def write(path: Path, fields: list[str], rows: list[list[str]], *, bom: bool = False) -> None:
        with path.open("w", encoding="utf-8-sig" if bom else "utf-8", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(fields)
            writer.writerows(rows)

    @property
    def paths(self):
        return finance.InputPaths(self.ledger, self.budget, self.subscriptions, self.labor)

    @staticmethod
    def ledger_row(
        transaction_id: str,
        *,
        status: str = "CLEARED",
        direction: str = "INCOME",
        amount: str = "10.00",
        currency: str = "USD",
        fx: str = "1",
        amount_usd: str = "",
        cash: str = "YES",
        subcategory: str | None = None,
        category: str | None = None,
        client: str = "Client A",
        date_value: str = "2026-08-15",
        recurring: str | None = None,
    ) -> list[str]:
        if category is None:
            category = "REVENUE" if direction == "INCOME" else "FINANCING" if direction.startswith("CAPITAL_") else "OPERATIONS"
        if subcategory is None:
            subcategory = "SUBSCRIPTION" if direction == "INCOME" else "OWNER_CONTRIBUTION" if direction == "CAPITAL_IN" else "OWNER_WITHDRAWAL" if direction == "CAPITAL_OUT" else "SUPPORT"
        if recurring is None:
            recurring = "YES" if subcategory == "SUBSCRIPTION" else "NO"
        return [
            transaction_id, date_value, status, direction, category, subcategory, client,
            "Test transaction", amount, currency, fx, amount_usd, cash, recurring, "test-ref", "private note",
        ]

    @staticmethod
    def interval(
        interval_id: str,
        client: str = "Client A",
        *,
        subscription_id: str | None = None,
        status: str = "ACTIVE",
        start: str = "2026-08-01",
        end: str = "",
        fee: str = "89.00",
        low_reserve: str = "1.00",
        conservative_reserve: str = "5.00",
        planned_service: str = "",
    ) -> list[str]:
        return [
            interval_id, subscription_id or f"SUB-{client}", client, status, start, end, fee, "250.00",
            "1", "1", low_reserve, conservative_reserve, planned_service, "",
        ]

    def manifest(self) -> dict[str, object]:
        return json.loads((self.output / finance.MANIFEST_NAME).read_text(encoding="utf-8"))

    def artifact_bytes(self, name: str) -> bytes:
        manifest = self.manifest()
        return (self.output / str(manifest["run_path"]) / name).read_bytes()

    def artifact_rows(self, name: str) -> list[dict[str, str]]:
        return list(csv.DictReader(io.StringIO(self.artifact_bytes(name).decode("utf-8-sig"), newline="")))

    def summary_rows(self) -> list[dict[str, str]]:
        return self.artifact_rows("monthly_summary.csv")

    def test_usd_nio_rounding_status_exclusion_cash_noncash_and_labor(self) -> None:
        self.write(self.ledger, finance.LEDGER_FIELDS, [
            self.ledger_row("USD", amount="10.005"),
            self.ledger_row("NIO", amount="3.00", currency="NIO", fx="0.3333"),
            self.ledger_row("PENDING", status="PENDING", amount="50.00"),
            self.ledger_row("UNVERIFIED", status="UNVERIFIED", amount="70.00"),
            self.ledger_row("NONCASH", amount="5.00", cash="NO"),
            self.ledger_row("EXPENSE", direction="EXPENSE", amount="3.00"),
        ])
        self.write(self.labor, finance.LABOR_FIELDS, [
            ["L1", "2026-08-20", "CONFIRMED", "Client A", "Support", "2", "25", ""],
            ["L2", "2026-08-21", "ESTIMATED", "Client A", "Estimate", "9", "25", ""],
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        row = self.summary_rows()[0]
        self.assertEqual(row["cleared_cash_income_usd"], "11.01")
        self.assertEqual(row["cleared_cash_expenses_usd"], "3.00")
        self.assertEqual(row["noncash_income_usd"], "5.00")
        self.assertEqual(row["economic_result_after_owner_labor_before_taxes_usd"], "-36.99")
        self.assertEqual((row["pending_rows"], row["unverified_rows"]), ("1", "1"))

    def test_effective_dated_history_survives_pause_cancellation_and_reactivation(self) -> None:
        intervals = [
            self.interval("A1", start="2026-01-01", end="2026-08-31"),
            self.interval("A2", status="PAUSED", start="2026-09-01", end="2026-09-30"),
            self.interval("A3", status="ACTIVE", start="2026-10-01", end="2026-10-31"),
            self.interval("A4", status="CANCELLED", start="2026-11-01"),
        ]
        self.write(self.subscriptions, finance.SUBSCRIPTION_FIELDS, intervals)
        for period in ("2026-08", "2026-09", "2026-10", "2026-11", "2026-08"):
            finance.generate(period, "LOW", self.paths, self.output)
        by_period = {(row["period"], row["scenario"]): row for row in self.summary_rows()}
        self.assertEqual(by_period[("2026-08", "LOW")]["mrr_usd"], "89.00")
        self.assertEqual(by_period[("2026-09", "LOW")]["mrr_usd"], "0.00")
        self.assertEqual(by_period[("2026-10", "LOW")]["mrr_usd"], "89.00")
        self.assertEqual(by_period[("2026-11", "LOW")]["mrr_usd"], "0.00")

    def test_capital_in_out_and_reversals_change_cash_not_operating_result(self) -> None:
        self.write(self.ledger, finance.LEDGER_FIELDS, [
            self.ledger_row("IN", direction="CAPITAL_IN", amount="100"),
            self.ledger_row("OUT", direction="CAPITAL_OUT", amount="30"),
            self.ledger_row("REV", direction="CAPITAL_OUT", amount="10", subcategory="CAPITAL_REVERSAL"),
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        row = self.summary_rows()[0]
        self.assertEqual((row["cleared_capital_in_usd"], row["cleared_capital_out_usd"]), ("100.00", "40.00"))
        self.assertEqual(row["net_cash_flow_usd"], "60.00")
        self.assertEqual(row["operating_result_before_taxes_usd"], "0.00")

    def test_budget_month_override_and_unrelated_addition(self) -> None:
        self.write(self.budget, finance.BUDGET_FIELDS, [
            ["BASE", "RECURRING", "LOW", "OPERATIONS", "Fixed", "100", "FIXED", ""],
            ["BASE", "2026-08", "LOW", "OPERATIONS", "Fixed", "120", "FIXED", ""],
            ["EXTRA", "2026-08", "LOW", "OTHER", "Extra", "10", "FIXED", ""],
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        self.assertEqual(self.summary_rows()[0]["fixed_budget_usd"], "130.00")

    def test_duplicate_budget_key_and_variable_scope_are_rejected(self) -> None:
        duplicate = ["BASE", "RECURRING", "LOW", "OPERATIONS", "Fixed", "100", "FIXED", ""]
        self.write(self.budget, finance.BUDGET_FIELDS, [duplicate, duplicate])
        with self.assertRaises(finance.ValidationError):
            finance.generate("2026-08", "LOW", self.paths, self.output)
        invalid_scope = ["RESERVE", "RECURRING", "LOW", "OPERATIONS", "Reserve", "1", "VARIABLE_PER_ACTIVE_CLIENT", ""]
        self.write(self.budget, finance.BUDGET_FIELDS, [invalid_scope])
        with self.assertRaises(finance.ValidationError):
            finance.generate("2026-08", "LOW", self.paths, self.output)

    def test_reserve_comes_only_from_active_interval_and_break_even_states(self) -> None:
        finance.generate("2026-08", "LOW", self.paths, self.output)
        self.assertEqual(self.summary_rows()[0]["break_even_state_or_clients"], "NO_ACTIVE_SUBSCRIPTIONS")
        self.write(self.subscriptions, finance.SUBSCRIPTION_FIELDS, [self.interval("A", fee="1", low_reserve="1")])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        row = self.summary_rows()[0]
        self.assertEqual(row["variable_reserve_usd"], "1.00")
        self.assertEqual(row["break_even_state_or_clients"], "UNATTAINABLE_NONPOSITIVE_MARGIN")
        self.write(self.subscriptions, finance.SUBSCRIPTION_FIELDS, [self.interval("A", fee="89", low_reserve="1")])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        self.assertEqual(self.summary_rows()[0]["break_even_state_or_clients"], "2")

    def test_client_contribution_includes_noncash_and_exposes_shared_reconciliation(self) -> None:
        self.write(self.ledger, finance.LEDGER_FIELDS, [
            self.ledger_row("REV", amount="200", subcategory="SETUP"),
            self.ledger_row("CASH", direction="EXPENSE", amount="20"),
            self.ledger_row("NONCASH", direction="EXPENSE", amount="5", cash="NO"),
            self.ledger_row("SHARED-CASH", direction="EXPENSE", amount="30", client=""),
            self.ledger_row("SHARED-NONCASH", direction="EXPENSE", amount="7", cash="NO", client=""),
        ])
        self.write(self.labor, finance.LABOR_FIELDS, [
            ["L1", "2026-08-20", "CONFIRMED", "Client A", "Setup", "2", "25", ""],
            ["L2", "2026-08-21", "CONFIRMED", "", "Shared admin", "1", "25", ""],
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        client = self.artifact_rows("client_contribution_2026-08.csv")[0]
        self.assertEqual(client["attributed_noncash_expenses_usd"], "5.00")
        self.assertEqual(client["contribution_before_allocated_shared_costs_and_taxes_usd"], "125.00")
        shared = self.artifact_rows("cost_allocation_reconciliation_2026-08.csv")[0]
        self.assertEqual(shared["unallocated_shared_cash_expenses_usd"], "30.00")
        self.assertEqual(shared["unallocated_shared_noncash_expenses_usd"], "7.00")
        self.assertEqual(shared["unallocated_shared_owner_labor_value_usd"], "25.00")

    def test_planned_client_is_excluded_and_active_without_activity_is_labeled(self) -> None:
        self.write(self.subscriptions, finance.SUBSCRIPTION_FIELDS, [
            self.interval("P", "SOHO", status="PLANNED", start="2026-08-01", planned_service="2026-09-05"),
            self.interval("A", "Active Client"),
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        rows = self.artifact_rows("client_contribution_2026-08.csv")
        self.assertEqual([row["client"] for row in rows], ["Active Client"])
        self.assertEqual(rows[0]["activity_basis"], "ACTIVE_NO_PERIOD_ACTIVITY")

    def test_exact_cent_mismatch_is_rejected_in_both_directions(self) -> None:
        for supplied in ("10.01", "9.99"):
            with self.subTest(supplied=supplied):
                self.write(self.ledger, finance.LEDGER_FIELDS, [self.ledger_row("ID", amount="10", amount_usd=supplied)])
                with self.assertRaises(finance.ValidationError):
                    finance.generate("2026-08", "LOW", self.paths, self.output)

    def test_zero_boundaries_are_non_negative_not_positive_surplus(self) -> None:
        self.write(self.budget, finance.BUDGET_FIELDS, [
            ["ZERO", "RECURRING", "LOW", "OTHER", "Zero", "0", "FIXED", ""]
        ])
        finance.generate("2026-08", "LOW", self.paths, self.output)
        row = self.summary_rows()[0]
        self.assertEqual(row["cash_viability_state"], "NON_NEGATIVE")
        self.assertEqual(row["economic_viability_state"], "NON_NEGATIVE")
        self.assertEqual(row["recurring_viability_state"], "NON_NEGATIVE")

    def test_revenue_classification_invariants(self) -> None:
        cases = [
            self.ledger_row("A", subcategory="SUBSCRIPTION", recurring="NO"),
            self.ledger_row("B", subcategory="SETUP", recurring="YES"),
            self.ledger_row("C", category="UNKNOWN", subcategory="OTHER"),
            self.ledger_row("D", direction="EXPENSE", category="REVENUE", subcategory="OTHER"),
        ]
        for row in cases:
            with self.subTest(row=row[0]):
                self.write(self.ledger, finance.LEDGER_FIELDS, [row])
                with self.assertRaises(finance.ValidationError):
                    finance.generate("2026-08", "LOW", self.paths, self.output)

    def test_generated_spreadsheet_text_escapes_every_formula_prefix(self) -> None:
        rows = [self.ledger_row(f"ID-{index}", client=f"{prefix}Client") for index, prefix in enumerate("=+-@")]
        self.write(self.ledger, finance.LEDGER_FIELDS, rows)
        finance.generate("2026-08", "LOW", self.paths, self.output)
        clients = [row["client"] for row in self.artifact_rows("client_contribution_2026-08.csv")]
        self.assertEqual(clients, ["'+Client", "'-Client", "'=Client", "'@Client"])

    def test_utf8_bom_input_and_excel_compatible_generated_csv(self) -> None:
        self.write(self.ledger, finance.LEDGER_FIELDS, [], bom=True)
        finance.generate("2026-08", "LOW", self.paths, self.output)
        self.assertTrue(self.artifact_bytes("monthly_summary.csv").startswith(b"\xef\xbb\xbf"))

    def test_fault_injection_never_repoints_authoritative_manifest(self) -> None:
        finance.generate("2026-08", "LOW", self.paths, self.output)
        original = (self.output / finance.MANIFEST_NAME).read_bytes()
        self.write(self.ledger, finance.LEDGER_FIELDS, [self.ledger_row("NEW")])
        for target in ("after_artifact", "after_run_commit", "before_manifest_commit", "after_manifest_stage"):
            with self.subTest(target=target):
                def fail(stage: str, expected: str = target) -> None:
                    if stage.startswith(expected):
                        raise OSError(f"injected at {stage}")

                with self.assertRaises(OSError):
                    finance.generate("2026-08", "LOW", self.paths, self.output, fail)
                self.assertEqual((self.output / finance.MANIFEST_NAME).read_bytes(), original)
                finance.load_authoritative_snapshot(self.output)

    def test_malformed_manifest_corrupt_artifact_and_malformed_summary_are_rejected(self) -> None:
        finance.generate("2026-08", "LOW", self.paths, self.output)
        manifest_path = self.output / finance.MANIFEST_NAME
        original_manifest = manifest_path.read_bytes()
        manifest_path.write_text("{broken", encoding="utf-8")
        with self.assertRaises(finance.ValidationError):
            finance.generate("2026-08", "LOW", self.paths, self.output)
        manifest_path.write_bytes(original_manifest)
        summary_path = self.output / str(self.manifest()["run_path"]) / "monthly_summary.csv"
        original_summary = summary_path.read_bytes()
        summary_path.write_bytes(b"corrupt")
        with self.assertRaises(finance.ValidationError):
            finance.generate("2026-08", "LOW", self.paths, self.output)
        summary_path.write_bytes(original_summary)
        finance.publish_snapshot(self.output, {"monthly_summary.csv": b"bad,header\n1,2\n"})
        with self.assertRaises(finance.ValidationError):
            finance.generate("2026-08", "LOW", self.paths, self.output)

    def test_deterministic_regeneration_and_summary_upsert(self) -> None:
        finance.generate("2026-08", "LOW", self.paths, self.output)
        finance.generate("2026-08", "CONSERVATIVE", self.paths, self.output)
        before_manifest = (self.output / finance.MANIFEST_NAME).read_bytes()
        before_summary = self.artifact_bytes("monthly_summary.csv")
        result = finance.generate("2026-08", "CONSERVATIVE", self.paths, self.output)
        self.assertEqual((self.output / finance.MANIFEST_NAME).read_bytes(), before_manifest)
        self.assertEqual(self.artifact_bytes("monthly_summary.csv"), before_summary)
        self.assertEqual(len(self.summary_rows()), 2)
        self.assertEqual(result["generation_id"], self.manifest()["generation_id"])


if __name__ == "__main__":
    unittest.main()

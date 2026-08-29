#!/usr/bin/env python3
"""Generate authoritative OmniFood NI financial reports from CSV contracts."""

from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import uuid
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from pathlib import Path
from typing import Any


CENT = Decimal("0.01")
ZERO = Decimal("0.00")
MANIFEST_NAME = "authoritative_manifest.json"
MANIFEST_VERSION = 1
LEDGER_FIELDS = (
    "transaction_id,date,status,direction,category,subcategory,client,description,"
    "amount,currency,fx_to_usd,amount_usd,cash_effect,recurring,reference,notes"
).split(",")
BUDGET_FIELDS = (
    "budget_line_id,period,scenario,category,description,monthly_amount_usd,scope,notes"
).split(",")
SUBSCRIPTION_FIELDS = (
    "interval_id,subscription_id,client,status,effective_start_date,effective_end_date,"
    "monthly_fee_usd,setup_fee_usd,locations,terminals,variable_reserve_low_usd,"
    "variable_reserve_conservative_usd,planned_service_date,notes"
).split(",")
LABOR_FIELDS = "entry_id,date,status,client,activity,hours,hourly_rate_usd,notes".split(",")
SUMMARY_FIELDS = [
    "period", "scenario", "cleared_cash_income_usd", "cleared_cash_expenses_usd",
    "cleared_capital_in_usd", "cleared_capital_out_usd", "net_cash_flow_usd",
    "noncash_income_usd", "noncash_expenses_usd", "confirmed_owner_labor_hours",
    "confirmed_owner_labor_value_usd", "operating_result_before_taxes_usd",
    "economic_result_after_owner_labor_before_taxes_usd", "active_clients", "mrr_usd",
    "arr_usd", "setup_revenue_actual_usd", "recurring_revenue_actual_usd",
    "fixed_budget_usd", "variable_reserve_usd",
    "modeled_recurring_contribution_before_taxes_usd", "break_even_state_or_clients",
    "actual_expense_budget_usd", "actual_vs_budget_expense_variance_usd", "pending_rows",
    "pending_signed_cash_usd", "unverified_rows", "unverified_signed_cash_usd",
    "cash_viability_state", "economic_viability_state", "recurring_viability_state",
]
CONTRIBUTION_FIELDS = [
    "client", "activity_basis", "cleared_revenue_usd", "attributed_cash_expenses_usd",
    "attributed_noncash_expenses_usd", "confirmed_owner_labor_value_usd",
    "contribution_before_allocated_shared_costs_and_taxes_usd",
]
RECONCILIATION_FIELDS = [
    "period", "cleared_cash_expenses_usd", "attributed_cash_expenses_usd",
    "unallocated_shared_cash_expenses_usd", "cleared_noncash_expenses_usd",
    "attributed_noncash_expenses_usd", "unallocated_shared_noncash_expenses_usd",
    "confirmed_owner_labor_value_usd", "attributed_owner_labor_value_usd",
    "unallocated_shared_owner_labor_value_usd",
]
LEDGER_CLASSIFICATIONS = {
    "AI": {"GEMINI", "GPT", "OPENGO", "OTHER"},
    "OPERATIONS": {"INTERNET", "AI_AND_INTERNET", "SUPPORT", "OTHER"},
    "INFRASTRUCTURE": {"DOMAIN", "HOSTING", "RAILWAY", "CLOUDFLARE_PAGES", "CLOUDFLARE_R2", "OTHER"},
    "PUBLICATION": {"GOOGLE_PLAY", "OTHER"},
    "REVENUE": {"SETUP", "SUBSCRIPTION", "SUPPORT", "CUSTOM_WORK", "OTHER"},
    "FINANCING": {"OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL", "CAPITAL_REVERSAL"},
}
BUDGET_CATEGORIES = {"AI", "OPERATIONS", "INFRASTRUCTURE", "BACKUP", "PUBLICATION", "OTHER"}


class ValidationError(ValueError):
    """Raised when an input or authoritative output violates its contract."""


@dataclass(frozen=True)
class InputPaths:
    ledger: Path
    budget: Path
    subscriptions: Path
    labor: Path


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def formatted(value: Decimal) -> str:
    return f"{money(value):.2f}"


def parse_decimal(value: str, label: str, *, allow_zero: bool = False) -> Decimal:
    try:
        parsed = Decimal(value)
    except (InvalidOperation, ValueError):
        raise ValidationError(f"{label}: expected a decimal, got {value!r}") from None
    if not parsed.is_finite() or parsed < 0 or (parsed == 0 and not allow_zero):
        qualifier = "non-negative" if allow_zero else "positive"
        raise ValidationError(f"{label}: expected a {qualifier} decimal, got {value!r}")
    return parsed


def parse_date(value: str, label: str, *, optional: bool = False) -> date | None:
    if optional and not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValidationError(f"{label}: expected YYYY-MM-DD, got {value!r}") from None
    if parsed.isoformat() != value:
        raise ValidationError(f"{label}: expected canonical YYYY-MM-DD, got {value!r}")
    return parsed


def parse_period(value: str) -> tuple[date, date]:
    try:
        first = datetime.strptime(value, "%Y-%m").date()
    except ValueError:
        raise ValidationError(f"period: expected YYYY-MM, got {value!r}") from None
    if first.strftime("%Y-%m") != value:
        raise ValidationError(f"period: expected canonical YYYY-MM, got {value!r}")
    return first, date(first.year, first.month, calendar.monthrange(first.year, first.month)[1])


def require_enum(value: str, allowed: set[str], label: str) -> None:
    if value not in allowed:
        raise ValidationError(f"{label}: expected one of {sorted(allowed)}, got {value!r}")


def read_csv_bytes(data: bytes, fields: Sequence[str], contract: str) -> list[dict[str, str]]:
    try:
        text = data.decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(text, newline="")))
    except (UnicodeError, csv.Error) as error:
        raise ValidationError(f"{contract}: cannot read UTF-8 CSV: {error}") from None
    if not rows:
        raise ValidationError(f"{contract}: file is empty")
    if rows[0] != list(fields):
        raise ValidationError(f"{contract}: schema mismatch; expected {','.join(fields)}")
    result: list[dict[str, str]] = []
    for line_number, row in enumerate(rows[1:], 2):
        if len(row) != len(fields):
            raise ValidationError(f"{contract} line {line_number}: expected {len(fields)} columns, got {len(row)}")
        if not any(row):
            raise ValidationError(f"{contract} line {line_number}: blank rows are not allowed")
        result.append(dict(zip(fields, row)))
    return result


def read_contract(path: Path, fields: Sequence[str], contract: str) -> list[dict[str, str]]:
    try:
        return read_csv_bytes(path.read_bytes(), fields, contract)
    except OSError as error:
        raise ValidationError(f"{contract}: cannot read {path}: {error}") from None


def validate_ledger(path: Path) -> list[dict[str, Any]]:
    rows = read_contract(path, LEDGER_FIELDS, "ledger")
    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for line, row in enumerate(rows, 2):
        prefix = f"ledger line {line}"
        transaction_id = row["transaction_id"]
        if not transaction_id or transaction_id in seen:
            raise ValidationError(f"{prefix}: duplicate or empty transaction_id {transaction_id!r}")
        seen.add(transaction_id)
        category, subcategory = row["category"], row["subcategory"]
        if category not in LEDGER_CLASSIFICATIONS or subcategory not in LEDGER_CLASSIFICATIONS[category]:
            raise ValidationError(f"{prefix}: unsupported category/subcategory {category}/{subcategory}")
        if not row["description"]:
            raise ValidationError(f"{prefix}.description: value is required")
        require_enum(row["status"], {"CLEARED", "PENDING", "UNVERIFIED"}, f"{prefix}.status")
        require_enum(row["direction"], {"INCOME", "EXPENSE", "CAPITAL_IN", "CAPITAL_OUT"}, f"{prefix}.direction")
        require_enum(row["currency"], {"USD", "NIO"}, f"{prefix}.currency")
        require_enum(row["cash_effect"], {"YES", "NO"}, f"{prefix}.cash_effect")
        require_enum(row["recurring"], {"YES", "NO"}, f"{prefix}.recurring")
        direction = row["direction"]
        if direction == "INCOME" and category != "REVENUE":
            raise ValidationError(f"{prefix}: INCOME requires REVENUE category")
        if direction == "EXPENSE" and category in {"REVENUE", "FINANCING"}:
            raise ValidationError(f"{prefix}: EXPENSE cannot use {category} category")
        if direction.startswith("CAPITAL_"):
            if category != "FINANCING" or row["cash_effect"] != "YES":
                raise ValidationError(f"{prefix}: capital directions require FINANCING and cash_effect YES")
            allowed = {"OWNER_CONTRIBUTION", "CAPITAL_REVERSAL"} if direction == "CAPITAL_IN" else {"OWNER_WITHDRAWAL", "CAPITAL_REVERSAL"}
            if subcategory not in allowed:
                raise ValidationError(f"{prefix}: {direction} contradicts subcategory {subcategory}")
        if subcategory == "SUBSCRIPTION" and (direction != "INCOME" or row["recurring"] != "YES"):
            raise ValidationError(f"{prefix}: SUBSCRIPTION requires INCOME and recurring YES")
        if subcategory == "SETUP" and (direction != "INCOME" or row["recurring"] != "NO"):
            raise ValidationError(f"{prefix}: SETUP requires INCOME and recurring NO")
        amount = parse_decimal(row["amount"], f"{prefix}.amount")
        fx = parse_decimal(row["fx_to_usd"], f"{prefix}.fx_to_usd")
        if row["currency"] == "USD" and fx != Decimal("1"):
            raise ValidationError(f"{prefix}.fx_to_usd: USD must use 1")
        derived = money(amount * fx)
        if row["amount_usd"]:
            supplied = parse_decimal(row["amount_usd"], f"{prefix}.amount_usd")
            if money(supplied) != derived:
                raise ValidationError(f"{prefix}.amount_usd: {formatted(supplied)} does not exactly match {formatted(derived)}")
        transaction_date = parse_date(row["date"], f"{prefix}.date")
        assert transaction_date is not None
        validated.append({**row, "date_value": transaction_date, "usd": derived})
    return validated


def validate_budget(path: Path) -> list[dict[str, Any]]:
    rows = read_contract(path, BUDGET_FIELDS, "budget")
    seen: set[tuple[str, str, str]] = set()
    identities: dict[tuple[str, str], tuple[str, str, str]] = {}
    validated: list[dict[str, Any]] = []
    for line, row in enumerate(rows, 2):
        prefix = f"budget line {line}"
        line_id = row["budget_line_id"]
        if not line_id:
            raise ValidationError(f"{prefix}.budget_line_id: value is required")
        if row["period"] != "RECURRING":
            parse_period(row["period"])
        require_enum(row["scenario"], {"LOW", "CONSERVATIVE"}, f"{prefix}.scenario")
        require_enum(row["scope"], {"FIXED"}, f"{prefix}.scope")
        require_enum(row["category"], BUDGET_CATEGORIES, f"{prefix}.category")
        if not row["description"]:
            raise ValidationError(f"{prefix}.description: value is required")
        key = (row["scenario"], row["period"], line_id)
        if key in seen:
            raise ValidationError(f"{prefix}: duplicate budget identity {key}")
        seen.add(key)
        identity = (row["category"], row["description"], row["scope"])
        stable_key = (row["scenario"], line_id)
        if stable_key in identities and identities[stable_key] != identity:
            raise ValidationError(f"{prefix}: budget identity metadata changed for {stable_key}")
        identities[stable_key] = identity
        validated.append({**row, "monthly_usd": parse_decimal(
            row["monthly_amount_usd"], f"{prefix}.monthly_amount_usd", allow_zero=True
        )})
    return validated


def positive_integer(value: str, label: str) -> int:
    try:
        parsed = int(value)
    except ValueError:
        raise ValidationError(f"{label}: expected a positive integer, got {value!r}") from None
    if parsed <= 0 or str(parsed) != value:
        raise ValidationError(f"{label}: expected a positive integer, got {value!r}")
    return parsed


def validate_subscriptions(path: Path) -> list[dict[str, Any]]:
    rows = read_contract(path, SUBSCRIPTION_FIELDS, "subscriptions")
    interval_ids: set[str] = set()
    clients_by_subscription: dict[str, str] = {}
    validated: list[dict[str, Any]] = []
    for line, row in enumerate(rows, 2):
        prefix = f"subscriptions line {line}"
        interval_id, subscription_id, client = row["interval_id"], row["subscription_id"], row["client"]
        if not interval_id or interval_id in interval_ids:
            raise ValidationError(f"{prefix}: duplicate or empty interval_id {interval_id!r}")
        if not subscription_id or not client:
            raise ValidationError(f"{prefix}: subscription_id and client are required")
        interval_ids.add(interval_id)
        if subscription_id in clients_by_subscription and clients_by_subscription[subscription_id] != client:
            raise ValidationError(f"{prefix}: client changed within subscription {subscription_id}")
        clients_by_subscription[subscription_id] = client
        require_enum(row["status"], {"PLANNED", "ACTIVE", "PAUSED", "CANCELLED"}, f"{prefix}.status")
        start = parse_date(row["effective_start_date"], f"{prefix}.effective_start_date")
        end = parse_date(row["effective_end_date"], f"{prefix}.effective_end_date", optional=True)
        planned = parse_date(row["planned_service_date"], f"{prefix}.planned_service_date", optional=True)
        assert start is not None
        if end and end < start:
            raise ValidationError(f"{prefix}.effective_end_date: cannot precede effective_start_date")
        if row["status"] == "PLANNED" and planned is None:
            raise ValidationError(f"{prefix}.planned_service_date: required for PLANNED interval")
        validated.append({
            **row, "start": start, "end": end, "planned": planned,
            "monthly_fee": parse_decimal(row["monthly_fee_usd"], f"{prefix}.monthly_fee_usd"),
            "setup_fee": parse_decimal(row["setup_fee_usd"], f"{prefix}.setup_fee_usd", allow_zero=True),
            "locations_value": positive_integer(row["locations"], f"{prefix}.locations"),
            "terminals_value": positive_integer(row["terminals"], f"{prefix}.terminals"),
            "reserve_low": parse_decimal(row["variable_reserve_low_usd"], f"{prefix}.variable_reserve_low_usd", allow_zero=True),
            "reserve_conservative": parse_decimal(row["variable_reserve_conservative_usd"], f"{prefix}.variable_reserve_conservative_usd", allow_zero=True),
        })
    by_subscription: dict[str, list[dict[str, Any]]] = {}
    for row in validated:
        by_subscription.setdefault(row["subscription_id"], []).append(row)
    for subscription_id, intervals in by_subscription.items():
        intervals.sort(key=lambda item: item["start"])
        for previous, current in zip(intervals, intervals[1:]):
            if previous["end"] is None or previous["end"] >= current["start"]:
                raise ValidationError(f"subscriptions: overlapping intervals for {subscription_id}")
    return validated


def validate_labor(path: Path) -> list[dict[str, Any]]:
    rows = read_contract(path, LABOR_FIELDS, "owner labor")
    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for line, row in enumerate(rows, 2):
        prefix = f"owner labor line {line}"
        entry_id = row["entry_id"]
        if not entry_id or entry_id in seen:
            raise ValidationError(f"{prefix}: duplicate or empty entry_id {entry_id!r}")
        seen.add(entry_id)
        require_enum(row["status"], {"CONFIRMED", "ESTIMATED"}, f"{prefix}.status")
        if not row["activity"]:
            raise ValidationError(f"{prefix}.activity: value is required")
        hours = parse_decimal(row["hours"], f"{prefix}.hours")
        rate = parse_decimal(row["hourly_rate_usd"], f"{prefix}.hourly_rate_usd")
        labor_date = parse_date(row["date"], f"{prefix}.date")
        assert labor_date is not None
        validated.append({**row, "date_value": labor_date, "hours_value": hours, "labor_value": money(hours * rate)})
    return validated


def signed_cash(row: dict[str, Any]) -> Decimal:
    return -row["usd"] if row["direction"] in {"EXPENSE", "CAPITAL_OUT"} else row["usd"]


def selected_budget(rows: list[dict[str, Any]], period: str, scenario: str) -> list[dict[str, Any]]:
    selected = {row["budget_line_id"]: row for row in rows if row["scenario"] == scenario and row["period"] == "RECURRING"}
    selected.update({row["budget_line_id"]: row for row in rows if row["scenario"] == scenario and row["period"] == period})
    return [selected[key] for key in sorted(selected)]


def viability_state(value: Decimal) -> str:
    if value > 0:
        return "POSITIVE_SURPLUS"
    if value == 0:
        return "NON_NEGATIVE"
    return "NEGATIVE"


def calculate(
    period: str,
    scenario: str,
    ledger: list[dict[str, Any]],
    budget: list[dict[str, Any]],
    subscriptions: list[dict[str, Any]],
    labor: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    _, period_end = parse_period(period)
    period_ledger = [row for row in ledger if row["date_value"].strftime("%Y-%m") == period]
    cleared = [row for row in period_ledger if row["status"] == "CLEARED"]
    cash = [row for row in cleared if row["cash_effect"] == "YES"]
    cash_income = sum((row["usd"] for row in cash if row["direction"] == "INCOME"), ZERO)
    cash_expenses = sum((row["usd"] for row in cash if row["direction"] == "EXPENSE"), ZERO)
    capital_in = sum((row["usd"] for row in cash if row["direction"] == "CAPITAL_IN"), ZERO)
    capital_out = sum((row["usd"] for row in cash if row["direction"] == "CAPITAL_OUT"), ZERO)
    noncash_income = sum((row["usd"] for row in cleared if row["cash_effect"] == "NO" and row["direction"] == "INCOME"), ZERO)
    noncash_expenses = sum((row["usd"] for row in cleared if row["cash_effect"] == "NO" and row["direction"] == "EXPENSE"), ZERO)
    operating_result = cash_income + noncash_income - cash_expenses - noncash_expenses
    period_labor = [row for row in labor if row["date_value"].strftime("%Y-%m") == period]
    confirmed_labor = [row for row in period_labor if row["status"] == "CONFIRMED"]
    labor_hours = sum((row["hours_value"] for row in confirmed_labor), ZERO)
    labor_value = sum((row["labor_value"] for row in confirmed_labor), ZERO)
    active = [
        row for row in subscriptions
        if row["status"] == "ACTIVE" and row["start"] <= period_end and (row["end"] is None or row["end"] >= period_end)
    ]
    active_clients = sorted({row["client"] for row in active})
    mrr = sum((row["monthly_fee"] for row in active), ZERO)
    variable_reserve = sum((row["reserve_low"] if scenario == "LOW" else row["reserve_conservative"] for row in active), ZERO)
    applicable_budget = selected_budget(budget, period, scenario)
    fixed_budget = sum((row["monthly_usd"] for row in applicable_budget), ZERO)
    if not active:
        break_even: str | int = "NO_ACTIVE_SUBSCRIPTIONS"
    else:
        average_margin = (mrr - variable_reserve) / len(active)
        break_even = "UNATTAINABLE_NONPOSITIVE_MARGIN" if average_margin <= 0 else int(
            (fixed_budget / average_margin).to_integral_value(rounding=ROUND_CEILING)
        )
    setup_actual = sum((row["usd"] for row in cleared if row["direction"] == "INCOME" and row["subcategory"] == "SETUP"), ZERO)
    recurring_actual = sum((row["usd"] for row in cleared if row["direction"] == "INCOME" and row["subcategory"] == "SUBSCRIPTION"), ZERO)
    pending = [row for row in period_ledger if row["status"] == "PENDING"]
    unverified = [row for row in period_ledger if row["status"] == "UNVERIFIED"]
    pending_cash = sum((signed_cash(row) for row in pending if row["cash_effect"] == "YES"), ZERO)
    unverified_cash = sum((signed_cash(row) for row in unverified if row["cash_effect"] == "YES"), ZERO)
    expense_budget = fixed_budget + variable_reserve
    modeled_contribution = mrr - expense_budget
    net_cash = cash_income + capital_in - cash_expenses - capital_out
    economic_result = operating_result - labor_value
    result: dict[str, Any] = {
        "period": period, "scenario": scenario, "cash_income": money(cash_income),
        "cash_expenses": money(cash_expenses), "capital_in": money(capital_in),
        "capital_out": money(capital_out), "net_cash": money(net_cash),
        "noncash_income": money(noncash_income), "noncash_expenses": money(noncash_expenses),
        "labor_hours": labor_hours, "labor_value": money(labor_value),
        "operating_result": money(operating_result), "economic_result": money(economic_result),
        "active_clients": len(active_clients), "mrr": money(mrr), "arr": money(mrr * 12),
        "setup_actual": money(setup_actual), "recurring_actual": money(recurring_actual),
        "fixed_budget": money(fixed_budget), "variable_reserve": money(variable_reserve),
        "modeled_contribution": money(modeled_contribution), "break_even": break_even,
        "expense_budget": money(expense_budget), "expense_variance": money(cash_expenses - expense_budget),
        "pending_rows": len(pending), "pending_cash": money(pending_cash),
        "unverified_rows": len(unverified), "unverified_cash": money(unverified_cash),
        "cash_state": viability_state(net_cash), "economic_state": viability_state(economic_result),
        "recurring_state": viability_state(modeled_contribution),
    }
    activity_clients = {row["client"] for row in period_ledger + period_labor if row["client"]}
    contribution_clients = sorted(activity_clients | set(active_clients))
    contributions: list[dict[str, Any]] = []
    for client in contribution_clients:
        revenue = sum((row["usd"] for row in cleared if row["client"] == client and row["direction"] == "INCOME"), ZERO)
        cash_cost = sum((row["usd"] for row in cleared if row["client"] == client and row["direction"] == "EXPENSE" and row["cash_effect"] == "YES"), ZERO)
        noncash_cost = sum((row["usd"] for row in cleared if row["client"] == client and row["direction"] == "EXPENSE" and row["cash_effect"] == "NO"), ZERO)
        client_labor = sum((row["labor_value"] for row in confirmed_labor if row["client"] == client), ZERO)
        contributions.append({
            "client": client,
            "activity_basis": "PERIOD_ACTIVITY" if client in activity_clients else "ACTIVE_NO_PERIOD_ACTIVITY",
            "cleared_revenue_usd": money(revenue),
            "attributed_cash_expenses_usd": money(cash_cost),
            "attributed_noncash_expenses_usd": money(noncash_cost),
            "confirmed_owner_labor_value_usd": money(client_labor),
            "contribution_before_allocated_shared_costs_and_taxes_usd": money(revenue - cash_cost - noncash_cost - client_labor),
        })
    attributed_cash = sum((row["usd"] for row in cleared if row["direction"] == "EXPENSE" and row["cash_effect"] == "YES" and row["client"]), ZERO)
    attributed_noncash = sum((row["usd"] for row in cleared if row["direction"] == "EXPENSE" and row["cash_effect"] == "NO" and row["client"]), ZERO)
    attributed_labor = sum((row["labor_value"] for row in confirmed_labor if row["client"]), ZERO)
    reconciliation = {
        "period": period,
        "cleared_cash_expenses_usd": money(cash_expenses),
        "attributed_cash_expenses_usd": money(attributed_cash),
        "unallocated_shared_cash_expenses_usd": money(cash_expenses - attributed_cash),
        "cleared_noncash_expenses_usd": money(noncash_expenses),
        "attributed_noncash_expenses_usd": money(attributed_noncash),
        "unallocated_shared_noncash_expenses_usd": money(noncash_expenses - attributed_noncash),
        "confirmed_owner_labor_value_usd": money(labor_value),
        "attributed_owner_labor_value_usd": money(attributed_labor),
        "unallocated_shared_owner_labor_value_usd": money(labor_value - attributed_labor),
    }
    return result, contributions, applicable_budget, reconciliation


def dashboard_text(result: dict[str, Any], budget_rows: list[dict[str, Any]], reconciliation: dict[str, Any]) -> str:
    def usd(value: Decimal) -> str:
        sign = "-" if value < 0 else ""
        return f"{sign}US${formatted(abs(value))}"

    budget_lines = "\n".join(
        f"| {row['budget_line_id']} | {row['category']} | {row['description']} | {usd(row['monthly_usd'])} |"
        for row in budget_rows
    )
    return f"""# Financial dashboard — {result['period']} / {result['scenario']}

> Internal management report. Every result is **before taxes and withholdings**. Economic result and client contribution are not net profit.

## Viability states

| Dimension | State | Exact rule |
| --- | --- | --- |
| Cash | {result['cash_state']} | `POSITIVE_SURPLUS` > 0; `NON_NEGATIVE` = 0; `NEGATIVE` < 0. |
| Economic after owner labor | {result['economic_state']} | Same boundaries; zero covers recognized costs and confirmed owner labor without surplus. |
| Recurring model | {result['recurring_state']} | Same boundaries; zero covers fixed budget and active-interval reserves without surplus. |

## Actuals for the month

| Metric | Value |
| --- | ---: |
| Cleared cash income | {usd(result['cash_income'])} |
| Cleared cash expenses | {usd(result['cash_expenses'])} |
| Cleared owner capital in | {usd(result['capital_in'])} |
| Cleared owner capital out | {usd(result['capital_out'])} |
| Net cash flow | {usd(result['net_cash'])} |
| Non-cash income | {usd(result['noncash_income'])} |
| Non-cash expenses | {usd(result['noncash_expenses'])} |
| Operating result before taxes/withholdings | {usd(result['operating_result'])} |
| Confirmed owner labor | {formatted(result['labor_hours'])} hours / {usd(result['labor_value'])} |
| Economic result after owner labor, before taxes/withholdings | {usd(result['economic_result'])} |
| Setup revenue actual | {usd(result['setup_actual'])} |
| Recurring revenue actual | {usd(result['recurring_actual'])} |

PENDING: **{result['pending_rows']}** rows, signed cash effect {usd(result['pending_cash'])}.  
UNVERIFIED: **{result['unverified_rows']}** rows, signed cash effect {usd(result['unverified_cash'])}.  
Neither status affects actual metrics.

## Recurring model

| Metric | Value |
| --- | ---: |
| Active clients at period end | {result['active_clients']} |
| MRR | {usd(result['mrr'])} |
| ARR | {usd(result['arr'])} |
| Fixed monthly budget | {usd(result['fixed_budget'])} |
| Variable reserve from active subscription intervals | {usd(result['variable_reserve'])} |
| Modeled recurring contribution before taxes/withholdings | {usd(result['modeled_contribution'])} |
| Break-even state or client count | {result['break_even']} |
| Actual expense budget | {usd(result['expense_budget'])} |
| Actual-vs-budget expense variance | {usd(result['expense_variance'])} |

Break-even states: `NO_ACTIVE_SUBSCRIPTIONS` means no observed active fee/reserve; `UNATTAINABLE_NONPOSITIVE_MARGIN` means average fee minus reserve is zero or negative; otherwise the value is a numeric client count.

## Shared-cost reconciliation

| Unallocated item | Value |
| --- | ---: |
| Shared cash expenses | {usd(reconciliation['unallocated_shared_cash_expenses_usd'])} |
| Shared non-cash expenses | {usd(reconciliation['unallocated_shared_noncash_expenses_usd'])} |
| Shared confirmed owner labor | {usd(reconciliation['unallocated_shared_owner_labor_value_usd'])} |

Client contribution excludes these unallocated shared costs and therefore does **not** equal client profit.

## Effective fixed budget inputs

| Line ID | Category | Description | Monthly amount |
| --- | --- | --- | ---: |
{budget_lines}

Generated from effective-dated contracts. PLANNED, PAUSED and CANCELLED intervals do not create MRR.
"""


def summary_row(result: dict[str, Any]) -> dict[str, str]:
    values = {
        "period": result["period"], "scenario": result["scenario"],
        "cleared_cash_income_usd": formatted(result["cash_income"]),
        "cleared_cash_expenses_usd": formatted(result["cash_expenses"]),
        "cleared_capital_in_usd": formatted(result["capital_in"]),
        "cleared_capital_out_usd": formatted(result["capital_out"]),
        "net_cash_flow_usd": formatted(result["net_cash"]),
        "noncash_income_usd": formatted(result["noncash_income"]),
        "noncash_expenses_usd": formatted(result["noncash_expenses"]),
        "confirmed_owner_labor_hours": formatted(result["labor_hours"]),
        "confirmed_owner_labor_value_usd": formatted(result["labor_value"]),
        "operating_result_before_taxes_usd": formatted(result["operating_result"]),
        "economic_result_after_owner_labor_before_taxes_usd": formatted(result["economic_result"]),
        "active_clients": str(result["active_clients"]), "mrr_usd": formatted(result["mrr"]),
        "arr_usd": formatted(result["arr"]), "setup_revenue_actual_usd": formatted(result["setup_actual"]),
        "recurring_revenue_actual_usd": formatted(result["recurring_actual"]),
        "fixed_budget_usd": formatted(result["fixed_budget"]),
        "variable_reserve_usd": formatted(result["variable_reserve"]),
        "modeled_recurring_contribution_before_taxes_usd": formatted(result["modeled_contribution"]),
        "break_even_state_or_clients": str(result["break_even"]),
        "actual_expense_budget_usd": formatted(result["expense_budget"]),
        "actual_vs_budget_expense_variance_usd": formatted(result["expense_variance"]),
        "pending_rows": str(result["pending_rows"]), "pending_signed_cash_usd": formatted(result["pending_cash"]),
        "unverified_rows": str(result["unverified_rows"]), "unverified_signed_cash_usd": formatted(result["unverified_cash"]),
        "cash_viability_state": result["cash_state"], "economic_viability_state": result["economic_state"],
        "recurring_viability_state": result["recurring_state"],
    }
    return {field: values[field] for field in SUMMARY_FIELDS}


def spreadsheet_safe(value: str) -> str:
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


def csv_bytes(fields: Sequence[str], rows: Iterable[dict[str, str]], *, text_fields: set[str] | None = None) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        output = dict(row)
        for field in text_fields or set():
            output[field] = spreadsheet_safe(output[field])
        writer.writerow(output)
    return buffer.getvalue().encode("utf-8-sig")


def updated_summary(existing: bytes | None, new_row: dict[str, str]) -> bytes:
    rows = read_csv_bytes(existing, SUMMARY_FIELDS, "monthly summary") if existing is not None else []
    seen: set[tuple[str, str]] = set()
    for line, row in enumerate(rows, 2):
        parse_period(row["period"])
        require_enum(row["scenario"], {"LOW", "CONSERVATIVE"}, f"monthly summary line {line}.scenario")
        key = (row["period"], row["scenario"])
        if key in seen:
            raise ValidationError(f"monthly summary line {line}: duplicate period/scenario {key}")
        seen.add(key)
    key = (new_row["period"], new_row["scenario"])
    rows = [row for row in rows if (row["period"], row["scenario"]) != key] + [new_row]
    order = {"LOW": 0, "CONSERVATIVE": 1}
    rows.sort(key=lambda row: (row["period"], order[row["scenario"]]))
    return csv_bytes(SUMMARY_FIELDS, rows)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json(document: dict[str, Any]) -> bytes:
    return (json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def snapshot_id(artifacts: dict[str, bytes]) -> str:
    hasher = hashlib.sha256()
    for name in sorted(artifacts):
        hasher.update(name.encode("utf-8") + b"\0" + artifacts[name] + b"\0")
    return hasher.hexdigest()


def manifest_document(generation_id: str, artifacts: dict[str, bytes]) -> dict[str, Any]:
    return {
        "schema_version": MANIFEST_VERSION,
        "generation_id": generation_id,
        "run_path": f"runs/{generation_id}",
        "files": {name: digest(data) for name, data in sorted(artifacts.items())},
    }


def load_authoritative_snapshot(output_dir: Path) -> tuple[dict[str, Any] | None, dict[str, bytes]]:
    manifest_path = output_dir / MANIFEST_NAME
    if not manifest_path.exists():
        return None, {}
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValidationError(f"authoritative manifest is malformed: {error}") from None
    if not isinstance(document, dict) or document.get("schema_version") != MANIFEST_VERSION:
        raise ValidationError("authoritative manifest has unsupported schema")
    generation_id = document.get("generation_id")
    files = document.get("files")
    if not isinstance(generation_id, str) or len(generation_id) != 64 or not isinstance(files, dict):
        raise ValidationError("authoritative manifest has invalid generation_id/files")
    expected_run = f"runs/{generation_id}"
    if document.get("run_path") != expected_run:
        raise ValidationError("authoritative manifest run_path does not match generation_id")
    artifacts: dict[str, bytes] = {}
    run_dir = output_dir / expected_run
    for name, expected_hash in files.items():
        if not isinstance(name, str) or Path(name).name != name or not isinstance(expected_hash, str):
            raise ValidationError("authoritative manifest contains an invalid file entry")
        try:
            data = (run_dir / name).read_bytes()
        except OSError as error:
            raise ValidationError(f"authoritative artifact missing: {name}: {error}") from None
        if digest(data) != expected_hash:
            raise ValidationError(f"authoritative artifact hash mismatch: {name}")
        artifacts[name] = data
    if snapshot_id(artifacts) != generation_id:
        raise ValidationError("authoritative generation_id does not match artifact set")
    run_manifest = run_dir / "run_manifest.json"
    try:
        if run_manifest.read_bytes() != canonical_json(document):
            raise ValidationError("run manifest does not match authoritative manifest")
    except OSError as error:
        raise ValidationError(f"run manifest missing: {error}") from None
    return document, artifacts


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def publish_snapshot(
    output_dir: Path,
    artifacts: dict[str, bytes],
    fault: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    generation_id = snapshot_id(artifacts)
    document = manifest_document(generation_id, artifacts)
    manifest_bytes = canonical_json(document)
    runs_dir = output_dir / "runs"
    output_dir.mkdir(parents=True, exist_ok=True)
    runs_dir.mkdir(parents=True, exist_ok=True)
    temporary_run = runs_dir / f".tmp-{uuid.uuid4().hex}"
    final_run = runs_dir / generation_id
    temporary_run.mkdir()
    try:
        for name, data in sorted(artifacts.items()):
            with (temporary_run / name).open("wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            if fault:
                fault(f"after_artifact:{name}")
        (temporary_run / "run_manifest.json").write_bytes(manifest_bytes)
        with (temporary_run / "run_manifest.json").open("rb") as handle:
            os.fsync(handle.fileno())
        fsync_directory(temporary_run)
        if fault:
            fault("before_run_commit")
        if final_run.exists():
            shutil.rmtree(temporary_run)
            temporary_run = final_run
            existing_manifest = final_run / "run_manifest.json"
            if existing_manifest.read_bytes() != manifest_bytes:
                raise ValidationError("deterministic run directory conflicts with generated content")
            for name, data in artifacts.items():
                if (final_run / name).read_bytes() != data:
                    raise ValidationError(f"deterministic run artifact is corrupted: {name}")
        else:
            temporary_run.replace(final_run)
            temporary_run = final_run
            fsync_directory(runs_dir)
        if fault:
            fault("after_run_commit")
            fault("before_manifest_commit")
        with tempfile.NamedTemporaryFile("wb", dir=output_dir, prefix=".manifest-", delete=False) as handle:
            manifest_temp = Path(handle.name)
            handle.write(manifest_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            if fault:
                fault("after_manifest_stage")
            manifest_temp.replace(output_dir / MANIFEST_NAME)
            try:
                fsync_directory(output_dir)
            except OSError:
                # The atomic replace is the publication commit point. Do not report
                # a committed generation as failed solely because durability fsync
                # is unavailable on the hosting filesystem.
                pass
        finally:
            manifest_temp.unlink(missing_ok=True)
    except Exception:
        if temporary_run.exists() and temporary_run != final_run:
            shutil.rmtree(temporary_run, ignore_errors=True)
        raise
    return document


def generate(
    period: str,
    scenario: str,
    paths: InputPaths,
    output_dir: Path,
    publication_fault: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    parse_period(period)
    require_enum(scenario, {"LOW", "CONSERVATIVE"}, "scenario")
    ledger = validate_ledger(paths.ledger)
    budget = validate_budget(paths.budget)
    subscriptions = validate_subscriptions(paths.subscriptions)
    labor = validate_labor(paths.labor)
    _, artifacts = load_authoritative_snapshot(output_dir)
    result, contributions, budget_rows, reconciliation = calculate(period, scenario, ledger, budget, subscriptions, labor)
    dashboard_name = f"financial_dashboard_{period}_{scenario}.md"
    contribution_name = f"client_contribution_{period}.csv"
    reconciliation_name = f"cost_allocation_reconciliation_{period}.csv"
    artifacts[dashboard_name] = dashboard_text(result, budget_rows, reconciliation).encode("utf-8")
    artifacts["monthly_summary.csv"] = updated_summary(artifacts.get("monthly_summary.csv"), summary_row(result))
    contribution_rows = [
        {field: formatted(value) if isinstance(value, Decimal) else str(value) for field, value in row.items()}
        for row in contributions
    ]
    artifacts[contribution_name] = csv_bytes(
        CONTRIBUTION_FIELDS, contribution_rows, text_fields={"client", "activity_basis"}
    )
    reconciliation_row = {
        field: formatted(value) if isinstance(value, Decimal) else str(value)
        for field, value in reconciliation.items()
    }
    artifacts[reconciliation_name] = csv_bytes(RECONCILIATION_FIELDS, [reconciliation_row])
    document = publish_snapshot(output_dir, artifacts, publication_fault)
    return {**result, "generation_id": document["generation_id"], "manifest": output_dir / MANIFEST_NAME}


def default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    finance = default_repo_root() / "docs" / "finance"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--period", required=True, help="Reporting month in YYYY-MM format")
    parser.add_argument("--scenario", required=True, choices=("LOW", "CONSERVATIVE"))
    parser.add_argument("--ledger", type=Path, default=finance / "FINANCIAL_TRACKER.csv")
    parser.add_argument("--budget", type=Path, default=finance / "FINANCIAL_BUDGET.csv")
    parser.add_argument("--subscriptions", type=Path, default=finance / "CUSTOMER_SUBSCRIPTIONS.csv")
    parser.add_argument("--labor", type=Path, default=finance / "OWNER_LABOR.csv")
    parser.add_argument("--output-dir", type=Path, default=finance / "generated")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = generate(
            args.period, args.scenario,
            InputPaths(args.ledger, args.budget, args.subscriptions, args.labor),
            args.output_dir,
        )
    except (ValidationError, OSError) as error:
        print(f"Financial report generation failed: {error}", file=sys.stderr)
        return 2
    print(f"Published generation {result['generation_id']} via {result['manifest']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

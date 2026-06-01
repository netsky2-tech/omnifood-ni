# openspec-archive-consistency Specification

## Purpose

Define how follow-up changes close cleanup tasks against archived OpenSpec artifacts while preserving immutable historical evidence.

## Requirements

### Requirement: Cleanup closure must reference dated archive paths

The system MUST close follow-up cleanup items using canonical dated archive paths under `openspec/changes/archive/YYYY-MM-DD-{change-name}/...`.
The system MUST NOT mark cleanup complete using non-archived or outdated path variants when a dated archive path exists.

#### Scenario: Task 4.3 closes with canonical archive path

- GIVEN Wave1B artifacts are archived under `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/`
- WHEN follow-up task `4.3` is updated to closed
- THEN the closure record MUST cite that dated archive path
- AND the cited file references MUST resolve inside that archived folder.

### Requirement: Archived evidence remains immutable

The system MUST preserve archived files as historical evidence and SHALL satisfy consistency fixes through new follow-up artifacts.

#### Scenario: Consistency fix avoids rewriting archive

- GIVEN an archived Wave1B tasks file and verify report exist
- WHEN a follow-up change reconciles stale references
- THEN the follow-up change MUST document corrected references externally
- AND archived file contents MUST remain unchanged.

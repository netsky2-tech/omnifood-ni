# Pilot Terminal Incident Procedure — Café (Cuota Fija)

**Purpose:** what to do when a POS terminal dies, is stolen, or its fiscal data is at risk — **before** it happens. Gate item G5.1 (#531).

**Why this is not optional:** two findings make this a legal procedure, not an IT runbook.

1. Duplicate DGI invoice numbers **already exist** in the pilot tenant's data. `invoices` has no unique constraint on `(tenant_id, invoice_number)` — only `invoices_pkey`, one FK and one CHECK. Verified against the dev database 2026-09-24.
2. Under **Art. 129 of the Código Tributario (Ley 562)**, *siniestro*, *robo*, and *caso fortuito o fuerza mayor* are the recognized grounds for "causa justa" to avoid a fine — and the DGI's own guidance requires **supporting documents** ("documentos soportes"). For a fire, the cited evidence is the fire department's constancia. DGI FAQ, *Infracciones, Sanciones y Delitos*, preguntas #7 and #8.

So: the legal protection exists, but it is **evidence-conditioned**. A terminal that dies with no paperwork leaves the owner with the fine and no defence. Filing is done at the **Administración de Rentas** corresponding to the fiscal address; Art. 103 CTr (as summarized by EY) also requires updating registration data at least every two years.

---

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Owner (contribuyente) | client's legal representative | signs and files everything; the DGI relationship is theirs, not ours |
| Accountant | client's contador | decides what is filed, when, and how the gap is described |
| Support (us) | OmniFood on-call | technical recovery, data extraction, evidence preservation |
| Terminals | 1 in pilot (decided #531 G0.1) | one device; that simplifies recovery but does not remove the procedure |

## Standing preparation (do once, before opening day)

- [ ] **P1.** Photograph/copy of the **DGI resolution of registration** and the authorized prefix/series, stored off-device (paper + cloud, owner-controlled).
- [ ] **P2.** Record the terminal's identity: `device_id`, tenant, and the authorized series it is bound to. Today the device id can be runtime-generated `pos-local-<uuid>` (`terminal_identity_service.dart:55`), which is **not** a stable fiscal identity — see #520/#532. Until fixed, record what the device actually reports.
- [ ] **P3.** Written daily habit: **end-of-day Corte Z** printed and kept with the cash documents (X/Z are screen-only today — #522; print them manually until that lands). The Z report is the cheapest off-device record of the day's totals.
- [ ] **P4.** Accountant's phone in the POS support contact list, and ours in theirs. Decide the escalation order before the incident.
- [ ] **P5.** An authorized **contingency stop of pre-printed invoices**, prepared **before** opening day. This is not a habit we recommend; it is ordinal TERCERO 3.3 of Disposición Técnica 09-2007, which names *"fallas del equipo computarizado o falta de energía eléctrica"* and prescribes the procedure. Three conditions, all mandatory:
  - **(a)** the forms must meet ordinal SEGUNDO 1.8 (authorized imprenta, RUC, *orden de trabajo*, correlativa numbering) — **and their numbering must be a DIFFERENT series from the computerized system's**: *"la numeración correlativa del stop de facturas en existencia deberá ser diferente a la utilizada en el sistema de facturación computarizado"*.
  - **(b)** that numbering must be **reported to the Administración de Rentas**: *"Debe reportar a la Dirección de Grandes Contribuyentes o Administración de Rentas, la numeración correlativa de estas facturas."*
  - **(c)** once the system is back, the manual tickets must be **entered into the computerized system with a note stating which manual number corresponds**, printed in original and duplicate, **with the manual copy attached as support** — see §E.
  Until P5(a)/(b) are done, **the manual fallback is itself non-compliant** — it is not a safe default. Cross-reference: #539 S3, #531 G5.4.

---

## SCENARIO A — Terminal won't boot / hardware failure

**Immediately (owner/staff):**
1. **Stop selling on that terminal.** Do not reinstall, do not factory-reset, do not "just try once more". A reset destroys the only copy of unsynced fiscal documents and resets the local numbering counter.
2. Call support. Note the time.

**Support (technical):**
3. Attempt non-destructive recovery only (reboot, charge, external display). **Never** `pm clear` / uninstall — the SQLite file is the source of truth (`AGENTS.md`).
4. If the device boots: **force a sync before anything else** (`sync_service.dart:200` runs every 5 min when online; a manual push closes the window). Then confirm upstream receipt of the last invoice numbers.
5. If it does not boot but storage is reachable: extract `app_database.db` via `adb backup`/file pull. Preserve the **original file plus a copy with hash + timestamp**. This is the evidence, not just a backup.

**Accountant (fiscal):**
6. Determine **which invoice numbers existed only on that device** — reconcile local sequence end vs. what the cloud received.
7. File the **baja / falta de comprobantes** before the next taxable period closes — Art. 129 requires prompt action and Art. 103 makes the update the contributor's duty. Submit at the Administración de Rentas, keep the **Constancia Oficial de Recepción** (DT 013-2006: the *sello* "RECIBIDO" with date, time, chronological number and receiving official is the "prueba irrefutable de su recepción"; virtual filing via the DGI site or `info@dgi.gob.ni` returns an *ACUSE DE RECIBO* with a control number, which serves the same purpose).

**Owner:** signs and files. Retains the constancia with the fiscal papers.

## SCENARIO B — Terminal stolen

1. Do **not** remotely wipe. The thief wiping it destroys the evidence; *we* wiping it destroys evidence we may need. Preserve the last-known state; remote **revocation** of the device credential is the correct action (`device_sync_credential_coordinator.dart` handles revocation; renewal-expiry forces re-provisioning).
2. File a police report (**denuncia**) the same day. This is the "robo" evidence Art. 129 requires — without it there is no causa justa.
3. Then follow Scenario A steps 4–7.
4. Re-provision a replacement device **with the terminal identity explicitly bound** (build-time id, `scripts/build_pos_apk.sh:180-186` already fails closed on pilot builds without `--device-id`). Never let the replacement self-generate a fresh id: that is how two devices end up with overlapping sequences.

## SCENARIO C — Terminal re-imaged / factory reset by mistake

1. **Assume the sequence has restarted.** Do not sell another ticket on that device until the cursor is reconciled. We have no tripwire for this yet (#526 B5), so this check is manual and it is mandatory.
2. Compare: highest invoice number already issued for that series (from Corte Z papers + cloud) vs. the device's current counter.
3. If the device is **at or below** the highest issued number → **do not use it.** It would print a duplicate. Escalate to the accountant before any sale.
4. If above → resume, and record the reconciliation (numbers, sources, date, who checked) in the fiscal binder.
5. Report the incident to the accountant even when it reconciles cleanly; the record is the defence.

## SCENARIO D — Suspected duplicate invoice numbers (detected any time)

Duplicates are **not self-correctable**: a number already printed cannot be un-printed, and `AGENTS.md` forbids deleting invoices — only cancellations.

1. Freeze sales on the affected terminal immediately.
2. Produce a written list of every duplicate: number, date, amount, payment method, both/all copies.
3. Accountant decides the regularization — normally cancellation of the erroneous copy with the **"ANULADO" legend on original and duplicate** (Art. 143 LCT / Art. 100 Reglamento, DGI FAQ #3) and a filed explanation at the Administración de Rentas.
4. Keep the constancia de recepción.
5. **Do not** "fix" it in the database. Editing fiscal documents is precisely what the no-delete rule exists to prevent, and it converts a filing problem into a fraud problem.

---

## Decision rule for selling while the terminal is down

| Situation | Keep selling? |
|---|---|
| Terminal down < 1h, customer flow small | No — pause. Manual talonario only if the accountant has confirmed P5 is in place |
| Terminal down mid-service | Yes — **manual authorized pre-printed forms only, and only if P5(a)+(b) are already in place**: a different series from the system's, already reported to the Administración de Rentas (DT 09-2007 ordinal TERCERO 3.3.a). Record each manual number, and back-enter them per §E the day the system returns. If P5 is not in place, **pause sales** and call the accountant |
| Replacement device ready but unreconciled | **No.** Scenario C first |

Never invent an ad-hoc numbering scheme (hand-written numbers, a second notebook sequence). An undocumented gap is defensible with Art. 129 paperwork; an invented sequence is not.

## SECTION E — Back-entering manual contingency tickets (DT 09-2007 ordinal TERCERO 3.3.b)

When the system comes back, the manual tickets are **not** finished business. The disposición requires:

> *"una vez superado el problema de facturación deberá proceder a ingresar al sistema de facturación computarizado las facturas elaboradas manualmente **e indicar con una nota el número de la factura manual que corresponde a esa factura elaborada**, así como deberá imprimir las factura computarizada en original y copia, **adjuntando como soporte la copia de la facturación manual**."*

Steps:
1. Collect every used manual form (original issued to customer; **keep the duplicate**).
2. Enter each as a computerized invoice **in the same order** as the manual numbering.
3. Annotate each computerized invoice with the manual number it replaces.
4. Print each in **original and duplicate**; staple the manual duplicate to it as support.
5. Give the accountant the reconciliation list (manual number ↔ system number ↔ amount) the same day.

**Product reality:** step 3 has **no field in our system today** — there is no way to record "this invoice replaces manual ticket N". The workaround until #539 S3 lands is a paper register kept with the fiscal binder and the accountant notified the same day. **That is a workaround, not compliance**, and it is why #539 S3 sits in the gate (#531 G5.4) rather than the backlog.

## What this procedure does NOT fix

It is a containment and evidence plan, not a substitute for the code work. Three product defects create the exposure this document manages:

- **#526 B1/B5** — the numbering cursor is device-local with no cloud authority and no tripwire; **this procedure is a workaround for a missing control.** Ordinal SEGUNDO **1.4** makes backing up daily operations an explicit requirement, and the POS currently has **no** backup/export/restore path at all (#526).
- **#522** — Corte X/Z are screen-only, so the daily off-device fiscal record depends on someone printing deliberately (P3).
- **#520 / #532 T1** — identity and range are per-device and boot-overwritten; until numbering has cloud authority, Scenario C's reconciliation is manual forever.

Land those and this document gets shorter. Until then, **P1–P5 are prerequisites for opening day, not follow-ups.**

## Sources

Primary:
- DGI, *Infracciones, Sanciones y Delitos* (Código Tributario) — https://www.dgi.gob.ni/FAQ/infracciones__sanciones_y_deli.htm — arts. 124, 126.10, 127, 129, 131, 133, 136-137. Preguntas #6 (cuota fija fined at 50%), #7 (fire → constancia de Bomberos), #8 (siniestro/robo/fuerza mayor as causa justa).
- DGI, *Obligaciones de los Responsables Recaudadores* (IVA) — https://www.dgi.gob.ni/FAQ/obligaciones_de_los_responsabl.htm — pregunta #3: Art. 143.3 LCT / Art. 100.1 Reglamento + Decreto Nº 1357 (pie de imprenta); **consecutive numbering**, and **"cuando se anule una factura… conservar original y duplicados, reflejando en cada uno la leyenda 'ANULADO'"**; pregunta #5: branch numbering — *literal g, art. 100 Reglamento* and **ordinal tercero, Disposición Técnica 09-2007**.
- Disposición Técnica **013-2006** (Recepción, Administración y Control de Documentos), pub. La Gaceta 180, 2006-09-18 — constancia oficial de recepción, horario, presentación automatizada y acuse de recibo. https://nicaragua.justia.com/nacionales/disposiciones-tecnicas/recepcion-administracion-y-control-de-documentos-sep-18-2006/gdoc/
- Código Tributario de Nicaragua (Ley 562) — arts. 69 (requerimiento de documentos), 103 (actualización de datos), 129 (causa justa).

Secondary / advisory only (not legal sources):
- EY Nicaragua on Art. 103.1 biennial data updates.
- FacturaSimple and GCH Accounting summaries on Cuota Fija vs. Régimen General document types.

**Disposición Técnica No. 09-2007 — "Requisitos para uso de Sistemas de Facturación Computarizadas"**, aprobada 2007-05-23, publicada **La Gaceta No. 134 del 2007-07-16** (Walter Porras, Director General de Ingresos). Full text retrieved verbatim: https://nicaragua.justia.com/nacionales/normas-tecnicas/requisitos-para-uso-de-sistemas-de-facturacion-computarizadas-jul-16-2007/gdoc/ (PDF: https://docs.nicaragua.justia.com/nacionales/normas-tecnicas/requisitos-para-uso-de-sistemas-de-facturacion-computarizadas-jul-16-2007.pdf). Quoted ordinals: **SEGUNDO 1.4** (respaldo en medios magnéticos), **1.6** (notificación previa de variantes/modificaciones/cancelaciones del sistema), **1.7** (numeración continua e inalterable), **1.8** (pie de imprenta), **1.10** (anulación: conservar original y todas las copias preimpresas, estampando "anulado"), **TERCERO 3.1** (series por sucursal), **3.3** (plan de contingencia — la base de P5 y §E), **3.4** (devoluciones posteriores = nota de crédito, no anulación), **CUARTO** (carta de autorización), **QUINTO** (número de autorización en la parte inferior derecha de cada factura), **SÉPTIMO** (sanción: Arto. 127.2 CTr).

**Open question that conditions several of the above:** this disposición regulates *computerized invoicing systems* and ordinal SEGUNDO 1.9 frames IVA break-out in Régimen General terms. Whether every ordinal binds a **Cuota Fija** taxpayer is a legal question for the accountant (#535 Q4c), not something this document settles. Ordinal CUARTO also means the client must actually **hold** an authorization letter for QUINTO to apply (#535 Q7). This document is operational guidance, not legal advice.

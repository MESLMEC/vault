# MESL Vault: Frontend API Integration & Feature Roadmap

This roadmap tracks the alignment between the **MESL Vault** frontend (`vault/`) and the **MESL Finance FastAPI Backend** (`mesl-finance-backend/`), using [`mesl-finance-backend/docs/openapi.json`](file:///home/abir/coding/MESL/treasurer/mesl-finance-backend/docs/openapi.json) as the official contract.

---

## 1. Architecture & Integration Strategy

The frontend is architected as an **Adaptive Hybrid Application**:
1. **Intact Structure**: All existing screens, components, view models, and client-side simulation logic (`FinanceEngine`) remain completely intact.
2. **Direct API Integration (`backendApi.ts`)**: Every endpoint defined in `openapi.json` has a 1:1 typed client method with JWT Bearer authentication and RFC 9457 error translation.
3. **Unified API Coordinator (`api.ts`)**:
   - For backend-implemented features (Phases 0–7), the coordinator routes requests directly to the FastAPI server while keeping local state in sync.
   - For pending backend features (Phases 8–12: allocation draft/confirm, asset events, monthly reconciliation, tenure closure), the coordinator seamlessly executes via the client-side `FinanceEngine`.
   - When the backend is offline or unauthenticated, the application operates in **Local Simulation Mode**, guaranteeing uninterrupted demo and offline functionality.
4. **Treasurer Authentication**: Handled via the **API & Auth Status Modal** in the top navigation bar with live server health probing and token management.

---

## 2. API Contract & Coverage Matrix

| # | HTTP Method | API Endpoint | Backend Phase | Frontend Status | Frontend UI Component |
|---|---|---|---|---|---|
| **1** | `POST` | `/api/v1/auth/login` | Phase 4 | ✅ Covered | `AuthModal.tsx` |
| **2** | `GET` | `/api/v1/cost-centers` | Phase 5 | ✅ Covered | `CostCentersScreen.tsx` |
| **3** | `POST` | `/api/v1/cost-centers` | Phase 5 | ✅ Covered | `CostCentersScreen.tsx` |
| **4** | `POST` | `/api/v1/cost-centers/{id}/rename` | Phase 5 | ✅ Covered | `CostCentersScreen.tsx` (Edit Modal) |
| **5** | `POST` | `/api/v1/cost-centers/{id}/status` | Phase 5 | ✅ Covered | `CostCentersScreen.tsx` (Edit Modal) |
| **6** | `GET` | `/api/v1/envelopes` | Phase 5 | ✅ Covered | `EnvelopeCardGrid.tsx` |
| **7** | `POST` | `/api/v1/envelopes` | Phase 5 | ✅ Covered | `EnvelopeCardGrid.tsx` (New Envelope) |
| **8** | `POST` | `/api/v1/envelopes/{id}/rename` | Phase 5 | ✅ Covered | `EnvelopeCardGrid.tsx` (Settings Modal) |
| **9** | `POST` | `/api/v1/envelopes/{id}/settings` | Phase 5 | ✅ Covered | `EnvelopeCardGrid.tsx` (Settings Modal) |
| **10** | `POST` | `/api/v1/envelopes/{id}/deactivate` | Phase 5 | ✅ Covered | `EnvelopeCardGrid.tsx` (Deactivate Button) |
| **11** | `GET` | `/api/v1/allocation-context` | Phase 7 | ✅ Covered | `AppShell.tsx`, `FinanceDashboard.tsx` |
| **12** | `GET` | `/api/v1/dues` | Phase 7 | ✅ Covered | `DuesOverviewTable.tsx` |
| **13** | `GET` | `/api/v1/fee-rates` | Phase 7 | ✅ Covered | `FeeRatesModal.tsx` |
| **14** | `POST` | `/api/v1/fee-rates` | Phase 7 | ✅ Covered | `FeeRatesModal.tsx` |
| **15** | `GET` | `/api/v1/shutdown-weeks` | Phase 7 | ✅ Covered | `ShutdownCalendarModal.tsx` |
| **16** | `POST` | `/api/v1/shutdown-weeks` | Phase 7 | ✅ Covered | `ShutdownCalendarModal.tsx` |
| **17** | `GET` | `/api/v1/entries` | Phase 6 | ✅ Covered | `LedgerTable.tsx` |
| **18** | `POST` | `/api/v1/deposits` | Phase 6 | ✅ Covered | `TransactionModal.tsx` |
| **19** | `POST` | `/api/v1/expenses` | Phase 6 | ✅ Covered | `TransactionModal.tsx` |
| **20** | `POST` | `/api/v1/transfers` | Phase 6 | ✅ Covered | `TransactionModal.tsx` |
| **21** | `POST` | `/api/v1/refunds` | Phase 7 | ✅ Covered | `TransactionModal.tsx` (Refund Tab) |
| **22** | `POST` | `/api/v1/entries/{id}/fix-amount` | Phase 6 | ✅ Covered | `FixAmountModal.tsx` |
| **23** | `POST` | `/api/v1/entries/{id}/edit-labels` | Phase 6 | ✅ Covered | `EditLabelModal.tsx` |
| **24** | `GET` | `/api/v1/members` | Phase 7 | ✅ Covered | `DuesOverviewTable.tsx` |
| **25** | `POST` | `/api/v1/members` | Phase 7 | ✅ Covered | `DuesOverviewTable.tsx` (Add Member) |
| **26** | `POST` | `/api/v1/members/{id}/edit` | Phase 7 | ✅ Covered | `EditMemberModal.tsx` |
| **27** | `GET` | `/api/v1/members/{id}/periods` | Phase 7 | ✅ Covered | `EditMemberModal.tsx` |
| **28** | `POST` | `/api/v1/members/{id}/periods/start` | Phase 7 | ✅ Covered | `EditMemberModal.tsx` |
| **29** | `POST` | `/api/v1/members/{id}/periods/end` | Phase 7 | ✅ Covered | `EditMemberModal.tsx` |
| **30** | `GET` | `/api/v1/members/{id}/adjustments` | Phase 7 | ✅ Covered | `EditMemberModal.tsx` |
| **31** | `POST` | `/api/v1/members/{id}/adjustments` | Phase 7 | ✅ Covered | `WaiverModal.tsx` |

---

## 3. Detailed Progress Tracker by Domain

### ✅ Module A: Authentication & Session
- **Backend Spec**: `POST /api/v1/auth/login` (Argon2 + HS512 JWT issued for treasurer).
- **Frontend Status**: **Complete & Tested**
- **Capabilities**:
  - `AuthModal.tsx` accessible from the top-bar status pill.
  - Automatic probe of backend health (`:8000`).
  - Bearer token stored in `authStorage` and injected on all outgoing requests.
  - Mode selector: Auto (Hybrid) / Strict Backend / Local Engine.

### ✅ Module B: Virtual Envelopes & Pots
- **Backend Spec**: CRUD endpoints for envelopes (`/api/v1/envelopes`).
- **Frontend Status**: **Complete & Tested**
- **Capabilities**:
  - List virtual envelopes and display live balances.
  - Create new envelopes with target cap and priority ranking.
  - **New**: Envelope settings modal (`POST /api/v1/envelopes/{id}/settings`).
  - **New**: Rename envelope (`POST /api/v1/envelopes/{id}/rename`).
  - **New**: Deactivate zero-balance non-pool envelope (`POST /api/v1/envelopes/{id}/deactivate`).

### ✅ Module C: Cost Centers & Project Funds
- **Backend Spec**: `/api/v1/cost-centers` with filtering and status updates.
- **Frontend Status**: **Complete & Tested**
- **Capabilities**:
  - Display project and event summaries with money in / money out / leftover.
  - Create new cost centers (event, member_project, lab_project, competition).
  - **New**: Rename cost center (`POST /api/v1/cost-centers/{id}/rename`).
  - **New**: Lifecycle status transitions (`planned`, `active`, `completed`, `cancelled`).

### ✅ Module D: Money Movement & Immutable Ledger
- **Backend Spec**: Deposits, expenses, transfers, refunds, fix-amount, edit-labels.
- **Frontend Status**: **Complete & Tested**
- **Capabilities**:
  - `TransactionModal.tsx`:
    - Deposit money into pool with source and donor/member tagging (`POST /api/v1/deposits`).
    - Expense money from specific envelopes with zero-overdraw invariant (`POST /api/v1/expenses`).
    - Transfer money between envelopes with zero-sum invariant (`POST /api/v1/transfers`).
    - **New**: Refund member advance credit directly from the General Pool (`POST /api/v1/refunds`).
  - `FixAmountModal.tsx`: Fix transaction amount via mirror-reversal and replacement (`POST /api/v1/entries/{id}/fix-amount`).
  - `EditLabelModal.tsx`: Correct note, tag, date, and cost center with audit log (`POST /api/v1/entries/{id}/edit-labels`).
  - Reversal trail inspector (`LedgerTable.tsx`).

### ✅ Module E: Membership, Fees & Dues
- **Backend Spec**: Members, periods, weekly rates, shutdown calendar, adjustments.
- **Frontend Status**: **Complete & Tested**
- **Capabilities**:
  - Dues overview derived from Sunday calendar and rate rules (`GET /api/v1/dues`).
  - Quick fee collection modal (`POST /api/v1/deposits` with `source="weekly_fee"`).
  - Waiver and adjustment modal (`POST /api/v1/members/{id}/adjustments`).
  - Shutdown calendar modal (`GET`/`POST /api/v1/shutdown-weeks`).
  - **New** `FeeRatesModal.tsx`: View effective fee history and schedule rate changes (`GET`/`POST /api/v1/fee-rates`).
  - **New** `EditMemberModal.tsx`:
    - Edit name, batch, and notes (`POST /api/v1/members/{id}/edit`).
    - View membership period history (`GET /api/v1/members/{id}/periods`).
    - Start active period (`POST /api/v1/members/{id}/periods/start`).
    - End active period to freeze dues (`POST /api/v1/members/{id}/periods/end`).
    - View member's complete adjustment ledger (`GET /api/v1/members/{id}/adjustments`).

---

## 4. Pending Features Roadmap (Backend Phases 8–12)

The following modules are fully functional in the frontend via `FinanceEngine` and are queued for backend API conversion as each backend phase is implemented:

### ⏳ Phase 8: Allocation Sessions & Sweeps
- **Backend Roadmap Step**: `8.0` – `8.4` (in progress in `mesl-finance-backend`)
- **Planned Backend Endpoints**:
  - `GET /api/v1/allocation-suggestion` (draft proposal based on caps and priorities)
  - `POST /api/v1/allocate` (commit envelope top-ups in one transaction)
  - `POST /api/v1/cost-centers/{id}/sweep` (sweep leftover event funds into pool)
- **Current Frontend State**: Executed via `api.getAllocationSuggestion()`, `api.allocate()`, and `api.sweepLeftover()`.
- **Conversion Action**: Replace engine delegate with `backendApi` calls once endpoints are exposed in `openapi.json`.

### ⏳ Phase 9: Equipment & Assets
- **Backend Roadmap Step**: `9.0` – `9.5`
- **Planned Backend Endpoints**:
  - `GET /api/v1/assets`, `POST /api/v1/assets`
  - `POST /api/v1/assets/{id}/events` (acquired, lent, returned, damaged, repaired, lost, scrapped)
  - `GET /api/v1/assets/state`, `GET /api/v1/assets/holdings`, `GET /api/v1/assets/admin-queue`
- **Current Frontend State**: Fully rendered in `AssetsScreen.tsx` via `FinanceEngine`.
- **Conversion Action**: Map `AssetsScreen.tsx` to FastAPI endpoints when `9.5` publishes updated `openapi.json`.

### ⏳ Phase 10: Trust & Monthly Reconciliation
- **Backend Roadmap Step**: `10.0` – `10.3`
- **Planned Backend Endpoints**:
  - `POST /api/v1/reconciliations` (record cash count match / difference)
  - `GET /api/v1/reconciliations/status`, `GET /api/v1/reconciliations/unverified`, `GET /api/v1/reconciliations/suspects`
- **Current Frontend State**: Fully rendered in `ReconciliationScreen.tsx` via `FinanceEngine`.
- **Conversion Action**: Connect `ReconciliationScreen.tsx` to backend API upon completion of Phase 10.

### ⏳ Phase 11: Tenure Handover & Historical Snapshots
- **Backend Roadmap Step**: `11.1` – `11.2`
- **Planned Backend Endpoints**:
  - `POST /api/v1/tenures/close` (execute closing checksum, archive state, create carry-over opening in new tenure)
  - `GET /api/v1/tenures`
- **Current Frontend State**: Fully rendered in `HandoverScreen.tsx` with printable handover report and cryptographic checksum via `FinanceEngine`.
- **Conversion Action**: Connect `closeTenure` call to backend API upon completion of Phase 11.

### ⏳ Phase 12: Health & System Contracts
- **Backend Roadmap Step**: `12.1` – `12.2`
- **Planned Backend Endpoints**:
  - `GET /api/v1/health` / `verify-all`
- **Current Frontend State**: Simulated via `api.verifyAll()`.

---

## 5. Development Verification Summary

- **TypeScript Compilation**: `npm run build` passes with zero errors.
- **Unit Test Suite**: `npm test` runs 12 tests across 2 suites (`backendApi.test.ts` + `engine.test.ts`), with 100% passing.
- **Vite Proxy**: Configured in `vite.config.ts` to forward `/api` to `http://127.0.0.1:8000`.

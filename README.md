# Linha Farma

**AI-powered pharmacy operations platform.**

Linha Farma answers the questions that consume a pharmacy's day — stock availability,
prices, reservations, opening hours — through WhatsApp and the web, 24/7. When a
conversation touches anything clinical, a deterministic safety engine stops the
automation and routes the case to a pharmacist.

It is not a diagnosis system. It never prescribes, never suggests a dose, and never
replaces a professional.

---

## Why it exists

Pharmacies lose sales to unanswered calls and burn staff time on the same five
questions. Existing chatbots either can't verify real stock, or — worse — happily
give medical advice they have no business giving.

Linha Farma solves both: the backend is the source of truth for stock and reservations,
and clinical safety is enforced by fixed rules rather than delegated to a language model.

---

## Core design principle

> The AI never decides a clinical case.

Every incoming message passes through a **deterministic safety gate before the LLM is
consulted at all**. If the message mentions pregnancy, children, prescription
medication, severe symptoms, or dosage questions, the gate blocks automation, creates
an escalation ticket, and notifies a pharmacist.

```
Message → Safety Gate ─── sensitive ──→ Escalation ticket → Pharmacist
                     └── safe ──→ AI (intent + entity) → Backend verification → Reply
```

The LLM's only job is understanding language: intent detection and entity extraction.
It has no direct database access and no decision authority. Everything it returns is
validated against PostgreSQL before reaching the customer.

---

## Architecture

| Layer | Stack |
|---|---|
| Frontend | Angular 20, standalone components, signals, PrimeNG |
| Backend | Java 21, Spring Boot 3, Spring Security, Spring Data JPA |
| Database | PostgreSQL, Flyway migrations, multi-tenant by `tenant_id` |
| AI | Ollama running a local model (Qwen 3 / Llama / Gemma) |
| Infra | Docker Compose, Nginx, Linux VPS |

The LLM runs locally. No third-party AI API, no per-token cost, and customer data
never leaves the deployment — which matters for GDPR compliance.

**Ollama is never exposed to the frontend.** All AI calls are proxied and validated
by the backend.

---

## Features

**Customer channel**
- Product availability and pricing, tolerant of misspellings (`"parasetsmou"` → Paracetamol)
- Reservations with atomic stock deduction
- Store info, opening hours, order tracking, FAQ
- Automatic escalation of clinical cases

**Pharmacy console**
- Escalation queue with SLA tracking (`NOVO → ATRIBUIDO → EM_ATENDIMENTO → RESOLVIDO`)
- Reservation lifecycle (`PENDENTE → CONFIRMADA → PRONTA → LEVANTADA`, plus
  `CANCELADA` / `EXPIRADA` — both return stock to inventory)
- Inventory with low-stock and out-of-stock alerts
- Immutable audit trail of every state transition

**Platform**
- Multi-tenant with per-pharmacy data isolation
- JWT authentication, RBAC (`SUPER_ADMIN`, `PHARMACY_ADMIN`, `PHARMACIST`, `EMPLOYEE`)
- Structured logging with correlation IDs
- GDPR-oriented: consent tracking, soft delete, audit log

---

## Safety rules

These trigger escalation and are enforced in backend code, not in prompts:

| Category | Examples |
|---|---|
| Pregnancy / breastfeeding | pregnancy, nursing |
| Children | baby, toddler, "my son has a fever" |
| Prescription / antibiotics | prescription-only medication |
| Clinical complaint | pain, headache, fever, cough, nausea |
| Recommendation request | "what can I take for…" |
| Dosage / interaction | dose, mixing medication |
| Severe symptoms | shortness of breath, chest pain, bleeding |

Rules are intentionally conservative: **false positives (escalating unnecessarily) are
acceptable; false negatives are not.**

---

## Getting started

> Status: in development. The MVP prototypes are functional; backend implementation
> is in progress.

```bash
git clone https://github.com/ghrs123/linha-farma.git
cd linha-farma
cp .env.example .env          # configure DB credentials and model name
docker compose up -d
```

Services: `nginx`, `frontend`, `backend`, `postgres`, `ollama`.

**Minimum VPS:** 4 vCPU · 8 GB RAM · 100 GB SSD (Ollama is the memory-heavy component).

---

## Project structure

```
linha-farma/
├── backend/          # Spring Boot — hexagonal architecture, DDD
│   ├── domain/       # entities, business rules, safety engine
│   ├── application/  # use cases
│   └── infrastructure/  # REST, JPA, Ollama client
├── frontend/         # Angular 20
├── docs/             # architecture, functional & non-functional specs, diagrams
└── docker/           # Dockerfiles, compose, nginx config
```

---

## Roadmap

- [ ] **F1 — Core:** multi-tenant data model, safety engine, catalog, reservations
- [ ] **F2 — AI:** Ollama integration, intent detection, entity extraction, guardrails
- [ ] **F3 — Frontend:** customer channel, pharmacy console, RBAC
- [ ] **F4 — Production:** audit trail, observability, deployment, health checks

---

## Non-goals

Linha Farma will not, under any circumstance:

- provide medical diagnosis
- recommend or prescribe medication
- indicate dosage, posology, or drug interactions
- replace a pharmacist's judgement

---

## License

TBD

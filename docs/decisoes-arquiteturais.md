# Architecture Decision Records

Short records of the decisions that shape this system, why they were made, and what
was traded away. Update this file when a decision is reversed — do not delete history.

---

## ADR-001 — The safety gate is deterministic and runs before the AI

**Status:** accepted

**Context.** The platform talks to pharmacy customers, who will inevitably describe
symptoms and ask what to take. A language model asked to "not give medical advice"
will comply most of the time. Most of the time is not an acceptable standard when the
failure mode is a pregnant customer receiving a medication suggestion.

**Decision.** Every inbound message passes through a rule-based safety gate in backend
code before the LLM is invoked. If a sensitive category matches, the gate blocks
automation entirely, creates an escalation ticket, and the LLM is never consulted for
that message.

**Consequences.** Rules are hand-curated and will need periodic review. The gate is
intentionally conservative: it over-escalates. False positives cost a pharmacist a
glance at a ticket; false negatives cost far more. This is the correct asymmetry.

---

## ADR-002 — The backend is the source of truth, not the model

**Status:** accepted

**Context.** An LLM can state that a product is in stock. It has no way to know.

**Decision.** The AI layer performs intent detection and entity extraction only. It
returns a structured payload (`{intent, product}`) which the backend validates against
PostgreSQL before any reply reaches the customer. Stock levels, prices, and
reservation state are always read from the database.

**Consequences.** Slightly more backend work per message. In exchange, the system
cannot hallucinate availability — which would destroy trust with the first wrong answer.

---

## ADR-003 — Local LLM via Ollama instead of a hosted API

**Status:** accepted

**Context.** Per-token pricing makes unit economics unpredictable for a product sold
to small pharmacies. Sending customer health-adjacent conversations to a third party
also complicates GDPR compliance.

**Decision.** Run a quantised open model locally through Ollama, proxied by the backend
and never exposed to the frontend.

**Consequences.** Near-zero marginal AI cost and data stays within the deployment
perimeter. The trade-off is latency and RAM: Ollama is the memory-heavy component and
sets the 8 GB VPS floor. If latency proves unacceptable in the field, the AI service
is behind an interface and a hosted provider can be swapped in per-tenant.

---

## ADR-004 — Multi-tenancy by `tenant_id`, not database-per-tenant

**Status:** accepted

**Context.** The platform serves multiple pharmacies. Isolation is required; the
question is at which layer.

**Decision.** Logical isolation via a `tenant_id` column on every entity, enforced at
the repository layer.

**Consequences.** Simple to operate and cheap to run at the expected scale (tens of
pharmacies, not thousands). The isolation is logical rather than physical — a missing
tenant filter is a data leak, so tenant scoping must be enforced centrally and covered
by tests, never left to individual queries.

---

## ADR-005 — Stock is deducted on reservation creation and returned on cancellation

**Status:** accepted

**Context.** A reservation that does not hold stock is not a reservation. But stock
held by abandoned reservations silently disappears from the sellable inventory.

**Decision.** Stock is deducted atomically when a reservation enters `PENDENTE`, and
returned when it moves to `CANCELADA` or `EXPIRADA`. A scheduled job expires
reservations after `RESERVATION_EXPIRY_HOURS`. Every movement writes an
`InventoryHistory` row with reason and origin.

**Consequences.** Requires the expiry job to be reliable — without it, stock leaks. The
inventory history is what makes month-end discrepancies explainable.

---

## ADR-006 — Hexagonal architecture with DDD

**Status:** accepted

**Context.** The safety engine and reservation lifecycle are the parts most likely to
change and the most costly to get wrong.

**Decision.** Domain logic sits at the centre with no framework dependencies.
Infrastructure (REST, JPA, Ollama client) depends inward through ports.

**Consequences.** More initial structure than a layered CRUD app. Justified here
because the domain rules are genuinely non-trivial and must be unit-testable without
spinning up a database or a model.

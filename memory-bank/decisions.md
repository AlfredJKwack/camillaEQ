# Architecture Decision Records

This file tracks significant technical decisions made during development.

---

## ADR-001: Memory Bank Structure
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need a consistent way to track project context, decisions, and progress for both human developers and AI assistants.

### Decision
Implement a `memory-bank/` directory with the following structure:
- `projectbrief.md` - High-level project overview and goals
- `productContext.md` - Design philosophy, non-goals, and trade-offs
- `systemPatterns.md` - Architecture patterns and component relationships
- `techContext.md` - Technology stack and technical constraints
- `activeContext.md` - Current work focus and open questions
- `progress.md` - Milestone tracking and backlog
- `decisions.md` - This file, for ADRs

### Consequences
- **Positive:** Clear separation of concerns, easy onboarding, consistent context for AI assistance
- **Positive:** Lightweight, file-based approach suitable for version control
- **Negative:** Requires discipline to keep files updated
- **Negative:** Could become outdated if not maintained

---

---

## ADR-002: Backend Technology Stack
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need a lightweight, performant backend for LAN-only web UI server on low-power devices (Pi Zero-class). Requirements:
- Serve static assets
- Provide minimal REST API for config/OS queries
- NOT proxy real-time spectrum data
- Structured logging
- Low CPU/memory overhead

### Decision
- **Runtime:** Node.js
- **Framework:** Fastify (lightweight, high-performance, built-in Pino logging)
- **Logging:** Pino with JSON structured logs
- **Shell operations:** `child_process.spawn` with strict timeouts and argument whitelisting

### Consequences
- **Positive:** Fastify is extremely lightweight vs Express/alternatives
- **Positive:** Pino provides structured logging out-of-the-box with minimal overhead
- **Positive:** Node.js ecosystem mature for this use case
- **Negative:** Requires Node.js runtime on target device
- **Negative:** Must be disciplined about shell-out security

---

## ADR-003: Frontend Technology Stack
**Date:** 2026-01-22  
**Status:** Accepted  
**Updated:** 2026-01-22 (Svelte confirmed)

### Context
Need browser-based UI with high-performance real-time rendering, running on user's tablet/desktop. Requirements:
- Canvas rendering for spectrum @ ~10Hz (no DOM churn)
- SVG rendering for interactive EQ curves/tokens
- TypeScript preferred for maintainability
- Minimal build complexity

### Decision
- **Build tool:** Vite (fast dev server, optimized bundling)
- **Language:** TypeScript
- **UI Framework:** **Svelte** (confirmed choice)
  - Lightweight reactive runtime
  - Compiles to minimal JavaScript
  - No virtual DOM overhead
  - Minimal boilerplate for state management

### Consequences
- **Positive:** Vite provides instant HMR and optimized production builds
- **Positive:** Svelte compiles to minimal JavaScript, ideal for low-power device constraints
- **Positive:** TypeScript catches errors early, improves maintainability
- **Positive:** Svelte's reactivity model simplifies state synchronization between UI elements
- **Negative:** Svelte is less ubiquitous than React/Vue (smaller ecosystem)
- **Negative:** Team must learn Svelte conventions if unfamiliar
- **Negative:** Vanilla TS fallback option now closed (acceptable trade-off)

---

## ADR-004: WebSocket Topology (Critical)
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need real-time spectrum data (~10Hz) from CamillaDSP service. Two options:
1. Browser → Web Server → CamillaDSP (proxied)
2. Browser → CamillaDSP directly (Web Server uninvolved)

### Decision
**Browser connects directly to CamillaDSP WebSocket service** (Process A).

The web UI server (Process B) only serves static assets and REST API. It does NOT proxy WebSocket traffic.

### Consequences
- **Positive:** Eliminates server CPU/memory overhead for proxying high-frequency data
- **Positive:** Reduces latency (one fewer hop)
- **Positive:** Web server remains simple and stateless
- **Negative:** Browser must know CamillaDSP service address (handled via config endpoint)
- **Negative:** Two separate TCP connections to manage (REST + WS)

---

## ADR-005: Rendering Architecture (Critical)
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need to render two distinct visual layers:
1. High-frequency spectrum data (~10Hz updates)
2. Interactive EQ curves, tokens, controls (on user interaction)

### Decision
**Rendering split:**
- **Canvas:** Spectrum analyzer (10Hz redraw, minimal allocations, no DOM mutations)
- **SVG/DOM:** EQ curves, filter tokens/handles, interactive controls (incremental updates on interaction)

**Rules:**
- Spectrum rendering must NOT trigger DOM layout/reflow
- SVG updates must modify existing elements, not rebuild trees
- Canvas context is reused across frames

### Consequences
- **Positive:** Canvas avoids DOM overhead for high-frequency updates
- **Positive:** SVG provides crisp vector graphics, easy hit-testing, CSS styling for interactive elements
- **Positive:** Clear separation of concerns (fast path vs interactive path)
- **Negative:** Slightly more complex rendering pipeline (two layers to coordinate)
- **Negative:** Team must understand both Canvas and SVG APIs

---

## ADR-006: Band Color Persistence
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Per design-spec: each EQ band needs consistent visual identity across graph tokens, curves, and right-panel controls.

### Decision
- Each band has ONE persistent color for its lifetime
- Band color NEVER changes when frequency/type/Q changes
- Band color is applied consistently via CSS custom properties (`--band-color`, `--band-ink`, etc.)
- Disabled state uses same hue at reduced opacity, not different hue
- Filter type communicated by icon shape, not color

### Consequences
- **Positive:** Strong visual coherence across UI
- **Positive:** User learns band identity by color
- **Positive:** CSS theming via custom properties enables clean implementation
- **Negative:** Requires discipline to not "color by type" (common antipattern)
- **Negative:** 10+ bands may require secondary visual markers (dotted rings, dash patterns)

---

## ADR Template for Future Decisions

```markdown
## ADR-XXX: [Decision Title]
**Date:** YYYY-MM-DD  
**Status:** [Proposed | Accepted | Deprecated | Superseded]

### Context
[What is the issue that we're seeing that is motivating this decision or change?]

### Decision
[What is the change that we're proposing and/or doing?]

### Consequences
[What becomes easier or more difficult to do because of this change?]
- **Positive:** ...
- **Negative:** ...
```

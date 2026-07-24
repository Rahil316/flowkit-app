# FlowKit User Stories

> **Creation, collaboration, and research — all in one.**

## Platform Vision

FlowKit is a browser-based UI prototyping platform built around three values:

**Creation** — Anyone can build production-quality interactive prototypes. A non-developer directs AI agents; the platform's controlled, predictable structure ensures the agent knows exactly where to write, what shape the code must take, and what it must never touch. This is the core differentiator from open-ended vibe-coding: FlowKit gives agents a bounded surface, so the output is reliable and repeatable.

**Collaboration** — Prototypes are not static mockups. They are live, navigable, multi-screen flows that stakeholders can experience in a browser — no installation, no setup. Teams align faster when everyone is reacting to the same working thing, not a slide deck.

**Research** — Every prototype session is a data source. FlowLens records interactions, replays them, and exports structured analytics. UX researchers get real behavioral data from real prototype sessions — not guesses, not surveys.

---

## Users

| ID  | Role                   | Environment                        | Core Need                                       |
| --- | ---------------------- | ---------------------------------- | ----------------------------------------------- |
| U1  | Platform Developer     | `production` branch, full tooling  | Build and evolve FlowKit itself                 |
| U2  | Workspace Author       | `deployment` branch, CLI + browser | Create prototype flows, possibly via AI agents  |
| U3  | UX Researcher          | `deployment` browser + CLI         | Gather and export session data and feedback     |
| U4  | Stakeholder / Teammate | Browser or standalone HTML         | Experience and review flows, give feedback      |
| U5  | Workspace Recipient    | Handoff zip, no FlowKit needed     | Implement the real product from prototype specs |

---

## User Stories

### U1 — Platform Developer

> Owns the engine. Works in `production` with full access to `src/`, `scripts/lib/`, tests, lint, and docs. Responsible for the stability and evolution of the platform that everyone else depends on.

- As a platform developer, I want full lint, type-check, and test tooling so I can maintain quality and catch regressions before they reach workspace authors or agents.
- As a platform developer, I want CLI validation commands (`check`/`check:<domain>`, `agent:check`, `kit:check`) so I can verify platform integrity without manually inspecting files.
- As a platform developer, I want a version tagging workflow so I can record every iteration and recover any previous state of the platform when something breaks.
- As a platform developer, I want a strip script that generates the `deployment` branch from `production` automatically so I never manually maintain two diverging codebases.
- As a platform developer, I want the `deployment` branch to lock `src/` and `scripts/lib/` so workspace authors and agents cannot accidentally mutate the platform — keeping the engine stable and the workspace surface clean.
- As a platform developer, I want clear separation between platform code and workspace code so I can evolve the engine without breaking existing workspaces.

---

### U2 — Workspace Author

> The creator. May be a designer, PM, or researcher — not necessarily a developer. Directs AI agents (e.g. Claude Code) to author workspace files within the platform's defined conventions. The value proposition: get a working, navigable, data-connected prototype without writing code yourself. The platform's structure is what makes this possible — it gives the agent a predictable lane to work in.

- As a workspace author, I want a scaffolded workspace structure (`flowkit nw`) so an AI agent has an unambiguous starting point and knows exactly what to create and where.
- As a workspace author, I want the platform to define strict file and code conventions (`PageProps`, `defineFlow`, `pageMeta`) so agents produce consistent, correct output every time — not improvised variations.
- As a workspace author, I want `flowkit watch` to hot-reload workspace changes so I can see agent-authored screens appear in real time without restarting anything.
- As a workspace author, I want platform files locked in the `deployment` environment so agents I direct cannot accidentally edit the engine — only workspace files are in play.
- As a workspace author, I want `flowkit status` and `flowkit flowStory:ls` so I can understand what exists in my workspace at a glance, without reading code.
- As a workspace author, I want `flowkit export` to produce a standalone HTML file so I can share a working prototype with stakeholders instantly — no server, no setup on their end.
- As a workspace author, I want `flowkit handoff` to package my workspace into a structured deliverable so the workspace recipient gets everything they need to implement the real product.
- As a workspace author, I want the prototype to support real data states via the mock DB so the flows I author feel grounded and believable, not placeholder-filled.

---

### U3 — UX Researcher

> The analyst. Uses the browser-side FlowLens and the CLI data tools to turn prototype sessions into structured insight. Does not build flows — studies them. Needs data access without developer dependency.

- As a UX researcher, I want FlowLens session replay in the browser so I can watch exactly how users navigated a prototype — click paths, hesitations, dead ends — without interpreting raw data.
- As a UX researcher, I want `flowkit lens:report` to export a structured analytics JSON so I can import session data into my own analysis tools (spreadsheets, Python, BI dashboards).
- As a UX researcher, I want `flowkit sessions:ls`, `sessions:export`, and `sessions:stats` so I can audit what data has been collected and how much before deciding what to export.
- As a UX researcher, I want `flowkit sessions:purge` so I can clean up test or junk sessions before a real study run — keeping the data set clean.
- As a UX researcher, I want `flowkit feedback:ls` and `feedback:dump` so I can collect and export annotated feedback from prototype review sessions alongside the session recordings.
- As a UX researcher, I want all data tools to work without needing a developer present so I can run studies independently and on my own schedule.

---

### U4 — Stakeholder / Teammate

> The audience. Experiences the prototype as close to an end user as possible. Gives feedback that shapes the product direction. Should never need to install, configure, or understand FlowKit.

- As a stakeholder, I want a link or a file I can open in my browser so I can review a prototype without installing anything or asking for help.
- As a stakeholder, I want to navigate flows naturally — tapping, clicking, swiping — so I can experience the prototype the way a real user would, not as a passive slide viewer.
- As a stakeholder, I want the prototype to reflect realistic data and realistic device constraints so my feedback is grounded in what the product will actually feel like.
- As a stakeholder, I want to be able to leave comments or reactions during a review session so my feedback is captured in context, attached to the specific screen or moment that triggered it.
- As a stakeholder, I want the prototype to load fast and work offline (standalone export) so I can review it anywhere — in a meeting, on a plane, without a stable connection.

---

### U5 — Workspace Recipient

> The builder. Receives the finished prototype as a handoff artifact and uses it to implement the real product. Never interacts with FlowKit directly — the handoff zip is their only touchpoint. The quality of that zip determines how much back-and-forth they need with the workspace author.

- As a workspace recipient, I want a structured handoff zip with clearly named screens and flows so I can understand the full UX scope without a walkthrough call.
- As a workspace recipient, I want action notes on each flowplan step so I know what interaction triggers each transition — not just what the next screen is, but what causes the navigation.
- As a workspace recipient, I want the handoff to include the mock DB state for each screen so I understand the data shape behind every view and can map it to real API contracts.
- As a workspace recipient, I want screen metadata (labels, IDs, flow membership) so I can reference specific screens in tickets, PRs, and design conversations without ambiguity.
- As a workspace recipient, I want the handoff to be self-contained so I can reference it months later — after the workspace author has moved on — and still understand the intended behavior.

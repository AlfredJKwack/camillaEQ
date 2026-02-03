# Product Context
This project exists to provide the most refined, front end for camillaDSP, prioritizing clarity, precision, and responsiveness while remaining extremely lightweight in compute and memory usage server side. 

Many existing DSP control interfaces are either generic, visually cluttered, or resource-heavy, making them poorly suited for embedded or low-power systems. This project deliberately targets small-footprint devices (such as a Pi Zero) and treats limited CPU, memory, and I/O bandwidth as first-class constraints rather than afterthoughts. CPU intensive tasks are offloaded to the web browser used to access the camillaDSP back-end api.

The goal is not to expose every possible DSP feature, but to deliver a highly optimized, visually precise, and intuitive front-end experience that feels professional and immediate, even when hosted on minimal hardware. 

In short, this product aims to be:
	•	A best-in-class UI specifically for camillaDSP
	•	Visually and interaction-wise refined, not generic
	•	Efficient by design, suitable for always-on, low-power devices
	•	Focused on predictability, responsiveness, and correctness, not feature sprawl

## Non-Goals

To maintain focus, performance, and long-term maintainability, the following are explicitly not goals of this project:
	•	Not a generic DSP or audio-control framework. The UI and architecture are intentionally tailored to camillaDSP. Generalization for other DSP engines is out of scope unless it can be achieved without added complexity or overhead.
	•	Not a feature-maximal interface. Adding features at the expense of clarity, responsiveness, or resource usage is explicitly discouraged server side. Every feature must earn its place.
	•	Not optimized for high-powered hardware first. The system is designed with low-resource devices (e.g., Pi Zero–class hardware) to host the UI and configuration data. Performance on more powerful hardware is a byproduct, not the design target.
	•	Not a cloud-connected or internet-dependent system. Remote services, telemetry, user accounts, or cloud integrations are out of scope.

These non-goals are intentional and serve to protect the project’s core objective: a refined, predictable, and efficient equalizer front end for camillaDSP.

## Design Trade-offs We Accept

To achieve a refined, efficient, and predictable equalizer front end for camillaDSP, the project intentionally accepts the following trade-offs:
	•	Specialization over generality. The system favors a tightly scoped, camillaDSP-specific design rather than a flexible, abstracted architecture. This reduces complexity, improves performance, and enables deeper refinement at the cost of reuse.
	•	Clarity and responsiveness over feature breadth. A smaller, well-considered feature set is preferred to a larger, more complex one. Features that complicate the UI, increase cognitive load, or introduce performance risk may be excluded even if they are technically feasible.
	•	Deterministic behavior over dynamic cleverness. The design prioritizes predictable execution, explicit state transitions, and transparent data flow over dynamic or implicit mechanisms. This may result in more verbose or explicit code in exchange for reliability.
	•	Visual flourish is managed browser side, saving server resources and reducing latency. The UI is expected to be responsive and visually engaging, but the backend prioritizes stability
	•	CamillaDSP authority with optimistic UI. CamillaDSP service is the authoritative source for applied DSP state. The UI may update optimistically for immediate feedback, but must converge to DSP-confirmed state after uploads. Backend provides persistence and fallback, not authority.
	•	Early constraint enforcement over late flexibility. Parameter ranges, validation rules, and invariants are enforced as early as possible, even if this reduces perceived flexibility in the UI. This prevents invalid or undefined DSP states.
	•	Incremental capability over monolithic completeness. The system is expected to grow through well-defined milestones, each establishing stable behavior, rather than attempting to deliver a complete solution upfront.

These trade-offs are deliberate and should be preserved unless there is a compelling, explicitly justified reason to revisit them.
## Pipeline Editor Specification
### Goal: Implement a full featured pipeline editor for the application.

### Status
To Do.

### Deliverables:

#### 1. Purpose and Scope

The Pipeline Editor allows an advanced hobbyist user to inspect and modify the CamillaDSP pipeline live, while preventing the creation or application of invalid CamillaDSP configurations.

This editor is not a node-graph system and does not introduce new DSP concepts. It is a structured, linear editor over CamillaDSP’s pipeline[].

This editor will live in its own page and have an icon in the rail menu.

⸻

#### 2. In-Scope Capabilities (v1)

The Pipeline Editor MUST support the following:

##### 2.1 Pipeline Structure
	•	Reordering existing pipeline blocks
	•	Adding and removing:
	•	Filter blocks
	•	Mixer blocks
	•	Creating pipelines from scratch
	•	Operating on a maximum of:
	•	2 channels
	•	3 pipeline blocks
	•	20 filters per block

##### 2.2 Filters
	•	Filters appear as individual filter blocks
	•	Filters adhere strictly to:
	•	Existing CamillaDSP filter subclasses
	•	Existing filter type icons
	•	Existing knob styles (frequency, Q, gain)
	•	Existing color scheme
	•	Filter parameters beyond EQ MAY be edited where supported

##### 2.3 Mixers
	•	Mixers may be added, removed, and reordered
	•	Mixer routing MAY be edited for:
	•	Per-source gain
	•	Per-source inversion
	•	Mixers MUST NOT allow:
	•	Silent channel loss
	•	Summing without warning
	•	Gain > 0 dB summing

##### 2.4 Live DSP Interaction
	•	All valid edits apply live to the running DSP
	•	Invalid configurations MUST NOT be applied

⸻

#### 3. Relationship to the Existing EQ UI

##### 3.1 Shared Object Model
	•	The EQ UI and Pipeline Editor operate on the same underlying model
	•	There is no secondary representation
	•	Changes from either UI are immediately visible in the other

##### 3.2 EQ Representation
	•	EQ filters appear as individual filter blocks within the pipeline
	•	There is no single “EQ super-block”
	•	Ordering EQ filters relative to other pipeline elements is allowed

##### 3.3 Source of Truth
	•	The shared data model is authoritative
	•	No UI maintains a private copy of pipeline state

⸻

#### 4. UX Principles

The Pipeline Editor UI SHOULD adhere to the following principles:

##### 4.1 Signal Flow Clarity
	•	Signal flows top → bottom
	•	Visual order equals execution order
	•	No implicit reordering or grouping

##### 4.2 Physical Metaphor
	•	Blocks represent physical processing stages
	•	Reordering feels like moving hardware in a rack
	•	Bypass resembles hardware bypass

##### 4.3 Explicitness Over Convenience
	•	No auto-fixing
	•	No hidden routing
	•	No “smart” behavior

⸻

#### 5. Screen Layout

##### 5.1 Overall Layout
	•	Vertical stack of pipeline blocks
	•	Fixed-width column
	•	One block per pipeline step
```
[ Input ]
   ↓
[ Filter Block ]
   ↓
[ Mixer Block ]
   ↓
[ Filter Block ]
   ↓
[ Output ]
```
##### 5.2 Block Types

Each block is one of:
	•	Filter Block
	•	Mixer Block

Block type MUST be visually distinguishable.

⸻

#### 6. Component Responsibilities

##### 6.1 Pipeline Editor Container
	•	Renders pipeline blocks in execution order
	•	Handles drag-and-drop reordering
	•	Handles keyboard actions
	•	Delegates validation to existing validators

##### 6.2 Filter Block
	•	Displays:
	•	Filter type icon
	•	Filter number icon (if applicable)
	•	Parameter controls using existing knobs
	•	Supports:
	•	Enable / disable
	•	Remove
	•	Reflects validation state inline

##### 6.3 Mixer Block
	•	Displays:
	•	Summary view by default
	•	Collapsible detailed routing view
	•	Detailed view includes:
	•	Source → destination mapping
	•	Gain controls
	•	Inversion toggles
	•	Displays warnings for:
	•	Summing
	•	Attenuation enforcement
	•	Prevents invalid routing edits

⸻

#### 7. Interaction Rules

##### 7.1 Selection
	•	Single-selection only
	•	Selected block is visually highlighted

##### 7.2 Reordering
	•	Drag & drop reordering
	•	Button-based reordering (move up / down)

##### 7.3 Keyboard
	•	Delete: remove selected block
	•	Ctrl/Cmd + D: duplicate selected block (if valid)
	•	Arrow keys: move selection

##### 7.4 Add / Remove
	•	Add actions are explicit (buttons)
	•	Remove actions require selection

⸻

#### 8. Validation Rules

##### 8.1 Validation Timing
	•	Validation occurs continuously as the user edits

##### 8.2 Validation Enforcement
	•	Invalid states:
	•	Are visible
	•	Block DSP application
	•	Editor MUST NOT apply invalid configs to DSP

##### 8.3 Validation Scope

The editor must prevent:
	•	References to non-existent channels
	•	Invalid mixer routing
	•	Invalid filter parameter ranges
	•	Invalid pipeline ordering

##### 8.4 Responsibility
	•	The implementing LLM MUST:
	•	Wire existing validators
	•	Surface missing validators explicitly for follow-up

⸻

#### 9. Error States

##### 9.1 Presentation
	•	Errors are shown inline on the affected block
	•	Errors are descriptive and structural

Example:

“Mixer output channel 1 receives no input.”

##### 9.2 Severity
	•	Errors block DSP application
	•	Warnings allow DSP application but remain visible

⸻

#### 10. Persistence and Templates
	•	The Pipeline Editor:
	•	Reads from the shared model
	•	Pushes changes to the shared model
	•	It has no responsibility for:
	•	Loading templates
	•	Saving templates
	•	Diffing
	•	Versioning

⸻

#### 11. UI Metadata
	•	UI-only fields MAY be written into config
	•	UI metadata MUST be namespaced (e.g. ui:)
	•	DSP behavior MUST NOT depend on UI metadata

⸻

#### 12. Accessibility Notes
	•	All controls must be keyboard reachable
	•	Focus state must be visible
	•	Inline errors must be screen-reader accessible

⸻

#### 13. Explicit Non-Goals

The Pipeline Editor MUST NOT include:
	•	Node-graph editing
	•	Arbitrary DSP math
	•	Auto-optimization
	•	Smart routing
	•	Preset recommendation
	•	AI-driven behavior at runtime

⸻

#### 14. Implementation Guidance for LLMs

An implementing LLM should:
	•	Favor correctness over elegance
	•	Preserve explicit user intent
	•	Fail visibly rather than silently
	•	Never invent DSP abstractions
	•	Never “fix” user input without confirmation

⸻

#### 15. Completion Criteria

The Pipeline Editor is considered complete when:
	•	All valid CamillaDSP pipelines can be constructed
	•	Invalid pipelines cannot be applied
	•	EQ and Pipeline views remain synchronized
	•	No DSP behavior is hidden from the user
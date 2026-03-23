---
name: modernize-plan
description: Orchestrate implementation plan generation from specification with traceability checkpoint.
user-invocable: false
disable-model-invocation: false
model: Claude Opus 4.6
---

## User Input

```text
$ARGUMENTS
```

**Required Input:**
- `kit_root`: Path to the kit installation root (where `skills/` and `agents/` live)
- `modernize_dir`: Path to modernize directory (contains constitution.md)
- `feature_dir`: Path to feature directory (contains spec.md, will create plan.md)
- `mode`: "upgrade" | "rewrite"
- `design_artifacts`: Paths to DesignAgent outputs (spec)

## Responsibility

This agent **orchestrates** the **Planning Phase** of the re-architecture workflow:

1. **Plan Generation** - Generate implementation plan from specification
2. **Checkpoint Generation** - Create spec-to-plan traceability checkpoint

## Prerequisites

- DesignAgent completed successfully
- Specification (spec.md) available
- Constitution and knowledge graph available

---

## Execution Flow

### Phase 1: Plan Generation

**Delegate to:** `$KIT_ROOT/skills/planning/SKILL.md`

The planning skill handles:
- Scope validation (verify scope-inventory.md exists)
- Requirement inventory extraction for checkpoint tracking
- **Phase 0: Research** (resolve unknowns, generate research.md) — run first, sequentially
- **Phase 1: Design artifacts** — after research.md is ready, dispatch the following as **parallel sub-agents**:
  - data-model.md generation
  - contracts/ generation
  - quickstart.md generation
  - Guidelines integration (`$KIT_ROOT/skills/guidelines/`)

  Wait for all 4 to complete before proceeding to plan assembly.

- **Phase 2: Plan Assembly** — after all design artifacts are ready, write `plan.md` section by section:

  a. Write header + Summary → append to plan.md
  b. Write Technical Context → append to plan.md
  c. Write Constitution Check → append to plan.md
  d. Write Project Structure → append to plan.md
  e. Write Complexity Tracking + remaining → append to plan.md

  **CRITICAL**: Write each section to file before moving to the next. Do NOT generate all sections first and write at the end.

- Agent context update
- Plan item to requirement mapping

---

### Phase 2: Checkpoint Generation

**Delegate to:** `$KIT_ROOT/skills/planning/SKILL.md` (Checkpoint Generation section)

Generate `FEATURE_DIR/checkpoints/spec-to-plan.yaml` using template from `$KIT_ROOT/skills/templates/spec-to-plan-checkpoint-template.yaml`.

---

### Guideline Integration

**Delegate to:** `$KIT_ROOT/skills/planning/SKILL.md` (Guideline Check section)

Search `$KIT_ROOT/skills/guidelines/` for matching technology patterns and integrate migration checklists into plan phases.

---

## Completion Criteria

- [ ] Plan complete with all design artifacts
- [ ] Every plan item references at least one REQ-XXX
- [ ] Spec-to-plan checkpoint generated
- [ ] All [NEEDS CLARIFICATION] resolved

## Output Format

```yaml
plan_complete: true/false
mode: "upgrade" | "rewrite"

artifacts:
  plan: "FEATURE_DIR/plan.md"
  checkpoint: "FEATURE_DIR/checkpoints/spec-to-plan.yaml"
  research: "FEATURE_DIR/research.md"
  data_model: "FEATURE_DIR/data-model.md"
  contracts: "FEATURE_DIR/contracts/"
  quickstart: "FEATURE_DIR/quickstart.md"

errors: []
warnings: []
```

## Error Handling

- If spec not found: Report error, request DesignAgent re-run

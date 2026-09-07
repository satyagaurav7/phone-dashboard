### Observation 001: Audit every projection of canonical data

**Date:** 2026-09-07
**Session context:** Completing a phased Day board implementation from an existing design and handoff.
**Skill:** superpowers:executing-plans
**Type:** internal
**Phase/Area:** Final diff audit and acceptance verification
**Status:** OPEN

**Issue:** The central schedule and new execution board were correct, but a legacy Plan-tab timetable still projected retired commute and deep-work data. Unit tests around the new module did not expose the contradictory second presentation.

**Suggested improvement:** Add a pre-release projection audit to executing-plans: search for every renderer, export, cache, and denormalized dataset that presents the changed canonical concept, then add at least one cross-presentation consistency test.

**Principle:** A canonical model is only operationally canonical when every user-facing projection agrees with it; validating the new path alone can leave an older path actively misleading.

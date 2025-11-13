# Feature Guide: Prompt Review & Template Improvement System

## Purpose
Provide moderators and admins with tools to review LLM request/response pairs, identify deficiencies, and capture structured feedback.  
Enable an automated subsystem to analyze collected reviews and propose updates to the prompt templates used by the system.

---

## Functional Overview

### Access Control
- Accessible **only to users with Admin or Moderator roles**.
- Hidden from general users and game participants.
- Uses existing authentication and role-based access layers.

---

## Primary Components

### 1. Review Queue
A centralized queue of request/response pairs pending review.

**Capabilities**
- Display request/response items with relevant metadata (e.g., player, prompt template, time, reviewer status).
- Filter and sort by:
  - Player
  - Prompt Template
  - Completion Status (Unreviewed, In Progress, Completed)
  - Date Range
- Pagination and search integrated into the existing data retrieval system.

**Behavior**
- When a moderator selects an item, load the original request and response content for display.
- Queue status determined by presence or absence of an associated review artifact.

---

### 2. Review Workspace
A focused interface for viewing a single request/response pair and entering structured feedback.

**Layout**
- **Context Panel**: key metadata such as player, time, and template reference.
- **Request & Response Panels**: formatted text display with optional raw JSON view.
- **Review Form**:
  - Summary of deficiencies (short text)
  - Detailed notes (multiline or rich text)
  - Tags (predefined list; see below)
  - Severity rating (informational to critical)
  - Optional “Suggested Template Change” text
  - Save Draft / Complete Review actions

**Tag Suggestions**
Coverage gap, Hallucination, Tone mismatch, Style error, Instruction ignored, Context misuse, Verbosity issue, Output safety concern, Format violation.

**Completion Flow**
- Save draft for partial progress.
- Mark as “Complete” to finalize the review.
- On completion, persist structured review data to the existing storage system.

---

### 3. Review Persistence
All review data is stored using existing storage mechanisms.  
Each completed review links back to the original LLM request/response item.  
No changes are made to storage schemas outside the scope of adding this data structure.

**Review Record Contents**
- Reference to source request/response
- Reviewer and timestamps
- Template identifier
- Status, tags, severity, and feedback fields
- Optional suggested prompt change text

---

### 4. Template Proposal Subsystem
An automated analysis layer that periodically aggregates moderator reviews to identify recurring deficiencies and propose updates to prompt templates.

**Functions**
- Aggregate reviews by template.
- Summarize most frequent deficiencies and severity trends.
- Generate concise update proposals for prompt templates.
- Record proposals for later review by moderators and admins.

**Outputs**
- Human-readable proposals including:
  - Template identifier
  - Summary of issues
  - Proposed adjustments or example prompt modifications
  - Confidence or rationale metrics
- No direct modification to live templates; proposals are advisory.

**Processing Flow**
1. Collect completed reviews from storage.
2. Summarize recurring issues per template.
3. Invoke the existing LLM subsystem to draft updated prompt language.
4. Store and surface proposed updates for human approval.

---

### 5. Proposal Review Interface
- Displays automatically generated proposals.
- Lists template, summary, rationale, and date of generation.
- Allows moderators/admins to open detailed view showing:
  - Proposed template text or structured diff
  - Supporting evidence (linked reviews)
  - Confidence or frequency analysis

---

## States and Transitions

| State        | Description               | Next States   |
|---------------|---------------------------|----------------|
| Unreviewed    | No moderator feedback yet | In Progress    |
| In Progress   | Draft review saved        | Completed      |
| Completed     | Review finalized and stored | —            |

---

## Acceptance Criteria
- Page and related views accessible only to Admins and Moderators.
- Queue lists and filters available request/response pairs.
- Detailed review interface supports structured deficiency entry and completion.
- Reviews persist correctly and associate with the source data.
- Proposal subsystem periodically generates improvement suggestions based on completed reviews.
- Proposals are viewable and traceable back to their review sources.
- No changes to security, telemetry, or testing systems.

---

## Deliverables Summary
1. **Admin/Moderator Review Page**
   - Queue + Review Workspace
2. **Review Persistence Mechanism**
   - Structured, linked feedback records
3. **Proposal Generation Subsystem**
   - Automated prompt improvement drafts
4. **Proposal Review Page**
   - Listing and inspection of generated proposals

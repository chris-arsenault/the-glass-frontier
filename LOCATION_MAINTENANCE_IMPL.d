# Feature Guide: Location Dictionary Review & Update System

## Purpose
Provide moderators and admins with an interface to review, edit, and maintain the **Location Dictionary**, including graph-based relationships and descriptive metadata.
This feature ensures the world’s location network remains coherent, well-documented, and narratively consistent.

---

## Functional Overview

### Access Control
- Accessible **only to users with Admin or Moderator roles**.
- Hidden from general users and players.
- Integrated with existing authentication and role-based access systems.

---

## Primary Components

### 1. Location Review Dashboard
A top-level pane listing all locations and their key attributes for navigation and review.

**Capabilities**
- Display list or map view of locations.
- Columns/fields: Location Name, Type (e.g., Planet, City, Structure), Parent/Container, Number of Sub-Locations, Last Updated, Reviewer.
- Search and filter by:
  - Name
  - Location Type
  - Containing Location (graph parent)
  - Update Status (Unreviewed, Edited, Outdated)
- Supports both list view and collapsible tree view (hierarchical relationships).

**Behavior**
- Selecting a location opens the **Location Editor** (see below).
- Locations are fetched from the existing location store and represented as a graph (nodes and relationships).

---

### 2. Location Editor
An interactive editor for viewing and modifying a single location and its relationships within the graph.

**Layout**
- **Overview Panel**: Displays key metadata such as name, ID, type, creation date, and last modified timestamp.
- **Description Panel**: Editable text field for narrative description or environmental details.
- **Graph Panel**:
  - Visual representation of relationships.
  - Shows parent, siblings, and contained locations.
  - Allows creation, removal, or reassignment of edges.
- **Relationship Editor**:
  - Add or remove “CONTAINS” and “CONNECTED_TO” relationships.
  - Select target nodes via autocomplete or visual drag interaction.
  - Validate relationships to prevent cycles or duplicates.

**Editing Actions**
- Edit location name and description.
- Change or add relationships.
- Create new sub-locations (optionally from within editor).
- Save Draft or Publish Changes.

**Completion Flow**
- Drafts are saved to temporary storage or working set.
- Publishing writes changes to the primary location store and updates related graph nodes.

---

### 3. Graph Visualization and Navigation
A unified visual graph browser available within the location pane.

**Capabilities**
- Pan and zoom across all known locations.
- Click nodes to view or edit.
- Filter visible nodes by type, region, or connection type.
- Highlight affected nodes when editing relationships.
- Display warnings for dangling nodes or circular dependencies.

**Interactions**
- Click + drag to create or delete a relationship edge.
- Hover for tooltips with brief location summaries.
- Double-click node to open the Location Editor.

---

### 4. Suggested Fields per Location
| Field | Description |
|-------|--------------|
| **ID** | Unique location identifier |
| **Name** | Display name |
| **Type** | Classification (planet, region, structure, etc.) |
| **Parent** | Containing or higher-level location |
| **Children** | Contained sub-locations |
| **Connections** | Lateral relationships (CONNECTED_TO, ADJACENT_TO) |
| **Description** | Editable text describing the environment, history, or purpose |
| **Tags** | Optional metadata for filtering or narrative classification |
| **Last Reviewed** | Date and reviewer of last edit |

---

## Acceptance Criteria
- Pane accessible only to Admins and Moderators.
- List and graph views display all existing locations with filters and search.
- Editor supports editing of descriptions, relationships, and metadata.
- Graph interface allows intuitive navigation and visual modification of edges.
- Changes persist to the location store with full change tracking.
- Validation prevents invalid graph structures or incomplete records.
- Published updates immediately reflect in dependent systems (e.g., chronicles or narrative prompts).

---

## Deliverables Summary
1. **Location Review Dashboard**
   - List and tree views with filtering and search
2. **Location Editor**
   - Editing of descriptions and relationships
3. **Graph Visualization**
   - Interactive graph for visual relationship editing

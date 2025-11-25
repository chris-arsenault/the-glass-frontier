# Postgres Knowledge Graph Implementation (LLM-Ready)

This document specifies how to implement the unified Postgres-based knowledge graph for Characters, Locations, Chronicles, Turns, Factions, Items, Magic Concepts, and Knowledge Entities.

The design uses:
- A generic property graph (`node`, `edge`)
- Thin typed tables mapped 1:1 to nodes
- Recursive CTEs for graph traversal
- No denormalized neighbor metadata

---

# 1. Core Graph Tables

## node
CREATE TABLE node (
id         uuid PRIMARY KEY,
kind       text NOT NULL,
props      jsonb NOT NULL,
created_at timestamptz NOT NULL DEFAULT now()
);

## edge
CREATE TABLE edge (
id         uuid PRIMARY KEY,
src_id     uuid NOT NULL REFERENCES node(id) ON DELETE CASCADE,
dst_id     uuid NOT NULL REFERENCES node(id) ON DELETE CASCADE,
type       text NOT NULL,
props      jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamptz NOT NULL DEFAULT now()
);

## Indexes
CREATE INDEX edge_src_type_idx ON edge (src_id, type);
CREATE INDEX edge_dst_type_idx ON edge (dst_id, type);

---

# 2. Thin Typed Domain Tables

## character
CREATE TABLE character (
id     uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
name   text NOT NULL,
tags   text[] NOT NULL DEFAULT '{}'
);

## location
CREATE TABLE location (
id          uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
slug        text NOT NULL UNIQUE,
name        text NOT NULL,
biome       text NULL,
tags        text[] NOT NULL DEFAULT '{}',
ltree_path  ltree NULL
);

CREATE INDEX location_path_idx ON location USING gist (ltree_path);

## chronicle
CREATE TABLE chronicle (
id               uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
title            text NOT NULL,
primary_char_id  uuid REFERENCES character(id),
status           text NOT NULL DEFAULT 'active'
);

## chronicle_turn
CREATE TABLE chronicle_turn (
id             uuid PRIMARY KEY REFERENCES node(id) ON DELETE CASCADE,
chronicle_id   uuid NOT NULL REFERENCES chronicle(id) ON DELETE CASCADE,
turn_index     integer NOT NULL,
player_input   text NOT NULL,
gm_output      text NOT NULL,
intent_json    jsonb NOT NULL,
created_at     timestamptz NOT NULL DEFAULT now(),
UNIQUE (chronicle_id, turn_index)
);

---

# 3. Graph Relationships

Examples:
- Location: CONTAINS, ADJACENT_TO
- Chronicles: HAS_TURN, FOLLOWS
- Participation: PROTAGONIST_OF, ACTS_IN, SET_IN, INVOLVES_FACTION, USES_ITEM
- Knowledge: ABOUT_LOCATION, APPLIES_TO_CONCEPT, MENTIONS_KNOWLEDGE

---

# 4. Joining node -> typed tables

SELECT n.id, n.kind, n.props, c.name
FROM node n
JOIN character c ON c.id = n.id
WHERE n.id = :character_id;

SELECT n.id, n.kind, c.name, l.slug
FROM node n
LEFT JOIN character c ON c.id = n.id
LEFT JOIN location  l ON l.id = n.id;

---

# 5. Graph Traversal (Recursive CTE)

WITH anchor_nodes AS (
SELECT unnest(ARRAY[
:location_id::uuid,
:faction_id::uuid,
:item_id::uuid,
:turn_id::uuid,
:chronicle_id::uuid
]) AS id
),
walk AS (
SELECT n.id, 0 AS depth
FROM node n
JOIN anchor_nodes a ON a.id = n.id

UNION ALL

SELECT n2.id, w.depth + 1
FROM walk w
JOIN edge e  ON e.src_id = w.id
JOIN node n2 ON n2.id = e.dst_id
WHERE w.depth < :max_depth
)
SELECT DISTINCT k.*, MIN(w.depth) AS min_depth
FROM walk w
JOIN node k ON k.id = w.id
WHERE k.kind IN (
'LoreSnippet','RuleOfMagic','HistoricalEvent','Rumor','GMNote'
)
GROUP BY k.id, k.kind, k.props, k.created_at
ORDER BY min_depth ASC;

---

# 6. Implementation Rules

1. Create node + edge tables.
2. Create thin typed tables for character, location, chronicle, chronicle_turn.
3. Insert order: node → typed row → edges.
4. All relationships use edge.
5. Traversals use recursive CTEs.
6. Use kind for discriminating types.
7. Props jsonb for flexible metadata.
8. Do not build custom neighbor metadata.

---

# 7. Optional Extensions

- pgvector (semantic search)
- Apache AGE (Cypher-like queries)
- ltree (location containment)

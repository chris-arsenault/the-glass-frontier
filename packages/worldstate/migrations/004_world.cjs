/* eslint-disable no-undef */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../../../worldSchema.json');
const worldSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.createTable('world_prominence', {
    id: { type: 'text', primaryKey: true },
    rank: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('world_kind', {
    id: { type: 'text', primaryKey: true },
    category: { type: 'text' },
    display_name: { type: 'text' },
    default_status: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('world_subkind', {
    id: { type: 'text', notNull: true },
    kind_id: { type: 'text', notNull: true, references: 'world_kind(id)', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('world_subkind', 'world_subkind_pk', {
    primaryKey: ['id', 'kind_id'],
  });

  pgm.createTable('world_kind_status', {
    kind_id: { type: 'text', notNull: true, references: 'world_kind(id)', onDelete: 'CASCADE' },
    status: { type: 'text', notNull: true },
  });
  pgm.addConstraint('world_kind_status', 'world_kind_status_pk', {
    primaryKey: ['kind_id', 'status'],
  });

  pgm.createTable('world_relationship_kind', {
    id: { type: 'text', primaryKey: true },
    description: { type: 'text' },
  });

  pgm.createTable('world_relationship_rule', {
    relationship_id: {
      type: 'text',
      notNull: true,
      references: 'world_relationship_kind(id)',
      onDelete: 'CASCADE',
    },
    src_kind: { type: 'text', notNull: true, references: 'world_kind(id)', onDelete: 'CASCADE' },
    dst_kind: { type: 'text', notNull: true, references: 'world_kind(id)', onDelete: 'CASCADE' },
  });
  pgm.addConstraint('world_relationship_rule', 'world_relationship_rule_pk', {
    primaryKey: ['relationship_id', 'src_kind', 'dst_kind'],
  });

  pgm.createTable('hard_state', {
    id: { type: 'uuid', primaryKey: true, references: 'node(id)', onDelete: 'CASCADE' },
    slug: { type: 'text', notNull: true, unique: true },
    kind: { type: 'text', notNull: true, references: 'world_kind(id)', onDelete: 'RESTRICT' },
    subkind: { type: 'text' },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    prominence: {
      type: 'text',
      notNull: true,
      default: 'recognized',
      references: 'world_prominence(id)',
      onDelete: 'RESTRICT',
    },
    status: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('hard_state', 'hard_state_subkind_fk', {
    foreignKeys: {
      columns: ['subkind', 'kind'],
      references: 'world_subkind(id, kind_id)',
      onDelete: 'SET NULL',
    },
    deferrable: false,
  });
  pgm.addConstraint('hard_state', 'hard_state_status_fk', {
    foreignKeys: {
      columns: ['kind', 'status'],
      references: 'world_kind_status(kind_id, status)',
      onDelete: 'SET NULL',
    },
    deferrable: false,
  });
  pgm.createIndex('hard_state', 'kind', { name: 'hard_state_kind_idx' });
  pgm.createIndex('hard_state', 'slug', { name: 'hard_state_slug_idx', unique: true });
  pgm.addConstraint('hard_state', 'hard_state_prominence_check', {
    check: "prominence IN ('forgotten','marginal','recognized','renowned','mythic')",
  });

  pgm.createTable('lore_fragment', {
    id: { type: 'uuid', primaryKey: true, references: 'node(id)', onDelete: 'CASCADE' },
    entity_id: { type: 'uuid', notNull: true, references: 'hard_state(id)', onDelete: 'CASCADE' },
    chronicle_id: { type: 'uuid' },
    beat_id: { type: 'text' },
    title: { type: 'text', notNull: true },
    prose: { type: 'text', notNull: true },
    tags: { type: 'text[]', notNull: true, default: pgm.func(`'{}'::text[]`) },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('lore_fragment', ['entity_id', 'created_at'], {
    name: 'lore_fragment_entity_idx',
  });
  pgm.createIndex('lore_fragment', 'chronicle_id', { name: 'lore_fragment_chronicle_idx' });

  await seedWorldSchema(pgm, worldSchema);
};

exports.down = (pgm) => {
  pgm.dropIndex('lore_fragment', 'chronicle_id', { ifExists: true, name: 'lore_fragment_chronicle_idx' });
  pgm.dropIndex('lore_fragment', ['entity_id', 'created_at'], { ifExists: true, name: 'lore_fragment_entity_idx' });
  pgm.dropTable('lore_fragment', { ifExists: true });

  pgm.dropIndex('hard_state', 'kind', { ifExists: true, name: 'hard_state_kind_idx' });
  pgm.dropConstraint('hard_state', 'hard_state_status_fk', { ifExists: true });
  pgm.dropConstraint('hard_state', 'hard_state_subkind_fk', { ifExists: true });
  pgm.dropIndex('hard_state', 'slug', { ifExists: true, name: 'hard_state_slug_idx' });
  pgm.dropConstraint('hard_state', 'hard_state_prominence_check', { ifExists: true });
  pgm.dropTable('hard_state', { ifExists: true });
  pgm.dropTable('world_prominence', { ifExists: true });

  pgm.dropConstraint('world_relationship_rule', 'world_relationship_rule_pk', { ifExists: true });
  pgm.dropTable('world_relationship_rule', { ifExists: true });
  pgm.dropTable('world_relationship_kind', { ifExists: true });

  pgm.dropConstraint('world_kind_status', 'world_kind_status_pk', { ifExists: true });
  pgm.dropTable('world_kind_status', { ifExists: true });

  pgm.dropConstraint('world_subkind', 'world_subkind_pk', { ifExists: true });
  pgm.dropTable('world_subkind', { ifExists: true });

  pgm.dropTable('world_kind', { ifExists: true });
};

async function seedWorldSchema(pgm, schema) {
  if (!schema || !schema.kinds) {
    return;
  }

  pgm.sql(`INSERT INTO world_prominence (id, rank) VALUES
    ('forgotten', 0),
    ('marginal', 1),
    ('recognized', 2),
    ('renowned', 3),
    ('mythic', 4)
  ON CONFLICT (id) DO NOTHING`);

  const escape = (value) => {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  };

  for (const [kindId, kindDef] of Object.entries(schema.kinds)) {
    pgm.sql(`INSERT INTO world_kind (id, category, display_name, default_status)
             VALUES (${escape(kindId)}, ${escape(kindDef.category ?? null)}, ${escape(kindDef.displayName ?? null)}, ${escape(kindDef.defaultStatus ?? null)})
             ON CONFLICT (id) DO NOTHING`);
    for (const subkind of kindDef.subkinds ?? []) {
      pgm.sql(`INSERT INTO world_subkind (id, kind_id)
               VALUES (${escape(subkind)}, ${escape(kindId)})
               ON CONFLICT ON CONSTRAINT world_subkind_pk DO NOTHING`);
    }
    for (const status of kindDef.statuses ?? []) {
      pgm.sql(`INSERT INTO world_kind_status (kind_id, status)
               VALUES (${escape(kindId)}, ${escape(status)})
               ON CONFLICT ON CONSTRAINT world_kind_status_pk DO NOTHING`);
    }
  }

  if (schema.relationshipTypes) {
    for (const [relId, description] of Object.entries(schema.relationshipTypes)) {
      pgm.sql(`INSERT INTO world_relationship_kind (id, description)
               VALUES (${escape(relId)}, ${escape(description ?? null)})
               ON CONFLICT (id) DO NOTHING`);
    }
  }

  if (schema.relationships) {
    for (const [srcKind, destinations] of Object.entries(schema.relationships)) {
      for (const [dstKind, relationships] of Object.entries(destinations)) {
        for (const relationship of relationships) {
          pgm.sql(`INSERT INTO world_relationship_rule (relationship_id, src_kind, dst_kind)
                   VALUES (${escape(relationship)}, ${escape(srcKind)}, ${escape(dstKind)})
                   ON CONFLICT ON CONSTRAINT world_relationship_rule_pk DO NOTHING`);
        }
      }
    }
  }
}

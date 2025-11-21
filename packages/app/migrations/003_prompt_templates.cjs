/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.createTable(
    { schema: 'app', name: 'prompt_template' },
    {
      id: { type: 'text', primaryKey: true },
      body: { type: 'text', notNull: true },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    { schema: 'app', name: 'prompt_template_override' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      template_id: {
        type: 'text',
        notNull: true,
        references: '"app"."prompt_template"(id)',
        onDelete: 'CASCADE',
      },
      player_id: {
        type: 'text',
        notNull: true,
        references: '"app"."player"(id)',
        onDelete: 'CASCADE',
      },
      variant_id: { type: 'text', notNull: true },
      label: { type: 'text', notNull: true },
      body: { type: 'text', notNull: true },
      is_active: { type: 'boolean', notNull: true, default: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex(
    { schema: 'app', name: 'prompt_template_override' },
    ['template_id', 'player_id', 'variant_id'],
    { name: 'prompt_template_override_variant_idx', unique: true, ifNotExists: true }
  );
  pgm.sql(
    `CREATE UNIQUE INDEX IF NOT EXISTS prompt_template_override_active_idx
     ON app.prompt_template_override (template_id, player_id)
     WHERE is_active = true`
  );

  seedOfficialTemplates(pgm);
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'app', name: 'prompt_template_override' }, { ifExists: true });
  pgm.dropTable({ schema: 'app', name: 'prompt_template' }, { ifExists: true });
};

function seedOfficialTemplates(pgm) {
  const templateDir = path.resolve(__dirname, '../templates');
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Prompt template directory not found at ${templateDir}`);
  }
  const files = fs.readdirSync(templateDir).filter((file) => file.endsWith('.hbs'));
  for (const file of files) {
    const id = file.replace(/\.hbs$/, '');
    const body = normalizeTemplateBody(fs.readFileSync(path.join(templateDir, file), 'utf-8'));
    // Use dollar-quoted strings to avoid escaping issues
    // Replace single quotes with two single quotes for SQL escaping
    const escapedId = id.replace(/'/g, "''");
    const escapedBody = body.replace(/\$/g, '$$$$'); // Escape dollar signs
    pgm.sql(
      `INSERT INTO app.prompt_template (id, body, updated_at)
       VALUES ('${escapedId}', $$${escapedBody}$$, now())
       ON CONFLICT (id) DO UPDATE
       SET body = EXCLUDED.body, updated_at = now()`
    );
  }
}

const normalizeTemplateBody = (input) => {
  const normalized = input.replace(/\r\n/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
};

/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

exports.shorthands = undefined;

const CLOSURE_TEMPLATE_IDS = ['canon-extractor', 'canon-resolver', 'entity-summarizer'];

exports.up = (pgm) => {
  const templateDir = path.resolve(__dirname, '../templates');
  for (const id of CLOSURE_TEMPLATE_IDS) {
    const file = path.join(templateDir, `${id}.hbs`);
    const body = normalizeTemplateBody(fs.readFileSync(file, 'utf-8'));
    const escapedBody = body.replace(/\$/g, '$$$$');
    pgm.sql(
      `INSERT INTO app.prompt_template (id, body, updated_at)
       VALUES ('${id}', $$${escapedBody}$$, now())
       ON CONFLICT (id) DO UPDATE
       SET body = EXCLUDED.body, updated_at = now()`
    );
  }
};

exports.down = (pgm) => {
  for (const id of CLOSURE_TEMPLATE_IDS) {
    pgm.sql(`DELETE FROM app.prompt_template WHERE id = '${id}'`);
  }
};

const normalizeTemplateBody = (input) => {
  const normalized = input.replace(/\r\n/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
};

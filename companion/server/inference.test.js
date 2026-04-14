// Validates companion SimpleBPE.encode against Python GlubTokenizer oracle.
// Run via: cd companion && npm test
//
// Oracle from tests/fixtures/bpe_oracle.json (shared with desk-pet test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SimpleBPE } from './inference.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const TOKENIZER_PATH = path.join(REPO_ROOT, 'desk-pet', 'tokenizer.json');
const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'bpe_oracle.json');

async function loadTokenizer() {
  const raw = await readFile(TOKENIZER_PATH, 'utf8');
  return new SimpleBPE(JSON.parse(raw));
}

async function loadFixture() {
  const raw = await readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw);
}

test('companion SimpleBPE encode matches Python oracle (with specials)', async () => {
  const tok = await loadTokenizer();
  const fixture = await loadFixture();

  for (const entry of fixture.entries) {
    const actual = tok.encode(entry.prompt, true);
    assert.deepEqual(
      actual,
      entry.ids,
      `prompt=${JSON.stringify(entry.prompt)}\n  expected=${JSON.stringify(entry.ids)}\n  actual  =${JSON.stringify(actual)}`,
    );
  }
});

test('companion SimpleBPE encode matches Python oracle (no specials)', async () => {
  const tok = await loadTokenizer();
  const fixture = await loadFixture();

  for (const entry of fixture.entries) {
    const actual = tok.encode(entry.prompt, false);
    assert.deepEqual(
      actual,
      entry.ids_no_specials,
      `prompt=${JSON.stringify(entry.prompt)}\n  expected=${JSON.stringify(entry.ids_no_specials)}\n  actual  =${JSON.stringify(actual)}`,
    );
  }
});

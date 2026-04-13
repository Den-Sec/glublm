// companion/server/prompt-builder.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './prompt-builder.js';

describe('buildPrompt', () => {
  it('happy state produces clean prompt', () => {
    const prompt = buildPrompt('hello', { hunger: 90, cleanliness: 85, health: 100, bondLevel: 'familiar' });
    assert.equal(prompt, '[mood:happy] hello');
  });

  it('hungry state adds hunger tag', () => {
    const prompt = buildPrompt('hello', { hunger: 20, cleanliness: 85, health: 100, bondLevel: 'familiar' });
    assert.ok(prompt.includes('[mood:hungry]'));
    assert.ok(prompt.includes('hello'));
  });

  it('dirty water adds water tag', () => {
    const prompt = buildPrompt('hi', { hunger: 80, cleanliness: 15, health: 100, bondLevel: 'familiar' });
    assert.ok(prompt.includes('[water:dirty]'));
  });

  it('critical state produces dying tag', () => {
    const prompt = buildPrompt('hi', { hunger: 5, cleanliness: 5, health: 8, bondLevel: 'stranger' });
    assert.ok(prompt.includes('[mood:dying]'));
  });

  it('prompt stays compact (<30 chars prefix)', () => {
    const prompt = buildPrompt('test', { hunger: 10, cleanliness: 10, health: 5, bondLevel: 'bonded' });
    const prefix = prompt.replace('test', '').trim();
    assert.ok(prefix.length < 30, `prefix too long: "${prefix}" (${prefix.length})`);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverse, slug } from '../src/strings.mjs';

test('reverse', () => { assert.equal(reverse('hello'), 'olleh'); });
test('slug basic', () => { assert.equal(slug('Hello World'), 'hello-world'); });
test('slug collapses punctuation', () => { assert.equal(slug('foo -- bar!'), 'foo-bar'); });

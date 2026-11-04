import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCzechVocative } from '../src/utils/czechVocative';

test('correctly vocativizes user specified examples', () => {
  assert.strictEqual(toCzechVocative('David'), 'Davide');
  assert.strictEqual(toCzechVocative('Nela'), 'Nelo');
});

test('correctly vocativizes common Czech names', () => {
  assert.strictEqual(toCzechVocative('Petr'), 'Petře');
  assert.strictEqual(toCzechVocative('Tomáš'), 'Tomáši');
  assert.strictEqual(toCzechVocative('Jan'), 'Jane');
  assert.strictEqual(toCzechVocative('Jakub'), 'Jakube');
  assert.strictEqual(toCzechVocative('Eliška'), 'Eliško');
  assert.strictEqual(toCzechVocative('Tereza'), 'Terezo');
  assert.strictEqual(toCzechVocative('Lucie'), 'Lucie');
  assert.strictEqual(toCzechVocative('Marie'), 'Marie');
  assert.strictEqual(toCzechVocative('Matěj'), 'Matěji');
  assert.strictEqual(toCzechVocative('Martin'), 'Martine');
  assert.strictEqual(toCzechVocative('Adéla'), 'Adélo');
  assert.strictEqual(toCzechVocative('Vojta'), 'Vojto');
  assert.strictEqual(toCzechVocative('Honza'), 'Honzo');
  assert.strictEqual(toCzechVocative('Marek'), 'Marku');
});

test('handles full names by extracting first name', () => {
  assert.strictEqual(toCzechVocative('David Novák'), 'Davide');
  assert.strictEqual(toCzechVocative('Nela Dvořáková'), 'Nelo');
});

test('falls back gracefully when name is empty or undefined', () => {
  assert.strictEqual(toCzechVocative(null), 'studente');
  assert.strictEqual(toCzechVocative(''), 'studente');
  assert.strictEqual(toCzechVocative(undefined, 'učiteli'), 'učiteli');
});

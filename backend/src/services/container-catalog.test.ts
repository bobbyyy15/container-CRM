import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalCondition, canonicalSize, findConditionId, findSizeId } from './container-catalog';

const SIZES = ['10ft', '20ft', '20ft HC', '40ft HC', '45ft HC', '53ft HC'].map(name => ({ id: `size:${name}`, name }));
const CONDITIONS = ['Brand New', 'One Trip', 'Cargo Worthy', 'Wind and Watertight', 'As-Is', 'Refurbished', 'Modified', 'Used']
  .map(name => ({ id: `condition:${name}`, name }));

test('every catalog size is found from the way a spreadsheet writes it', () => {
  const cases: [string, string][] = [
    ['10ft', '10ft'], ["10'", '10ft'], ['10 FT', '10ft'],
    ['20ft', '20ft'], ["20'", '20ft'], ['20GP', '20ft'], ['20 DC', '20ft'], ['20 feet', '20ft'],
    ['20ft HC', '20ft HC'], ["20' High Cube", '20ft HC'],
    ['40ft HC', '40ft HC'], ["40' HC", '40ft HC'], ['40HC', '40ft HC'], ['40 ft High Cube', '40ft HC'], ['40HQ', '40ft HC'], ["40'Hi-Cube", '40ft HC'],
    ['45ft HC', '45ft HC'], ["45' HC", '45ft HC'],
    ['53ft HC', '53ft HC'], ['53 HC', '53ft HC'],
  ];
  for (const [typed, catalogName] of cases) {
    assert.equal(findSizeId(typed, SIZES), `size:${catalogName}`, typed);
  }
});

test('a size the catalog does not carry is left unmatched, not guessed', () => {
  assert.equal(findSizeId('40ft', SIZES), undefined, 'a standard 40ft is not a 40ft HC');
  assert.equal(findSizeId('30ft', SIZES), undefined);
  assert.equal(findSizeId('large', SIZES), undefined);
  assert.equal(findSizeId('', SIZES), undefined);
  assert.equal(canonicalSize(undefined), undefined);
});

test('every catalog condition is found from its name, its shorthand and its spellings', () => {
  const cases: [string, string][] = [
    ['Brand New', 'Brand New'], ['new', 'Brand New'],
    ['One Trip', 'One Trip'], ['one-trip', 'One Trip'], ['1 Trip', 'One Trip'],
    ['Cargo Worthy', 'Cargo Worthy'], ['CW', 'Cargo Worthy'], ['Cargo Worthy (CW)', 'Cargo Worthy'], ['cargo-worthy', 'Cargo Worthy'],
    ['Wind and Watertight', 'Wind and Watertight'], ['WWT', 'Wind and Watertight'], ['Wind & Water Tight', 'Wind and Watertight'], ['wind/watertight', 'Wind and Watertight'],
    ['As-Is', 'As-Is'], ['as is', 'As-Is'],
    ['Refurbished', 'Refurbished'], ['refurb', 'Refurbished'],
    ['Modified', 'Modified'], ['Used', 'Used'],
  ];
  for (const [typed, catalogName] of cases) {
    assert.equal(findConditionId(typed, CONDITIONS), `condition:${catalogName}`, typed);
  }
});

test('a condition still matches the catalog while it is named WWT', () => {
  const legacy = [{ id: 'wwt', name: 'WWT' }];
  assert.equal(findConditionId('Wind and Watertight', legacy), 'wwt');
  assert.equal(canonicalCondition('WWT'), canonicalCondition('Wind and Watertight'));
});

test('an unknown condition is left unmatched', () => {
  assert.equal(findConditionId('Damaged beyond repair', CONDITIONS), undefined);
  assert.equal(findConditionId('', CONDITIONS), undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCountryAbbr,
  formatStateAbbr,
  formatCityTitleCase,
  getStatesForCountry,
  getCountryForState,
  getCitiesForState,
  getCitiesForCountry,
  lookupCity,
} from './places';

test('formatCountryAbbr standardizes country names to uppercase abbreviations', () => {
  assert.equal(formatCountryAbbr('United States'), 'US');
  assert.equal(formatCountryAbbr('usa'), 'US');
  assert.equal(formatCountryAbbr('United States of America'), 'US');
  assert.equal(formatCountryAbbr('Canada'), 'CA');
  assert.equal(formatCountryAbbr('can'), 'CA');
  assert.equal(formatCountryAbbr('Mexico'), 'MX');
  assert.equal(formatCountryAbbr('US'), 'US');
  assert.equal(formatCountryAbbr(''), '');
  assert.equal(formatCountryAbbr(null), '');
});

test('formatStateAbbr standardizes state and province names to postal abbreviations', () => {
  assert.equal(formatStateAbbr('Texas'), 'TX');
  assert.equal(formatStateAbbr('texas'), 'TX');
  assert.equal(formatStateAbbr('California'), 'CA');
  assert.equal(formatStateAbbr('Ontario'), 'ON');
  assert.equal(formatStateAbbr('Quebec'), 'QC');
  assert.equal(formatStateAbbr('TX'), 'TX');
  assert.equal(formatStateAbbr(''), '');
  assert.equal(formatStateAbbr(null), '');
});

test('formatCityTitleCase converts city strings to clean Title Case', () => {
  assert.equal(formatCityTitleCase('houston'), 'Houston');
  assert.equal(formatCityTitleCase('LOS ANGELES'), 'Los Angeles');
  assert.equal(formatCityTitleCase('new york'), 'New York');
  assert.equal(formatCityTitleCase('salt lake city'), 'Salt Lake City');
  assert.equal(formatCityTitleCase(''), '');
  assert.equal(formatCityTitleCase(null), '');
});

test('getStatesForCountry narrows down states by country', () => {
  const usStates = getStatesForCountry('US');
  assert.equal(usStates.every(s => s.country === 'US'), true);
  assert.equal(usStates.some(s => s.code === 'TX'), true);
  assert.equal(usStates.some(s => s.code === 'ON'), false);

  const caProvinces = getStatesForCountry('CA');
  assert.equal(caProvinces.every(s => s.country === 'CA'), true);
  assert.equal(caProvinces.some(s => s.code === 'ON'), true);
  assert.equal(caProvinces.some(s => s.code === 'TX'), false);
});

test('getCountryForState returns country for state abbreviation', () => {
  assert.equal(getCountryForState('TX'), 'US');
  assert.equal(getCountryForState('Texas'), 'US');
  assert.equal(getCountryForState('ON'), 'CA');
  assert.equal(getCountryForState('Ontario'), 'CA');
  assert.equal(getCountryForState('XYZ'), undefined);
});

test('getCitiesForState returns only cities in selected state', () => {
  const txCities = getCitiesForState('TX');
  assert.equal(txCities.includes('Houston'), true);
  assert.equal(txCities.includes('Dallas'), true);
  assert.equal(txCities.includes('Los Angeles'), false);
  assert.equal(txCities.includes('Toronto'), false);

  const onCities = getCitiesForState('ON');
  assert.equal(onCities.includes('Toronto'), true);
  assert.equal(onCities.includes('Ottawa'), true);
  assert.equal(onCities.includes('Houston'), false);
});

test('lookupCity finds state and country for a city', () => {
  const houston = lookupCity('houston');
  assert.deepEqual(houston, { name: 'Houston', state: 'TX', country: 'US' });

  const toronto = lookupCity('toronto');
  assert.deepEqual(toronto, { name: 'Toronto', state: 'ON', country: 'CA' });

  const la = lookupCity('los angeles');
  assert.deepEqual(la, { name: 'Los Angeles', state: 'CA', country: 'US' });
});

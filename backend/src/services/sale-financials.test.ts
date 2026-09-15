import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSaleFinancials,
  masterpayTotalProfit,
  paymentOf,
  profitMargin,
  ratesFromTotals,
  saleTotalsColumns,
} from './sale-financials';

test('total buy, total sell, profit and margin follow from quantity and the two rates', () => {
  assert.deepEqual(computeSaleFinancials(3, 2000, 2800), {
    quantity: 3, buyingRate: 2000, sellingPrice: 2800,
    totalBuy: 6000, totalSell: 8400, profit: 2400, margin: 28.57,
  });
});

test('a sale at a loss keeps its negative profit and margin', () => {
  const money = computeSaleFinancials(2, 900, 400);
  assert.equal(money.profit, -1000);
  assert.equal(money.margin, -125);
});

test('margin is zero, not Infinity or NaN, when nothing was sold for money', () => {
  assert.equal(profitMargin(0, 0), 0);
  assert.equal(profitMargin(-500, 0), 0);
  assert.equal(computeSaleFinancials(1, 100, 0).margin, 0);
  assert.equal(computeSaleFinancials(1, 0, 0).margin, 0);
});

test('totals are rounded to the cent so float noise never reaches the database', () => {
  assert.deepEqual(saleTotalsColumns(3, 0.1, 0.2), { buying_cost: 0.3, revenue: 0.6, gross_profit: 0.3 });
});

test('rates are recovered from stored totals, and a zero quantity does not divide by zero', () => {
  assert.deepEqual(ratesFromTotals(4, 10_000, 14_000), { buyingRate: 2500, sellingPrice: 3500 });
  assert.deepEqual(ratesFromTotals(0, 10, 10), { buyingRate: 0, sellingPrice: 0 });
});

test('Masterpay total profit adds the mark-up and takes off the credit', () => {
  assert.equal(masterpayTotalProfit(2400, { additional_markup: '150', credit: 100 }), 2450);
  assert.equal(masterpayTotalProfit(2400, null), 2400);
});

test('Sales Tracker reads the payment date through from the Masterpay record', () => {
  const paid = { payment_status: 'Paid', payment_date: '2026-09-10', payment_amount: '8400.00' };
  assert.deepEqual(paymentOf(paid), { payment_status: 'Paid', payment_date: '2026-09-10', payment_amount: 8400 });
  assert.deepEqual(paymentOf([paid]), paymentOf(paid), 'an embedded array reads the same as an object');
});

test('a sale with no Masterpay record reads as unpaid with no payment date', () => {
  assert.deepEqual(paymentOf(null), { payment_status: 'Unpaid', payment_date: null, payment_amount: null });
  assert.deepEqual(paymentOf([]), { payment_status: 'Unpaid', payment_date: null, payment_amount: null });
});

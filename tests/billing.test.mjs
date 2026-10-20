import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  PASS_PLANS, getPlan, listPlans, verifyWebhookSignature, processRazorpayWebhook,
  entitlementSummary, assertCanStartStream, expireEntitlements
} from '../apps/server/billing.mjs';

const secret = 'test-webhook-secret';
const env = {
  ...process.env,
  RAZORPAY_PLAN_MONTHLY_SINGLE: 'plan_month_single_test',
  STREAM24_MONTHLY_SINGLE_AMOUNT_PAISE: '49900',
  RAZORPAY_PLAN_MONTHLY_FIVE: 'plan_month_five_test',
  STREAM24_MONTHLY_FIVE_AMOUNT_PAISE: '99900'
};
function db() {
  return { billingOrders: [], billingSubscriptions: [], billingPayments: [], entitlements: [], processedWebhookEvents: [], streams: [] };
}
function signed(body, eventId, targetDb, options = {}) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', options.secret || secret).update(rawBody).digest('hex');
  return processRazorpayWebhook({ rawBody, signature, eventId, secret, db: targetDb, env: options.env || env, now: options.now || Date.parse('2026-10-20T12:00:00Z') });
}
function paidOrderEvent({ orderId = 'order_1', paymentId = 'pay_1', amount = 3000, currency = 'INR', status = 'captured' } = {}) {
  return { event: 'order.paid', payload: { order: { entity: { id: orderId, status: 'paid' } }, payment: { entity: { id: paymentId, order_id: orderId, amount, currency, status } } } };
}

test('publishes the requested 24-hour pass prices and separate configured monthly plans', () => {
  assert.equal(PASS_PLANS['pass-single'].amountPaise, 3000);
  assert.equal(PASS_PLANS['pass-single'].maxConcurrentStreams, 1);
  assert.equal(PASS_PLANS['pass-five'].amountPaise, 9900);
  assert.equal(PASS_PLANS['pass-five'].maxConcurrentStreams, 5);
  assert.equal(getPlan('monthly-single', {}), null);
  assert.equal(getPlan('monthly-single', env).amountPaise, 49900);
  assert.equal(getPlan('monthly-five', env).maxConcurrentStreams, 5);
  assert.ok(listPlans(env).some(p => p.id === 'monthly-single' && p.recurring));
});

test('verifies HMAC-SHA256 against the exact raw webhook body', () => {
  const raw = Buffer.from('{"event":"order.paid"}');
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"other"}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(raw, signature, ''), false);
});

test('grants a single-stream 24-hour entitlement only for a matching captured order payment', () => {
  const store = db();
  store.billingOrders.push({ providerOrderId: 'order_1', ownerId: 'owner_1', planId: 'pass-single', amountPaise: 3000, currency: 'INR', status: 'CREATED' });
  const now = Date.parse('2026-10-20T12:00:00Z');
  const result = signed(paidOrderEvent(), 'evt_1', store, { now });
  assert.equal(result.outcome, 'entitlement_granted');
  assert.equal(store.entitlements.length, 1);
  assert.equal(store.entitlements[0].ownerId, 'owner_1');
  assert.equal(store.entitlements[0].maxConcurrentStreams, 1);
  assert.equal(Date.parse(store.entitlements[0].expiresAt) - Date.parse(store.entitlements[0].startsAt), 86400000);
});

test('rejects bad signatures and missing provider event IDs without granting access', () => {
  const store = db();
  store.billingOrders.push({ providerOrderId: 'order_1', ownerId: 'owner_1', planId: 'pass-single', amountPaise: 3000, currency: 'INR', status: 'CREATED' });
  const rawBody = Buffer.from(JSON.stringify(paidOrderEvent()));
  assert.throws(() => processRazorpayWebhook({ rawBody, signature: '0'.repeat(64), eventId: 'evt_bad', secret, db: store, env }), { statusCode: 401 });
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.throws(() => processRazorpayWebhook({ rawBody, signature, eventId: '', secret, db: store, env }), { statusCode: 400 });
  assert.equal(store.entitlements.length, 0);
});

test('webhook retries are idempotent by event ID and payment ID', () => {
  const store = db();
  store.billingOrders.push({ providerOrderId: 'order_1', ownerId: 'owner_1', planId: 'pass-single', amountPaise: 3000, currency: 'INR', status: 'CREATED' });
  assert.equal(signed(paidOrderEvent(), 'evt_1', store).outcome, 'entitlement_granted');
  assert.equal(signed(paidOrderEvent(), 'evt_1', store).duplicate, true);
  assert.equal(signed(paidOrderEvent(), 'evt_2', store).outcome, 'duplicate_payment');
  assert.equal(store.entitlements.length, 1);
  assert.equal(store.billingPayments.length, 1);
});

test('does not grant access when amount, currency, or captured status do not match', () => {
  const store = db();
  store.billingOrders.push({ providerOrderId: 'order_1', ownerId: 'owner_1', planId: 'pass-single', amountPaise: 3000, currency: 'INR', status: 'CREATED' });
  assert.equal(signed(paidOrderEvent({ amount: 1 }), 'evt_1', store).outcome, 'payment_mismatch');
  assert.equal(signed(paidOrderEvent({ paymentId: 'pay_2', status: 'authorized' }), 'evt_2', store).outcome, 'payment_mismatch');
  assert.equal(store.entitlements.length, 0);
});

test('monthly subscription charge creates a time-bounded entitlement and rejects duplicates', () => {
  const store = db();
  store.billingSubscriptions.push({ providerSubscriptionId: 'sub_1', ownerId: 'owner_1', planId: 'monthly-single', status: 'CREATED' });
  const body = { event: 'subscription.charged', payload: {
    subscription: { entity: { id: 'sub_1', status: 'active', current_end: Math.floor(Date.parse('2026-11-20T12:00:00Z') / 1000) } },
    payment: { entity: { id: 'pay_month_1', amount: 49900, currency: 'INR', status: 'captured' } }
  } };
  assert.equal(signed(body, 'evt_month_1', store).outcome, 'entitlement_granted');
  assert.equal(signed(body, 'evt_month_2', store).outcome, 'duplicate_payment');
  assert.equal(store.entitlements.length, 1);
  assert.equal(store.entitlements[0].planId, 'monthly-single');
  assert.equal(store.entitlements[0].expiresAt, '2026-11-20T12:00:00.000Z');
});

test('enforces server-side concurrent stream limits and expires entitlements', () => {
  const store = db();
  const start = '2026-10-20T12:00:00.000Z';
  store.entitlements.push({ id: 'ent_1', ownerId: 'owner_1', planId: 'pass-single', maxConcurrentStreams: 1, startsAt: start, expiresAt: '2026-10-21T12:00:00.000Z', status: 'ACTIVE' });
  store.streams.push({ id: 'stream_1', ownerId: 'owner_1', desiredRunning: true });
  assert.throws(() => assertCanStartStream(store, 'owner_1', 'stream_2', Date.parse(start)), { statusCode: 409, code: 'CONCURRENT_STREAM_LIMIT' });
  assert.equal(assertCanStartStream(store, 'owner_1', 'stream_1', Date.parse(start)).maxConcurrentStreams, 1);
  assert.equal(entitlementSummary(store, 'owner_1', Date.parse('2026-10-22T12:00:00Z')).active, false);
  assert.equal(expireEntitlements(store, Date.parse('2026-10-22T12:00:00Z')), true);
  assert.equal(store.entitlements[0].status, 'EXPIRED');
  assert.throws(() => assertCanStartStream(store, 'owner_1', 'stream_2', Date.parse('2026-10-22T12:00:00Z')), { statusCode: 402, code: 'ENTITLEMENT_REQUIRED' });
});

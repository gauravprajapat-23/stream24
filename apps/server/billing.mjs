import crypto from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_FALLBACK_MS = 30 * DAY_MS;
const CURRENCY = 'INR';

export const PASS_PLANS = Object.freeze({
  'pass-single': Object.freeze({ id: 'pass-single', name: '24-hour pass · 1 stream', kind: 'pass', amountPaise: 3000, currency: CURRENCY, maxConcurrentStreams: 1, durationMs: DAY_MS }),
  'pass-five': Object.freeze({ id: 'pass-five', name: '24-hour pass · up to 5 streams', kind: 'pass', amountPaise: 9900, currency: CURRENCY, maxConcurrentStreams: 5, durationMs: DAY_MS })
});

const MONTHLY_PLANS = {
  'monthly-single': { id: 'monthly-single', name: 'Monthly · 1 concurrent stream', kind: 'monthly', maxConcurrentStreams: 1, providerPlanEnv: 'RAZORPAY_PLAN_MONTHLY_SINGLE', amountEnv: 'STREAM24_MONTHLY_SINGLE_AMOUNT_PAISE' },
  'monthly-five': { id: 'monthly-five', name: 'Monthly · up to 5 concurrent streams', kind: 'monthly', maxConcurrentStreams: 5, providerPlanEnv: 'RAZORPAY_PLAN_MONTHLY_FIVE', amountEnv: 'STREAM24_MONTHLY_FIVE_AMOUNT_PAISE' }
};

export function getPlan(planId, env = process.env) {
  const pass = PASS_PLANS[planId];
  if (pass) return { ...pass };
  const base = MONTHLY_PLANS[planId];
  if (!base) return null;
  const providerPlanId = String(env[base.providerPlanEnv] || '').trim();
  const amountPaise = Number(env[base.amountEnv]);
  if (!providerPlanId || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) return null;
  return { id: base.id, name: base.name, kind: base.kind, amountPaise, currency: CURRENCY, maxConcurrentStreams: base.maxConcurrentStreams, providerPlanId };
}

export function listPlans(env = process.env) {
  return [...Object.keys(PASS_PLANS), ...Object.keys(MONTHLY_PLANS)]
    .map(id => getPlan(id, env))
    .filter(Boolean)
    .map(({ providerPlanId, durationMs, ...plan }) => ({ ...plan, durationHours: durationMs ? durationMs / 3600000 : null, recurring: plan.kind === 'monthly' }));
}

export function billingIsEnforced(env = process.env) {
  return String(env.STREAM24_SAAS_BILLING_ENFORCED || '').trim().toLowerCase() === 'true';
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let supplied;
  try {
    if (!/^[a-f0-9]{64}$/i.test(String(signature))) return false;
    supplied = Buffer.from(String(signature), 'hex');
  } catch {
    return false;
  }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function validNow(nowValue) {
  const value = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  return Number.isFinite(value) ? value : Date.now();
}

function grantEntitlement(db, { ownerId, plan, provider, paymentId, nowMs, periodEndSeconds = null }) {
  const existingPayment = db.billingPayments.find(p => p.providerPaymentId === paymentId);
  if (existingPayment) return { granted: false, duplicatePayment: true };
  const startsAt = new Date(nowMs).toISOString();
  let expiresAt;
  if (plan.kind === 'pass') {
    expiresAt = new Date(nowMs + plan.durationMs).toISOString();
  } else {
    const providerEnd = Number(periodEndSeconds) * 1000;
    expiresAt = new Date(Number.isFinite(providerEnd) && providerEnd > nowMs ? providerEnd : nowMs + MONTH_FALLBACK_MS).toISOString();
  }
  const entitlement = {
    id: `ent_${crypto.randomUUID()}`,
    ownerId,
    planId: plan.id,
    provider,
    providerPaymentId: paymentId,
    maxConcurrentStreams: plan.maxConcurrentStreams,
    startsAt,
    expiresAt,
    status: 'ACTIVE',
    createdAt: startsAt
  };
  db.billingPayments.push({ providerPaymentId: paymentId, ownerId, planId: plan.id, provider, amountPaise: plan.amountPaise, currency: plan.currency, capturedAt: startsAt });
  db.entitlements.push(entitlement);
  return { granted: true, entitlement };
}

function eventBody(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    const error = new Error('Webhook body is not valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export function processRazorpayWebhook({ rawBody, signature, eventId, secret, db, env = process.env, now = Date.now() }) {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    const error = new Error('Invalid Razorpay webhook signature.');
    error.statusCode = 401;
    throw error;
  }
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) {
    const error = new Error('Missing x-razorpay-event-id header.');
    error.statusCode = 400;
    throw error;
  }
  const duplicate = db.processedWebhookEvents.find(e => e.provider === 'razorpay' && e.eventId === normalizedEventId);
  if (duplicate) return { ok: true, duplicate: true, event: duplicate.event };

  const payload = eventBody(rawBody);
  const eventName = String(payload.event || '');
  const nowMs = validNow(now);
  let outcome = 'ignored';

  if (eventName === 'order.paid') {
    const payment = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;
    const providerOrderId = String(payment?.order_id || orderEntity?.id || '');
    const order = db.billingOrders.find(o => o.providerOrderId === providerOrderId);
    if (order && payment && String(payment.status || '').toLowerCase() === 'captured'
      && Number(payment.amount) === order.amountPaise && String(payment.currency || '') === order.currency) {
      order.status = 'PAID';
      order.providerPaymentId = String(payment.id || '');
      order.paidAt = new Date(nowMs).toISOString();
      const plan = getPlan(order.planId, env);
      if (plan && payment.id) {
        const result = grantEntitlement(db, { ownerId: order.ownerId, plan, provider: 'razorpay', paymentId: String(payment.id), nowMs });
        outcome = result.granted ? 'entitlement_granted' : 'duplicate_payment';
      }
    } else {
      outcome = order ? 'payment_mismatch' : 'unknown_order';
    }
  } else if (eventName === 'subscription.charged') {
    const subscription = payload.payload?.subscription?.entity;
    const payment = payload.payload?.payment?.entity;
    const providerSubscriptionId = String(subscription?.id || '');
    const local = db.billingSubscriptions.find(s => s.providerSubscriptionId === providerSubscriptionId);
    const plan = local ? getPlan(local.planId, env) : null;
    if (local && plan?.kind === 'monthly' && payment && String(payment.status || '').toLowerCase() === 'captured'
      && Number(payment.amount) === plan.amountPaise && String(payment.currency || '') === plan.currency && payment.id) {
      local.status = String(subscription?.status || local.status || 'active').toUpperCase();
      local.lastChargedAt = new Date(nowMs).toISOString();
      const result = grantEntitlement(db, {
        ownerId: local.ownerId,
        plan,
        provider: 'razorpay',
        paymentId: String(payment.id),
        nowMs,
        periodEndSeconds: subscription?.current_end
      });
      outcome = result.granted ? 'entitlement_granted' : 'duplicate_payment';
    } else {
      outcome = local ? 'payment_mismatch' : 'unknown_subscription';
    }
  } else if (eventName === 'subscription.cancelled' || eventName === 'subscription.halted' || eventName === 'subscription.completed') {
    const subscription = payload.payload?.subscription?.entity;
    const local = db.billingSubscriptions.find(s => s.providerSubscriptionId === String(subscription?.id || ''));
    if (local) {
      local.status = String(subscription?.status || eventName.split('.')[1] || 'inactive').toUpperCase();
      local.updatedAt = new Date(nowMs).toISOString();
      outcome = 'subscription_updated';
    }
  }

  db.processedWebhookEvents.push({ provider: 'razorpay', eventId: normalizedEventId, event: eventName, outcome, processedAt: new Date(nowMs).toISOString() });
  return { ok: true, duplicate: false, event: eventName, outcome };
}

export function entitlementSummary(db, ownerId, now = Date.now()) {
  const nowMs = validNow(now);
  const entitlements = db.entitlements
    .filter(e => e.ownerId === ownerId && e.status === 'ACTIVE' && Date.parse(e.startsAt) <= nowMs && Date.parse(e.expiresAt) > nowMs)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  const maxConcurrentStreams = entitlements.reduce((max, e) => Math.max(max, Number(e.maxConcurrentStreams || 0)), 0);
  return {
    active: entitlements.length > 0,
    maxConcurrentStreams,
    entitlements: entitlements.map(e => ({ id: e.id, planId: e.planId, maxConcurrentStreams: e.maxConcurrentStreams, startsAt: e.startsAt, expiresAt: e.expiresAt })),
    nextExpiryAt: entitlements[0]?.expiresAt || null
  };
}

export function assertCanStartStream(db, ownerId, streamId, now = Date.now()) {
  const summary = entitlementSummary(db, ownerId, now);
  if (!summary.active || summary.maxConcurrentStreams < 1) {
    const error = new Error('No active paid entitlement. Purchase a 24-hour pass or activate a monthly subscription before starting a stream.');
    error.statusCode = 402;
    error.code = 'ENTITLEMENT_REQUIRED';
    throw error;
  }
  const runningCount = db.streams.filter(s => s.ownerId === ownerId && s.id !== streamId && s.desiredRunning).length;
  if (runningCount >= summary.maxConcurrentStreams) {
    const error = new Error(`Your current plan allows ${summary.maxConcurrentStreams} concurrent stream(s); ${runningCount} are already running or starting.`);
    error.statusCode = 409;
    error.code = 'CONCURRENT_STREAM_LIMIT';
    throw error;
  }
  return summary;
}

export function expireEntitlements(db, now = Date.now()) {
  const nowMs = validNow(now);
  let changed = false;
  for (const entitlement of db.entitlements) {
    if (entitlement.status === 'ACTIVE' && Date.parse(entitlement.expiresAt) <= nowMs) {
      entitlement.status = 'EXPIRED';
      entitlement.updatedAt = new Date(nowMs).toISOString();
      changed = true;
    }
  }
  return changed;
}

export function createRazorpayOrder({ plan, ownerId, env = process.env, fetchImpl = fetch }) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.');
    error.statusCode = 503;
    throw error;
  }
  return fetchImpl('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      amount: plan.amountPaise,
      currency: plan.currency,
      receipt: `s24_${crypto.randomBytes(8).toString('hex')}`,
      notes: { ownerId, planId: plan.id }
    })
  }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id || Number(body.amount) !== plan.amountPaise || body.currency !== plan.currency) {
      const error = new Error('Razorpay order creation failed.');
      error.statusCode = 502;
      throw error;
    }
    return { id: body.id, amount: body.amount, currency: body.currency, status: body.status || 'created' };
  });
}

export async function createRazorpaySubscription({ plan, ownerId, env = process.env, fetchImpl = fetch }) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.');
    error.statusCode = 503;
    throw error;
  }
  if (plan.kind !== 'monthly' || !plan.providerPlanId) {
    const error = new Error('A configured monthly Razorpay plan is required.');
    error.statusCode = 503;
    throw error;
  }
  const headers = {
    authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    'content-type': 'application/json'
  };
  const planResponse = await fetchImpl(`https://api.razorpay.com/v1/plans/${encodeURIComponent(plan.providerPlanId)}`, { method: 'GET', headers });
  const providerPlan = await planResponse.json().catch(() => ({}));
  if (!planResponse.ok || Number(providerPlan.item?.amount) !== plan.amountPaise
    || String(providerPlan.item?.currency || '') !== plan.currency
    || String(providerPlan.period || '') !== 'monthly' || Number(providerPlan.interval) !== 1) {
    const error = new Error('The configured Razorpay plan must be a monthly plan whose amount and currency exactly match Stream24 configuration.');
    error.statusCode = 409;
    throw error;
  }
  const response = await fetchImpl('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      plan_id: plan.providerPlanId,
      total_count: 1200,
      quantity: 1,
      customer_notify: true,
      notes: { ownerId, planId: plan.id }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const error = new Error('Razorpay subscription creation failed.');
    error.statusCode = 502;
    throw error;
  }
  return { id: body.id, status: body.status || 'created', shortUrl: body.short_url || null };
}

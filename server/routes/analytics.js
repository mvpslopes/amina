'use strict';

const express = require('express');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function env(name, fallback) {
  const v = process.env[name];
  return v == null || String(v).trim() === '' ? fallback : String(v).trim();
}

function getConfig() {
  const propertyId = env('GA4_PROPERTY_ID', '');
  const clientEmail = env('GA4_CLIENT_EMAIL', '');
  const privateKeyRaw = env('GA4_PRIVATE_KEY', '');
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : '';
  const configured = !!(propertyId && clientEmail && privateKey);
  return { configured, propertyId, clientEmail, privateKey };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRows(rows, dKeys, mKeys) {
  return (rows || []).map((row) => {
    const out = {};
    dKeys.forEach((k, i) => {
      out[k] = row.dimensionValues && row.dimensionValues[i] ? row.dimensionValues[i].value : '';
    });
    mKeys.forEach((k, i) => {
      out[k] = toNum(row.metricValues && row.metricValues[i] ? row.metricValues[i].value : 0);
    });
    return out;
  });
}

async function runReport(client, propertyId, opts) {
  const [resp] = await client.runReport({
    property: `properties/${propertyId}`,
    ...opts,
  });
  return resp;
}

router.get('/summary', async (req, res) => {
  const cfg = getConfig();
  if (!cfg.configured) {
    return res.json({
      configured: false,
      error:
        'GA4 não configurado no backend. Defina GA4_PROPERTY_ID, GA4_CLIENT_EMAIL e GA4_PRIVATE_KEY no ambiente.',
    });
  }

  const daysRaw = Number(req.query.days);
  const days = [1, 7, 30, 90].includes(daysRaw) ? daysRaw : 7;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

  try {
    const client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: cfg.clientEmail,
        private_key: cfg.privateKey,
      },
    });

    const [rt, totals, timeline, byHour, byWeekday, byDevice, byBrowser, byOs, byChannel, byCountry, byCity, clicksByEvent] =
      await Promise.all([
        client.runRealtimeReport({
          property: `properties/${cfg.propertyId}`,
          metrics: [{ name: 'activeUsers' }],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          metrics: [
            { name: 'totalUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'eventCount' },
          ],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'hour' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ dimension: { dimensionName: 'hour' } }],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'dayOfWeekName' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'browser' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'operatingSystem' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'city' }, { name: 'country' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
        runReport(client, cfg.propertyId, {
          dateRanges,
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'CONTAINS', value: 'click' },
            },
          },
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 10,
        }),
      ]);

    const totalUsers = toNum(totals.rows?.[0]?.metricValues?.[0]?.value);
    const totalSessions = toNum(totals.rows?.[0]?.metricValues?.[1]?.value);
    const totalViews = toNum(totals.rows?.[0]?.metricValues?.[2]?.value);
    const totalEvents = toNum(totals.rows?.[0]?.metricValues?.[3]?.value);
    const totalClicks = mapRows(clicksByEvent.rows, ['eventName'], ['eventCount']).reduce(
      (acc, row) => acc + toNum(row.eventCount),
      0
    );

    const avgViewsPerVisitor = totalUsers > 0 ? totalViews / totalUsers : 0;
    const conversionRate = totalSessions > 0 ? (totalClicks / totalSessions) * 100 : 0;

    return res.json({
      configured: true,
      periodDays: days,
      onlineNow: toNum(rt?.[0]?.rows?.[0]?.metricValues?.[0]?.value),
      cards: {
        uniqueVisitors: totalUsers,
        totalVisits: totalSessions,
        totalViews,
        avgViewsPerVisitor,
        totalClicks,
        totalInteractions: totalEvents,
        conversionRate,
      },
      timeline: mapRows(timeline.rows, ['date'], ['users', 'sessions', 'views']),
      peakHours: mapRows(byHour.rows, ['hour'], ['sessions']),
      byWeekday: mapRows(byWeekday.rows, ['day'], ['sessions']),
      byDevice: mapRows(byDevice.rows, ['name'], ['sessions']),
      byBrowser: mapRows(byBrowser.rows, ['name'], ['sessions']),
      byOs: mapRows(byOs.rows, ['name'], ['sessions']),
      byChannel: mapRows(byChannel.rows, ['name'], ['sessions']),
      byCountry: mapRows(byCountry.rows, ['country'], ['sessions', 'views']),
      byCity: mapRows(byCity.rows, ['city', 'country'], ['sessions']),
      topClickedEvents: mapRows(clicksByEvent.rows, ['eventName'], ['eventCount']),
    });
  } catch (err) {
    return res.status(500).json({
      configured: false,
      error: 'Falha ao consultar GA4: ' + (err && err.message ? err.message : 'erro interno'),
    });
  }
});

module.exports = router;

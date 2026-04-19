/**
 * ETA Engine - Hybrid (Statistical + Kalman)
 */

const MAX_SPEED = 50;
const MAX_JUMP = 500;
const LAMBDA = 0.4;
const ALPHA = 0.3;
const MIN_SAMPLES = 3;
const MAX_HISTORY = 20;

const smoothedSpeeds = {};
const kalmanState = {};

function computeETA(duckId, historyRows, currentPos) {
  if (!historyRows || historyRows.length < 2) {
    return { eta: null, eta_low: null, eta_high: null, confidence: 0, speed_avg: null };
  }

  const sorted = [...historyRows].sort((a, b) => a.timestamp - b.timestamp);
  const now = Date.now();

  const samples = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const dp = prev.position - curr.position;
    const dt = (curr.timestamp - prev.timestamp) / 1000;

    if (dp <= 0 || dt <= 0) continue;

    const speed = dp / dt;
    if (speed >= MAX_SPEED) continue;
    if (dp >= MAX_JUMP) continue;

    samples.push({ speed, age: (now - curr.timestamp) / 1000 });
  }

  if (samples.length === 0) {
    return { eta: null, eta_low: null, eta_high: null, confidence: 0, speed_avg: null };
  }

  // --- Weighted mean ---
  const weights = samples.map(s => Math.exp(-LAMBDA * s.age));
  const wSum = weights.reduce((a, b) => a + b, 0);

  let mu = samples.reduce((acc, s, i) => acc + weights[i] * s.speed, 0) / wSum;

  // --- Variance ---
  let variance = samples.reduce((acc, s, i) => acc + weights[i] * (s.speed - mu) ** 2, 0) / wSum;
  let sigma = Math.sqrt(variance);

  // --- Outlier filtering ---
  const filtered = samples.filter((s) => Math.abs(s.speed - mu) <= 2 * sigma);

  if (filtered.length >= MIN_SAMPLES) {
    const fw = filtered.map(s => Math.exp(-LAMBDA * s.age));
    const fwSum = fw.reduce((a, b) => a + b, 0);

    mu = filtered.reduce((acc, s, i) => acc + fw[i] * s.speed, 0) / fwSum;

    variance = filtered.reduce((acc, s, i) => acc + fw[i] * (s.speed - mu) ** 2, 0) / fwSum;
    sigma = Math.sqrt(variance);
  }

  // --- Smoothing ---
  if (smoothedSpeeds[duckId] != null) {
    mu = ALPHA * mu + (1 - ALPHA) * smoothedSpeeds[duckId];
  }
  smoothedSpeeds[duckId] = mu;

  // --- Kalman layer ---
  if (!kalmanState[duckId]) {
    kalmanState[duckId] = { x: mu, p: 1 };
  }

  let { x, p } = kalmanState[duckId];

  const R = 0.5;
  const Q = 0.1;

  p = p + Q;

  const K = p / (p + R);
  x = x + K * (mu - x);
  p = (1 - K) * p;

  kalmanState[duckId] = { x, p };

  // --- HYBRID COMBINE (critical) ---
  mu = 0.7 * x + 0.3 * mu;

  if (mu <= 0) {
    return { eta: null, eta_low: null, eta_high: null, confidence: 0, speed_avg: mu };
  }

  // --- ETA ---
  const eta = currentPos / mu;
  const eta_low = currentPos / (mu + sigma);
  const eta_high = sigma > 0 && mu > sigma ? currentPos / (mu - sigma) : eta * 3;

  // --- Confidence ---
  const usedSamples = filtered.length >= MIN_SAMPLES ? filtered : samples;

  let confidence = 0;
  if (usedSamples.length >= MIN_SAMPLES) {
    const cv = sigma / mu;

    const stability = Math.max(0, 1 - cv);
    const sampleFactor = Math.min(1, usedSamples.length / 10);

    confidence = Math.round(stability * sampleFactor * 100);
  }

  return {
    eta: Math.round(eta),
    eta_low: Math.round(eta_low),
    eta_high: Math.round(eta_high),
    confidence,
    speed_avg: Math.round(mu * 1000) / 1000
  };
}

function formatETA(seconds) {
  if (seconds == null || seconds <= 0) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}p`;

  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);

  return m > 0 ? `${h}ó ${m}p` : `${h}ó`;
}

function formatETARange(eta_low, eta_high, confidence) {
  if (eta_low == null) return "⏱ ETA: nincs elég adat";

  const low = formatETA(eta_low);
  const high = formatETA(eta_high);
  const conf = confidence > 0 ? ` (${confidence}% biztos)` : "";

  return `⏱ ETA: ${low} – ${high}${conf}`;
}

module.exports = { computeETA, formatETA, formatETARange, MAX_HISTORY };

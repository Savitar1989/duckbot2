/**
 * ETA Engine - Weighted statistical model
 * Pipeline: raw speeds → filter → weighted mean (μ) → variance (σ)
 *           → outlier removal → recompute → ETA interval → confidence
 */

const MAX_SPEED = 50;    // positions/sec
const MAX_JUMP = 500;    // max position delta in one step
const LAMBDA = 0.4;      // exponential decay weight
const ALPHA = 0.3;       // smoothing factor for μ_final
const MIN_SAMPLES = 3;   // minimum valid samples for nonzero confidence
const MAX_HISTORY = 20;  // how many history points to keep per duck

// In-memory smoothed speed per duck (persisted across scans)
const smoothedSpeeds = {};

function computeETA(duckId, historyRows, currentPos) {
  if (!historyRows || historyRows.length < 2) {
    return { eta: null, eta_low: null, eta_high: null, confidence: 0, speed_avg: null };
  }

  // Sort oldest→newest
  const sorted = [...historyRows].sort((a, b) => a.timestamp - b.timestamp);
  const now = Date.now();

  // 1. Compute raw speed samples with timestamps
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

  // 2. Weighted mean (μ) - newer samples weigh more
  const weights = samples.map(s => Math.exp(-LAMBDA * s.age));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let mu = samples.reduce((acc, s, i) => acc + weights[i] * s.speed, 0) / wSum;

  // 3. Weighted variance (σ²)
  let variance = samples.reduce((acc, s, i) => acc + weights[i] * (s.speed - mu) ** 2, 0) / wSum;
  let sigma = Math.sqrt(variance);

  // 4. Outlier removal: discard |speed - μ| > 2σ
  const filtered = samples.filter((s, i) => Math.abs(s.speed - mu) <= 2 * sigma);

  if (filtered.length >= MIN_SAMPLES) {
    const fw = filtered.map(s => Math.exp(-LAMBDA * s.age));
    const fwSum = fw.reduce((a, b) => a + b, 0);
    mu = filtered.reduce((acc, s, i) => acc + fw[i] * s.speed, 0) / fwSum;
    variance = filtered.reduce((acc, s, i) => acc + fw[i] * (s.speed - mu) ** 2, 0) / fwSum;
    sigma = Math.sqrt(variance);
  }

  // 5. Smoothing with previous μ
  if (smoothedSpeeds[duckId] != null) {
    mu = ALPHA * mu + (1 - ALPHA) * smoothedSpeeds[duckId];
  }
  smoothedSpeeds[duckId] = mu;

  if (mu <= 0) {
    return { eta: null, eta_low: null, eta_high: null, confidence: 0, speed_avg: mu };
  }

  // 6. ETA interval
  const eta = currentPos / mu;
  const eta_low = currentPos / (mu + sigma);
  const eta_high = sigma > 0 && mu > sigma ? currentPos / (mu - sigma) : eta * 3;

  // 7. Confidence
  const usedSamples = filtered.length >= MIN_SAMPLES ? filtered : samples;
  let confidence = 0;
  if (usedSamples.length >= MIN_SAMPLES) {
    const cv = sigma / mu;
    confidence = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
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

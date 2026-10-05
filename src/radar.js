// Match what runs in an AWS account against retirements.yaml. Pure logic; the CLI does the I/O.
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const DAY = 86400000;
const SOON_DAYS = 90;
const UPCOMING_DAYS = 365;
// Worst first. "extended" = past standard support and paying for it (EKS, RDS).
const SEVERITY = ['retired', 'extended', 'soon', 'upcoming', 'ok', 'unknown'];

function loadRetirements(file = path.join(__dirname, '..', 'retirements.yaml')) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

// "13.12" -> "13", "9.6.24" -> "9.6", "8.0.35" -> "8.0", "5.7.mysql_aurora.2.11.2" -> "5.7"
function majorVersion(engine, version) {
  const parts = String(version || '').split('.');
  if (/postgres/.test(engine) && Number(parts[0]) >= 10) return parts[0];
  return parts.slice(0, 2).join('.');
}

const daysUntil = (date, now) => Math.ceil((Date.parse(date) - now) / DAY);
const byDays = (days) => (days <= SOON_DAYS ? 'soon' : days <= UPCOMING_DAYS ? 'upcoming' : 'ok');

// MSK reports "3.7.x.kraft"; the calendar lists "3.7.x".
const mskVersion = (v) => String(v || '').replace(/\.kraft$/, '');

// Per service: where its dates live, and what each status means for it in plain words.
const SERVICES = {
  EKS: {
    lookup: (db, i) => db.eks.versions[i.version],
    source: (db) => db.eks.source,
    retired: () => 'Extended support ended; AWS force-upgrades the control plane',
    extended: (db) => `Paid extended support until this date, then AWS force-upgrades. ${db.eks.cost}`,
    upcoming: () => 'Standard support ends; extended support charges start',
    monthlyCost: (db) => db.eks.monthlyCost,
  },
  RDS: {
    lookup: (db, i) => (db.rds.engines[i.engine] || {})[majorVersion(i.engine, i.version)],
    source: (db, i) => (db.rds.sources || {})[i.engine] || db.rds.source,
    retired: () => 'RDS Extended Support has ended; RDS upgrades the database',
    extended: (db) => `Paid Extended Support until this date. ${db.rds.cost}`,
    upcoming: () => 'Standard support ends; Extended Support billing starts',
  },
  ElastiCache: {
    lookup: (db, i) => (db.elasticache.engines[i.engine] || {})[String(i.version || '').split('.')[0]],
    source: (db) => db.elasticache.source,
    retired: () => 'Extended Support has ended; the version is end of life',
    extended: (db) => `Paid Extended Support until this date. ${db.elasticache.cost}`,
    upcoming: () => 'Standard support ends; Extended Support charges start',
  },
  OpenSearch: {
    lookup: (db, i) => db.opensearch.versions[i.version],
    source: (db) => db.opensearch.source,
    retired: () => 'Extended Support has ended; upgrade required',
    extended: (db) => `Paid Extended Support until this date. ${db.opensearch.cost}`,
    upcoming: () => 'Standard support ends; Extended Support charges start',
  },
  MSK: {
    lookup: (db, i) => db.msk.versions[mskVersion(i.version)],
    source: (db) => db.msk.source,
    retired: () => 'Past end of support: MSK can auto-upgrade the cluster at any time',
    upcoming: () => 'End of support; MSK auto-upgrades the cluster after this date',
  },
  Lambda: {
    lookup: (db, i) => db.lambda.runtimes[i.version],
    source: (db) => db.lambda.source,
    retired: () => 'Runtime deprecated: no security patches',
    upcoming: () => 'Runtime deprecation',
  },
};

// item: { service, region, resource, version, engine? }
function evaluate(item, db, now = Date.now()) {
  const svc = SERVICES[item.service];
  const f = { ...item, status: 'unknown', date: null, days: null, note: 'Version not in retirements.yaml', source: null };
  if (!svc || !db[item.service.toLowerCase()]) return f;
  f.source = svc.source(db, item);
  const raw = svc.lookup(db, item);
  if (raw === undefined) return f;                                  // not listed: unknown, never fine
  const v = typeof raw === 'string' ? { standard: raw } : raw || {};
  if (!v.standard) return { ...f, status: 'ok', note: 'No end of support announced' };

  const std = daysUntil(v.standard, now);
  const ext = v.extended ? daysUntil(v.extended, now) : null;
  if (ext !== null && ext < 0) return { ...f, status: 'retired', date: v.extended, days: ext, note: svc.retired(db) };
  if (std < 0) {
    if (ext === null || !svc.extended) return { ...f, status: 'retired', date: v.standard, days: std, note: svc.retired(db) };
    const out = { ...f, status: 'extended', date: v.extended, days: ext, note: svc.extended(db) };
    if (svc.monthlyCost) out.monthlyCost = svc.monthlyCost(db);
    return out;
  }
  return { ...f, status: byDays(std), date: v.standard, days: std, note: svc.upcoming(db) };
}

const sortFindings = (list) => [...list].sort((a, b) =>
  SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status) || (a.days ?? 1e9) - (b.days ?? 1e9));

// Exit non-zero in CI when anything is at or worse than `level`.
const failsAt = (findings, level) => {
  const max = SEVERITY.indexOf(level);
  return max >= 0 && findings.some((f) => f.status !== 'unknown' && SEVERITY.indexOf(f.status) <= max);
};

module.exports = { SEVERITY, SERVICES, loadRetirements, majorVersion, mskVersion, evaluate, sortFindings, failsAt };

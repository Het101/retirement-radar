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

// item: { service: 'EKS'|'RDS'|'Lambda', region, resource, version, engine? }
function evaluate(item, db, now = Date.now()) {
  const f = { ...item, status: 'unknown', date: null, days: null, note: 'Version not in retirements.yaml', source: null };
  if (item.service === 'EKS') {
    const v = db.eks.versions[item.version];
    f.source = db.eks.source;
    if (!v) return f;
    const std = daysUntil(v.standard, now);
    const ext = daysUntil(v.extended, now);
    if (ext < 0) return { ...f, status: 'retired', date: v.extended, days: ext, note: 'Extended support ended; AWS force-upgrades the control plane' };
    if (std < 0) return { ...f, status: 'extended', date: v.extended, days: ext, note: `Paid extended support until this date, then AWS force-upgrades. ${db.eks.cost}`, monthlyCost: db.eks.monthlyCost };
    return { ...f, status: byDays(std), date: v.standard, days: std, note: 'Standard support ends; extended support charges start' };
  }
  if (item.service === 'RDS') {
    const major = majorVersion(item.engine, item.version);
    const v = (db.rds.engines[item.engine] || {})[major];
    f.source = db.rds.source;
    if (!v) return f;
    const std = daysUntil(v.standard, now);
    if (std < 0) return { ...f, status: 'extended', date: v.standard, days: std, note: `Past standard support. ${db.rds.cost}` };
    return { ...f, status: byDays(std), date: v.standard, days: std, note: 'Standard support ends; Extended Support billing starts' };
  }
  if (item.service === 'Lambda') {
    const date = db.lambda.runtimes[item.version];
    f.source = db.lambda.source;
    if (!date) return f;
    const d = daysUntil(date, now);
    if (d < 0) return { ...f, status: 'retired', date, days: d, note: 'Runtime deprecated: no security patches' };
    return { ...f, status: byDays(d), date, days: d, note: 'Runtime deprecation' };
  }
  return f;
}

const sortFindings = (list) => [...list].sort((a, b) =>
  SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status) || (a.days ?? 1e9) - (b.days ?? 1e9));

// Exit non-zero in CI when anything is at or worse than `level`.
const failsAt = (findings, level) => {
  const max = SEVERITY.indexOf(level);
  return max >= 0 && findings.some((f) => f.status !== 'unknown' && SEVERITY.indexOf(f.status) <= max);
};

module.exports = { SEVERITY, loadRetirements, majorVersion, evaluate, sortFindings, failsAt };

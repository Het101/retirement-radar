#!/usr/bin/env node
// retirement-radar scan: read-only. Runs the AWS CLI you already have (your profiles, SSO, roles),
// calls only list/describe APIs, and prints what is near end of support. Nothing is sent anywhere.
const { execFile } = require('node:child_process');
const { SEVERITY, loadRetirements, evaluate, sortFindings, failsAt } = require('./radar');

const HELP = `Usage: retirement-radar scan [options]

Options:
  --region a,b       Regions to scan (default: every enabled region)
  --profile name     AWS CLI profile
  --json             Print findings as JSON
  --all              Also list resources that are fine
  --fail-on level    Exit 1 if anything is at this level or worse: ${SEVERITY.slice(0, 4).join(', ')}
  --data file        Use your own retirements.yaml
`;

function parseArgs(argv) {
  const o = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--all') o[a.slice(2)] = true;
    else if (['--region', '--profile', '--fail-on', '--data'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

function awsRunner(profile) {
  return (args, region) => new Promise((resolve, reject) => {
    const full = [...args, '--output', 'json', ...(region ? ['--region', region] : []), ...(profile ? ['--profile', profile] : [])];
    execFile('aws', full, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return reject(new Error('AWS CLI not found. Install AWS CLI v2 and sign in (aws configure / aws sso login).'));
      if (err) return reject(new Error((stderr || err.message).trim().split('\n').pop()));
      try { resolve(JSON.parse(stdout || '{}')); } catch { reject(new Error('Unexpected AWS CLI output')); }
    });
  });
}

const DB_ENGINE = /^(aurora|mysql|postgres|mariadb|oracle|sqlserver)/;

async function collectRegion(region, aws, warn) {
  const items = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { warn(`${region} ${label}: ${e.message}`); } };
  await Promise.all([
    step('EKS', async () => {
      const { clusters = [] } = await aws(['eks', 'list-clusters'], region);
      for (const name of clusters) {
        const { cluster } = await aws(['eks', 'describe-cluster', '--name', name], region);
        items.push({ service: 'EKS', region, resource: name, version: cluster.version });
      }
    }),
    step('RDS', async () => {
      const [{ DBInstances = [] }, { DBClusters = [] }] = await Promise.all([
        aws(['rds', 'describe-db-instances'], region), aws(['rds', 'describe-db-clusters'], region)]);
      // Cluster members share the cluster's engine version: report the cluster once.
      for (const i of DBInstances) if (!i.DBClusterIdentifier && DB_ENGINE.test(i.Engine)) {
        items.push({ service: 'RDS', region, resource: i.DBInstanceIdentifier, engine: i.Engine, version: i.EngineVersion });
      }
      for (const c of DBClusters) if (DB_ENGINE.test(c.Engine)) {
        items.push({ service: 'RDS', region, resource: c.DBClusterIdentifier, engine: c.Engine, version: c.EngineVersion });
      }
    }),
    step('Lambda', async () => {
      const { Functions = [] } = await aws(['lambda', 'list-functions'], region);
      for (const f of Functions) if (f.Runtime) items.push({ service: 'Lambda', region, resource: f.FunctionName, version: f.Runtime });
    }),
  ]);
  return items;
}

async function scan({ regions, aws, db, now = Date.now(), warn = () => {} }) {
  if (!regions || !regions.length) {
    const { Regions = [] } = await aws(['ec2', 'describe-regions'], 'us-east-1');
    regions = Regions.map((r) => r.RegionName);
  }
  const items = (await Promise.all(regions.map((r) => collectRegion(r, aws, warn)))).flat();
  return sortFindings(items.map((i) => evaluate(i, db, now)));
}

// ── Output ─────────────────────────────────────────────────────
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const COLOR = { retired: 31, extended: 31, soon: 33, upcoming: 36, ok: 32, unknown: 90 };

function table(findings) {
  const rows = findings.map((f) => [f.status.toUpperCase(), f.service, f.region, f.resource,
    f.engine ? `${f.engine} ${f.version}` : f.version, f.date ? `${f.date} (${f.days < 0 ? `${-f.days}d ago` : `in ${f.days}d`})` : '-', f.note]);
  const head = ['STATUS', 'SERVICE', 'REGION', 'RESOURCE', 'VERSION', 'DATE', 'WHAT IT MEANS'];
  const w = head.map((h, c) => Math.max(h.length, ...rows.map((r) => String(r[c]).length)));
  const line = (r, status) => r.map((v, c) => {
    if (c === r.length - 1) return v;
    const cell = String(v).padEnd(w[c]);
    return c === 0 && status ? paint(COLOR[status], cell) : cell;
  }).join('  ');
  return [paint(1, line(head)), ...rows.map((r, i) => line(r, findings[i].status))].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message + '\n\n' + HELP); return 2; }
  if (o.cmd !== 'scan') { console.log(HELP); return o.cmd ? 2 : 0; }
  const db = loadRetirements(o.data);
  const warnings = [];
  let findings;
  const aws = awsRunner(o.profile);
  try {
    // Fail fast with one clear message instead of a warning per region.
    const id = await aws(['sts', 'get-caller-identity']);
    if (!o.json) console.log(paint(90, `Scanning AWS account ${id.Account} (read-only)...
`));
    findings = await scan({ regions: o.region && o.region.split(','), aws, db, warn: (w) => warnings.push(w) });
  } catch (e) { console.error(`retirement-radar: ${e.message}`); return 2; }

  if (o.json) {
    console.log(JSON.stringify({ dataUpdated: db.updated, findings, warnings }, null, 2));
  } else {
    const shown = o.all ? findings : findings.filter((f) => f.status !== 'ok');
    const count = (s) => findings.filter((f) => f.status === s).length;
    if (shown.length) console.log(table(shown) + '\n');
    const eksExtra = findings.reduce((n, f) => n + (f.monthlyCost || 0), 0);
    const tally = SEVERITY.map((s) => count(s) && `${count(s)} ${s}`).filter(Boolean).join(', ');
    console.log(`${findings.length} resources scanned${tally ? `: ${tally}` : ''}.`);
    if (eksExtra) console.log(paint(31, `EKS extended support is costing about $${eksExtra.toLocaleString()} a month.`));
    if (count('unknown')) console.log(paint(90, 'Unknown = version not in retirements.yaml yet. PRs with a source link welcome.'));
    if (!o.all && count('ok')) console.log(paint(90, `${count('ok')} fine (more than a year left); --all lists them.`));
    console.log(paint(90, `Dates updated ${db.updated}. Sources: ${[db.eks.source, db.rds.source, db.lambda.source].join(' ')}`));
    for (const w of warnings) console.error(paint(33, `warning: ${w}`));
  }
  return o['fail-on'] && failsAt(findings, o['fail-on']) ? 1 : 0;
}

if (require.main === module) main().then((code) => { process.exitCode = code; });
module.exports = { main, scan, parseArgs, table };

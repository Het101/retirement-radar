const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadRetirements, majorVersion, evaluate, failsAt } = require('../src/radar');
const { scan } = require('../src/cli');

const db = loadRetirements();
const NOW = Date.parse('2026-10-04T00:00:00Z');

test('retirements.yaml: every date parses and every section has a source', () => {
  for (const s of ['eks', 'rds', 'lambda']) assert.match(db[s].source, /^https:\/\//);
  const dates = [
    ...Object.values(db.eks.versions).flatMap((v) => [v.standard, v.extended]),
    ...Object.values(db.rds.engines).flatMap((e) => Object.values(e).map((v) => v.standard)),
    ...Object.values(db.lambda.runtimes),
  ];
  for (const d of dates) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)), d);
});

test('majorVersion handles postgres, mysql and aurora version strings', () => {
  assert.equal(majorVersion('postgres', '13.12'), '13');
  assert.equal(majorVersion('postgres', '9.6.24'), '9.6');
  assert.equal(majorVersion('mysql', '8.0.35'), '8.0');
  assert.equal(majorVersion('aurora-mysql', '5.7.mysql_aurora.2.11.2'), '5.7');
});

test('evaluate: EKS standard / extended / retired, RDS extended, Lambda, unknown', () => {
  const e = (item) => evaluate(item, db, NOW).status;
  assert.equal(e({ service: 'EKS', version: '1.27' }), 'retired');
  assert.equal(e({ service: 'EKS', version: '1.31' }), 'extended');
  assert.equal(evaluate({ service: 'EKS', version: '1.31' }, db, NOW).monthlyCost, 365);
  assert.equal(e({ service: 'EKS', version: '1.33' }), 'extended');
  assert.equal(e({ service: 'RDS', engine: 'postgres', version: '13.12' }), 'extended');
  assert.equal(e({ service: 'RDS', engine: 'postgres', version: '14.9' }), 'upcoming');
  assert.equal(e({ service: 'RDS', engine: 'postgres', version: '16.1' }), 'ok');
  assert.equal(e({ service: 'Lambda', version: 'nodejs18.x' }), 'retired');
  assert.equal(e({ service: 'Lambda', version: 'dotnet8' }), 'soon');
  assert.equal(e({ service: 'Lambda', version: 'nodejs99.x' }), 'unknown');
});

test('scan: walks regions through the AWS CLI, skips cluster members, sorts worst first', async () => {
  const calls = [];
  const fake = {
    'eks list-clusters': { clusters: ['prod'] },
    'eks describe-cluster': { cluster: { version: '1.29' } },
    'rds describe-db-instances': { DBInstances: [
      { DBInstanceIdentifier: 'db1', Engine: 'postgres', EngineVersion: '16.2' },
      { DBInstanceIdentifier: 'aurora-1', DBClusterIdentifier: 'aur', Engine: 'aurora-mysql', EngineVersion: '5.7.mysql_aurora.2.11.2' },
    ] },
    'rds describe-db-clusters': { DBClusters: [
      { DBClusterIdentifier: 'aur', Engine: 'aurora-mysql', EngineVersion: '5.7.mysql_aurora.2.11.2' },
      { DBClusterIdentifier: 'graph', Engine: 'neptune', EngineVersion: '1.2' },
    ] },
    'lambda list-functions': { Functions: [{ FunctionName: 'api', Runtime: 'python3.9' }, { FunctionName: 'img' }] },
  };
  const aws = async (args, region) => { calls.push(region); return fake[args.slice(0, 2).join(' ')]; };
  const f = await scan({ regions: ['eu-west-1'], aws, db, now: NOW });
  assert.deepEqual(f.map((x) => `${x.status}:${x.resource}`), ['retired:api', 'retired:prod', 'extended:aur', 'ok:db1'], 'oldest retirement first');
  assert.ok(calls.every((r) => r === 'eu-west-1'));
  assert.equal(failsAt(f, 'retired'), true);
  assert.equal(failsAt([{ status: 'ok' }, { status: 'unknown' }], 'upcoming'), false);
});

test('scan: one failing service becomes a warning, not a crash', async () => {
  const warnings = [];
  const aws = async (args) => {
    if (args[0] === 'rds') throw new Error('AccessDenied');
    return args[0] === 'eks' ? { clusters: [] } : { Functions: [] };
  };
  const f = await scan({ regions: ['us-east-1'], aws, db, now: NOW, warn: (w) => warnings.push(w) });
  assert.deepEqual(f, []);
  assert.deepEqual(warnings, ['us-east-1 RDS: AccessDenied']);
});

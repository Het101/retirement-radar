const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadRetirements, majorVersion, evaluate, failsAt } = require('../src/radar');
const { scan } = require('../src/cli');

const db = loadRetirements();
const NOW = Date.parse('2026-10-04T00:00:00Z');

test('retirements.yaml: every date parses, every section has a source, extended never precedes standard', () => {
  const sections = ['eks', 'rds', 'elasticache', 'opensearch', 'msk', 'lambda'];
  for (const s of sections) assert.match(db[s].source, /^https:\/\//, `${s} needs a source`);
  // Walk every entry: a string is a single date, an object may have standard/extended, null/{} = no date yet.
  const entries = [];
  const walk = (node, at) => {
    if (typeof node === 'string' || node === null) return entries.push([at, node === null ? {} : { standard: node }]);
    if (node.standard !== undefined || node.extended !== undefined || Object.keys(node).length === 0) return entries.push([at, node]);
    for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
  };
  walk(db.eks.versions, 'eks'); walk(db.rds.engines, 'rds'); walk(db.elasticache.engines, 'elasticache');
  walk(db.opensearch.versions, 'opensearch'); walk(db.msk.versions, 'msk'); walk(db.lambda.runtimes, 'lambda');
  assert.ok(entries.length > 150, `only ${entries.length} entries`);
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  for (const [at, e] of entries) {
    if (e.standard) assert.ok(ok(e.standard), `${at} standard ${e.standard}`);
    if (e.extended) {
      assert.ok(ok(e.extended), `${at} extended ${e.extended}`);
      assert.ok(e.standard && e.extended > e.standard, `${at}: extended must come after standard`);
    }
  }
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

// The two promises in SECURITY.md, enforced rather than stated.
test('read-only: a scan only calls list/describe/get operations', async () => {
  const ops = new Set();
  const aws = async (args) => {
    ops.add(`${args[0]} ${args[1]}`);
    return { clusters: ['c'], cluster: { version: '1.30' }, DBInstances: [], DBClusters: [], Functions: [], Regions: [{ RegionName: 'us-east-1' }] };
  };
  await scan({ aws, db, now: NOW }); // no regions: exercises describe-regions too
  for (const op of ops) assert.match(op.split(' ')[1], /^(list|describe|get)-/, `${op} is not a read-only operation`);
  assert.ok(ops.size >= 6, 'every service was scanned');
});

test('local: the code has no network access of its own', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(src, /require\(['"](node:)?(https?|http2|net|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/, `${f} must not make network calls`);
  }
});

test('--version prints the package version', async () => {
  const { main } = require('../src/cli');
  const out = [];
  const log = console.log;
  console.log = (s) => out.push(s);
  try { assert.equal(await main(['--version']), 0); } finally { console.log = log; }
  assert.deepEqual(out, [require('../package.json').version]);
});

test('evaluate: ElastiCache, OpenSearch, MSK and "no end announced"', () => {
  const e = (item) => evaluate(item, db, NOW);
  // Redis 5 left standard support 2026-01-31: paid Extended Support until 2029-01-31.
  assert.equal(e({ service: 'ElastiCache', engine: 'redis', version: '5.0.6' }).status, 'extended');
  assert.equal(e({ service: 'ElastiCache', engine: 'redis', version: '5.0.6' }).date, '2029-01-31');
  assert.equal(e({ service: 'ElastiCache', engine: 'redis', version: '6.2.6' }).status, 'upcoming');
  assert.equal(e({ service: 'ElastiCache', engine: 'valkey', version: '8.0' }).status, 'ok');
  assert.equal(e({ service: 'ElastiCache', engine: 'valkey', version: '8.0' }).note, 'No end of support announced');
  assert.equal(e({ service: 'ElastiCache', engine: 'memcached', version: '1.6.22' }).status, 'unknown');

  assert.equal(e({ service: 'OpenSearch', version: 'Elasticsearch_7.4' }).status, 'extended');
  assert.equal(e({ service: 'OpenSearch', version: 'Elasticsearch_7.10' }).status, 'ok');
  assert.equal(e({ service: 'OpenSearch', version: 'OpenSearch_3.1' }).status, 'ok');

  // MSK has no paid extension: past the date it is simply retired.
  assert.equal(e({ service: 'MSK', version: '3.6.0' }).status, 'retired');
  assert.equal(e({ service: 'MSK', version: '3.7.x.kraft' }).status, 'retired', '.kraft suffix is normalised');
  assert.equal(e({ service: 'MSK', version: '3.9.x' }).status, 'ok');

  // RDS now knows the end of Extended Support, and Aurora MySQL 8.0 runs longer than RDS MySQL 8.0.
  assert.equal(e({ service: 'RDS', engine: 'mysql', version: '8.0.46' }).status, 'extended');
  assert.equal(e({ service: 'RDS', engine: 'aurora-mysql', version: '8.0.mysql_aurora.3.10.0' }).status, 'ok');
  assert.match(e({ service: 'RDS', engine: 'aurora-mysql', version: '8.0.mysql_aurora.3.10.0' }).source, /AuroraMySQL/);
  assert.equal(e({ service: 'Lambda', version: 'python3.10' }).status, 'soon');
  assert.equal(e({ service: 'Lambda', version: 'nodejs26.x' }).status, 'ok');
});

test('scan: ElastiCache groups are reported once, serverless caches and OpenSearch batches included', async () => {
  const calls = [];
  const fake = {
    'eks list-clusters': { clusters: [] },
    'rds describe-db-instances': { DBInstances: [] },
    'rds describe-db-clusters': { DBClusters: [] },
    'lambda list-functions': { Functions: [] },
    'elasticache describe-cache-clusters': { CacheClusters: [
      { CacheClusterId: 'sessions-001', ReplicationGroupId: 'sessions', Engine: 'redis', EngineVersion: '5.0.6' },
      { CacheClusterId: 'sessions-002', ReplicationGroupId: 'sessions', Engine: 'redis', EngineVersion: '5.0.6' },
      { CacheClusterId: 'memo', Engine: 'memcached', EngineVersion: '1.6.22' },
    ] },
    'elasticache describe-serverless-caches': { ServerlessCaches: [{ ServerlessCacheName: 'edge', Engine: 'valkey', MajorEngineVersion: '8', FullEngineVersion: '8.0' }] },
    'opensearch list-domain-names': { DomainNames: ['a', 'b', 'c', 'd', 'e', 'f'].map((DomainName) => ({ DomainName })) },
    'kafka list-clusters-v2': { ClusterInfoList: [
      { ClusterName: 'events', Provisioned: { CurrentBrokerSoftwareInfo: { KafkaVersion: '2.8.1' } } },
      { ClusterName: 'serverless-x', ClusterType: 'SERVERLESS' },
    ] },
  };
  const aws = async (args) => {
    calls.push(args.join(' '));
    if (args[1] === 'describe-domains') {
      const names = args.slice(3);
      return { DomainStatusList: names.map((n) => ({ DomainName: n, EngineVersion: 'Elasticsearch_6.8' })) };
    }
    return fake[args.slice(0, 2).join(' ')];
  };
  const warnings = [];
  const f = await scan({ regions: ['eu-west-1'], aws, db, now: NOW, warn: (w) => warnings.push(w) });
  assert.deepEqual(warnings, []);
  const by = (svc) => f.filter((x) => x.service === svc).map((x) => `${x.resource}:${x.status}`).sort();
  assert.deepEqual(by('ElastiCache'), ['edge:ok', 'memo:unknown', 'sessions:extended']);
  assert.equal(by('OpenSearch').length, 6, 'all six domains, across two describe-domains calls');
  assert.equal(calls.filter((c) => c.startsWith('opensearch describe-domains')).length, 2);
  assert.deepEqual(by('MSK'), ['events:retired']);
});

test('scan: --services limits which APIs are called', async () => {
  const calls = [];
  const aws = async (args) => { calls.push(args[0]); return { Functions: [] }; };
  await scan({ regions: ['us-east-1'], aws, db, now: NOW, services: ['lambda'] });
  assert.deepEqual([...new Set(calls)], ['lambda']);
});

test('scan: a service the account is not subscribed to is skipped, not reported', async () => {
  const warnings = [];
  const aws = async (args) => {
    if (args[0] === 'kafka') throw new Error('aws: [ERROR]: An error occurred (SubscriptionRequiredException) when calling the ListClustersV2 operation: The AWS Access Key Id needs a subscription for the service');
    if (args[0] === 'rds') throw new Error('AccessDenied');
    return {};
  };
  await scan({ regions: ['eu-west-1'], aws, db, now: NOW, warn: (w) => warnings.push(w) });
  assert.deepEqual(warnings, ['eu-west-1 RDS: AccessDenied'], 'real failures still surface');
});

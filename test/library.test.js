const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('..');

test('the package exports the scanner for programs', () => {
  for (const name of ['scan', 'awsRunner', 'loadRetirements', 'evaluate', 'sortFindings']) assert.equal(typeof lib[name], 'function', name);
  assert.deepEqual(lib.ALL_SERVICES, ['eks', 'rds', 'elasticache', 'opensearch', 'msk', 'lambda']);
});

test('explicit credentials go to the AWS CLI through the environment, and win over any profile', async () => {
  const calls = [];
  const execFileImpl = (cmd, args, opts, cb) => { calls.push({ cmd, args, env: opts.env }); cb(null, '{"clusters":[]}', ''); };
  const prev = process.env.AWS_PROFILE; process.env.AWS_PROFILE = 'someone-else';
  try {
    const aws = lib.awsRunner('ignored', { credentials: { accessKeyId: 'ASIATEST', secretAccessKey: 's3cret', sessionToken: 'tok' }, execFileImpl });
    assert.deepEqual(await aws(['eks', 'list-clusters'], 'eu-west-1'), { clusters: [] });
  } finally { if (prev === undefined) delete process.env.AWS_PROFILE; else process.env.AWS_PROFILE = prev; }
  const [c] = calls;
  assert.equal(c.cmd, 'aws');
  assert.deepEqual(c.args, ['eks', 'list-clusters', '--output', 'json', '--region', 'eu-west-1']);
  assert.equal(c.env.AWS_ACCESS_KEY_ID, 'ASIATEST'); assert.equal(c.env.AWS_SECRET_ACCESS_KEY, 's3cret'); assert.equal(c.env.AWS_SESSION_TOKEN, 'tok');
  assert.equal(c.env.AWS_PROFILE, undefined);
});

test('without credentials the runner keeps the CLI behaviour (profile flag, inherited env)', async () => {
  const calls = [];
  const aws = lib.awsRunner('dev', { execFileImpl: (cmd, args, opts, cb) => { calls.push({ args, opts }); cb(null, '{}', ''); } });
  await aws(['sts', 'get-caller-identity']);
  assert.deepEqual(calls[0].args, ['sts', 'get-caller-identity', '--output', 'json', '--profile', 'dev']);
  assert.equal(calls[0].opts.env, undefined);
});

test('a scan runs end to end through an injected runner', async () => {
  const fake = async (args) => {
    const k = args.slice(0, 2).join(' ');
    if (k === 'eks list-clusters') return { clusters: ['prod'] };
    if (k === 'eks describe-cluster') return { cluster: { version: '1.28' } };
    return {};
  };
  const findings = await lib.scan({ regions: ['us-east-1'], aws: fake, db: lib.loadRetirements(), services: ['eks'] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].resource, 'prod'); assert.equal(findings[0].service, 'EKS');
});

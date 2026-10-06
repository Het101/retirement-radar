<p align="center"><img src="https://raw.githubusercontent.com/Het101/retirement-radar/main/docs/banner.png" alt="Retirement Radar: find AWS resources before end of support costs you money" width="100%"></p>

<p align="center">
  <a href="https://www.npmjs.com/package/retirement-radar"><img src="https://img.shields.io/npm/v/retirement-radar?color=E5484D&label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3f4756" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/AWS-read--only-3f4756" alt="Read-only">
</p>

# Retirement Radar

Find what in your AWS account is about to lose support before it starts costing you money or gets force-upgraded.

```bash
npx retirement-radar scan
```

<img src="https://raw.githubusercontent.com/Het101/retirement-radar/main/docs/scan-output.png" alt="Example output: a table of resources with status RETIRED, EXTENDED, SOON or UPCOMING, the end-of-support date and what it means, plus the monthly EKS extended support cost" width="100%">

<sub>Example output with sample data.</sub>

## What it checks

| Service | What | Why it matters |
|---|---|---|
| EKS | Kubernetes version per cluster | After standard support, clusters move to extended support at 6x the control-plane price, then get force-upgraded |
| RDS / Aurora | Engine major version (PostgreSQL, MySQL, Aurora) | After standard support, RDS bills Extended Support per vCPU-hour automatically |
| ElastiCache | Redis OSS / Valkey version per cluster, replication group and serverless cache | Redis OSS 4 and 5 are already on paid Extended Support; 6 follows on 31 January 2027 |
| OpenSearch | Elasticsearch / OpenSearch version per domain | From 7 November 2026, Extended Support for older versions costs as much as the instances themselves |
| MSK | Kafka version per provisioned cluster | No paid extension: past the date, MSK can auto-upgrade the cluster at any time |
| Lambda | Function runtime | Deprecated runtimes get no security patches, then can't be created or updated |

Dates live in [`retirements.yaml`](retirements.yaml), each section with its AWS source link. A version that isn't listed shows as `unknown`, never as fine.

## Run it

You need Node 18+ and the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), signed in (`aws configure`, `aws sso login`, or an assumed role). Retirement Radar uses your AWS CLI, so profiles, SSO and roles just work.

```bash
npx retirement-radar scan
```

| Option | |
|---|---|
| `--region eu-west-1,us-east-1` | Only these regions (default: every enabled region) |
| `--services rds,elasticache` | Only these services: `eks`, `rds`, `elasticache`, `opensearch`, `msk`, `lambda` (default: all) |
| `--profile prod` | AWS CLI profile |
| `--json` | Machine-readable output |
| `--all` | Also list resources with more than a year left |
| `--fail-on soon` | Exit 1 if anything is `retired`, `extended` or `soon` (levels: `retired`, `extended`, `soon`, `upcoming`) |
| `--data my.yaml` | Use your own dates file |

## Safe by design

- **Read-only.** It only calls `sts get-caller-identity`, `ec2 describe-regions`, `eks list-clusters` / `describe-cluster`, `rds describe-db-instances` / `describe-db-clusters`, `elasticache describe-cache-clusters` / `describe-serverless-caches`, `opensearch list-domain-names` / `describe-domains`, `kafka list-clusters-v2` and `lambda list-functions`.
- **Local.** Nothing is sent anywhere; no telemetry.
- A region or service you can't read becomes a warning, not a failed scan.

Minimal IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:DescribeRegions", "eks:ListClusters", "eks:DescribeCluster",
               "rds:DescribeDBInstances", "rds:DescribeDBClusters",
               "elasticache:DescribeCacheClusters", "elasticache:DescribeServerlessCaches",
               "es:ListDomainNames", "es:DescribeDomains", "kafka:ListClustersV2",
               "lambda:ListFunctions"],
    "Resource": "*"
  }]
}
```

## In CI

```yaml
# .github/workflows/retirement-radar.yml - weekly, fails when something needs action within 90 days
on: { schedule: [{ cron: "0 8 * * 1" }], workflow_dispatch: {} }
permissions: { id-token: write, contents: read }
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: arn:aws:iam::123456789012:role/retirement-radar, aws-region: us-east-1 }
      - run: npx retirement-radar scan --fail-on soon
```

## Contributing dates

Found a wrong or missing date? Edit `retirements.yaml`, include the AWS source link in the PR, and run `npm test`.

## Hosted: Radar Cloud

Rather not run it yourself? [Radar Cloud](https://radar.hetops.dev) runs this same scanner for you: connect an account by deploying one read-only role (the same list and describe actions as above, trusted only with your private external id), and it scans every region daily and alerts you by email or Slack when something new or worse turns up, with the monthly cost. Free for one account.

## Roadmap

Azure and GCP retirements, cost per finding for RDS, ElastiCache and OpenSearch. Part of [HetOps](https://hetops.dev).

MIT licensed.

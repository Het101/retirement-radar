# Retirement Radar

Find what in your AWS account is about to lose support before it starts costing you money or gets force-upgraded.

```
$ npx retirement-radar scan
Scanning AWS account 123456789012 (read-only)...

STATUS    SERVICE  REGION     RESOURCE     VERSION         DATE                   WHAT IT MEANS
RETIRED   Lambda   us-east-1  thumbnailer  nodejs18.x      2025-09-01 (398d ago)  Runtime deprecated: no security patches
EXTENDED  RDS      us-east-1  orders-db    postgres 13.12  2026-02-28 (218d ago)  Past standard support. RDS Extended Support is billed per vCPU-hour...
EXTENDED  EKS      eu-west-1  prod         1.31            2026-11-26 (in 53d)    Paid extended support until this date, then AWS force-upgrades...
SOON      Lambda   us-east-1  api          dotnet8         2026-11-10 (in 37d)    Runtime deprecation

14 resources scanned: 1 retired, 2 extended, 1 soon, 10 ok.
EKS extended support is costing about $365 a month.
```

## What it checks

| Service | What | Why it matters |
|---|---|---|
| EKS | Kubernetes version per cluster | After standard support, clusters move to extended support at 6x the control-plane price, then get force-upgraded |
| RDS / Aurora | Engine major version (PostgreSQL, MySQL, Aurora) | After standard support, RDS bills Extended Support per vCPU-hour automatically |
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
| `--profile prod` | AWS CLI profile |
| `--json` | Machine-readable output |
| `--all` | Also list resources with more than a year left |
| `--fail-on soon` | Exit 1 if anything is `retired`, `extended` or `soon` (levels: `retired`, `extended`, `soon`, `upcoming`) |
| `--data my.yaml` | Use your own dates file |

## Safe by design

- **Read-only.** It only calls `sts get-caller-identity`, `ec2 describe-regions`, `eks list-clusters` / `describe-cluster`, `rds describe-db-instances` / `describe-db-clusters` and `lambda list-functions`.
- **Local.** Nothing is sent anywhere; no telemetry.
- A region or service you can't read becomes a warning, not a failed scan.

Minimal IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:DescribeRegions", "eks:ListClusters", "eks:DescribeCluster",
               "rds:DescribeDBInstances", "rds:DescribeDBClusters", "lambda:ListFunctions"],
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

## Roadmap

Azure and GCP retirements, ElastiCache / OpenSearch / MSK versions, hosted weekly scans with alerts, cost per finding. Part of [HetOps](https://hetops.dev).

MIT licensed.

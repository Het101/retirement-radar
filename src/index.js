// Library entry: the same scanner the CLI runs, for programs that bring their own credentials.
//   const { scan, awsRunner, loadRetirements } = require('retirement-radar');
//   const findings = await scan({ aws: awsRunner(null, { credentials }), db: loadRetirements() });
const { scan, awsRunner, ALL_SERVICES } = require('./cli');
const { SEVERITY, SERVICES, loadRetirements, evaluate, sortFindings, failsAt } = require('./radar');

module.exports = { scan, awsRunner, ALL_SERVICES, SEVERITY, SERVICES, loadRetirements, evaluate, sortFindings, failsAt };

# Security Policy

## Reporting a Vulnerability

If you've found a security issue in this app — credential leakage, unauthorised device control, traffic interception, anything that could compromise a user's home — please report it privately. **Do not open a public GitHub issue.**

**Preferred:** [Open a private security advisory](../../security/advisories/new)

**Email fallback:** homey@alistairs.net

## What to expect

This is a hobbyist project maintained in spare time. I aim to:

- **Acknowledge** within 7 days
- **Triage** within 14 days
- **Patch and disclose** as quickly as the fix permits, coordinated with you

Please give the project reasonable time to ship a fix before public disclosure.

## Scope

In scope:
- Credential leakage (logs, settings, repo, device storage)
- Authentication bypass
- Privilege escalation within the Homey app
- Traffic interception or MITM enablement
- Hardcoded secrets

Out of scope:
- Vulnerabilities in upstream npm dependencies (please report to the dependency directly; I'll bump versions when patches land)
- Vulnerabilities in the Homey platform itself (report to Athom)
- Issues requiring physical access to a paired device

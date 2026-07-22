# Security policy

Do not open a public issue for a suspected vulnerability, leaked token, exposed
customer data, or authorization bypass. Use GitHub's private vulnerability
reporting for `praxa-labs/praxa`.

Include the affected package and version, impact, reproduction steps with
synthetic data, and any suggested mitigation. Do not include live OAuth tokens,
provider credentials, tenant identifiers, private gateway origins, or production
receipts.

The public SDK is not an authority boundary. Authorization, consent, purpose,
target, budget, revocation, provider execution, and independent verification
must be enforced by the hosted server. Please report any client behavior that
could weaken those guarantees.

See [docs/SECURITY.md](docs/SECURITY.md) for the integration threat model.

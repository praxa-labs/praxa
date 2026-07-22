# Security boundary

## Guarantees provided by the clients

- HTTPS origins without embedded credentials.
- Bearer token validation against empty, oversized, and line-breaking values.
- Stable idempotency keys across keyed mutation retries.
- No automatic replay of an unkeyed mutation.
- Bounded server-sent-event lines and payloads with strict UTF-8 decoding.
- Explicit public package exports and package-file allowlists.

## Guarantees that must remain server-side

- Tenant and principal isolation.
- Consent, purpose, target, budget, and revocation checks.
- Credential storage and action-scoped credential resolution.
- Provider execution, reconciliation, and independent verification.
- Receipt signing, incident response, and rollback.

An SDK method call, HTTP 2xx response, or provider acknowledgement is not proof
that an external effect occurred. Applications should display the verified
mission projection or receipt state.

## Data handling

Never send passwords, one-time codes, CAPTCHA answers, PAN, CVV, raw provider
credentials, or unrelated customer data through a model prompt or mission
payload. Use only the minimum purpose-bound data required by the hosted
contract.

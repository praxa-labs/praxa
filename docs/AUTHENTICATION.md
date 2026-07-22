# Authentication

Praxa public clients use short-lived delegated OAuth access tokens issued for a
specific gateway audience, tenant, principal, and scope set.

## SDK

Provide an async token function so your application can refresh a token without
recreating the client:

```ts
const client = new PraxaClient({
  baseUrl: "https://your-praxa-gateway.example",
  accessToken: () => session.getPraxaAccessToken(),
});
```

Do not hard-code tokens, put them in URLs, commit them, or pass provider API
keys to the SDK. Browser applications should obtain tokens through their
reviewed first-party session flow and keep them out of durable client storage.

## CLI

```sh
npx @praxa/cli@0.2.0 init --base-url https://your-praxa-gateway.example
export PRAXA_ACCESS_TOKEN="<short-lived delegated token>"
praxa doctor
```

Shell environment variables can leak through history, process inspection, or
diagnostic capture. Use your platform's secret injection mechanism and clear
the variable after the command.

## Scopes

Each OpenAPI operation and MCP tool declares one required scope. Ask only for
the scopes your integration needs. A scope lets a request reach server-side
policy; it does not itself authorize a provider effect.

OAuth discovery, client registration, and production token issuance are hosted
deployment concerns. A configured Integration Gateway publishes RFC 9728
protected-resource metadata at `/.well-known/oauth-protected-resource`; it does
not mint tokens or replace the authorization server.

# Releasing packages

Package publication is separate from making this GitHub repository public.
Maintainers should release only from a clean, protected commit after CI passes.

```sh
npm ci
npm run verify
npm pack --dry-run --workspace @praxa/sdk
npm pack --dry-run --workspace @praxa/mcp-contracts
npm pack --dry-run --workspace @praxa/cli
```

Inspect every tarball file list. Confirm package versions, changelog and
compatibility notes, registry ownership of the `@praxa` scope, npm trusted
publishing configuration, and provenance before running `npm publish`.

After publication, install each exact version in a clean directory, run the CLI
`version` command, import every public entrypoint, and compare the registry
integrity and provenance records. A successful local pack is not registry
publication proof.

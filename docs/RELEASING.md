# Releasing packages

npm is the canonical registry for the `@praxa` package scope. GitHub Releases
carry the matching source tag, npm tarballs, and `SHA256SUMS`; they are not a
second package identity.

GitHub Packages is intentionally not used for these names. Its npm scope must
match the GitHub owner, which would require duplicate `@praxa-labs/*` package
names instead of the canonical `@praxa/*` API.

## Release prerequisites

- A clean `main` commit in `praxa-labs/praxa` with passing CI.
- Matching semantic versions in the root and all three package manifests.
- An exact `@praxa/sdk` dependency in `@praxa/cli`.
- npm ownership of the `@praxa` scope.
- The GitHub `npm` environment and npm trusted publishing, or a scoped
  automation token stored only in the `NPM_TOKEN` environment secret.

Configure npm trusted publishing separately for `@praxa/sdk`, `@praxa/cli`, and
`@praxa/mcp-contracts` with these exact GitHub Actions values:

| Setting | Value |
| --- | --- |
| Organization or user | `praxa-labs` |
| Repository | `praxa` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

The workflow grants only `contents: write` and `id-token: write`, runs on a
GitHub-hosted runner, and installs a trusted-publishing-compatible npm CLI.
Once OIDC is active for all packages, remove the `NPM_TOKEN` fallback secret.

## Prepare and verify

```sh
npm ci
npm run verify
npm run release:pack
cd release-assets
shasum -a 256 --check SHA256SUMS
```

Inspect each package file list and the generated tarballs. Confirm versions,
changelog, compatibility notes, registry ownership, and the release diff.

## Publish

Create and publish the matching GitHub Release from an annotated `vX.Y.Z` tag.
The `Release packages` workflow then:

1. installs from the lockfile and runs the complete public verification suite;
2. builds checksummed tarballs;
3. publishes only package versions that do not already exist on npm;
4. uploads the tarballs and checksums as workflow artifacts; and
5. attaches them to the GitHub Release.

The publish script is idempotent: an exact version already present on npm is
verified and skipped. npm versions are immutable, so a changed release requires
a new semantic version rather than overwriting an existing one.

For the one-time bootstrap before trusted publishing is configured, a
maintainer may use a granular npm token with publish access and explicitly
disable local provenance:

```sh
PRAXA_RELEASE_DISABLE_PROVENANCE=1 npm run release:publish
```

This exception is for the initial package claim only. Normal releases should
come from the GitHub workflow so npm records OIDC provenance.

## Registry verification

After publication, verify the registry rather than relying on the workflow
exit code:

```sh
npm view @praxa/sdk@X.Y.Z --json
npm view @praxa/mcp-contracts@X.Y.Z --json
npm view @praxa/cli@X.Y.Z --json
```

In a new empty directory, install every exact version from the public registry,
run `praxa version`, import each public entrypoint, and exercise the SDK with a
deterministic mock transport. Confirm the package-lock integrity values and the
GitHub Release checksums.

For a bad release, publish a corrected version. If consumers need an immediate
warning, use `npm deprecate @praxa/package@X.Y.Z "reason and upgrade version"`.
Avoid unpublishing except where npm policy and an active security incident both
require it.

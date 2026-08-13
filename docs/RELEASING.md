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
- The GitHub `npm` environment with an environment-scoped, granular
  `NPM_TOKEN` that can publish all three packages.

Configure npm trusted publishing separately for `@praxa/sdk`, `@praxa/cli`, and
`@praxa/mcp-contracts` with these exact GitHub Actions values:

| Setting | Value |
| --- | --- |
| Organization or user | `praxa-labs` |
| Repository | `praxa` |
| Workflow filename | `release.yml` |
| Environment | `npm` |
| Allowed action | `npm publish` |

The workflow grants only `contents: write` and `id-token: write`, runs on a
GitHub-hosted runner with Node.js 24, and installs npm 12. The environment
secret is exposed as `NODE_AUTH_TOKEN` only to the publish step. Package
manifests keep provenance enabled, so npm still records signed build
provenance for token-authenticated GitHub Actions publication.

The token is a bootstrap fallback, not the desired steady state. Configure npm
trusted publishing separately for `@praxa/sdk`, `@praxa/cli`, and
`@praxa/mcp-contracts` with the values above. After one successful
OIDC-authenticated release, remove the `NODE_AUTH_TOKEN` mapping from
`release.yml` and delete the `NPM_TOKEN` environment secret. Do both in the
same maintenance window so the release workflow never has two undocumented
authentication owners.

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

For a GitHub `release` event, or a manual dispatch with `publish: true`, the
workflow, pack script, and publish script all require `GITHUB_REF_NAME` to equal
`vX.Y.Z` for the root package version before creating assets or contacting npm.
The workflow passes that publish intent explicitly to all three gates. A manual
dispatch with `publish: false` remains usable from a branch for verification
and packing; ordinary local `release:pack` also remains usable. The publication
script itself always treats execution as a publish request, so a direct local
`release:publish` also fails before an npm lookup unless `GITHUB_REF_NAME`
equals the exact version tag.

## Publish

Create and publish the matching GitHub Release from an annotated `vX.Y.Z` tag.
The `Release packages` workflow then:

1. installs from the lockfile and runs the complete public verification suite;
2. builds checksummed tarballs;
3. publishes those exact tarballs from `release-assets/`, then verifies their
   registry SHA-512 integrity; it publishes only package versions that do not
   already exist on npm, or skips
   an existing version only when its registry integrity exactly matches the
   release tarball bytes;
4. uploads the tarballs and checksums as workflow artifacts; and
5. attaches them to the GitHub Release.

The publish script is idempotent only for byte-identical reuse: it computes the
SHA-512 SRI directly from each checksummed release tarball and compares it with
`dist.integrity` before a skip and after a publish. A mismatch fails with
`published_digest_mismatch`; it is never silently skipped. npm versions are
immutable, so changed bytes require a new semantic version rather than
overwriting an existing one.

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

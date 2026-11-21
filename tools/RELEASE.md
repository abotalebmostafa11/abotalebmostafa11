# Release C++ Start

Build from the repository root with Node.js 24, npm and Python 3.9 or later.

```sh
npm ci --prefix tools --ignore-scripts
python3 tools/package.py
python3 tools/validate.py dist/cppstart-2.2.0.vsix
```

The release workflow builds the VSIX from the tag. Push a tag matching the version in `extension/package.json`, for example `v2.2.0`, at the release commit on `cppstart-vscode`. GitHub Actions attaches the VSIX and its SHA-256 checksum to the GitHub Release.

## Optional Visual Studio Marketplace publishing

The existing extension ID is `cppstart.cppstart-run`. Marketplace publishing requires permission to publish for the `cppstart` publisher. The default tag workflow uploads to GitHub Releases only.

For Marketplace publication on release tags, set the GitHub Actions repository variable `CPPSTART_MARKETPLACE_MODE` to one of the following values.

| Value | Configuration |
| --- | --- |
| `trusted-publishing` | Configure the Marketplace publisher’s GitHub trusted publishing policy for this repository and `release.yml`. This job uses a short-lived GitHub OIDC token. |
| `publisher-token` | Add the publisher’s Marketplace publishing token as the Actions secret `VSCE_PAT`. The workflow verifies that the token has publishing rights for `cppstart`. |

An unset variable keeps release tags on GitHub only. For a one-time manual run, use the workflow's `marketplace` input if GitHub exposes this workflow on the repository’s default branch. Each publishing mode submits the exact VSIX from the GitHub Release.

[Visual Studio Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

# Version Management for Maintainers

This document describes the version management process for maintainers of ChatGPT MD.

## Version Update Script

The `update-version` script ensures consistent versioning across all project files:

### Basic Usage

To update the version number:

```bash
npm run update-version 2.0.3
```

This will:

1. Update the version in package.json
2. Update the version in manifest.json
3. Add the new version to versions.json with the current minAppVersion
4. Create a git commit with these changes
5. Create a git tag v2.0.3

### Beta Version

To create a beta version:

```bash
npm run update-version 2.0.3-beta.1 beta
```

This will update manifest-beta.json instead of manifest.json, while still updating package.json and versions.json.

After running the script, push the changes and tag:

```bash
git push origin master
git push origin v2.0.3
```

## Release Process

1. Decide on the new version number following semantic versioning principles
2. Run the update-version script as shown above
3. Push the changes and tag to the repository
4. Create a release on GitHub using the new tag
5. Update the release notes with changes since the last version

#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// Get command line arguments
const newVersion = process.argv[2];
const isBeta = process.argv[3] === "beta";

if (!newVersion) {
  console.error("Error: Version number is required");
  console.log("Usage: node update-version.mjs <version> [beta]");
  process.exit(1);
}

// Base version validation (x.y.z format)
if (!/^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(newVersion)) {
  console.error("Error: Version must be in format x.y.z or x.y.z-label.n");
  process.exit(1);
}

// Apply the -beta suffix if it's a beta version and doesn't already have a suffix
let versionWithSuffix = newVersion;
if (isBeta && !newVersion.includes("-")) {
  versionWithSuffix = `${newVersion}-beta`;
}

console.log(`Updating to version ${versionWithSuffix}${isBeta ? " (beta)" : ""}`);

// Update package.json
try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageJson.version = versionWithSuffix;
  writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");
  console.log("✅ Updated package.json");
} catch (error) {
  console.error("❌ Failed to update package.json:", error.message);
  process.exit(1);
}

// Get minAppVersion from manifest.json
let minAppVersion;
try {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  minAppVersion = manifest.minAppVersion;
} catch (error) {
  console.error("❌ Failed to read minAppVersion from manifest.json:", error.message);
  process.exit(1);
}

// Update manifest.json
try {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  manifest.version = versionWithSuffix;
  writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log(`✅ Updated manifest.json`);
} catch (error) {
  console.error(`❌ Failed to update manifest.json:`, error.message);
  process.exit(1);
}

// Update versions.json
try {
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  versions[versionWithSuffix] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
  console.log("✅ Updated versions.json");
} catch (error) {
  console.error("❌ Failed to update versions.json:", error.message);
  process.exit(1);
}

// Create git commit and tag
try {
  // Only include manifest.json in the commit for non-beta versions
  const filesToCommit = isBeta ? ["package.json", "versions.json"] : ["package.json", "manifest.json", "versions.json"];

  execSync(`git add ${filesToCommit.join(" ")}`);
  execSync(`git commit -m "Bump version to ${versionWithSuffix}${isBeta ? " (beta)" : ""}"`);
  execSync(`git tag -a ${versionWithSuffix} -m "Version ${versionWithSuffix}${isBeta ? " (beta)" : ""}"`);

  console.log(`✅ Created git commit and tag ${versionWithSuffix}`);
  console.log("\nNext steps:");
  console.log(`- Push changes: git push origin master`);
  console.log(`- Push tag: git push origin ${versionWithSuffix}`);
  console.log(`- Create a GitHub release for tag ${versionWithSuffix} and upload the plugin files`);
  if (isBeta) {
    console.log(`  (Mark this release as a pre-release on GitHub)`);
  }
} catch (error) {
  console.error("❌ Failed to create git commit or tag:", error.message);
  console.log("You may need to commit and tag manually.");
}

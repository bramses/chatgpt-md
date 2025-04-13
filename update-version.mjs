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

// Validate version format (simple validation)
if (!/^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(newVersion)) {
  console.error("Error: Version must be in format x.y.z or x.y.z-label.n");
  process.exit(1);
}

console.log(`Updating to version ${newVersion}${isBeta ? " (beta)" : ""}`);

// Update package.json
try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageJson.version = newVersion;
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

// Update manifest files based on version type
if (isBeta) {
  // For beta versions, only update manifest-beta.json
  try {
    const manifestFile = "manifest-beta.json";
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    manifest.version = newVersion;
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Updated ${manifestFile}`);
  } catch (error) {
    console.error(`❌ Failed to update manifest-beta.json:`, error.message);
    process.exit(1);
  }
} else {
  // For non-beta versions, update both manifest.json and manifest-beta.json
  try {
    // Update manifest.json
    const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
    manifest.version = newVersion;
    writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Updated manifest.json`);

    // Also update manifest-beta.json
    try {
      const betaManifest = JSON.parse(readFileSync("manifest-beta.json", "utf8"));
      betaManifest.version = newVersion;
      writeFileSync("manifest-beta.json", JSON.stringify(betaManifest, null, 2) + "\n");
      console.log(`✅ Updated manifest-beta.json`);
    } catch (error) {
      console.error(`❌ Failed to update manifest-beta.json:`, error.message);
      // Don't exit since the main manifest was updated successfully
    }
  } catch (error) {
    console.error(`❌ Failed to update manifest.json:`, error.message);
    process.exit(1);
  }
}

// Update versions.json
try {
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  versions[newVersion] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
  console.log("✅ Updated versions.json");
} catch (error) {
  console.error("❌ Failed to update versions.json:", error.message);
  process.exit(1);
}

// Create git commit and tag
try {
  const filesToCommit = ["package.json", "versions.json"];
  if (isBeta) {
    filesToCommit.push("manifest-beta.json");
  } else {
    filesToCommit.push("manifest.json", "manifest-beta.json");
  }

  execSync(`git add ${filesToCommit.join(" ")}`);
  execSync(`git commit -m "Bump version to ${newVersion}${isBeta ? " (beta)" : ""}"`);
  execSync(`git tag -a ${newVersion} -m "Version ${newVersion}${isBeta ? " (beta)" : ""}"`);

  console.log(`✅ Created git commit and tag ${newVersion}`);
  console.log("\nNext steps:");
  console.log(`- Push changes: git push origin main`);
  console.log(`- Push tag: git push origin ${newVersion}`);
} catch (error) {
  console.error("❌ Failed to create git commit or tag:", error.message);
  console.log("You may need to commit and tag manually.");
}

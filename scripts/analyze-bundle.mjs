#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

/**
 * Analyze bundle for optimization opportunities
 */
async function analyzeBundle() {
  console.log("🔍 Analyzing bundle for optimization opportunities...\n");

  // Check if main.js exists
  const mainJsPath = path.join(rootDir, "main.js");
  if (!fs.existsSync(mainJsPath)) {
    console.error("❌ main.js not found. Run npm run build first.");
    process.exit(1);
  }

  // Get bundle size
  const stats = fs.statSync(mainJsPath);
  const sizeKB = (stats.size / 1024).toFixed(2);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`📏 Bundle Size: ${sizeKB} KB (${sizeMB} MB)`);

  // Read the bundle content
  const bundleContent = fs.readFileSync(mainJsPath, "utf8");

  // Analyze potential optimizations
  console.log("\n🎯 Optimization Analysis:");

  // Check for console statements that survived minification
  const consoleMatches = bundleContent.match(/console\.(log|warn|info|debug|error)/g);
  if (consoleMatches && consoleMatches.length > 0) {
    console.log(`⚠️  Found ${consoleMatches.length} console statements that weren't removed`);
  } else {
    console.log("✅ All console statements successfully removed");
  }

  // Check for common large dependencies
  const largeDeps = ["moment", "lodash", "axios", "react", "vue", "jquery"];

  const foundDeps = largeDeps.filter((dep) => bundleContent.includes(dep));
  if (foundDeps.length > 0) {
    console.log(`📦 Large dependencies detected: ${foundDeps.join(", ")}`);
    console.log("   Consider using lighter alternatives or tree-shaking");
  }

  // Check bundle composition
  console.log("\n📊 Bundle Composition:");

  // Estimate code vs comments ratio
  const lines = bundleContent.split("\n");
  const commentLines = lines.filter(
    (line) => line.trim().startsWith("//") || line.trim().startsWith("/*") || line.trim().startsWith("*")
  ).length;

  console.log(`   Total lines: ${lines.length.toLocaleString()}`);
  console.log(`   Comment lines: ${commentLines.toLocaleString()}`);
  console.log(`   Code density: ${(((lines.length - commentLines) / lines.length) * 100).toFixed(1)}%`);

  // Check for potential duplicated code patterns
  const functionDeclarations = bundleContent.match(/function\s+\w+/g) || [];
  const arrowFunctions = bundleContent.match(/\w+\s*=>\s*/g) || [];
  const totalFunctions = functionDeclarations.length + arrowFunctions.length;

  console.log(`   Function declarations: ${functionDeclarations.length}`);
  console.log(`   Arrow functions: ${arrowFunctions.length}`);
  console.log(`   Total functions: ${totalFunctions}`);

  // Size recommendations
  console.log("\n💡 Recommendations:");

  if (stats.size > 100 * 1024) {
    // > 100KB
    console.log("📏 Bundle is relatively large for an Obsidian plugin");
    console.log("   Consider code splitting or removing unused features");
  } else if (stats.size > 50 * 1024) {
    // > 50KB
    console.log("📏 Bundle size is moderate - monitor growth");
  } else {
    console.log("✅ Bundle size is optimal for an Obsidian plugin");
  }

  // Memory usage estimate
  const estimatedMemory = stats.size * 2; // Rough estimate: 2x file size in memory
  console.log(`🧠 Estimated memory usage: ~${(estimatedMemory / 1024).toFixed(0)} KB`);

  console.log("\n✨ Analysis complete!");
}

// Run the analysis
analyzeBundle().catch(console.error);

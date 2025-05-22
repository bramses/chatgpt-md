#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const pluginName = "chatgpt-md";
const statsFile = "community-plugin-stats.json";
const outputFile = `${pluginName}-history.json`;

console.log(`Extracting stats history for "${pluginName}" plugin...`);

// Get git commits that modified the stats file
const gitLogCommand = `git log --pretty=format:"%H %at" -- ${statsFile}`;
const commits = execSync(gitLogCommand, { encoding: "utf8" })
  .trim()
  .split("\n")
  .map((line) => {
    const [hash, timestamp] = line.split(" ");
    return { hash, timestamp: parseInt(timestamp) * 1000 }; // Convert to milliseconds
  });

console.log(`Found ${commits.length} commits that modified the stats file.`);

// First phase: Collect all data points
const rawData = [];

// Loop through commits (newest to oldest)
for (const commit of commits) {
  try {
    // Get stats file content at this commit
    const fileContent = execSync(`git show ${commit.hash}:${statsFile}`, {
      encoding: "utf8",
    });
    const statsData = JSON.parse(fileContent);

    // Check if the plugin exists in this version of the file
    if (!statsData[pluginName]) {
      console.log(
        `Plugin "${pluginName}" not found in commit ${commit.hash}. Stopping.`,
      );
      break;
    }

    const pluginData = statsData[pluginName];
    const downloads = pluginData.downloads || 0;
    const date = new Date(commit.timestamp).toISOString().split("T")[0]; // Format as YYYY-MM-DD

    // Create a record for this point in time
    const dataPoint = {
      hash: commit.hash,
      timestamp: commit.timestamp,
      date,
      downloads,
      versions: {},
    };

    // Add each version to the data object
    for (const key in pluginData) {
      // Skip non-version keys
      if (key === "downloads" || key === "updated") continue;

      // Add version info
      dataPoint.versions[key] = pluginData[key];
    }

    rawData.push(dataPoint);
    console.log(
      `Collected data from ${date}: ${downloads} downloads with ${
        Object.keys(dataPoint.versions).length
      } versions`,
    );
  } catch (error) {
    console.error(`Error processing commit ${commit.hash}: ${error.message}`);
  }
}

// Sort raw data by timestamp (newest to oldest)
rawData.sort((a, b) => b.timestamp - a.timestamp);

// Second phase: Filter out anomalies
const validData = [];
let skippedCount = 0;

for (let i = 0; i < rawData.length; i++) {
  const current = rawData[i];

  // Check if this point maintains monotonically decreasing download counts
  let isValid = true;

  // Check against previous (newer in time) point if it exists
  if (i > 0) {
    const prev = rawData[i - 1];
    if (current.downloads > prev.downloads) {
      console.log(
        `Anomaly detected: ${current.date} (${current.hash.substring(0, 8)}) ` +
          `has ${current.downloads} downloads which is > previous ${prev.downloads}`,
      );
      isValid = false;
    }
  }

  // Check against next (older in time) point if it exists
  if (i < rawData.length - 1) {
    const next = rawData[i + 1];
    if (current.downloads < next.downloads) {
      console.log(
        `Anomaly detected: ${current.date} (${current.hash.substring(0, 8)}) ` +
          `has ${current.downloads} downloads which is < next ${next.downloads}`,
      );
      isValid = false;
    }
  }

  if (isValid) {
    validData.push(current);
  } else {
    skippedCount++;
  }
}

console.log(`Filtered out ${skippedCount} anomalous data points`);

// Third phase: Format the final result
const history = {};

validData.forEach((point) => {
  history[point.timestamp] = {
    date: point.date,
    data: {
      downloads: point.downloads,
      ...point.versions,
    },
  };
});

// Write the results to a file
fs.writeFileSync(outputFile, JSON.stringify(history, null, 2));
console.log(`Saved ${validData.length} valid data points to ${outputFile}`);

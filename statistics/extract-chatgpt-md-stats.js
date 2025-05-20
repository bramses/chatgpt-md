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

// Process each commit
const history = {};

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

    // Create a record for this point in time with proper structure
    // Store as key-value pair using the commit hash as key
    history[commit.hash] = {
      date,
      data: {
        downloads,
      },
    };

    // Add each version to the data object directly (not under versions)
    for (const key in pluginData) {
      // Skip non-version keys
      if (key === "downloads" || key === "updated") continue;

      // Add version info directly to the data object
      history[commit.hash].data[key] = pluginData[key];
    }

    console.log(
      `Added entry for ${date}: ${downloads} downloads with ${
        Object.keys(history[commit.hash].data).length - 1
      } versions`,
    );
  } catch (error) {
    console.error(`Error processing commit ${commit.hash}: ${error.message}`);
  }
}

// Write the results to a file
fs.writeFileSync(outputFile, JSON.stringify(history, null, 2));
console.log(`Saved history to ${outputFile}`);

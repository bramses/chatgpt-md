import { Message } from "src/Models/Message";
import {
	HORIZONTAL_LINE_MD,
	MARKDOWN_LINKS_REGEX,
	ROLE_USER,
	WIKI_LINKS_REGEX,
} from "src/Constants";

/**
 * Utility functions for message parsing and manipulation
 * These are simple, stateless functions that can be used anywhere
 */

/**
 * Remove comments from message content
 * Comment blocks are delimited by =begin-chatgpt-md-comment and =end-chatgpt-md-comment
 */
export function removeCommentBlocks(message: string): string {
	const commentStart = "=begin-chatgpt-md-comment";
	const commentEnd = "=end-chatgpt-md-comment";

	const startIndex = message.indexOf(commentStart);
	if (startIndex === -1) return message;

	const endIndex = message.indexOf(commentEnd, startIndex);
	if (endIndex === -1) return message;

	return message.substring(0, startIndex) + message.substring(endIndex + commentEnd.length);
}

/**
 * Find all wiki links and markdown links in a message
 * Returns unique links with their titles, excluding http/https URLs
 */
export function findLinksInMessage(message: string): { link: string; title: string }[] {
	const regexes = [
		{ regex: WIKI_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 1 },
		{ regex: MARKDOWN_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 2 },
	];

	const links: { link: string; title: string }[] = [];
	const seenTitles = new Set<string>();

	for (const { regex, fullMatchIndex, titleIndex } of regexes) {
		for (const match of message.matchAll(regex)) {
			const fullLink = match[fullMatchIndex];
			let linkTitle = match[titleIndex];

			// For wiki links with aliases ([[file|alias]]), extract only the filename
			if (linkTitle && linkTitle.includes("|")) {
				linkTitle = linkTitle.split("|")[0].trim();
			}

			// Skip URLs that start with http:// or https://
			if (
				linkTitle &&
				!seenTitles.has(linkTitle) &&
				!linkTitle.startsWith("http://") &&
				!linkTitle.startsWith("https://")
			) {
				links.push({ link: fullLink, title: linkTitle });
				seenTitles.add(linkTitle);
			}
		}
	}

	return links;
}

/**
 * Split text into messages based on horizontal line separator
 */
export function splitMessages(text: string | undefined): string[] {
	return text ? text.split(HORIZONTAL_LINE_MD) : [];
}

/**
 * Remove YAML frontmatter from text
 */
export function removeYAMLFrontMatter(note: string | undefined): string | undefined {
	if (!note) return note;

	// Check if the note starts with frontmatter
	if (!note.trim().startsWith("---")) {
		return note;
	}

	// Find the end of frontmatter
	const lines = note.split("\n");
	let endIndex = -1;

	// Skip first line (opening ---)
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) {
		// No closing ---, return original note
		return note;
	}

	// Return content after frontmatter
	return lines.slice(endIndex + 1).join("\n");
}

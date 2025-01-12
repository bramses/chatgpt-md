# Changelog

## [1.6.0] - 2025-01-12

### Code Improvements & Refactoring

- Centralized statusBar updates and improved response processing (@Deniz Okcu)
- Added command IDs and other important strings as constants (@Deniz Okcu)
- Moved helper methods to EditorService and OpenAIService (@Deniz Okcu)
- Improved code organization and imports (@Deniz Okcu)
- Added more configuration values (@Deniz Okcu)
- Extracted data structures to Models (@Deniz Okcu)
- Moved ChatTemplates and Settings to Views (@Deniz Okcu)

### Bug Fixes

- Fixed missing frontmatter overwrite with default settings (@Deniz Okcu)
- Added check for chat folder before renaming inferred title (@Deniz Okcu)
- Cherry-picked missing fixes (@Deniz Okcu)

### Development Updates

- Upgraded dependencies (@Deniz Okcu)
- Added .prettierrc configuration (@Deniz Okcu)
- Fixed TypeScript build issues (@Deniz Okcu)

## [1.5.0] - 2023-04-03

### Features

- Added ChatGPT comments functionality (@Bram Adams)
- Added command to clear conversation except frontmatter (@Bram Adams)
- Added setting for inferring title language (@Schumi543)

### Improvements

- New chat files now open in source mode (@Szymon Wrozynski)

## [1.4.3] - 2023-03-25

### Bug Fixes

- Fixed new chat from template when `chats` folder is missing (@Bram Adams)
- Fixed infer title error (@Bram Adams)

## [1.4.0-1.4.2] - 2023-03-23

### Features

- Added stop button for streaming (@Bram Adams)
- Added configurable URL support (@Nintorac Dev)

### Bug Fixes

- Fixed stream passthrough issues (@Bram Adams)
- Fixed resolve/reject handling (@Bram Adams)

### Improvements

- Improved streaming icon behavior on mobile (@Bram Adams)

## [1.3.0] - 2023-03-20

### Features

- Added headings to messages (@Lukas Petry)

### Improvements

- Enhanced code block handling (@Bram Adams)

## [1.2.0-1.2.1] - 2023-03-18

### Features

- Implemented improved streaming functionality (@Bram Adams)

### Bug Fixes

- Enhanced error logic for SSE (@Bram Adams)

## [1.1.0-1.1.1] - 2023-03-13

### Features

- Added title inference functionality (@Bram Adams)
- Added platform-specific logic (@Bram Adams)
- Implemented custom dates (@Bram Adams)

### Bug Fixes

- Fixed streaming bugs (@Bram Adams)
- Reduced message count for title inference (@Bram Adams)

## [1.0.0-1.0.2] - 2023-03-10

### Initial Release

- Core functionality implementation (@Bram Adams)
- Error reporting improvements (@Bram Adams)
- iOS compatibility fixes (@Bram Adams)
- Status bar improvements (@Bram Adams)

### Documentation

- Added comprehensive README (@Bram Adams, @Adam Grant)
- Added YouTube tutorial mirror (@Bram Adams)
- Added licensing information (@Bram Adams)

---

For detailed information about each release, please visit the [GitHub repository](https://github.com/bramses/chatgpt-md).

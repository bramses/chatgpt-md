// check for unclosed code block in MD (three backticks), string should contain three backticks in a row
export const unfinishedCodeBlock = (txt: string): boolean => {
  const codeBlockMatches = txt.match(/```/g) || [];
  const isUnclosed = codeBlockMatches.length % 2 !== 0;

  if (isUnclosed) {
    console.log("[ChatGPT MD] Unclosed code block detected");
  }

  return isUnclosed;
};

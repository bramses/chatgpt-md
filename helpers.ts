// check for unclosed code block in MD (three backticks), string should contain three backticks in a row
export const unfinishedCodeBlock = (txt: string) => {
	const matcher = txt.match(/```/g);
    if (!matcher) {
        return false;
    }

    if (matcher.length % 2 !== 0) console.log("unclosed code block detected");

    return matcher.length % 2 !== 0;
};

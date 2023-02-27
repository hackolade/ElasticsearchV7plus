/**
 * @typedef { import('../types/scriptParserTypes').ParsedScriptFirstLine } ParsedScriptFirstLine
 * @typedef { import('../types/scriptParserTypes').ParsedScriptBody } ParsedScriptBody
 * @typedef { import('../types/scriptParserTypes').ParsedScriptData } ParsedScriptData
 * */

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptFirstLine}
 */
const parseFirstLine = (script) => {
    // See the line example below:
    // PUT /new_index
    const firstLineAsArray = script.split('\n', 1);
    if (!firstLineAsArray.length) {
        throw new Error(`Invalid script: ${script}`);
    }
    const firstLine = firstLineAsArray[0];
    const httpMethodAsArray = firstLine.split(' ', 1);
    if (!httpMethodAsArray.length) {
        throw new Error(`Invalid first line of kibana script: ${firstLine}`);
    }
    const httpMethod = httpMethodAsArray[0] || '';
    if (!(['POST', 'PUT'].includes(httpMethod.toUpperCase()))) {
        throw new Error(`Invalid http method: ${httpMethod}`);
    }
    // +1 to include whitespace
    const indexNameWithSlash = firstLine.substring(httpMethod.length + 1);
    if (indexNameWithSlash.length < 2) {
        throw new Error(`Invalid index name after slash: ${indexNameWithSlash}`);
    }
    const indexName = indexNameWithSlash.substring(1);
    return {
        httpMethod,
        indexName,
        line: firstLine,
    }
}

/**
 * @param script {string}
 * @param firstLine {string}
 * @throws {Error}
 * @return {ParsedScriptBody}
 */
const parseBody = (script, firstLine) => {
    // We need `${script}` and not script, because script comes with new line breaks, tabulations
    // and a bunch of other crap that has to be escaped before being passed into JSON.parse
    const scriptBodyWithExampleAsString = `${script.substring(firstLine.length)}`;
    const scriptAndExampleWithNoLeadingAndTrailingCurlyBrace = scriptBodyWithExampleAsString.split(/}\n{/g);
    if (scriptAndExampleWithNoLeadingAndTrailingCurlyBrace.length === 0) {
        throw new Error(`Invalid kibana script body: ${scriptBodyWithExampleAsString}`);
    }
    let scriptBody = scriptAndExampleWithNoLeadingAndTrailingCurlyBrace[0];
    if (scriptAndExampleWithNoLeadingAndTrailingCurlyBrace.length > 1) {
        // It means, there was an example attached to kibana script
        scriptBody += '}';
    }
    try {
        return JSON.parse(scriptBody);
    } catch (e) {
        throw new Error(`Invalid script body: ${scriptBody}`);
    }
}

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptData}
 */
const parseKibanaScript = (script) => {
    const firstLineParsed = parseFirstLine(script);
    const {indexName, line: firstLine, httpMethod} = firstLineParsed;
    const scriptBody = parseBody(script, firstLine);

    return {
        body: scriptBody,
        httpMethod,
        indexName,
    }
}

module.exports = {
    parseKibanaScript
}

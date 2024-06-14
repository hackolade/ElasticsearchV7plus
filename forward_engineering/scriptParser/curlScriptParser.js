/**
 * @typedef { import('../types/scriptParserTypes').ParsedScriptFirstLine } ParsedScriptFirstLine
 * @typedef { import('../types/scriptParserTypes').ParsedScriptBody } ParsedScriptBody
 * @typedef { import('../types/scriptParserTypes').ParsedScriptData } ParsedScriptData
 * */

const curlPostRegex = /-X\s*post/gi;
const curlPutRegex = /-X\s*put/gi;

/**
 * @param firstLine {string}
 * @throws {Error}
 * @return string
 */
const extractHttpMethod = firstLine => {
	const isPutRequest = curlPutRegex.test(firstLine);
	if (isPutRequest) {
		return 'PUT';
	}
	const isPostRequest = curlPostRegex.test(firstLine);
	if (isPostRequest) {
		return 'POST';
	}
	throw new Error(`Invalid curl config: ${firstLine}`);
};

/**
 * @param firstLine {string}
 * @param httpMethod {string}
 * @throws {Error}
 * @return string
 */
const extractIndexName = (firstLine, httpMethod) => {
	const indexOfContentTypeHeader = firstLine.indexOf("-H 'Content-Type: application/json'");
	if (indexOfContentTypeHeader === -1) {
		throw new Error(`Invalid curl config: ${firstLine}`);
	}
	const indexOfHttpMethod = firstLine.indexOf(httpMethod);
	if (indexOfHttpMethod === -1 || indexOfHttpMethod > indexOfContentTypeHeader) {
		throw new Error(`URL must be specified between HTTP method and Content-Type header, got: ${firstLine}`);
	}
	const urlWithMethodAndWhitespacesAndSingleQuotes = firstLine.substring(indexOfHttpMethod, indexOfContentTypeHeader);
	const urlWithWhitespacesAndSingleQuotes = urlWithMethodAndWhitespacesAndSingleQuotes.substring(httpMethod.length);
	const urlWithSingleQuotes = urlWithWhitespacesAndSingleQuotes.trim();
	const url = urlWithSingleQuotes.substring(1, urlWithSingleQuotes.length - 1);
	const queryParameterStart = url.lastIndexOf('?');
	const lastPathDelimiterIndex = url.lastIndexOf('/');
	if (queryParameterStart === -1 || lastPathDelimiterIndex === -1 || lastPathDelimiterIndex > queryParameterStart) {
		throw new Error(`Expected index name to be after last slash and first question mark, got: ${url}`);
	}
	// +1 because we want to cut out the slash
	const indexName = url.substring(lastPathDelimiterIndex + 1, queryParameterStart);
	if (!indexName) {
		throw new Error(`Index name has to be not empty, got: ${url}`);
	}
	return indexName;
};

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptFirstLine}
 */
const parseFirstLine = script => {
	// See the line example below:
	// curl -XPUT 'localhost:9200/new index?pretty' -H 'Content-Type: application/json' -d '
	const firstLineAsArray = script.split('\n', 1);
	if (!firstLineAsArray.length) {
		throw new Error(`Invalid script: ${script}`);
	}
	const firstLine = firstLineAsArray[0];
	const httpMethod = extractHttpMethod(firstLine);
	const indexName = extractIndexName(firstLine, httpMethod);
	return {
		httpMethod,
		indexName,
		line: firstLine,
	};
};

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
	const scriptAndExampleWithNoLeadingAndTrailingCurlyBrace = scriptBodyWithExampleAsString.split(/}\n'\n{/g);
	if (scriptAndExampleWithNoLeadingAndTrailingCurlyBrace.length === 0) {
		throw new Error(`Invalid curl script body: ${scriptBodyWithExampleAsString}`);
	}
	let scriptBody = scriptAndExampleWithNoLeadingAndTrailingCurlyBrace[0];
	if (scriptBody.endsWith("'")) {
		scriptBody = scriptBody.substring(0, scriptBody.length - 1);
	}
	if (scriptAndExampleWithNoLeadingAndTrailingCurlyBrace.length > 1) {
		// It means, there was an example attached to curl script
		scriptBody += '}';
	}
	try {
		return JSON.parse(scriptBody);
	} catch (e) {
		throw new Error(`Invalid script body: ${scriptBody}`);
	}
};

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptData}
 */
const parseCurlScript = script => {
	const firstLineConfig = parseFirstLine(script);
	const { indexName, httpMethod, line: firstLine } = firstLineConfig;
	const body = parseBody(script, firstLine);
	return {
		httpMethod,
		indexName,
		body,
	};
};

module.exports = {
	parseCurlScript,
};

/**
 * @typedef { import('../types/scriptParserTypes').ParsedScriptFirstLine } ParsedScriptFirstLine
 * @typedef { import('../types/scriptParserTypes').ParsedScriptBody } ParsedScriptBody
 * @typedef { import('../types/scriptParserTypes').ParsedScriptData } ParsedScriptData
 * */

const { removeFirstLine } = require('../helpers/generateScriptHelpers');

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptFirstLine}
 */
const parseFirstLine = script => {
	const line = script.split('\n', 1)[0];

	const regex = /^([A-Z]+)\s+\/([^/\s]+)(?:\/([^?\s]+))?/;
	const match = regex.exec(line);

	if (!match) {
		throw new Error(`Invalid script: ${script}`);
	}

	const [, httpMethod, indexName, operation] = match;

	if (!['POST', 'PUT', 'DELETE'].includes(httpMethod?.toUpperCase())) {
		throw new Error(`Invalid http method: ${httpMethod}`);
	}

	if (indexName?.length < 2) {
		throw new Error(`Invalid index name: ${indexNameWithSlash}`);
	}

	return {
		httpMethod,
		indexName,
		operation: operation || null,
	};
};

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptBody}
 */
const parseBody = script => {
	// We need `${script}` and not script, because script comes with new line breaks, tabulations
	// and a bunch of other crap that has to be escaped before being passed into JSON.parse
	const scriptBodyWithExampleAsString = `${removeFirstLine(script)}`;
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
};

/**
 * @param script {string}
 * @throws {Error}
 * @return {ParsedScriptData}
 */
const parseKibanaScript = script => {
	const { indexName, httpMethod, operation } = parseFirstLine(script);
	const body = httpMethod === 'DELETE' ? null : parseBody(script);

	return {
		httpMethod,
		indexName,
		operation,
		body,
	};
};

module.exports = {
	parseKibanaScript,
};

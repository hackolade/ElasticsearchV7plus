const fs = require('fs/promises');
const path = require('path');
const { getCurlScript, getKibanaScript } = require('./generateScriptHelpers');

const buildTemplateContext = ({ mappingScript, modelData, indexData }) => ({
	body: mappingScript,
	host: modelData?.host || 'localhost',
	port: modelData?.port ?? 9200,
	indexName: (indexData?.name || '').toLowerCase(),
});

const getTemplateEngine = async ({ app, logger }) => {
	let engine;
	let requireError;

	try {
		engine = await app.require('@hackolade/template-engine');
	} catch (error) {
		requireError = error;
	}

	if (engine?.renderLiquidTemplate) {
		logger?.log('info', '@hackolade/template-engine is available', 'Forward-engineering template');
		return engine;
	}

	logger?.log(
		'info',
		requireError ? { message: requireError.message } : '@hackolade/template-engine is not available',
		'@hackolade/template-engine is not available',
		'Forward-engineering template',
	);

	return undefined;
};

const applyTemplate = async ({ template, mappingScript, modelData, indexData, scriptFormat, app, logger }) => {
	const templateEngine = await getTemplateEngine({ app, logger });

	// Older versions of the application do not provide the template engine
	if (!templateEngine) {
		return scriptFormat === 'curlScript'
			? getCurlScript(mappingScript, modelData, indexData)
			: getKibanaScript(mappingScript, indexData);
	}

	const scope = buildTemplateContext({ mappingScript, modelData, indexData });
	const { renderLiquidTemplate } = templateEngine;
	const templates = await readTemplates();
	const { rendered: result } = await renderLiquidTemplate({ template, scope, options: { templates } });

	if (typeof result !== 'string') {
		throw new Error('Forward-engineering template did not render to a string');
	}

	return result;
};

const TEMPLATE_EXTENSION = '.liquid';
const TEMPLATES_PATH = path.join(__dirname, '..', 'templates');

let templatesPromise;

const readTemplates = () => {
	if (!templatesPromise) {
		templatesPromise = fs
			.readdir(TEMPLATES_PATH)
			.then(files => files.filter(file => file.endsWith(TEMPLATE_EXTENSION)))
			.then(files =>
				Promise.all(
					files.map(async file => [
						file.slice(0, -TEMPLATE_EXTENSION.length),
						await fs.readFile(path.join(TEMPLATES_PATH, file), 'utf8'),
					]),
				),
			)
			.then(Object.fromEntries)
			.catch(error => {
				templatesPromise = undefined;
				throw error;
			});
	}

	return templatesPromise;
};

const readDefaultTemplate = async ({ scriptFormat }) => {
	const templates = await readTemplates();

	return templates[scriptFormat === 'curlScript' ? 'curl' : 'kibana'];
};

module.exports = {
	applyTemplate,
	readDefaultTemplate,
};

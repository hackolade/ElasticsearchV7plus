const fs = require('fs/promises');
const path = require('path');

const buildTemplateContext = ({ mappingScript, modelData, indexData }) => ({
	body: mappingScript,
	host: modelData?.host || 'localhost',
	port: modelData?.port ?? 9200,
	indexName: (indexData?.name || '').toLowerCase(),
});

const applyTemplate = async ({ template, mappingScript, modelData, indexData, app }) => {
	const scope = buildTemplateContext({ mappingScript, modelData, indexData });
	const { renderLiquidTemplate } = await app.require('@hackolade/template-engine');
	const templates = await readTemplates();
	const { rendered: result } = await renderLiquidTemplate({ template, scope, templates });

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

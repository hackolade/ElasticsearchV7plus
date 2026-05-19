const {
	mergeSchemas,
	getIndexProperties,
	getSampleGenerationOptions,
	getScriptAndSampleResponse,
	getFieldsSchema,
	getMappingScript,
	getCurlScript,
	getKibanaScript,
} = require('./helpers/generateScriptHelpers');

const generateContainerScript = (data, logger, cb, app) => {
	try {
		const { containerData, jsonData, pluginConfiguration } = data;

		const modelData = (data.modelData || [])[0] || '';
		const indexData = (containerData || [])[0] || '';

		const scriptsData = data.entities.map(entityId => {
			return {
				fieldsSchema: getFieldsSchema({
					jsonSchema: JSON.parse(data.jsonSchema[entityId] || '""'),
					internalDefinitions: JSON.parse(data.internalDefinitions[entityId] || '""'),
					modelDefinitions: JSON.parse(data.modelDefinitions),
					externalDefinitions: JSON.parse(data.externalDefinitions),
					modelData,
					fieldLevelConfig: pluginConfiguration.fieldLevelConfig,
				}),
				entityData: data.entityData[entityId]?.[0] || {},
			};
		});
		const schema = scriptsData.reduce(
			(resultSchema, { fieldsSchema }) => mergeSchemas(resultSchema, fieldsSchema),
			{},
		);
		const indexMappingProperties = getIndexProperties(scriptsData);
		let mappingScript = getMappingScript(
			indexData,
			{ ...indexMappingProperties, properties: schema },
			logger,
			pluginConfiguration.containerLevelConfig,
		);

		const scriptFormat = data.options?.targetScriptOptions?.keyword;
		let script = '';
		if (scriptFormat === 'curlScript') {
			script = getCurlScript(mappingScript, modelData, indexData);
		} else {
			script = getKibanaScript(mappingScript, indexData);
		}

		const sampleGenerationOptions = getSampleGenerationOptions(app, data);
		if (!sampleGenerationOptions.isSampleGenerationRequired) {
			return cb(null, script);
		}
		// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
		if (sampleGenerationOptions.shouldAppendSamplesToTheResultScript) {
			// Sampling for CLI is not supported yet
			return cb(null, script);
		}
		const firstIndexSampleData = (Object.values(jsonData) || [''])[0];

		return cb(null, getScriptAndSampleResponse(script, firstIndexSampleData));
	} catch (error) {
		cb({
			message: error.message,
			stack: error.stack,
		});
	}
};

module.exports = {
	generateContainerScript,
};

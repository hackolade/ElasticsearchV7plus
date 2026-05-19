const {
	getSampleGenerationOptions,
	getScriptAndSampleResponse,
	getFieldsSchema,
	getTypeSchema,
	getMappingScript,
	getCurlScript,
	getKibanaScript,
} = require('./helpers/generateScriptHelpers');

const generateScript = (data, logger, cb, app) => {
	const {
		jsonSchema,
		modelData,
		entityData,
		jsonData,
		pluginConfiguration,
		containerData = {},
		internalDefinitions,
		modelDefinitions,
		externalDefinitions,
	} = data;

	let fieldsSchema = getFieldsSchema({
		jsonSchema: JSON.parse(jsonSchema),
		internalDefinitions: JSON.parse(internalDefinitions),
		modelDefinitions: JSON.parse(modelDefinitions),
		externalDefinitions: JSON.parse(externalDefinitions),
		fieldLevelConfig: pluginConfiguration.fieldLevelConfig,
	});
	let typeSchema = getTypeSchema(entityData, fieldsSchema);
	let mappingScript = getMappingScript(containerData, typeSchema, logger, pluginConfiguration.containerLevelConfig);

	const scriptFormat = data.options?.targetScriptOptions?.keyword;
	let script = '';
	if (scriptFormat === 'curlScript') {
		script = getCurlScript(mappingScript, modelData, containerData);
	} else {
		script = getKibanaScript(mappingScript, containerData);
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
	return cb(null, getScriptAndSampleResponse(script, jsonData));
};

module.exports = {
	generateScript,
};

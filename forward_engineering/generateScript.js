const { generateAlterScript } = require('./alterScript/alterScriptBuilder');
const { applyTemplate, readDefaultTemplate } = require('./helpers/applyTemplate');
const {
	getSampleGenerationOptions,
	getScriptAndSampleResponse,
	getFieldsSchema,
	getTypeSchema,
	getMappingScript,
} = require('./helpers/generateScriptHelpers');

const generateScript = async (data, logger, cb, app) => {
	try {
		if (data.isUpdateScript) {
			return generateAlterScript(data, cb, logger);
		}

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
		let mappingScript = getMappingScript(
			containerData,
			typeSchema,
			logger,
			pluginConfiguration.containerLevelConfig,
		);

		const scriptFormat = data.options?.targetScriptOptions?.keyword;

		const template = data.options?.template || (await readDefaultTemplate({ scriptFormat }));
		const script = await applyTemplate({
			template,
			indexData: containerData,
			mappingScript,
			modelData,
			app,
		});

		const sampleGenerationOptions = getSampleGenerationOptions(data);
		if (!sampleGenerationOptions.isSampleGenerationRequired) {
			return cb(null, script);
		}
		// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
		if (sampleGenerationOptions.shouldAppendSamplesToTheResultScript) {
			// Sampling for CLI is not supported yet
			return cb(null, script);
		}
		return cb(null, getScriptAndSampleResponse(script, jsonData));
	} catch (error) {
		cb({
			message: error.message,
			stack: error.stack,
		});
	}
};

module.exports = {
	generateScript,
};

const _ = require('lodash');
const {
	getSchemaByItem,
	mergeSchemas,
	getCurlUpdateScript,
	getKibanaUpdateScript,
	getIndexProperties,
	getMappingScript,
	getCurlScript,
	getKibanaScript,
	getSampleGenerationOptions,
	getScriptAndSampleResponse,
} = require('../helpers/generateScriptHelpers');

const getItems = data => [data?.items].flat().filter(Boolean);

const getItemProperties = data => getItems(data).map(item => Object.values(item.properties)[0]);

const getContainers = data =>
	getItems(data).map(container => {
		const [containerName, containerData] = Object.entries(container.properties)[0];
		return {
			...containerData,
			...containerData?.role,
			name: containerName,
		};
	});

const generateAlterScript = (data, callback, logger) => {
	const collection = JSON.parse(data.jsonSchema);
	if (!collection) {
		throw new Error(
			'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
		);
	}

	const scriptFormat = data.options?.targetScriptOptions?.keyword;
	const modelData = Array.isArray(data.modelData) ? data.modelData[0] : data.modelData;
	const internalDefinitions =
		typeof data.internalDefinitions === 'string'
			? JSON.parse(data.internalDefinitions)
			: JSON.parse(Object.values(data.internalDefinitions)[0]);
	const modelDefinitions = JSON.parse(data.modelDefinitions);
	const externalDefinitions = JSON.parse(data.externalDefinitions);
	const definitions = {
		internalDefinitions,
		modelDefinitions,
		externalDefinitions,
	};
	const { fieldLevelConfig, containerLevelConfig } = data.pluginConfiguration;

	const containersData = collection.properties?.containers?.properties;
	const entitiesData = collection.properties?.entities?.properties;

	const addedContainers = getContainers(containersData?.added);
	const addedEntities = getItemProperties(entitiesData?.added);

	const addedEntitiesScriptDataByContainer = addedEntities.reduce((result, entity) => {
		const properties = entity.properties?._source?.properties;

		if (_.isEmpty(properties)) {
			return result;
		}

		const schemaData = {
			jsonSchema: entity.role,
			modelData,
			fieldLevelConfig,
			...definitions,
		};

		const containerName = entity.role.compMod.bucketProperties.name;

		if (!result[containerName]) {
			result[containerName] = [];
		}

		result[containerName].push({
			fieldsSchema: getSchemaByItem(properties, schemaData, fieldLevelConfig),
			entityData: entity.role,
		});

		return result;
	}, {});

	const resultScript = Object.entries(addedEntitiesScriptDataByContainer)
		.map(([containerName, addedEntitiesScriptData]) => {
			const properties = addedEntitiesScriptData.reduce(
				(resultSchema, { fieldsSchema }) => mergeSchemas(resultSchema, fieldsSchema),
				{},
			);

			const addedContainer = addedContainers.find(({ name }) => name === containerName);

			if (addedContainer) {
				const indexMappingProperties = getIndexProperties(addedEntitiesScriptData);
				const mappingScript = getMappingScript(
					addedContainer,
					{ ...indexMappingProperties, properties },
					logger,
					containerLevelConfig,
				);

				return scriptFormat === 'curlScript'
					? getCurlScript(mappingScript, modelData, addedContainer)
					: getKibanaScript(mappingScript, addedContainer);
			}

			const mappingScript = { properties };

			return scriptFormat === 'curlScript'
				? getCurlUpdateScript(mappingScript, modelData, { name: containerName })
				: getKibanaUpdateScript(mappingScript, { name: containerName });
		})
		.join('\n\n');

	const sampleGenerationOptions = getSampleGenerationOptions(data);

	if (sampleGenerationOptions.isSampleGenerationRequired) {
		callback(null, getScriptAndSampleResponse(resultScript, resultScript && '// Not supported in delta model'));
	} else {
		callback(null, resultScript);
	}
};

module.exports = {
	generateAlterScript,
};

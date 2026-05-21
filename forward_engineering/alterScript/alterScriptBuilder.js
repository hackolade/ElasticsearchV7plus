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

const SUPPORTED_MAPPING_PARAMETERS = [
	'coerce',
	'fielddata',
	'fields',
	'ignore_above',
	'ignore_malformed',
	'meta',
	'norms',
	'search_analyzer',
];

const ALWAYS_KEEP_PROPERTY_KEYS = ['type', 'mode'];

const filterPropertyNodeForAlter = ({ newProperty = {}, oldProperty = {} } = {}) => {
	const filteredProperty = {};

	for (const parameter of SUPPORTED_MAPPING_PARAMETERS) {
		const newParameterValue = newProperty[parameter];

		if (newParameterValue !== undefined && !_.isEqual(newParameterValue, oldProperty[parameter])) {
			filteredProperty[parameter] = newParameterValue;
			if (parameter === 'search_analyzer') {
				filteredProperty.analyzer = oldProperty.analyzer || newProperty.analyzer;
			}
		}
	}

	if (newProperty.properties) {
		const filteredNestedProperties = filterPropertiesForAlter({
			newProperties: newProperty.properties,
			oldProperties: oldProperty.properties,
		});

		if (!_.isEmpty(filteredNestedProperties)) {
			filteredProperty.properties = filteredNestedProperties;
		}
	}

	if (_.isEmpty(filteredProperty)) {
		return {};
	}

	for (const key of ALWAYS_KEEP_PROPERTY_KEYS) {
		if (newProperty[key] !== undefined) {
			filteredProperty[key] = newProperty[key];
		}
	}

	return filteredProperty;
};

const filterPropertiesForAlter = ({ newProperties = {}, oldProperties = {} } = {}) =>
	Object.entries(newProperties).reduce((result, [propertyName, newProperty]) => {
		const filteredProperty = filterPropertyNodeForAlter({
			newProperty,
			oldProperty: oldProperties[propertyName],
		});

		if (!_.isEmpty(filteredProperty)) {
			result[propertyName] = filteredProperty;
		}

		return result;
	}, {});

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
	const modifiedEntities = getItemProperties(entitiesData?.modified);

	const scriptDataItemsByContainer = {};

	modifiedEntities.forEach(entity => {
		const newProperties = entity.properties._source.properties;
		const oldProperties = entity.role.properties._source.properties;
		const filteredProperties = filterPropertiesForAlter({ newProperties, oldProperties });

		if (_.isEmpty(filteredProperties)) {
			return;
		}

		const schemaData = {
			jsonSchema: entity.role,
			modelData,
			fieldLevelConfig,
			...definitions,
		};

		const containerName = entity.role.compMod.bucketProperties.name;

		if (!scriptDataItemsByContainer[containerName]) {
			scriptDataItemsByContainer[containerName] = [];
		}

		scriptDataItemsByContainer[containerName].push({
			fieldsSchema: getSchemaByItem(filteredProperties, schemaData, fieldLevelConfig),
			entityData: entity.role,
		});
	});

	addedEntities.forEach((result, entity) => {
		const properties = entity.properties?._source?.properties;

		if (_.isEmpty(properties)) {
			return;
		}

		const schemaData = {
			jsonSchema: entity.role,
			modelData,
			fieldLevelConfig,
			...definitions,
		};

		const containerName = entity.role.compMod.bucketProperties.name;

		if (!scriptDataItemsByContainer[containerName]) {
			scriptDataItemsByContainer[containerName] = [];
		}

		scriptDataItemsByContainer[containerName].push({
			fieldsSchema: getSchemaByItem(properties, schemaData, fieldLevelConfig),
			entityData: entity.role,
		});
	});

	const resultScript = Object.entries(scriptDataItemsByContainer)
		.map(([containerName, scriptDataItems]) => {
			const properties = scriptDataItems.reduce(
				(resultSchema, { fieldsSchema }) => mergeSchemas(resultSchema, fieldsSchema),
				{},
			);

			const addedContainer = addedContainers.find(({ name }) => name === containerName);

			if (addedContainer) {
				const indexMappingProperties = getIndexProperties(scriptDataItems);
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

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
	getCurlUpdateSettingsScript,
	getKibanaUpdateSettingsScript,
	getCurlDeleteIndexScript,
	getKibanaDeleteIndexScript,
} = require('../helpers/generateScriptHelpers');
const { getIndexSettings } = require('../mappers/indexSettingsMapper');

const STATIC_CHANGE = 'static_change';

const DYNAMIC_MAPPING_PARAMETERS = [
	'coerce',
	'fielddata',
	'stringfields',
	'ignore_above',
	'ignore_malformed',
	'meta',
	'norms',
	'search_analyzer',
];

const DYNAMIC_INDEX_SETTINGS = new Set([
	'number_of_replicas',
	'auto_expand_replicas',
	'refresh_interval',
	'max_result_window',
	'max_inner_result_window',
	'max_rescore_window',
	'max_docvalue_fields_search',
	'max_script_fields',
	'max_ngram_diff',
	'max_shingle_diff',
	'max_refresh_listeners',
	'max_terms_count',
	'max_regex_length',
	'gc_deletes',
	'default_pipeline',
	'final_pipeline',
	'blocks',
	'index.indexing.slowlog.include.user',
	'index.indexing.slowlog.reformat',
	'index.indexing.slowlog.source',
	'index.indexing.slowlog.threshold.index.warn',
	'index.search.slowlog.include.user',
	'index.search.slowlog.threshold.fetch.debug',
	'index.search.slowlog.threshold.query.info',
]);

const ALWAYS_KEEP_PROPERTY_KEYS = ['type', 'mode', 'index_options'];

const isDynamicMappingParameter = parameter => DYNAMIC_MAPPING_PARAMETERS.includes(parameter);

const getChangedKeysExcludingProperties = ({ newObject = {}, oldObject = {} } = {}) =>
	_.union(Object.keys(newObject), Object.keys(oldObject)).filter(
		key => key !== 'properties' && !_.isEqual(newObject[key], oldObject[key]),
	);

const hasNonDynamicMappingChange = ({ newProperty = {}, oldProperty = {} } = {}) =>
	getChangedKeysExcludingProperties({ newObject: newProperty, oldObject: oldProperty }).some(
		key => !isDynamicMappingParameter(key),
	);

const applyDynamicParameterChanges = ({ newProperty = {}, oldProperty = {} } = {}) => {
	const filteredProperty = {};

	for (const parameter of DYNAMIC_MAPPING_PARAMETERS) {
		const oldParameterValue = oldProperty[parameter];
		const newParameterValue = newProperty[parameter];

		if (!_.isEqual(newParameterValue, oldParameterValue)) {
			if (newParameterValue === undefined) {
				if (_.isBoolean(oldParameterValue)) {
					filteredProperty[parameter] = false;
				}
			} else {
				filteredProperty[parameter] = newParameterValue;
			}

			if (newParameterValue && parameter === 'search_analyzer') {
				filteredProperty.analyzer = oldProperty.analyzer || newProperty.analyzer;
			}
		}
	}

	return filteredProperty;
};

const filterPropertyNodeForAlter = ({ newProperty = {}, oldProperty } = {}) => {
	if (oldProperty === undefined) {
		throw new Error(STATIC_CHANGE);
	}

	if (hasNonDynamicMappingChange({ newProperty, oldProperty })) {
		throw new Error(STATIC_CHANGE);
	}

	const filteredProperty = applyDynamicParameterChanges({ newProperty, oldProperty });

	if (newProperty.properties) {
		const filteredNestedProperties = filterPropertiesForAlter({
			newProperties: newProperty.properties,
			oldProperties: oldProperty.properties || {},
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
	const modifiedContainers = getContainers(containersData?.modified);
	const deletedContainers = getContainers(containersData?.deleted);
	const addedEntities = getItemProperties(entitiesData?.added);
	const modifiedEntities = getItemProperties(entitiesData?.modified);
	const deletedEntities = getItemProperties(entitiesData?.deleted);

	const containersToRecreate = new Set([]);

	deletedEntities.forEach(entity => {
		const source = entity.properties?._source;
		if (source) {
			const isAnyFieldDeleted = entity.compMod?.deleted
				? Boolean(source.properties && Object.keys(source.properties).length)
				: source.compMod.newField.properties.length !== source.compMod.oldField.properties.length;

			if (isAnyFieldDeleted) {
				containersToRecreate.add(entity.role.compMod.bucketProperties.name);
			}
		}
	});

	const updateIndexSettingsScript = modifiedContainers.reduce((resultScript, container) => {
		const hasNameChanged = container.compMod.name.old !== container.compMod.name.new;

		if (hasNameChanged) {
			containersToRecreate.add(container.compMod.name.old);
			return resultScript;
		}

		const newContainerProperties = container;
		const oldContainerProperties = Object.entries(container.compMod).reduce(
			(resultContainer, [property, compMod]) => {
				resultContainer[property] = compMod.old;
				return resultContainer;
			},
			{ ...container },
		);

		const newSettings = getIndexSettings(newContainerProperties, logger, containerLevelConfig);
		const oldSettings = getIndexSettings(oldContainerProperties, logger, containerLevelConfig);

		if (_.isEqual(newSettings, oldSettings) || !newSettings) {
			return resultScript;
		}

		const changedSettings = _.pickBy(newSettings, (value, key) => !_.isEqual(value, oldSettings?.[key]));

		const hasStaticPropertyChanged = Object.keys(changedSettings).some(
			property => !DYNAMIC_INDEX_SETTINGS.has(property),
		);

		if (hasStaticPropertyChanged) {
			containersToRecreate.add(container.name);
			return resultScript;
		}

		const script =
			scriptFormat === 'curlScript'
				? getCurlUpdateSettingsScript(changedSettings, modelData, container)
				: getKibanaUpdateSettingsScript(changedSettings, container);

		return `${resultScript}\n\n${script}`.trim();
	}, '');

	const deleteIndexScript = deletedContainers.reduce((resultScript, container) => {
		const script =
			scriptFormat === 'curlScript'
				? getCurlDeleteIndexScript(container, modelData)
				: getKibanaDeleteIndexScript(container);

		return `${resultScript}\n\n${script}`.trim();
	}, '');

	const scriptDataItemsByContainer = {};

	modifiedEntities.forEach(entity => {
		const containerName = entity.role.compMod.bucketProperties.name;

		if (containersToRecreate.has(containerName)) {
			return;
		}

		const schemaData = {
			jsonSchema: entity.role,
			modelData,
			fieldLevelConfig,
			...definitions,
		};

		const newProperties = getSchemaByItem(entity.properties._source.properties, schemaData, fieldLevelConfig);
		const oldProperties = getSchemaByItem(entity.role.properties._source.properties, schemaData, fieldLevelConfig);
		let changedProperties = {};

		try {
			changedProperties = filterPropertiesForAlter({ newProperties, oldProperties });
		} catch (error) {
			if (error?.message === STATIC_CHANGE) {
				containersToRecreate.add(containerName);
			}
			return;
		}

		if (_.isEmpty(changedProperties)) {
			return;
		}

		if (!scriptDataItemsByContainer[containerName]) {
			scriptDataItemsByContainer[containerName] = [];
		}

		scriptDataItemsByContainer[containerName].push({
			fieldsSchema: changedProperties,
			entityData: entity.role,
		});
	});

	addedEntities.forEach(entity => {
		const containerName = entity.role.compMod.bucketProperties.name;

		if (containersToRecreate.has(containerName)) {
			return;
		}

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

		if (!scriptDataItemsByContainer[containerName]) {
			scriptDataItemsByContainer[containerName] = [];
		}

		scriptDataItemsByContainer[containerName].push({
			fieldsSchema: getSchemaByItem(properties, schemaData, fieldLevelConfig),
			entityData: entity.role,
		});
	});

	const updateMappingOrCreateIndexScript = Object.entries(scriptDataItemsByContainer)
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

	const recreateIndexWarning = containersToRecreate.size
		? `// The following indexes require recreation, which is not supported by Hackolade,\n// and will be ignored: ${Array.from(containersToRecreate).join(', ')}.`
		: '';

	const resultScript = [
		recreateIndexWarning,
		deleteIndexScript,
		updateIndexSettingsScript,
		updateMappingOrCreateIndexScript,
	]
		.map(script => script.trim())
		.filter(Boolean)
		.join('\n\n');

	const sampleGenerationOptions = getSampleGenerationOptions(data);

	if (sampleGenerationOptions.isSampleGenerationRequired) {
		callback(null, getScriptAndSampleResponse(resultScript, ''));
	} else {
		callback(null, resultScript);
	}
};

module.exports = {
	generateAlterScript,
};

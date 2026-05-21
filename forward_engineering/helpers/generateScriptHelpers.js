const _ = require('lodash');
const propertiesHelper = require('../../shared/propertiesHelper');
const schemaHelper = require('../../shared/schemaHelper');
const { getIndexSettings } = require('../mappers/indexSettingsMapper');

const getSchemaByItem = (properties, data, fieldLevelConfig) => {
	let schema = {};

	for (let fieldName in properties) {
		let field = properties[fieldName];

		schema[fieldName] = getField(field, data, fieldLevelConfig);
	}

	return schema;
};

const getField = (field, data, fieldLevelConfig) => {
	let schema = {};
	const fieldWithExtras = {
		...field,
		dbVersion: data.modelData?.dbVersion,
	};
	const fieldProperties = propertiesHelper.getFieldProperties(field.type, fieldWithExtras, {}, fieldLevelConfig);
	let type = getFieldType(field);

	if (type !== 'object' && type !== 'array') {
		schema.type = type;
	}

	if (type === 'object') {
		schema.properties = {};
	}

	setProperties(schema, fieldProperties, data);

	if (type === 'alias') {
		return { ...schema, ...getAliasSchema(field, data) };
	} else if (type === 'join') {
		return { ...schema, ...getJoinSchema(field) };
	} else if (
		[
			'completion',
			'sparse_vector',
			'dense_vector',
			'geo_shape',
			'geo_point',
			'rank_feature',
			'rank_features',
		].includes(type)
	) {
		return schema;
	} else if (field.properties && !['range', 'flattened'].includes(field.type)) {
		schema.properties = getSchemaByItem(field.properties, data, fieldLevelConfig);
	} else if (field.items) {
		let arrData = field.items;

		if (Array.isArray(field.items)) {
			arrData = field.items[0];
		}

		schema = { ...schema, ...getField(arrData, data, fieldLevelConfig) };
	}

	return schema;
};

const getFieldType = field => {
	switch (field.type) {
		case 'geo-shape':
			return 'geo_shape';
		case 'geo-point':
			return 'geo_point';
		case 'number':
			return field.mode || 'long';
		case 'string':
			return field.mode || 'text';
		case 'range':
			return field.mode || 'integer_range';
		case 'null':
			return 'long';
		default:
			return field.type;
	}
};

const setProperties = (schema, properties, data) => {
	for (let propName in properties) {
		if (propName === 'stringfields') {
			try {
				schema.fields = JSON.parse(properties[propName]);
			} catch {}
		} else if (propName === 'customAnalyzerName') {
			schema.analyzer = properties[propName];
		} else if (isFieldList(properties[propName])) {
			const names = schemaHelper.getNamesByIds(
				properties[propName].map(item => item.keyId),
				[data.jsonSchema, data.internalDefinitions, data.modelDefinitions, data.externalDefinitions],
			);
			if (names.length) {
				schema[propName] = names.length === 1 ? names[0] : names;
			}
		} else if (propName === 'enabled') {
			if (properties[propName] === false) {
				schema[propName] = false;
			}
		} else if (propName === 'meta') {
			try {
				schema.meta = JSON.parse(properties[propName]);
			} catch {}
		} else {
			schema[propName] = properties[propName];
		}
	}

	return schema;
};

const isFieldList = property => {
	if (!Array.isArray(property)) {
		return false;
	}

	if (!property[0]) {
		return false;
	}

	return Boolean(property[0].keyId);
};

const getJoinSchema = field => {
	if (!Array.isArray(field.relations)) {
		return {};
	}

	const relations = field.relations.reduce((result, item) => {
		if (!item.parent) {
			return result;
		}

		if (!Array.isArray(item.children)) {
			return result;
		}

		if (item.children.length === 1) {
			return { ...result, [item.parent]: item.children[0]?.name };
		}

		return { ...result, [item.parent]: item.children.map(item => item.name || '') };
	}, {});

	return { relations };
};

const getAliases = indexData => {
	let aliases;

	if (!indexData.aliases) {
		return aliases;
	}

	indexData.aliases.forEach(alias => {
		if (alias.name) {
			if (!aliases) {
				aliases = {};
			}

			aliases[alias.name] = {};

			if (alias.filter) {
				let filterData = '';
				try {
					filterData = JSON.parse(alias.filter);
				} catch (e) {}

				aliases[alias.name].filter = {
					term: filterData,
				};
			}

			if (alias.routing) {
				aliases[alias.name].routing = alias.routing;
			}
		}
	});

	return aliases;
};

const getAliasSchema = (field, data) => {
	if (!Array.isArray(field.path)) {
		return {};
	}

	if (field.path.length === 0) {
		return {};
	}

	const pathName = schemaHelper.getPathName(field.path[0].keyId, [
		data.jsonSchema,
		data.internalDefinitions,
		data.modelDefinitions,
		data.externalDefinitions,
	]);

	return { path: pathName };
};

const getCurlScript = (mapping, modelData, indexData) => {
	const host = modelData.host || 'localhost';
	const port = modelData.port || 9200;
	const indexName = indexData.name || '';

	return `curl -X PUT '${host}:${port}/${indexName.toLowerCase()}?pretty' -H 'Content-Type: application/json' -d '\n${JSON.stringify(mapping, null, 4)}\n'`;
};

const getCurlUpdateScript = (mapping, modelData, indexData) => {
	const host = modelData.host || 'localhost';
	const port = modelData.port || 9200;
	const indexName = indexData.name || '';

	return `curl -X PUT '${host}:${port}/${indexName.toLowerCase()}/_mapping' -H 'Content-Type: application/json' -d '\n${JSON.stringify(mapping, null, 4)}\n'`;
};

const getCurlUpdateSettingsScript = (settings, modelData, indexData) => {
	const host = modelData.host || 'localhost';
	const port = modelData.port || 9200;
	const indexName = indexData.name || '';

	return `curl -X PUT '${host}:${port}/${indexName.toLowerCase()}/_settings' -H 'Content-Type: application/json' -d '\n${JSON.stringify(settings, null, 4)}\n'`;
};

const getKibanaScript = (mapping, indexData) => {
	const indexName = indexData.name || '';

	return `PUT /${indexName.toLowerCase()}\n${JSON.stringify(mapping, null, 4)}`;
};

const getKibanaUpdateScript = (mapping, indexData) => {
	const indexName = indexData.name || '';

	return `PUT /${indexName.toLowerCase()}/_mapping\n${JSON.stringify(mapping, null, 4)}`;
};

const getKibanaUpdateSettingsScript = (settings, indexData) => {
	const indexName = indexData.name || '';

	return `PUT /${indexName.toLowerCase()}/_settings\n${JSON.stringify(settings, null, 4)}`;
};

const getFieldsSchema = data => {
	const { jsonSchema, fieldLevelConfig } = data;
	let schema = {};

	if (!jsonSchema.properties?._source?.properties) {
		return schema;
	}

	schema = getSchemaByItem(jsonSchema.properties._source.properties, data, fieldLevelConfig);

	return schema;
};

const getTypeSchema = (typeData, fieldsSchema) => {
	let script = {};

	if (typeData.dynamic) {
		script.dynamic = typeData.dynamic;
	}

	script.properties = fieldsSchema;

	return {
		[(typeData.collectionName || '').toLowerCase()]: script,
	};
};

const getMappingScript = (indexData, typeSchema, logger, containerLevelConfig) => {
	let mappingScript = {};
	let settings = getIndexSettings(indexData, logger, containerLevelConfig);
	let aliases = getAliases(indexData);

	if (settings) {
		mappingScript.settings = settings;
	}

	if (aliases) {
		mappingScript.aliases = aliases;
	}

	mappingScript.mappings = typeSchema;

	const mappingRouting = getMappingRouting(indexData);
	if (mappingRouting) {
		mappingScript = {
			...mappingScript,
			mappings: {
				_routing: mappingRouting,
				...mappingScript.mappings,
			},
		};
	}

	return mappingScript;
};

const getSampleGenerationOptions = data => {
	const insertSamplesOption =
		_.get(data, 'options.additionalOptions', []).find(option => option.id === 'INCLUDE_SAMPLES') || {};
	const isSampleGenerationRequired = Boolean(insertSamplesOption?.value);
	// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
	const shouldAppendSamplesToTheResultScript = data.options.origin !== 'ui';

	return {
		isSampleGenerationRequired,
		shouldAppendSamplesToTheResultScript,
	};
};

const getScriptAndSampleResponse = (script, sample) => {
	return [
		{
			title: 'Elasticsearsh script',
			script,
		},
		{
			title: 'Sample data',
			script: sample,
		},
	];
};

const getIndexProperties = scriptsData => {
	return scriptsData.reduce((result, { entityData }) => {
		if (entityData.dynamic) {
			result.dynamic = entityData.dynamic;
		}
		if (entityData.enabled === false) {
			result.enabled = entityData.enabled;
		}
		return result;
	}, {});
};

const mergeSchemas = (schemaA, schemaB) => {
	const aKeys = Object.keys(schemaA);
	const bKeys = Object.keys(schemaB).filter(bKey => !aKeys.includes(bKey));
	let result = {};

	aKeys.forEach(aKey => {
		const aValue = schemaA[aKey];
		const bValue = schemaB[aKey];

		if (!bValue) {
			result[aKey] = aValue;
			return;
		}

		if (aValue.properties && bValue.properties) {
			result[aKey] = {
				...aValue,
				properties: mergeSchemas(aValue.properties, bValue.properties),
			};
		} else if (!aValue.properties && bValue.properties) {
			result[aKey] = bValue;
		} else {
			result[aKey] = aValue;
		}
	});

	bKeys.forEach(bKey => {
		result[bKey] = schemaB[bKey];
	});

	return result;
};

const getMappingRouting = indexData => {
	if (!indexData.mappingRouting) {
		return null;
	}

	const required = getBooleanValue(indexData.mappingRouting.required);
	if (required === null) {
		return null;
	}

	return {
		required,
	};
};

const getBooleanValue = value => {
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	return null;
};

module.exports = {
	getCurlScript,
	getCurlUpdateScript,
	getCurlUpdateSettingsScript,
	getKibanaScript,
	getKibanaUpdateScript,
	getKibanaUpdateSettingsScript,
	getFieldsSchema,
	getTypeSchema,
	getMappingScript,
	getSampleGenerationOptions,
	getScriptAndSampleResponse,
	getIndexProperties,
	mergeSchemas,
	getSchemaByItem,
};

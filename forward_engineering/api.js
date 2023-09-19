const helper = require('../helper/helper.js');
const schemaHelper = require('../helper/schemaHelper.js');
const { ElasticSearchService} = require("./service/elasticsearch/elasticsearchService");
const {ElasticSearchClientFactory} = require("./service/elasticsearch/clientFactory");
const curlParser = require("./scriptParser/curlScriptParser");
const kibanaParser = require("./scriptParser/kibanaScriptParser");
const { getIndexSettings } = require('./mappers/indexSettingsMapper');

const getSampleGenerationOptions = (app, data) => {
	const _ = app.require('lodash');
	const insertSamplesOption = _.get(data, 'options.additionalOptions', []).find(option => option.id === 'INCLUDE_SAMPLES') || {};
	const isSampleGenerationRequired = Boolean(insertSamplesOption?.value);
	// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
	const shouldAppendSamplesToTheResultScript = data.options.origin !== 'ui';

	return {
		isSampleGenerationRequired,
		shouldAppendSamplesToTheResultScript
	}
}

const getScriptAndSampleResponse = (script, sample) => {
	return [
		{
			title: 'Elasticsearsh script',
			script
		},
		{
			title: 'Sample data',
			script: sample,
		},
	]
}

/**
 * @param error {Error}
 * @return {{
 *     message: string,
 *     stack: string | undefined,
 * }}
 * */
const extractNonSensitiveInfoFromError = (error) => {
	return {
		message: error.message,
		stack: error.stack,
	}
}

module.exports = {
	generateScript(data, logger, cb, app) {
		const { jsonSchema, modelData, entityData, isUpdateScript, jsonData } = data;
		const containerData = data.containerData || {};

		let fieldsSchema = this.getFieldsSchema({
			jsonSchema: JSON.parse(jsonSchema),
			internalDefinitions: JSON.parse(data.internalDefinitions),
			modelDefinitions: JSON.parse(data.modelDefinitions),
			externalDefinitions: JSON.parse(data.externalDefinitions)
		});
		let typeSchema = this.getTypeSchema(entityData, fieldsSchema);
		let mappingScript = this.getMappingScript(containerData, typeSchema, logger);

		let script = "";
		if (isUpdateScript) {
			script = this.getCurlScript(mappingScript, modelData, containerData);
		} else {
			script = this.getKibanaScript(mappingScript, containerData);
		}

		const sampleGenerationOptions = getSampleGenerationOptions(app, data);
		if (!sampleGenerationOptions.isSampleGenerationRequired) {
			return cb(null, script);
		}
		// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
		if (sampleGenerationOptions.shouldAppendSamplesToTheResultScript) {
			// Sampling for CLI is not supported yet
			return cb(null, script)
		}
		return cb(null, getScriptAndSampleResponse(script, jsonData));
	},

	generateContainerScript(data, logger, cb, app) {
		try {
			const { containerData, isUpdateScript, jsonData } = data;
			const modelData = (data.modelData || [])[0] || '';
			const indexData = (containerData || [])[0] || '';

			const scriptsData = data.entities.map(entityId => {
				return {
					fieldsSchema: this.getFieldsSchema({
						jsonSchema: JSON.parse(data.jsonSchema[entityId] || '""'),
						internalDefinitions: JSON.parse(data.internalDefinitions[entityId] || '""'),
						modelDefinitions: JSON.parse(data.modelDefinitions),
						externalDefinitions: JSON.parse(data.externalDefinitions)
					}),
					entityData: data.entityData[entityId]?.[0] || {},
				};
			});
			const schema = scriptsData.reduce((resultSchema, { fieldsSchema }) => mergeSchemas(resultSchema, fieldsSchema), {});
			const indexMappingProperties = getIndexProperties(scriptsData);
			let mappingScript = this.getMappingScript(indexData, { ...indexMappingProperties, properties: schema }, logger);

			let script = "";
			if (isUpdateScript) {
				script = this.getCurlScript(mappingScript, modelData, indexData);
			} else {
				script = this.getKibanaScript(mappingScript, indexData);
			}

			const sampleGenerationOptions = getSampleGenerationOptions(app, data);
			if (!sampleGenerationOptions.isSampleGenerationRequired) {
				return cb(null, script);
			}
			// Append to result script if the plugin is invoked from cli and do not append if it's invoked from GUI app
			if (sampleGenerationOptions.shouldAppendSamplesToTheResultScript) {
				// Sampling for CLI is not supported yet
				return cb(null, script)
			}
			const firstIndexSampleData = (Object.values(jsonData) || [''])[0];

			return cb(null, getScriptAndSampleResponse(script, firstIndexSampleData));
		} catch (error) {
			cb({
				message: error.message,
				stack: error.stack,
			});
		}
	},

	async applyToInstance(data, logger, cb, app) {
		try {
			const client = ElasticSearchClientFactory.getByConnectionInfo(data);
			const elasticSearchService = new ElasticSearchService(client);
			const {script, entitiesData} = data;

			let parsedScriptData;
			if (script.startsWith('curl')) {
				parsedScriptData = curlParser.parseCurlScript(script);
			} else {
				parsedScriptData = kibanaParser.parseKibanaScript(script);
			}

			await elasticSearchService.applyToInstance(parsedScriptData, entitiesData);
			await elasticSearchService.close();
			return cb(null);
		} catch (e) {
			const error = extractNonSensitiveInfoFromError(e);
			logger.log('error', error, 'Apply to instance', data.hiddenKeys);
			return cb(error);
		}
	},

	async testConnection(data, logger, cb, app) {
		try {
			const client = ElasticSearchClientFactory.getByConnectionInfo(data);
			const elasticSearchService = new ElasticSearchService(client);
			await elasticSearchService.testConnection();
			await elasticSearchService.close();
			return cb(null);
		} catch (e) {
			const error = extractNonSensitiveInfoFromError(e);
			logger.log('error', error, 'Apply to instance', data.hiddenKeys);
			return cb(error);
		}
	},

	getCurlScript(mapping, modelData, indexData) {
		const host = modelData.host || 'localhost';
		const port = modelData.port || 9200;
		const indexName = indexData.name || "";

		return `curl -XPUT '${host}:${port}/${indexName.toLowerCase()}?pretty' -H 'Content-Type: application/json' -d '\n${JSON.stringify(mapping, null, 4)}\n'`;
	},

	getKibanaScript(mapping, indexData) {
		const indexName = indexData.name || "";

		return `PUT /${indexName.toLowerCase()}\n${JSON.stringify(mapping, null, 4)}`;
	},

	getFieldsSchema(data) {
		const {
			jsonSchema
		} = data;
		let schema = {};

		if (!(jsonSchema.properties && jsonSchema.properties._source && jsonSchema.properties._source.properties)) {
			return schema;
		}

		schema = this.getSchemaByItem(jsonSchema.properties._source.properties, data)

		return schema;
	},

	getSchemaByItem(properties, data) {
		let schema = {};

		for (let fieldName in properties) {
			let field = properties[fieldName];

			schema[fieldName] = this.getField(field, data);
		}

		return schema;
	},

	getField(field, data) {
		let schema = {};
		const fieldProperties = helper.getFieldProperties(field.type, field, {});
		let type = this.getFieldType(field);

		if (type !== 'object' && type !== 'array') {
			schema.type = type;
		}

		if (type === 'object') {
			schema.properties = {};
		}

		this.setProperties(schema, fieldProperties, data);

		if (type === 'alias') {
			return Object.assign({}, schema, this.getAliasSchema(field, data));
		} else if (type === 'join') {
			return Object.assign({}, schema, this.getJoinSchema(field));
		} else if (
			[
				'completion', 'sparse_vector', 'dense_vector', 'geo_shape', 'geo_point', 'rank_feature', 'rank_features'
			].includes(type)
		) {
			return schema;
		} else if (field.properties && field.type !== 'range') {
			schema.properties = this.getSchemaByItem(field.properties, data);
		} else if (field.items) {
			let arrData = field.items;

			if (Array.isArray(field.items)) {
				arrData = field.items[0];
			}

			schema = Object.assign(schema, this.getField(arrData, data));
		}

		return schema;
	},

	getFieldType(field) {
		switch(field.type) {
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
	},

	setProperties(schema, properties, data) {
		for (let propName in properties) {
			if (propName === 'stringfields') {
				try {
					schema['fields'] = JSON.parse(properties[propName]);
				} catch (e) {
				}
			} else if (propName === 'customAnalyzerName') {
				schema['analyzer'] = properties[propName];
			} else if (this.isFieldList(properties[propName])) {
				const names = schemaHelper.getNamesByIds(
					properties[propName].map(item => item.keyId),
					[
						data.jsonSchema,
						data.internalDefinitions,
						data.modelDefinitions,
						data.externalDefinitions
					]
				);
				if (names.length) {
					schema[propName] = names.length === 1 ? names[0] : names;
				}
			} else {
				schema[propName] = properties[propName];
			}
		}

		return schema;
	},

	getTypeSchema(typeData, fieldsSchema) {
		let script = {};

		if (typeData.dynamic) {
			script.dynamic = typeData.dynamic;
		}

		script.properties = fieldsSchema;

		return {
			[(typeData.collectionName || "").toLowerCase()]: script
		};
	},

	getMappingScript(indexData, typeSchema, logger) {
		let mappingScript = {};
		let settings = getIndexSettings(indexData, logger);
		let aliases = this.getAliases(indexData);

		if (settings) {
			mappingScript.settings = settings;
		}

		if (aliases) {
			mappingScript.aliases = aliases;
		}

		mappingScript.mappings = typeSchema;

		return mappingScript;
	},

	getAliases(indexData) {
		let aliases;

		if (!indexData.aliases) {
			return aliases;
		}

		indexData.aliases.forEach((alias) => {
			if (alias.name) {
				if (!aliases) {
					aliases = {};
				}

				aliases[alias.name] = {};

				if (alias.filter) {
					let filterData = "";
					try {
						filterData = JSON.parse(alias.filter);
					} catch (e) {}

					aliases[alias.name].filter = {
						term: filterData
					};
				}

				if (alias.routing) {
					aliases[alias.name].routing = alias.routing;
				}
			}
		});

		return aliases;
	},

	isFieldList(property) {
		if (!Array.isArray(property)) {
			return false;
		}

		if (!property[0]) {
			return false;
		}

		if (property[0].keyId) {
			return true;
		}

		return false;
	},

	getJoinSchema(field) {
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
				return Object.assign({}, result, {
					[item.parent]: (item.children[0] || {}).name
				});
			}

			return Object.assign({}, result, {
				[item.parent]: item.children.map(item => item.name || "")
			});
		}, {});

		return { relations };
	},

	getAliasSchema(field, data) {
		if (!Array.isArray(field.path)) {
			return {};
		}

		if (field.path.length === 0) {
			return {};
		}

		const pathName = schemaHelper.getPathName(
			field.path[0].keyId,
			[
				data.jsonSchema,
				data.internalDefinitions,
				data.modelDefinitions,
				data.externalDefinitions
			]
		);

		return { path: pathName };
	}
};

const getPriority = (a, b) => {
	if (a.properties && b.properties) {
		return 0;
	} else if (!a.properties) {
		return -1;
	} else {
		return 1;
	}
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

		const priority = getPriority(aValue, bValue);

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

const getIndexProperties = (scriptsData) => {
	return scriptsData.reduce((result, { entityData }) => {
		if (entityData.dynamic) {
			result.dynamic = entityData.dynamic;
		}
		if (typeof entityData.enabled === 'boolean') {
			result.enabled = entityData.enabled;
		}
		return result;
	}, {});
};

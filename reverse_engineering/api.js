const _ = require('lodash');
const async = require('async');
const { ElasticSearchClientFactory } = require('../shared/elasticsearchClientFactory');
const SchemaCreator = require('./SchemaCreator');
const inferSchemaService = require('./helpers/inferSchemaService');
const { getAnalysisData } = require('./helpers/analysisSettingsHelper');
const { getIndexRefreshInterval } = require('./helpers/refreshIntervalMapper');
const { getSlowlogDataFromSettings } = require('./helpers/slowlogSettingsHelper');
const { ConnectionType } = require('../enums/connectionTypeEnum');
const versions = require('../package.json').contributes.target.versions;

let _connectionInfo = null;

let _client = null;

module.exports = {
	connect: function (connectionInfo, logger, cb) {
		logger.clear();
		logger.log('info', connectionInfo, 'Connection information', connectionInfo.hiddenKeys);

		if (_client !== null) {
			return cb(null, _client);
		}

		try {
			_connectionInfo = connectionInfo;
			_client = ElasticSearchClientFactory.getByConnectionInfo(connectionInfo);
			cb(null, _client);
		} catch (err) {
			cb(err);
		}
	},

	disconnect: function (connectionInfo, logger, cb) {
		if (_client) {
			_client.close();
			_client = null;
		}
		_connectionInfo = null;
		cb();
	},

	testConnection: function (connectionInfo, logger, cb) {
		this.connect(connectionInfo, logger, async (err, connection) => {
			if (err) {
				return cb(err);
			}
			try {
				await connection.ping(undefined, { requestTimeout: 5000 });
				this.disconnect(connectionInfo, logger, () => {});
				cb(null);
			} catch (error) {
				logger.log('error', error, 'Test connection', connectionInfo.hiddenKeys);
				this.disconnect(connectionInfo, logger, () => {});
				cb(error);
			}
		});
	},

	getDatabases: function (connectionInfo, logger, cb) {
		cb();
	},

	getDocumentKinds: function (connectionInfo, logger, cb) {
		this.connect(connectionInfo, logger, async (err, client) => {
			try {
				if (err) {
					throw err;
				}
				const { includeSystemCollection } = connectionInfo;
				const indexes = await getIndexes(client, includeSystemCollection);
				const indexNames = Object.keys(indexes);
				const documentPackages = await Promise.all(
					indexNames.map(async indexName => {
						const documents = await getDocuments({
							client,
							indexName,
							recordSamplingSettings: connectionInfo.recordSamplingSettings,
						});
						const inferSchema = inferSchemaService.generateCustomInferSchema(
							_.get(documents, 'hits.hits').map(doc => doc._source),
						);
						const { suggestedDocKinds, documentKind, otherDocKinds } =
							inferSchemaService.getDocumentKindDataFromInfer(
								{
									inference: inferSchema,
									excludeDocKind: connectionInfo.excludeDocKind,
								},
								90,
							);

						return {
							bucketName: indexName,
							documentList: suggestedDocKinds,
							documentKind: documentKind.key,
							otherDocKinds,
						};
					}),
				);

				cb(null, documentPackages);
			} catch (err) {
				logger.log('error', err);
				this.disconnect(connectionInfo, logger, () => {});
				cb(err);
			}
		});
	},

	getDbCollectionsNames: function (connectionInfo, logger, cb) {
		this.connect(connectionInfo, logger, async (err, client) => {
			try {
				if (err) {
					throw err;
				}
				const { includeSystemCollection, documentKinds, recordSamplingSettings } = connectionInfo;
				const indexes = await getIndexes(client, includeSystemCollection);
				const data = await Promise.all(
					Object.keys(indexes).map(async indexName => {
						const documentKind = documentKinds[indexName].documentKindName;
						let dbCollections = [];

						if (documentKind) {
							let documents = await getDocuments({ client, indexName, recordSamplingSettings });
							dbCollections = _.uniq(
								_.get(documents, 'hits.hits')
									.map(doc => doc._source)
									.map(data => {
										return String(data[documentKind]);
									})
									.filter(Boolean),
							);
						}

						return {
							dbName: indexName,
							dbCollections,
						};
					}),
				);

				cb(null, data);
			} catch (err) {
				logger.log('error', err);
				this.disconnect(connectionInfo, logger, () => {});
				cb(err);
			}
		});
	},

	getDbCollectionsData: function (data, logger, cb) {
		let includeEmptyCollection = data.includeEmptyCollection;
		let { recordSamplingSettings, fieldInference, documentKinds, pluginConfiguration } = data;
		const indices = data.collectionData.dataBaseNames;
		const indexTypes = data.collectionData.collections;

		const defaultBucketInfo = {
			indexName: '_index',
			indexType: 'string',
			docIDName: '_id',
			docIDType: 'string',
			sourceName: '_source',
			sourceType: 'object',
		};

		const containerLevelKeys = {
			index: '_index',
			docID: '_id',
			source: '_source',
		};

		logger.log(
			'info',
			getSamplingInfo(recordSamplingSettings, fieldInference),
			'Reverse-Engineering sampling params',
			data.hiddenKeys,
		);
		logger.log('info', { Indices: indices }, 'Selected collection list', data.hiddenKeys);
		logger.progress({ message: 'Start reverse-engineering ...', containerName: '', entityName: '' });

		async.waterfall(
			[
				getDbInfo => {
					this.connect(data, logger, getDbInfo);
				},
				(client, getMapping) => {
					logger.progress({ message: 'Connected to database', containerName: '', entityName: '' });

					client.info().then(
						({ body: info }) => {
							const socket = getInfoSocket();
							const modelName = info.name;
							const version = getVersion(info.version.number, versions);
							const modelInfo = {
								host: socket.host,
								port: +socket.port,
								modelName,
								version,
							};

							logger.log('info', { modelInfo }, 'Model info');
							logger.progress({
								message: 'Client info: ' + modelName + ' v' + version,
								containerName: '',
								entityName: '',
							});

							getMapping(null, client, modelInfo);
						},
						() => getMapping(null, client),
					);
				},

				(client, modelInfo, getData) => {
					logger.progress({ message: 'Get schema mappings ...', containerName: '', entityName: '' });

					getSchemaMapping(indices, client)
						.then(
							jsonSchemas => {
								getData(null, client, modelInfo, jsonSchemas);
							},
							err => {
								logger.log('error', err, 'Error of getting schema');
								getData(null, client, modelInfo, null);
							},
						)
						.catch(err => {
							logger.log('error', err);
							this.disconnect(data, logger, () => {});
							cb(err);
						});
				},

				(client, modelInfo, jsonSchemas, next) => {
					async.mapSeries(
						indices,
						async indexName => {
							logger.progress({
								message: 'Get index documents',
								containerName: indexName,
								entityName: '',
							});

							let bucketInfo = Object.assign(
								getBucketData(
									jsonSchemas[indexName] || {},
									logger,
									pluginConfiguration.containerLevelConfig,
								),
								defaultBucketInfo,
							);
							const documents = await getDocuments({ client, indexName, recordSamplingSettings });
							const documentKind = documentKinds[indexName].documentKindName;

							logger.progress({
								message: 'Group documents by kind',
								containerName: indexName,
								entityName: '',
							});

							const documentsByType = documentKind
								? groupDocumentsByType(documentKind, documents.hits.hits)
								: { [indexName]: documents.hits.hits || [] };
							const schemaData = {
								jsonSchema: jsonSchemas[indexName],
								containerLevelKeys,
								fieldInference,
								bucketInfo,
								indexName,
								client,
								async,
								fieldLevelConfig: pluginConfiguration.fieldLevelConfig,
							};
							let types = !documentKind ? [indexName] : indexTypes[indexName] || [];
							const ignoreDocumentKinds = types.length === 1;
							if (!ignoreDocumentKinds) {
								types.push('indexMappingConfig');
							}

							const packages = (types || [])
								.map(typeName => {
									logger.progress({
										message: 'Get schema by documents ...',
										containerName: indexName,
										entityName: typeName,
									});

									return getIndexTypeData({
										...schemaData,
										documents: documentsByType[typeName] || [],
										typeName,
										ignoreDocumentKinds,
									});
								})
								.filter(docPackage => shouldPackageBeAdded(includeEmptyCollection, docPackage));

							return packages;
						},
						(err, items) => {
							next(err, items, modelInfo);
						},
					);
				},
			],
			(err, items, modelInfo) => {
				if (err) {
					err = {
						message: err.message,
						stack: err.stack,
					};
					logger.log('error', err);
					this.disconnect(data, logger, () => {});
				}

				cb(err, items, modelInfo);
			},
		);
	},
};

const shouldPackageBeAdded = (includeEmptyCollection, docPackage) => {
	if (includeEmptyCollection) {
		return true;
	}

	if (
		docPackage.documents.length === 0 &&
		_.isEmpty(_.get(docPackage, 'validation.jsonSchema.properties._source.properties'))
	) {
		return false;
	}

	return true;
};

const getIndexTypeData = ({
	typeName,
	containerLevelKeys,
	fieldInference,
	bucketInfo,
	jsonSchema,
	documents,
	indexName,
	ignoreDocumentKinds,
	fieldLevelConfig,
}) => {
	const documentTemplate = documents.reduce((tpl, doc) => _.merge(tpl, doc), {});
	let documentsPackage = {
		dbName: indexName,
		collectionName: typeName || '_doc',
		documents,
		indexes: [],
		bucketIndexes: [],
		views: [],
		validation: false,
		emptyBucket: false,
		containerLevelKeys,
		bucketInfo,
	};

	const mappingJsonSchema = jsonSchema?.mappings;
	const hasJsonSchema = Boolean(mappingJsonSchema);

	if (hasJsonSchema) {
		SchemaCreator.ignoreSample = documents.length === 0 || ignoreDocumentKinds;
		documentsPackage.validation = {
			jsonSchema: SchemaCreator.getSchema(mappingJsonSchema, documentTemplate, fieldLevelConfig),
		};
	}

	if (fieldInference.active === 'field') {
		documentsPackage.documentTemplate = documentTemplate;
	}

	return documentsPackage;
};

const getCount = async (client, indexName) => {
	const { body } = await client.count({ index: indexName });
	return body.count;
};

const search = async (client, indexName, size) => {
	const { body } = await client.search({ index: indexName, size });
	return body;
};

const getSampleDocSize = (count, recordSamplingSettings) => {
	if (recordSamplingSettings.active === 'absolute') {
		return Number(recordSamplingSettings.absolute.value);
	}

	const limit = Math.ceil((count * recordSamplingSettings.relative.value) / 100);

	return Math.min(limit, recordSamplingSettings.maxValue);
};

const getDocuments = async ({ client, indexName, recordSamplingSettings }) => {
	const count = await getCount(client, indexName);
	const size = getSampleDocSize(count, recordSamplingSettings);

	return await search(client, indexName, size);
};

const isSystemIndex = indexName => {
	if (indexName[0] === '.') {
		return true;
	} else if (/^apm\-[0-9]+\.[0-9]+\.[0-9]+/i.test(indexName)) {
		return true;
	} else {
		return false;
	}
};

const getIndexes = (client, includeSystemCollection) => {
	return client.indices.getMapping().then(({ body: data }) => {
		return Object.keys(data)
			.filter(indexName => {
				if (!includeSystemCollection && isSystemIndex(indexName)) {
					return false;
				} else {
					return true;
				}
			})
			.reduce((result, indexName) => {
				return { ...result, [indexName]: data[indexName] };
			}, {});
	});
};

function getSamplingInfo(recordSamplingSettings, fieldInference) {
	let samplingInfo = {};
	let value = recordSamplingSettings[recordSamplingSettings.active].value;
	let unit = recordSamplingSettings.active === 'relative' ? '%' : ' records max';

	samplingInfo.recordSampling = `${recordSamplingSettings.active} ${value}${unit}`;
	samplingInfo.fieldInference = fieldInference.active === 'field' ? 'keep field order' : 'alphabetical order';

	return samplingInfo;
}

function getVersion(version, versions) {
	const arVersion = version.split('.');
	let result = '';

	versions.forEach(v => {
		const arV = v.split('.');

		for (let i = 0; i < arV.length; i++) {
			if (arV[0] === 'x') {
				continue;
			}

			if (arVersion[i] === arV[i]) {
				result = v;
			} else {
				break;
			}
		}
	});

	if (result) {
		return result;
	} else {
		return versions[versions.length - 1];
	}
}

function getInfoSocket() {
	if (!_connectionInfo) {
		return { host: '', port: '' };
	}
	if (
		_connectionInfo.connectionType === ConnectionType.REPLICA_SET_OR_SHARDED_CLUSTER &&
		_connectionInfo.hosts?.length
	) {
		return {
			host: _connectionInfo.hosts[0].host,
			port: _connectionInfo.hosts[0].port,
		};
	}
	return {
		host: _connectionInfo.host,
		port: _connectionInfo.port,
	};
}

function getSchemaMapping(indices, client) {
	let result = {};

	SchemaCreator.init();
	indices.forEach(indexName => {
		SchemaCreator.addIndex(indexName);
	});

	return SchemaCreator.getMapping(client)
		.then(schemas => {
			result.jsonSchemas = schemas;

			return SchemaCreator.getSettings(client);
		})
		.then(settings => {
			result.settings = settings;

			return SchemaCreator.getAliases(client);
		})
		.then(aliases => {
			result.aliases = aliases;

			return result;
		})
		.then(res => {
			let data = {};

			for (let indexName in res.jsonSchemas) {
				data[indexName] = res.jsonSchemas[indexName];
				data[indexName].settings = res.settings[indexName].settings;
				data[indexName].aliases = res.aliases[indexName].aliases;
			}

			return data;
		});
}

function getBucketData(mappingData, logger, containerLevelConfig) {
	let data = {};
	if (mappingData.settings) {
		let settingContainer = mappingData.settings;

		if (mappingData.settings.index) {
			settingContainer = mappingData.settings.index;
		}

		const containerProperties = getPropertiesByKeys(settingContainer, [
			'number_of_shards',
			'number_of_replicas',
			'max_ngram_diff',
			'number_of_routing_shards',
			'auto_expand_replicas',
			'refresh_interval',
			'max_result_window',
			'max_inner_result_window',
			'max_rescore_window',
			'max_docvalue_fields_search',
			'max_script_fields',
			'routing_partition_size',
			'soft_deletes',
			'codec',
			'max_shingle_diff',
			'max_terms_count',
			'max_terms_count',
			'max_regex_length',
			'gc_deletes',
			'default_pipeline',
			'final_pipeline',
		]);
		const containerJSONProperties = getJSONPropertiesByKeys(settingContainer, ['blocks', 'routing']);
		const refreshInterval = getIndexRefreshInterval({ indexData: containerProperties });
		data = {
			...data,
			...containerProperties,
			...containerJSONProperties,
			...refreshInterval,
			...getSlowlogDataFromSettings({ settingContainer }),
		};

		if (settingContainer.analysis) {
			try {
				data = { ...data, ...getAnalysisData(settingContainer.analysis, containerLevelConfig) };
			} catch (error) {
				logger.log('error', error, 'Getting analysis data');
			}
		}
	}

	if (mappingData.aliases) {
		let aliases = [];

		for (let aliasName in mappingData.aliases) {
			let alias = {
				name: aliasName,
			};

			if (mappingData.aliases[aliasName].filter) {
				alias.filter = JSON.stringify(mappingData.aliases[aliasName].filter.term, null, 4);
			}

			if (mappingData.aliases[aliasName].index_routing) {
				alias.routing = mappingData.aliases[aliasName].index_routing;
			}

			aliases.push(alias);
		}

		data.aliases = aliases;
	}

	const mappingRouting = getMappingRoutingFromApi({ mappings: mappingData.mappings });
	if (mappingRouting) {
		data.mappingRouting = mappingRouting;
	}

	return data;
}

function getMappingRoutingFromApi({ mappings } = {}) {
	if (!mappings?._routing) {
		return null;
	}

	const required = mappings._routing.required;
	if (typeof required !== 'boolean') {
		return null;
	}

	return {
		required: String(required),
	};
}

function groupDocumentsByType(type, documents) {
	return documents.reduce((result, doc) => {
		const typeName = doc._source[type];
		if (!result[typeName]) {
			result[typeName] = [];
		}
		result[typeName].push(doc);

		return result;
	}, {});
}

function getPropertiesByKeys(data, keys) {
	return keys.reduce((result, key) => {
		if (data[key]) {
			result[key] = data[key];
		}

		return result;
	}, {});
}

function getJSONPropertiesByKeys(data, keys) {
	const stringifiedData = keys.reduce((result, key) => {
		try {
			if (data[key]) {
				result[key] = JSON.stringify(data[key], null, 4);
			}
		} catch (error) {
			console.log(error);
		}

		return result;
	}, {});

	return getPropertiesByKeys(stringifiedData, keys);
}

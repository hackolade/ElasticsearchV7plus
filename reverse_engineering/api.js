'use strict';

const elasticsearch = require('elasticsearch');
const fs = require('fs');
const SchemaCreator = require('./SchemaCreator');
const inferSchemaService = require('./helpers/inferSchemaService');
const { getAnalysisData } = require('./helpers/analysisSettingsHelper');
const versions = require('../package.json').contributes.target.versions;

let connectionParams = {};

let _client = null;

module.exports = {
	connect: function(connectionInfo, logger, cb){
		logger.clear();
		logger.log('info', connectionInfo, 'Connection information', connectionInfo.hiddenKeys);
		
		let authString = "";

		if (_client !== null) {
			return cb(null, _client);
		}

		if (connectionInfo.username) {
			authString = connectionInfo.username;
		}

		if (connectionInfo.password) {
			authString += ':' + connectionInfo.password;
		}

		if (connectionInfo.connectionType === 'Direct connection') {
			connectionParams.host = {
				protocol: connectionInfo.protocol,
				host: connectionInfo.host,
				port: connectionInfo.port,
				path: connectionInfo.path,
				auth: authString
			};
		} else if (connectionInfo.connectionType === 'Replica set or Sharded cluster') {
			connectionParams.hosts = connectionInfo.hosts.map(socket => {
				return {
					host: socket.host,
					port: socket.port,
					protocol: connectionInfo.protocol,
					auth: authString
				};
			});
		} else {
			cb('Invalid connection parameters');
		}

		if (connectionInfo.is_ssl) {
			connectionParams.ssl = {
				ca: fs.readFileSync(connectionInfo.ca),
				rejectUnauthorized: connectionInfo.rejectUnauthorized
			};
		}

		_client = new elasticsearch.Client(connectionParams);

		cb(null, _client);
	},

	disconnect: function(connectionInfo, logger, cb){
		if (_client) {
			_client.close();
			_client = null;
		}
		connectionParams = {};
		cb();
	},

	testConnection: function(connectionInfo, logger, cb){
		this.connect(connectionInfo, logger, (err, connection) => {
			if (err) {
				cb(err);
			} else {
				connection.ping({
					requestTimeout: 5000
				}, (error, success) => {
					this.disconnect(connectionInfo, logger, () => {});
					if (error) {
						logger.log('error', error, 'Test connection', connectionInfo.hiddenKeys);
					}
					cb(!success);
				});
			}
		});
	},

	getDatabases: function(connectionInfo, logger, cb){
		cb();
	},

	getDocumentKinds: function(connectionInfo, logger, cb, app) {
		const _ = app.require('lodash');
		this.connect(connectionInfo, logger, async (err, client) => {
			try {
				if (err) {
					throw err;
				}
				const { includeSystemCollection } = connectionInfo;
				const indexes = await getIndexes(client, includeSystemCollection);
				const indexNames = Object.keys(indexes);
				const documentPackages = await Promise.all(indexNames.map(async indexName => {
					const documents = await getDocuments({ client, indexName, recordSamplingSettings: connectionInfo.recordSamplingSettings });
					const inferSchema = inferSchemaService.generateCustomInferSchema(_.get(documents, 'hits.hits').map(doc => doc._source));
					const {
						suggestedDocKinds,
						documentKind,
						otherDocKinds,
					} = inferSchemaService.getDocumentKindDataFromInfer({
						inference: inferSchema,
						excludeDocKind: connectionInfo.excludeDocKind,
					}, 90);

					return {
						bucketName: indexName,
						documentList: suggestedDocKinds,
						documentKind: documentKind.key,
						otherDocKinds,
					};
				}));

				cb(null, documentPackages);
			} catch (err) {
				logger.log('error', err);
				this.disconnect(connectionInfo, logger, () => {});
				cb(err);
			}
		});
	},

	getDbCollectionsNames: function(connectionInfo, logger, cb, app) {
		const _ = app.require('lodash');
		this.connect(connectionInfo, logger, async (err, client) => {
			try {
				if (err) {
					throw err;
				}
				const {
					includeSystemCollection,
					documentKinds,
					recordSamplingSettings,
				} = connectionInfo;
				const indexes = await getIndexes(client, includeSystemCollection);
				const data = await Promise.all(Object.keys(indexes).map(async indexName => {
					const documentKind = documentKinds[indexName].documentKindName;
					let dbCollections = [];
					
					if (documentKind) {
						let documents = await getDocuments({ client, indexName, recordSamplingSettings });
						dbCollections = _.uniq(_.get(documents, 'hits.hits').map(doc => doc._source).map(data => {
							return String(data[documentKind]);
						}).filter(Boolean));
					}

					return {
						dbName: indexName,
						dbCollections,
					};
				}));

				cb(null, data);
			} catch (err) {
				logger.log('error', err);
				this.disconnect(connectionInfo, logger, () => {});
				cb(err);
			}
		});
	},

	getDbCollectionsData: function(data, logger, cb, app) {
		const async = app.require('async');
		const _ = app.require('lodash');
		let includeEmptyCollection = data.includeEmptyCollection;
		let { recordSamplingSettings, fieldInference, documentKinds } = data;
		const indices = data.collectionData.dataBaseNames;
		const indexTypes = data.collectionData.collections;

		const defaultBucketInfo = {
			indexName: '_index',
			indexType: 'string',
			docIDName: '_id',
			docIDType: 'string',
			sourceName: '_source',
			sourceType: 'object'
		};

		const containerLevelKeys = {
			index: '_index',
			docID: '_id',
			source: '_source'
		};

		logger.log('info', getSamplingInfo(recordSamplingSettings, fieldInference), 'Reverse-Engineering sampling params', data.hiddenKeys);
		logger.log('info', { Indices: indices }, 'Selected collection list', data.hiddenKeys);
		logger.progress({ message: 'Start reverse-engineering ...', containerName: '', entityName: '' });

		async.waterfall([
			(getDbInfo) => {
				this.connect(data, logger, getDbInfo);
			},
			(client, getMapping) => {
				logger.progress({ message: 'Connected to database', containerName: '', entityName: '' });

				client.info().then(info => {
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
					logger.progress({ message: 'Client info: ' + modelName + ' v' + version, containerName: '', entityName: '' });

					getMapping(null, client, modelInfo)
				}, () => getMapping(null, client));
			},

			(client, modelInfo, getData) => {
				logger.progress({ message: 'Get schema mappings ...', containerName: '', entityName: '' });

				getSchemaMapping(indices, client).then((jsonSchemas) => {
					getData(null, client, modelInfo, jsonSchemas);
				}, (err) => {
					logger.log('error', err, 'Error of getting schema');
					getData(null, client, modelInfo, null);
				}).catch(err => {
					logger.log('error', err);
					this.disconnect(data, logger, () => {});
					cb(err);
				});
			},

			(client, modelInfo, jsonSchemas, next) => {
				async.mapSeries(indices, async (indexName) => {
					logger.progress({ message: 'Get index documents', containerName: indexName, entityName: '' });

					let bucketInfo = Object.assign(getBucketData(jsonSchemas[indexName] || {}, logger), defaultBucketInfo);
					const documents = await getDocuments({ client, indexName, recordSamplingSettings });
					const documentKind = documentKinds[indexName].documentKindName;
					
					logger.progress({ message: 'Group documents by kind', containerName: indexName, entityName: '' });
					
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
						_,
					};
					let types = !documentKind ? [indexName] : indexTypes[indexName] || [];
					const ignoreDocumentKinds = types.length === 1;
					if (!ignoreDocumentKinds) {
						types.push('indexMappingConfig');
					}

					const packages = (types || []).map((typeName) => {
						logger.progress({ message: 'Get schema by documents ...', containerName: indexName, entityName: typeName });

						return getIndexTypeData({
							...schemaData,
							documents: documentsByType[typeName] || [],
							typeName,
							ignoreDocumentKinds
						});
					}).filter(shouldPackageBeAdded.bind(null, _, includeEmptyCollection));

					return packages;
				}, (err, items) => {
					next(err, items, modelInfo);
				});
			}
		], (err, items, modelInfo) => {
			if (err) {
				err = {
					message: err.message,
					stack: err.stack,
				};
				logger.log('error', err);
				this.disconnect(data, logger, () => {});
			}
			
			cb(err, items, modelInfo);
		});
	}
};

const shouldPackageBeAdded = (_, includeEmptyCollection, docPackage) => {
	if (includeEmptyCollection) {
		return true;
	}

	if (
		docPackage.documents.length === 0
		&&
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
	_,
}) => {
	const documentTemplate = documents.reduce((tpl, doc) => _.merge(tpl, doc), {});
	let documentsPackage = {
		dbName: indexName,
		collectionName: typeName || "_doc",
		documents,
		indexes: [],
		bucketIndexes: [],
		views: [],
		validation: false,
		emptyBucket: false,
		containerLevelKeys,
		bucketInfo
	};

	const mappingJsonSchema = (jsonSchema || {}).mappings;
	const hasJsonSchema = Boolean(mappingJsonSchema);

	if (hasJsonSchema) {
		SchemaCreator.ignoreSample = documents.length === 0 || ignoreDocumentKinds;
		documentsPackage.validation = {
			jsonSchema: SchemaCreator.getSchema(
				mappingJsonSchema,
				documentTemplate
			)
		};
	}

	if (fieldInference.active === 'field') {
		documentsPackage.documentTemplate = documentTemplate;
	}

	return documentsPackage;
};

const getCount = (client, indexName) => new Promise((resolve, reject) => {
	client.count({
		index: indexName,
	}, (err, response) => {
		if (err) {
			reject(err);
		} else {
			resolve(response.count);
		}
	});
});

const search = (client, indexName, size) => new Promise((resolve, reject) => {
	client.search({
		index: indexName,
		size
	}, (err, data) => {
		if (err) {
			reject(err);
		} else {
			resolve(data);
		}
	});
});

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

const isSystemIndex = (indexName) => {
	if (indexName[0] === '.') {
		return true;
	} else if (/^apm\-[0-9]+\.[0-9]+\.[0-9]+/i.test(indexName)) {
		return true;
	} else {
		return false;
	}
};

const getIndexes = (client, includeSystemCollection) => {
	return client.indices.getMapping()
		.then(data => {
			return Object.keys(data).filter(indexName => {
				if (!includeSystemCollection && isSystemIndex(indexName)) {
					return false;
				} else {
					return true;
				}
			}).reduce((result, indexName) => {
				return Object.assign({}, result, {
					[indexName]: data[indexName]
				});
			}, {});
		});
};

function getSamplingInfo(recordSamplingSettings, fieldInference){
	let samplingInfo = {};
	let value = recordSamplingSettings[recordSamplingSettings.active].value;
	let unit = (recordSamplingSettings.active === 'relative') ? '%' : ' records max';
	
	samplingInfo.recordSampling = `${recordSamplingSettings.active} ${value}${unit}`
	samplingInfo.fieldInference = (fieldInference.active === 'field') ? 'keep field order' : 'alphabetical order';
	
	return samplingInfo;
}

function getVersion(version, versions) {
	const arVersion = version.split('.');
	let result = "";

	versions.forEach(v => {
		const arV = v.split('.');
		let isVersion = false;

		for (let i = 0; i < arV.length; i++) {
			if (arV[0] === 'x') {
				continue;
			}

			if (arVersion[i] == arV[i]) {
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
	if (connectionParams.host) {
		return {
			host: connectionParams.host.host,
			port: connectionParams.host.port
		};
	} else if (connectionParams.hosts) {
		return {
			host: connectionParams.hosts[0].host,
			port: connectionParams.hosts[0].port
		};
	} else {
		return {
			host: "",
			port: ""
		}
	}
}

function getSchemaMapping(indices, client) {
	let result = {};

	SchemaCreator.init();
	indices.forEach(indexName => {
		SchemaCreator.addIndex(indexName);
	});

	return SchemaCreator.getMapping(client).then(schemas => {
		result.jsonSchemas = schemas;

		return SchemaCreator.getSettings(client);
	}).then(settings => {
		result.settings = settings;

		return SchemaCreator.getAliases(client);
	}).then(aliases => {
		result.aliases = aliases;

		return result;
	}).then(res => {
		let data = {};

		for (let indexName in res.jsonSchemas) {
			data[indexName] = res.jsonSchemas[indexName];
			data[indexName].settings = res.settings[indexName].settings;
			data[indexName].aliases = res.aliases[indexName].aliases;
		}

		return data;
	});
}

function getBucketData(mappingData, logger) {
	let data = {};
	if (mappingData.settings) {
		let settingContainer = mappingData.settings;

		if (mappingData.settings.index) {
			settingContainer = mappingData.settings.index;
		}

		const containerProperties = getPropertiesByKeys(settingContainer, ['number_of_shards', 'number_of_replicas', 'max_ngram_diff']);
		const containerJSONProperties = getJSONPropertiesByKeys(settingContainer, ['blocks', 'routing']);
		data = { ...data, ...containerProperties, ...containerJSONProperties };

		if (settingContainer.analysis) {
			try {
				data = { ...data, ...getAnalysisData(settingContainer.analysis) };
			} catch (error) {
				logger.log('error', error, 'Getting analysis data');
			}
		}
	}

	if (mappingData.aliases) {
		let aliases = [];

		for (let aliasName in mappingData.aliases) {
			let alias = {
				name: aliasName
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

	return data;
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

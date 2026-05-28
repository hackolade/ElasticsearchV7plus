const curlParser = require('./scriptParser/curlScriptParser');
const kibanaParser = require('./scriptParser/kibanaScriptParser');
const { ElasticSearchService } = require('./service/elasticsearch/elasticsearchService');
const { ElasticSearchClientFactory } = require('./service/elasticsearch/clientFactory');
const { generateScript } = require('./generateScript');
const { generateContainerScript } = require('./generateContainerScript');

/**
 * @param error {Error}
 * @return {{
 *     message: string,
 *     stack: string | undefined,
 * }}
 * */
const extractNonSensitiveInfoFromError = error => {
	return {
		message: error.message,
		stack: error.stack,
	};
};

module.exports = {
	generateScript,

	generateContainerScript,

	async applyToInstance(data, logger, cb) {
		try {
			const client = ElasticSearchClientFactory.getByConnectionInfo(data);
			const elasticSearchService = new ElasticSearchService(client);
			const { entitiesData } = data;

			const scripts = data.script.split('\n\n');

			for (const script of scripts) {
				let parsedScriptData;
				if (script.startsWith('curl')) {
					parsedScriptData = curlParser.parseCurlScript(script);
				} else {
					parsedScriptData = kibanaParser.parseKibanaScript(script);
				}

				await elasticSearchService.applyToInstance({
					parsedScriptData,
					entitiesData,
					logger,
				});
			}

			await elasticSearchService.close();
			return cb(null);
		} catch (e) {
			const error = extractNonSensitiveInfoFromError(e);
			logger.log('error', error, 'Apply to instance', data.hiddenKeys);
			return cb(error);
		}
	},

	async testConnection(data, logger, cb) {
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
};

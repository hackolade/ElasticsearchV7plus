const helper = require("../../helper/helper");
const { getAnalyzers } = require("./analyzersMapper");
const { getFilters } = require("./filtersMapper");
const { isObjectEmpty } = require("./mapperHelper");
const { getTokenizers } = require("./tokenizersMapper");

const getIndexSettings = (indexData, logger) => {
	const properties = helper.getContainerLevelProperties();
	const indexSettings = properties.reduce((settings, { propertyName, isJson }) => {
		if (indexData[propertyName]) {
			try {
				settings[propertyName] = isJson ? JSON.parse(indexData[propertyName]) : indexData[propertyName];
			} catch (error) {
				logger.log('error', error, 'Error parsing index level property JSON');
			}
			return settings;
		}
	}, {});

	try {
		const analysis = getIndexAnalysisSettings(indexData);
		if (analysis) {
			indexSettings.analysis = analysis;
		}
	} catch (error) {
		logger.log('error', error, 'Getting analysis settings');
	}

	return isObjectEmpty(indexSettings) ? null : indexSettings;
};

const getIndexAnalysisSettings = (indexData) => {
	const analyzer = getAnalyzers(indexData.analyzers);
	const tokenizer = getTokenizers(indexData.tokenizers);
	const filter = getFilters(indexData.filters);
	const charFilter = getFilters(indexData.characterFilters);
	const normalizer = getFilters(indexData.normalizers);

	const analysis = {
		...(analyzer && { analyzer }),
		...(tokenizer && { tokenizer }),
		...(filter && { filter }),
		...(charFilter && { char_filter: charFilter }),
		...(normalizer && { normalizer })
	};

	return isObjectEmpty(analysis) ? null : analysis;
};

module.exports = {
    getIndexSettings
}
const helper = require("../../helper/helper");
const { getAnalyzers } = require("./analyzersMapper");
const { getFilters } = require("./filtersMapper");
const { isObjectEmpty } = require("./mapperHelper");
const { getTokenizers } = require("./tokenizersMapper");

const getIndexSettings = (indexData) => {
	const properties = helper.getContainerLevelProperties();
	const indexSettings = properties.reduce((settings, propertyName) => {
		if (indexData[propertyName]) {
			settings[propertyName] = indexData[propertyName];
			return settings;
		}
	}, {});

	const analysis = getIndexAnalysisSettings(indexData);
	if (analysis) {
		indexSettings.analysis = analysis;
	}

	return isObjectEmpty(indexSettings) ? null : indexSettings;
};

const getIndexAnalysisSettings = (indexData) => {
	const analyzer = getAnalyzers(indexData.analyzers);
	const tokenizer = getTokenizers(indexData.tokenizers);
	const filter = getFilters(indexData.filters);
	const charFilter = getFilters(indexData.characterFilters);

	const analysis = {
		...(analyzer && { analyzer }),
		...(tokenizer && { tokenizer }),
		...(filter && { filter }),
		...(charFilter && { char_filter: charFilter }),
	};

	return isObjectEmpty(analysis) ? null : analysis;
};

module.exports = {
    getIndexSettings
}
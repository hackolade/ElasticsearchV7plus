const helper = require("../../helper/helper");
const { getAnalyzers } = require("./analyzersMapper");
const { isObjectEmpty } = require("./mapperHelper");

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

	const analysis = {
		...(analyzer && { analyzer }),
	};

	return isObjectEmpty(analysis) ? null : analysis;
};

module.exports = {
    getIndexSettings
}
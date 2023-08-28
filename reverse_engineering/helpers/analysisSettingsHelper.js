const { getTokenizers } = require("../../forward_engineering/mappers/tokenizersMapper");
const { getAnalyzers } = require("./analyzersHelper");
const { getFilters } = require("./filtersHelper");

const getAnalysisData = (analysisSettings) => {
	const analyzers = getAnalyzers(analysisSettings.analyzer);
	const filters = getFilters(analysisSettings.filter);
	const characterFilters = getFilters(analysisSettings.char_filter);
	const tokenizers = getTokenizers(analysisSettings.tokenizer);

	return {
		...(analyzers && { analyzers }),
		...(filters && { filters }),
		...(characterFilters && { characterFilters }),
		...(tokenizers && { tokenizers }),
	};
};

module.exports = {
	getAnalysisData
};
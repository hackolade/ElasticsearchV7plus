const { getAnalyzers } = require('./analyzersHelper');
const { getFilters } = require('./filtersHelper');
const { getTokenizers } = require('./tokenizersHelper');

const getAnalysisData = analysisSettings => {
	const analyzers = getAnalyzers(analysisSettings.analyzer);
	const filters = getFilters(analysisSettings.filter);
	const characterFilters = getFilters(analysisSettings.char_filter);
	const tokenizers = getTokenizers(analysisSettings.tokenizer);
	const normalizers = getFilters(analysisSettings.normalizer);

	return {
		...(analyzers && { analyzers }),
		...(filters && { filters }),
		...(characterFilters && { characterFilters }),
		...(tokenizers && { tokenizers }),
		...(normalizers && { normalizers }),
	};
};

module.exports = {
	getAnalysisData,
};

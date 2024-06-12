const fs = require('fs');
const path = require('path');
const readConfig = pathToConfig => {
	return JSON.parse(
		fs
			.readFileSync(path.join(__dirname, pathToConfig))
			.toString()
			.replace(/\/\*[.\s\S]*?\*\//gi, ''),
	);
};
const containerLevelConfig = readConfig('../../properties_pane/container_level/containerLevelConfig.json');

const getAnalyzers = analyzersData => {
	if (!analyzersData) {
		return null;
	}
	const analyzers = Object.entries(analyzersData).map(getAnalyzer);

	return analyzers.length > 0 ? analyzers : null;
};

const getAnalyzer = ([name, data]) => {
	const analyzer = {
		name,
		type: data.type,
	};

	switch (data.type) {
		case 'custom':
			return combineOptions(analyzer, getCustomAnalyzer(data));
		case 'standard':
			return combineOptions(analyzer, getStandardAnalyzer(data));
		case 'simple':
		case 'whitespace':
		case 'keyword':
			return analyzer;
		case 'stop':
			return combineOptions(analyzer, getStopWordsConfig(data));
		case 'pattern':
			return combineOptions(analyzer, getPatternAnalyzer(data));
		case 'fingerprint':
			return combineOptions(analyzer, getFingerprintAnalyzer(data));
		default:
			return combineOptions(analyzer, getLanguageAnalyzer(data));
	}
};

const getCustomAnalyzer = data => {
	const builtInTokenizers = getConfigForProperty(containerLevelConfig[0].structure, [
		'analyzers',
		'tokenizer',
	]).options.filter(option => option !== 'custom');
	const tokenizer = builtInTokenizers.includes(data.tokenizer) ? data.tokenizer : 'custom';
	const customTokenizerName = tokenizer === 'custom' ? data.tokenizer : null;
	const filters = mapGroupArray(
		data.filter,
		'filter',
		'customFilterName',
		getConfigForProperty(containerLevelConfig[0].structure, ['analyzers', 'filters', 'filter']).options.filter(
			option => option !== 'custom',
		),
	);
	const charFilters = mapGroupArray(
		data.char_filter,
		'filter',
		'customFilterName',
		getConfigForProperty(containerLevelConfig[0].structure, ['analyzers', 'charFilters', 'filter']).options.filter(
			option => option !== 'custom',
		),
	);

	const analyzer = {
		tokenizer,
		...(customTokenizerName && { customTokenizerName }),
		...(Array.isArray(filters) && filters.length > 0 && { filters }),
		...(Array.isArray(charFilters) && charFilters.length > 0 && { charFilters }),
		...(data.position_increment_gap >= 0 && { positionIncrementGap: data.position_increment_gap }),
	};

	return analyzer;
};

const getStandardAnalyzer = data => {
	const analyzer = generalAnalyzerMapper(data, {
		'max_token_length': 'maxTokenLength',
	});

	return { ...analyzer, ...getStopWordsConfig(data) };
};

const getPatternAnalyzer = data => {
	const analyzer = generalAnalyzerMapper(data, {
		pattern: 'pattern',
		flags: 'flags',
		lowercase: 'lowercase',
	});

	return { ...analyzer, ...getStopWordsConfig(data) };
};

const getFingerprintAnalyzer = data => {
	const analyzer = generalAnalyzerMapper(data, {
		separator: 'separator',
		max_output_size: 'maxOutputSize',
	});

	return { ...analyzer, ...getStopWordsConfig(data) };
};

const getLanguageAnalyzer = data => {
	const builtInTokenizers = getConfigForProperty(containerLevelConfig[0].structure, [
		'analyzers',
		'tokenizer',
	]).options.filter(option => option !== 'custom');
	const tokenizerType = builtInTokenizers.includes(data.tokenizer) ? data.tokenizer : 'custom';
	const tokenizer = data.tokenizer ? tokenizerType : null;
	const customTokenizerName = tokenizer === 'custom' ? data.tokenizer : null;
	const filters = mapGroupArray(
		data.filter,
		'filter',
		'customFilterName',
		getConfigForProperty(containerLevelConfig[0].structure, ['analyzers', 'filters', 'filter']).options.filter(
			option => option !== 'custom',
		),
	);

	const analyzer = {
		type: 'language',
		'language': data.type,
		tokenizer,
		...(customTokenizerName && { customTokenizerName }),
		...(Array.isArray(filters) && filters.length > 0 && { filters }),
	};

	return { ...analyzer, ...getStopWordsConfig(data) };
};

const getStopWordsConfig = analyzerData => {
	const predefinedStopWordsList = typeof analyzerData.stopwords === 'string' ? analyzerData.stopwords : null;
	const stopWordsList = Array.isArray(analyzerData.stopwords)
		? analyzerData.stopwords.map(stopWord => ({ stopWord }))
		: null;
	const stopWordsPath = typeof analyzerData.stopwords_path === 'string' ? analyzerData.stopwords_path : null;

	if (stopWordsPath) {
		return { stopWordsPath };
	}
	if (predefinedStopWordsList) {
		return { predefinedStopWordsList };
	}
	if (stopWordsList) {
		return { stopWordsList };
	}
	return null;
};

const generalAnalyzerMapper = (analyzerData, mapConfig) => {
	return Object.keys(mapConfig).reduce((analyzer, analyzerKey) => {
		const analyzerValue = analyzerData[analyzerKey];
		if (analyzerValue || analyzerValue === false || analyzerValue === 0) {
			analyzer[mapConfig[analyzerKey]] = analyzerValue;
		}
		return analyzer;
	}, {});
};

const combineOptions = (generalOptions, specificOptions) => {
	return {
		...generalOptions,
		...(specificOptions && { ...specificOptions }),
	};
};

const getConfigForProperty = (configStructure, propertyPath) => {
	const [propertyKeyword, ...rest] = propertyPath;
	const property = configStructure.find(property => property.propertyKeyword === propertyKeyword);
	if (!property) {
		return null;
	}
	if (rest.length === 0) {
		return property;
	}
	if (property.structure) {
		return getConfigForProperty(property.structure, rest);
	}
	return null;
};

const mapGroupArray = (arrayData, key, customValueKey, builtInOptions) => {
	if (!Array.isArray(arrayData) || arrayData.length === 0) {
		return null;
	}

	return arrayData.map(itemValue => {
		const isBuiltIn = builtInOptions.includes(itemValue);
		if (isBuiltIn) {
			return { [key]: itemValue };
		} else {
			return { [key]: 'custom', [customValueKey]: itemValue };
		}
	});
};

module.exports = {
	getAnalyzers,
};

const getTokenizers = tokenizersData => {
	if (!tokenizersData) {
		return null;
	}
	const tokenizers = Object.entries(tokenizersData).map(getTokenizer);

	return tokenizers.length > 0 ? tokenizers : null;
};

const getTokenizer = ([name, data]) => {
	const tokenizer = {
		name,
		type: data.type,
	};

	switch (data.type) {
		case 'standard':
			return combineOptions(tokenizer, getStandardTokenizer(data));// TODO: start here

		case 'simple':
		case 'whitespace':
		case 'keyword':
			return tokenizer;
		case 'stop':
			return combineOptions(tokenizer, getStopWordsConfig(data));
		case 'pattern':
			return combineOptions(tokenizer, getPatternAnalyzer(data));
		case 'fingerprint':
			return combineOptions(tokenizer, getFingerprintAnalyzer(data));
		default:
			return combineOptions(tokenizer, getLanguageAnalyzer(data));
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
		'customCharFilterName',
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

const getStandardTokenizer = data => {
	const tokenizer = generalAnalyzerMapper(data, {
		'max_token_length': 'maxTokenLength',
	});

	return { ...tokenizer, ...getStopWordsConfig(data) };
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

	return { ...analyzer, ...getStopWordsConfig(analyzerOptions) };
};

const getLanguageAnalyzer = data => {
	const analyzer = {
		type: 'language',
		'language': data.type,
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
	// TODO: check setting custom analyzer on field level
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
	getAnalyzers: getTokenizers,
};

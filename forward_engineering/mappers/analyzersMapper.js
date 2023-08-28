const { isObjectEmpty } = require("./mapperHelper");

const getAnalyzers = (analyzersData = []) => {
	if (analyzersData.length === 0) {
		return null;
	}
	const analyzers = analyzersData.reduce((analyzers, analyzerData) => {
		const analyzer = getAnalyzer(analyzerData);
		const analyzerName = analyzerData.name?.trim();
		if (analyzer && analyzerName) {
			analyzers[analyzerName] = analyzer;
		}
		return analyzers;
	}, {});

	return isObjectEmpty(analyzers) ? null : analyzers;
};

const getAnalyzer = (analyzerData) => {
	const analyzer = {
		type: analyzerData.type,
	};

	switch (analyzerData.type) {
		case "custom":
			return combineOptions([analyzer,getCustomAnalyzer(analyzerData)]);
		case "standard":
			return combineOptions([analyzer, getStandardAnalyzer(analyzerData)]);
		case "simple":
		case "whitespace":
		case "keyword":
			return analyzer;
		case "stop":
			return combineOptions([analyzer, getStopWordsConfig(analyzerData)]);
		case "pattern":
			return combineOptions([analyzer, getPatternAnalyzer(analyzerData)]);
		case "fingerprint":
			return combineOptions([analyzer, getFingerprintAnalyzer(analyzerData)]);
		case "language":
			return combineOptions([getLanguageAnalyzer(analyzerData)]);
		default:
			return null;
	}
};

const getCustomAnalyzer = (analyzerOptions) => {
	const tokenizer = analyzerOptions.tokenizer === "custom" ? analyzerOptions.customTokenizerName : analyzerOptions.tokenizer;
	const filter = mapGroupArray(analyzerOptions.filter, "filter", "customFilterName");
	const charFilter = mapGroupArray(analyzerOptions.charFilter, "filter", "customCharFilterName");

	const analyzer = {
		tokenizer,
		...(Array.isArray(filter) && filter.length > 0 && { filter }),
		...(Array.isArray(charFilter) && charFilter.length > 0 && { char_filter: charFilter }),
		...(analyzerOptions.positionIncrementGap >= 0 && { position_increment_gap: analyzerOptions.positionIncrementGap }),
	};

	return isObjectEmpty(analyzer) ? null : analyzer;
};

const getStandardAnalyzer = (analyzerOptions) => {
	const analyzer = generalAnalyzerMapper(analyzerOptions, {
		maxTokenLength: "max_token_length",
	});

	return combineOptions([analyzer, getStopWordsConfig(analyzerOptions)]);
};

const getPatternAnalyzer = (analyzerOptions) => {
	const analyzer = generalAnalyzerMapper(analyzerOptions, {
		pattern: "pattern",
		flags: "flags",
		lowercase: "lowercase",
	});

	return combineOptions([analyzer, getStopWordsConfig(analyzerOptions)]);
};

const getFingerprintAnalyzer = (analyzerOptions) => {
	const analyzer = generalAnalyzerMapper(analyzerOptions, {
		separator: "separator",
		maxOutputSize: "max_output_size",
	});

	return combineOptions([analyzer, getStopWordsConfig(analyzerOptions)]);
};

const getLanguageAnalyzer = (analyzerData) => {
	if (!analyzerData.language) {
		return null;
	}
	const analyzer = {
		type: analyzerData.language,
	};

	return combineOptions([analyzer, getStopWordsConfig(analyzerData)]);
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

const getStopWordsConfig = (analyzerData) => {
	const predefinedStopWordsListName = typeof analyzerData.predefinedStopWordsList === "string" ? analyzerData.predefinedStopWordsList.trim() : null;
	const stopWordsList = (analyzerData.stopWordsList || []).map(stopWordData => stopWordData.stopWord?.trim()).filter(stopWord => stopWord?.length > 0);
	const stopWordsPath = typeof analyzerData.stopWordsPath === "string" ? analyzerData.stopWordsPath.trim() : null;

	if (stopWordsPath) {
		return { stopwords_path: stopWordsPath };
	}
	if (predefinedStopWordsListName) {
		return { stopwords: predefinedStopWordsListName };
	}
	if (stopWordsList.length > 0) {
		return { stopwords: stopWordsList };
	}
	return null;
};

const combineOptions = (options) => {
	return options.reduce((combinedOptions, option) => {
		if (option) {
			combinedOptions = {
				...combinedOptions,
				...option,
			};
		}
		return combinedOptions;
	}, {});
};

const mapGroupArray = (arrayData, key, customValueKey) => {
	if (!Array.isArray(arrayData) || arrayData.length === 0) {
		return null;
	}

	return arrayData.map(itemValue => {
		const result = itemValue[key];
		if (result === 'custom') {
			return itemValue[customValueKey]?.trim();
		}
	}).filter(item => item);
}

module.exports = {
    getAnalyzers
}
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
		case "whitespace":
		case "uax_url_email":
		case "classic":
			return combineOptions(tokenizer, getSharedTokenizerWithMaxTokenLength(data));
		case "ngram":
		case "edge_ngram":
			return combineOptions(tokenizer, getNgramTokenizer(data));
		case 'keyword':
			return combineOptions(tokenizer, getKeywordTokenizer(data));
		case 'pattern':
			return combineOptions(tokenizer, getPatternTokenizer(data));
		case "simple_pattern":
		case "simple_pattern_split":
			return combineOptions(tokenizer, getSimplePatternTokenizer(data));
		case 'char_group':
			return combineOptions(tokenizer, getCharGroupTokenizer(data));
		case 'path_hierarchy':
			return combineOptions(tokenizer, getPathHierarchyTokenizer(data));
		default:
			return null;
	}
};

const getSharedTokenizerWithMaxTokenLength = data => {
	const tokenizer = generalTokenizerMapper(data, {
		'max_token_length': 'maxTokenLength',
	});

	return tokenizer;
};

const getNgramTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		min_gram: 'minGram',
		max_gram: 'maxGram',
		token_chars: 'tokenChars',
		custom_token_chars: 'customTokenChars',
	}, ['token_chars']);

	return tokenizer;
};

const getKeywordTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		buffer_size: 'bufferSize',
	});

	return tokenizer;
};

const getPatternTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		pattern: "pattern",
		flags: "flags",
		group: "group",
	});

	return tokenizer;
};

const getSimplePatternTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		pattern: "lucenePattern",
	});

	return tokenizer;
};

const getCharGroupTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		max_token_length: "maxTokenLength",
		tokenize_on_chars: "tokenizeOnChars",
	}, ['tokenize_on_chars']);

	return tokenizer;
};

const getPathHierarchyTokenizer = data => {
	const tokenizer = generalTokenizerMapper(data, {
		delimiter: "delimiter",
		replacement: "replacement",
		buffer_size: "pathBufferSize",
		skip: "skip",
		reverse: "reverse",
	});

	return tokenizer;
};


const generalTokenizerMapper = (analyzerData, mapConfig, jsonFields = []) => {
	return Object.keys(mapConfig).reduce((analyzer, analyzerKey) => {
		const analyzerValue = analyzerData[analyzerKey];
		if (analyzerValue || analyzerValue === false || analyzerValue === 0) {
			if (jsonFields.includes(analyzerKey)) {
				try {
					analyzer[mapConfig[analyzerKey]] = JSON.stringify(analyzerValue, null, 4);
				} catch (e) {
					analyzer[mapConfig[analyzerKey]] = analyzerValue;
				}
			} else {
				analyzer[mapConfig[analyzerKey]] = analyzerValue;
			}
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

module.exports = {
	getTokenizers,
};

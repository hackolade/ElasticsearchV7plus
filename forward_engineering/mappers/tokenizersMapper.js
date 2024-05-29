const { isObjectEmpty } = require('./mapperHelper');

const getTokenizers = (tokenizersData = []) => {
	if (tokenizersData.length === 0) {
		return null;
	}
	const tokenizers = tokenizersData.reduce((tokenizers, tokenizerData) => {
		const tokenizer = getTokenizer(tokenizerData);
		const tokenizerName = tokenizerData.name?.trim();
		if (tokenizer && tokenizerName) {
			tokenizers[tokenizerName] = tokenizer;
		}
		return tokenizers;
	}, {});

	return isObjectEmpty(tokenizers) ? null : tokenizers;
};

const getTokenizer = tokenizerData => {
	const tokenizer = {
		type: tokenizerData.type,
	};

	switch (tokenizerData.type) {
		case 'standard':
		case 'whitespace':
		case 'uax_url_email':
		case 'classic':
			return combineOptions([tokenizer, getSharedTokenizerWithMaxTokenLength(tokenizerData)]);
		case 'ngram':
		case 'edge_ngram':
			return combineOptions([tokenizer, getNgramTokenizer(tokenizerData)]);
		case 'keyword':
			return combineOptions([tokenizer, getKeywordTokenizer(tokenizerData)]);
		case 'pattern':
			return combineOptions([tokenizer, getPatternTokenizer(tokenizerData)]);
		case 'simple_pattern':
		case 'simple_pattern_split':
			return combineOptions([tokenizer, getSimplePatternTokenizer(tokenizerData)]);
		case 'char_group':
			return combineOptions([tokenizer, getCharGroupTokenizer(tokenizerData)]);
		case 'path_hierarchy':
			return combineOptions([tokenizer, getPathHierarchyTokenizer(tokenizerData)]);
		default:
			return null;
	}
};

const getSharedTokenizerWithMaxTokenLength = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(tokenizerOptions, {
		maxTokenLength: 'max_token_length',
	});

	return tokenizer;
};

const getNgramTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(
		tokenizerOptions,
		{
			minGram: 'min_gram',
			maxGram: 'max_gram',
			tokenChars: 'token_chars',
			customTokenChars: 'custom_token_chars',
		},
		['tokenChars'],
	);

	return tokenizer;
};

const getKeywordTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(tokenizerOptions, {
		bufferSize: 'buffer_size',
	});

	return tokenizer;
};

const getPatternTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(tokenizerOptions, {
		pattern: 'pattern',
		flags: 'flags',
		group: 'group',
	});

	return tokenizer;
};

const getSimplePatternTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(tokenizerOptions, {
		lucenePattern: 'pattern',
	});

	return tokenizer;
};

const getCharGroupTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(
		tokenizerOptions,
		{
			maxTokenLength: 'max_token_length',
			tokenizeOnChars: 'tokenize_on_chars',
		},
		['tokenizeOnChars'],
	);

	return tokenizer;
};

const getPathHierarchyTokenizer = tokenizerOptions => {
	const tokenizer = generalTokenizerMapper(tokenizerOptions, {
		delimiter: 'delimiter',
		replacement: 'replacement',
		pathBufferSize: 'buffer_size',
		skip: 'skip',
		reverse: 'reverse',
	});

	return tokenizer;
};

const generalTokenizerMapper = (tokenizerData, mapConfig, jsonFields = []) => {
	return Object.keys(mapConfig).reduce((tokenizer, tokenizerKey) => {
		const tokenizerValue = tokenizerData[tokenizerKey];
		if (tokenizerValue || tokenizerValue === false || tokenizerValue === 0) {
			if (jsonFields.includes(tokenizerKey)) {
				try {
					tokenizer[mapConfig[tokenizerKey]] = JSON.parse(tokenizerValue);
				} catch (e) {}
			} else {
				tokenizer[mapConfig[tokenizerKey]] = tokenizerValue;
			}
		}
		return tokenizer;
	}, {});
};

const combineOptions = options => {
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

module.exports = {
	getTokenizers,
};

const { z } = require('zod');

/** Same levels as `SLOWLOG_LEVELS` in forward_engineering/mappers/slowlogMapper.js */
const slowlogLevels = ['warn', 'info', 'debug', 'trace'];

const slowlogThresholdFields = ({ settingPrefix, description }) =>
	Object.fromEntries(
		slowlogLevels.map(level => [`${settingPrefix}.${level}`, z.string().describe(description).optional()]),
	);

const dynamicSchema = z.union([z.boolean(), z.enum(['runtime', 'strict'])]);

const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const joinRelationsSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

const fieldMappingSchema = z.lazy(() =>
	z.object({
		type: z.string().optional(),
		properties: z.record(z.string(), fieldMappingSchema).optional(),
		dynamic: dynamicSchema
			.describe('The dynamic parameter controls whether new fields are added dynamically.')
			.optional(),
		enabled: z.literal(false).optional(),
		analyzer: z.string().optional(),
		search_analyzer: z.string().optional(),
		search_quote_analyzer: z.string().optional(),
		copy_to: stringOrStringArray.optional(),
		doc_values: z
			.boolean()
			.describe(
				'Should the field be stored on disk in a column-stride fashion, so that it can later be used for sorting, aggregations, or scripting?',
			)
			.optional(),
		eager_global_ordinals: z.boolean().describe('Should global ordinals be loaded eagerly on refresh?').optional(),
		fielddata: z.boolean().optional(),
		fielddata_frequency_filter: z.string().optional(),
		fields: z.record(z.string(), fieldMappingSchema).optional(),
		ignore_above: z.number().describe('Leaf values longer than this limit will not be indexed.').optional(),
		index: z.boolean().describe('Determines if the field should be searchable.').optional(),
		index_options: z
			.enum(['docs', 'freqs', 'positions', 'offsets'])
			.describe('What information should be stored in the index for scoring purposes.')
			.optional(),
		index_prefixes: z.string().optional(),
		index_phrases: z.boolean().optional(),
		norms: z.boolean().optional(),
		null_value: z
			.string()
			.describe(
				'A string value which is substituted for any explicit null values within the flattened object field.',
			)
			.optional(),
		store: z.boolean().optional(),
		similarity: z.enum(['BM25', 'classic', 'boolean']).optional(),
		term_vector: z.boolean().optional(),
		normalizer: z.string().optional(),
		meta: z.record(z.string(), z.unknown()).describe('Metadata attached to the field').optional(),
		coerce: z.boolean().optional(),
		ignore_malformed: z.boolean().optional(),
		scaling_factor: z.number().optional(),
		format: z.string().optional(),
		locale: z.string().optional(),
		depth_limit: z
			.number()
			.int()
			.describe('The maximum allowed depth of the flattened object field, in terms of nested inner objects.')
			.optional(),
		split_queries_on_whitespace: z
			.boolean()
			.describe(
				'Whether full text queries should split the input on whitespace when building a query for this field.',
			)
			.optional(),
		time_series_dimensions: z
			.array(z.string())
			.describe(
				'A list of fields inside the flattened object, where each field is a dimension of the time series.',
			)
			.optional(),
		tree: z
			.enum(['geohash', 'quadtree'])
			.describe('Select the name of the PrefixTree implementation to be used')
			.optional(),
		precision: z.string().optional(),
		tree_levels: z.string().optional(),
		strategy: z
			.enum(['recursive', 'term'])
			.describe('Select the name of the PrefixTree implementation to be used')
			.optional(),
		distance_error_pct: z.string().optional(),
		orientation: z.enum(['right', 'ccw', 'counterclockwise', 'left', 'cw', 'clockwise']).optional(),
		points_only: z.boolean().optional(),
		ignore_z_value: z.boolean().optional(),
		preserve_separators: z.boolean().optional(),
		preserve_position_increments: z.boolean().optional(),
		enable_position_increments: z.boolean().optional(),
		dims: z.number().optional(),
		positive_score_impact: z.boolean().optional(),
		path: z.string().optional(),
		relations: joinRelationsSchema.optional(),
	}),
);

const analyzerSchema = z.object({
	type: z.string().optional(),
	tokenizer: z.string().describe('A built-in or customised tokenizer.').optional(),
	filter: z.array(z.string()).describe('An optional array of built-in or customised token filters.').optional(),
	char_filter: z
		.array(z.string())
		.describe('An optional array of built-in or customised character filters.')
		.optional(),
	position_increment_gap: z
		.number()
		.describe(
			'When indexing an array of text values, Elasticsearch inserts a fake "gap" between the last term of one value and the first term of the next value to ensure that a phrase query doesn’t match two terms from different array elements. Defaults to 100.',
		)
		.optional(),
	max_token_length: z
		.number()
		.describe(
			'The maximum token length. If a token is seen that exceeds this length then it is split at max_token_length intervals.',
		)
		.optional(),
	stopwords: stringOrStringArray
		.describe('A pre-defined stop words list like _english_ or an array containing a list of stop words')
		.optional(),
	stopwords_path: z.string().describe('The path to a file containing stop words.').optional(),
	pattern: z.string().describe('A Java regular expression').optional(),
	flags: z
		.string()
		.describe('Java regular expression flags. Flags should be pipe-separated, eg "CASE_INSENSITIVE|COMMENTS".')
		.optional(),
	lowercase: z.boolean().describe('Should terms be lowercased or not.').optional(),
	separator: z.string().describe('The character to use to concatenate the terms. Defaults to a space.').optional(),
	max_output_size: z
		.number()
		.describe('The maximum token size to emit. Defaults to 255. Tokens larger than this size will be discarded.')
		.optional(),
});

const tokenizerSchema = z.object({
	type: z.string(),
	max_token_length: z
		.number()
		.describe(
			'The maximum token length. If a token is seen that exceeds this length then it is split at max_token_length intervals.',
		)
		.optional(),
	min_gram: z.number().describe('Minimum length of characters in a gram.').optional(),
	max_gram: z.number().describe('Maximum length of characters in a gram.').optional(),
	token_chars: z
		.unknown()
		.describe(
			'Character classes that should be included in a token (letter, digit, whitespace, punctuation, symbol, custom). Elasticsearch will split on characters that don’t belong to the classes specified. Defaults to []',
		)
		.optional(),
	custom_token_chars: z
		.string()
		.describe(
			'Custom characters that should be treated as part of a token. For example, setting this to +-_ will make the tokenizer treat the plus, minus and underscore sign as part of a token.',
		)
		.optional(),
	buffer_size: z
		.number()
		.describe(
			'The number of characters read into the term buffer in a single pass. The term buffer will grow by this size until all the text has been consumed. It is advisable not to change this setting.',
		)
		.optional(),
	pattern: z.string().describe('A Java regular expression').optional(),
	flags: z
		.string()
		.describe('Java regular expression flags. Flags should be pipe-separated, eg "CASE_INSENSITIVE|COMMENTS".')
		.optional(),
	group: z.number().describe('Which capture group to extract as tokens. Defaults to -1 (split).').optional(),
	tokenize_on_chars: z
		.unknown()
		.describe(
			'A list containing a list of characters to tokenize the string on. Whenever a character from this list is encountered, a new token is started. This accepts either single characters like e.g. -, or character groups: whitespace, letter, digit, punctuation, symbol.',
		)
		.optional(),
	delimiter: z.string().describe('The character to use as the path separator. Defaults to /.').optional(),
	replacement: z
		.string()
		.describe('An optional replacement character to use for the delimiter. Defaults to the delimiter.')
		.optional(),
	skip: z.number().describe('The number of initial tokens to skip. Defaults to 0.').optional(),
	reverse: z
		.boolean()
		.describe(
			'If true, uses Lucene’s ReversePathHierarchyTokenizer, which is suitable for domain–like hierarchies. Defaults to false.',
		)
		.optional(),
});

const customComponentsSchema = z.record(z.string(), z.unknown());

const settingsSchema = z.object({
	number_of_shards: z.number().int().describe('The number of shards that an index should have.').optional(),
	number_of_routing_shards: z
		.number()
		.int()
		.describe('The number of shards that a custom router should be aware of.')
		.optional(),
	number_of_replicas: z.number().int().describe('The number of replicas each primary shard has.').optional(),
	auto_expand_replicas: z
		.string()
		.describe('Auto-expand the number of replicas based on the number of data nodes in the cluster.')
		.optional(),
	refresh_interval: z
		.union([z.literal(-1), z.string()])
		.describe(
			'How often to perform a refresh operation, which makes recent changes to the index visible to search.',
		)
		.optional(),
	max_result_window: z
		.number()
		.int()
		.describe('The maximum value of from + size for searches to this index.')
		.optional(),
	max_inner_result_window: z
		.number()
		.int()
		.describe('The maximum value of from + size for inner hits definition and top hits aggregations to this index.')
		.optional(),
	max_rescore_window: z
		.number()
		.int()
		.describe('The maximum value of window_size for rescore requests in searches of this index.')
		.optional(),
	max_docvalue_fields_search: z
		.number()
		.int()
		.describe('The maximum number of docvalue_fields that are allowed in a query.')
		.optional(),
	max_script_fields: z
		.number()
		.int()
		.describe('The maximum number of script_fields that are allowed in a query.')
		.optional(),
	routing_partition_size: z.string().describe('The number of shards a custom routing value can go to.').optional(),
	routing: z
		.unknown()
		.describe(
			'Routing allows you to route documents to shards based on the values of the document’s routing parameter.',
		)
		.optional(),
	soft_deletes: z.unknown().describe('Soft deletes configuration.').optional(),
	codec: z
		.string()
		.describe(
			'The codec used to compress stored data on disk. Defaults to LZ4, but can also be set to best_compression which selects the best codec for each block independently.',
		)
		.optional(),
	max_ngram_diff: z
		.number()
		.int()
		.describe(
			'The maximum allowed difference between min_gram and max_gram for NGramTokenizer and NGramTokenFilter.',
		)
		.optional(),
	max_shingle_diff: z
		.number()
		.int()
		.describe(
			'The maximum allowed difference between max_shingle_size and min_shingle_size for the shingle token filter.',
		)
		.optional(),
	max_refresh_listeners: z
		.number()
		.int()
		.describe(
			'Maximum number of refresh listeners available on each shard of the index. These listeners are used to implement refresh=wait_for.',
		)
		.optional(),
	max_terms_count: z
		.number()
		.int()
		.describe('The maximum number of terms that can be used in Terms Query.')
		.optional(),
	max_regex_length: z
		.number()
		.int()
		.describe('The maximum length of regex that can be used in Regexp Query.')
		.optional(),
	gc_deletes: z
		.string()
		.describe(
			'The length of time that a deleted document’s version number remains available for further versioned operations.',
		)
		.optional(),
	default_pipeline: z
		.string()
		.describe(
			'Default ingest pipeline for the index. Index requests will fail if the default pipeline is set and the pipeline does not exist.',
		)
		.optional(),
	final_pipeline: z
		.string()
		.describe(
			'Final ingest pipeline for the index. Indexing requests will fail if the final pipeline is set and the pipeline does not exist.',
		)
		.optional(),
	blocks: z
		.unknown()
		.describe('Index blocks limit the kind of operations that are available on a certain index.')
		.optional(),
	analysis: z
		.object({
			analyzer: z
				.record(z.string(), analyzerSchema)
				.describe(
					'The analyzer parameter specifies the analyzer used for text analysis when indexing or searching a text field.',
				)
				.optional(),
			tokenizer: z
				.record(z.string(), tokenizerSchema)
				.describe(
					'A tokenizer receives a stream of characters, breaks it up into individual tokens (usually individual words), and outputs a stream of tokens.',
				)
				.optional(),
			filter: customComponentsSchema
				.describe(
					'Token filters accept a stream of tokens from a tokenizer and can modify tokens (eg lowercasing), delete tokens (eg remove stopwords) or add tokens (eg synonyms).',
				)
				.optional(),
			char_filter: customComponentsSchema
				.describe(
					'Character filters are used to preprocess the stream of characters before it is passed to the tokenizer.',
				)
				.optional(),
			normalizer: customComponentsSchema
				.describe(
					'A normalizer is similar to an analyzer except that it guarantees that the analysis chain produces a single token. The token can then be used in sorting, aggregations, or queries that require exact matches.',
				)
				.optional(),
		})
		.optional(),
	'index.search.slowlog.include.user': z
		.boolean()
		.describe(
			'If true, the user that triggered the request is included in the slowlog (index.search.slowlog.include.user).',
		)
		.optional(),
	...slowlogThresholdFields({
		settingPrefix: 'index.search.slowlog.threshold.query',
		description: 'Threshold value above which a query is logged.',
	}),
	...slowlogThresholdFields({
		settingPrefix: 'index.search.slowlog.threshold.fetch',
		description: 'Threshold value above which a fetch is logged.',
	}),
	'index.indexing.slowlog.include.user': z
		.boolean()
		.describe(
			'If true, the user that triggered the request is included in the slowlog (index.indexing.slowlog.include.user).',
		)
		.optional(),
	'index.indexing.slowlog.source': z
		.string()
		.describe(
			'Maximum number of characters of _source to include in the slowlog. Set to true to log the entire source, or false / 0 to skip logging the source.',
		)
		.optional(),
	'index.indexing.slowlog.reformat': z
		.boolean()
		.describe(
			'If true (default), source is reformatted to log on a single line. Set to false to log the source as-is, with embedded line breaks.',
		)
		.optional(),
	...slowlogThresholdFields({
		settingPrefix: 'index.indexing.slowlog.threshold.index',
		description: 'Threshold value above which an indexing operation is logged.',
	}),
});

const zodSchema = z.object({
	host: z.string().describe('Host').optional(),
	port: z.number().describe('Port').optional(),
	indexName: z.string().optional(),
	body: z.object({
		settings: settingsSchema.optional().describe('Configuration options for the index.'),
		aliases: z
			.record(
				z.string(),
				z.object({
					filter: z
						.object({ term: z.unknown() })
						.describe('Query used to limit documents the alias can access.')
						.optional(),
					routing: z
						.string()
						.describe('Value used to route indexing and search operations to a specific shard.')
						.optional(),
				}),
			)
			.optional()
			.describe('Aliases for the index.'),
		mappings: z
			.object({
				_routing: z.object({ required: z.boolean() }).describe('Mapping routing metadata').optional(),
				dynamic: dynamicSchema
					.describe('The dynamic parameter controls whether new fields are added dynamically.')
					.optional(),
				enabled: z.literal(false).optional(),
				properties: z.record(z.string(), fieldMappingSchema),
			})
			.describe(
				'Mapping for fields in the index. If specified, this mapping can include:\n- Field names\n- Field data types\n- Mapping parameters',
			),
	}),
});

const jsonSchema = z.toJSONSchema(zodSchema);

const getTemplateScopeJsonSchema = (data, logger, cb) => {
	return cb(null, jsonSchema);
};

module.exports = {
	getTemplateScopeJsonSchema,
};

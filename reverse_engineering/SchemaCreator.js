const snippetsPath = "../snippets/";

const snippets = {
	"geoJSON": require(snippetsPath + "geopoint-geojson.json"),
	"geo-bounding": require(snippetsPath + "geopoint-geo-bounding.json"),
	"string": require(snippetsPath + "geopoint-string.json"),
	"geohash": require(snippetsPath + "geopoint-geohash.json"),
	"object": require(snippetsPath + "geopoint-object.json"),
	"envelope": require(snippetsPath + "geoshape-envelope.json"),
	"linestring": require(snippetsPath + "geoshape-linestring.json"),
	"multipoint": require(snippetsPath + "geoshape-multipoint.json"),
	"point": require(snippetsPath + "geoshape-point.json"),
	"circle": require(snippetsPath + "geoshape-circle.json"),
	"geometrycollection": require(snippetsPath + "geoshape-geometrycollection.json"),
	"multilinestring": require(snippetsPath + "geoshape-multilinestring.json"),
	"multipolygon": require(snippetsPath + "geoshape-multipolygon.json"),
	"polygon": require(snippetsPath + "geoshape-polygon.json"),
	"completionArray": require(snippetsPath + "completionArray.json"),
	"completionObject": require(snippetsPath + "completionObject.json")
};

const helper = require('../helper/helper');

module.exports = {
	indices: [],
	types: [],
	ignoreSample: false,
	logger: { log(type, ...data) { console[type](data); } },

	init() {
		this.types = [];
		this.indices = [];
	},

	setLogger(logger) {
		this.logger = logger;
	},

	addIndex(index) {
		this.indices.push(index);
	},

	addType(type) {
		this.types.push(type);
	},

	getMapping(client) {
		return new Promise((resolve, reject) => {
			client.indices.getMapping({
				index: this.indices,
				type: this.types
			})
			.then(resolve)
			.catch(reject);
		});
	},

	getSettings(client) {
		return client.indices.getSettings({
			index: this.indices
		});
	},

	getAliases(client) {
		return client.indices.getAlias({
			index: this.indices
		});
	},

	getSchemaTemplate() {
		return {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			additionalProperties: false,
			properties: {}
		};
	},

	getSchema(elasticMapping, sample) {
		let schema = this.getSchemaTemplate();
		sample = sample || {};

		schema.properties = this.getServiceFields(sample);
		schema.properties._source.properties = this.getFields(elasticMapping.properties, sample._source, elasticMapping.properties);

		if (elasticMapping.dynamic) {
			schema.dynamic = elasticMapping.dynamic;
		}

		return schema;
	},

	getFields(properties, sample, mapping) {
		let schema = {};

		for (let fieldName in properties) {
			const currentSample = sample && sample[fieldName];

			if (!this.ignoreSample && currentSample === undefined) {
				continue;
			}

			schema[fieldName] = this.getField(properties[fieldName], currentSample, mapping);
		}

		return schema;
	},

	getField(fieldData, sample, mapping) {
		let schema = {};
		
		if (!fieldData) {
			return schema;
		}
		const hasProperties = !!fieldData.properties;

		schema = Object.assign(schema, this.getType(fieldData.type, sample, hasProperties));

		let isArrayType = [
			'nested',
			'array',
			'geo-point'
		].indexOf(schema.type) !== -1;

		if (hasProperties) {
			let properties = this.getFields(
				fieldData.properties,
				(isArrayType && Array.isArray(sample)) ? sample[0] : sample,
				mapping
			);

			if (isArrayType) {
				schema.items = [{
					type: 'object',
					properties
				}];
			} else {
				schema.properties = properties;
			}
		}

		if (fieldData.copy_to) {
			fieldData.copy_to = this.getCopyToPath(fieldData.copy_to, mapping);
		}

		if (Array.isArray(sample) && !isArrayType) {
			schema = {
				type: 'array',
				items: [schema]
			};
		}

		if ([
			'geo-shape', 'geo-point'
		].includes(schema.type)) {
			schema = this.handleSnippet(schema);
		}

		if (schema.type === 'completion') {
			schema = this.handleCompletionSnippet(schema);
		}

		schema = this.setProperties(schema, fieldData);

		return schema;
	},

	getType(type, value, hasProperties) {
		switch(type) {
			case "long":
			case "integer":
			case "short":
			case "byte":
			case "double":
			case "float":
			case "half_float":
			case "scaled_float":
				return {
					type: "number",
					mode: type	
				};
			case "keyword":
			case "text":
				return {
					type: "string",
					mode: type
				};
			case "integer_range":
			case "float_range":
			case "long_range":
			case "double_range":
			case "date_range":
			case "ip_range":
				return {
					type: "range",
					mode: type
				};
			case "null":
			case "boolean":
			case "binary":
			case "nested":
			case "date":
			case "token_count":
			case "murmur3":
			case "annotated_text":
			case "percolator":
			case "ip":
			case "dense_vector":
			case "sparse_vector":
			case "alias":
			case "rank_feature":
			case "rank_features":
			case "join":
				return { type };
			case "completion":
				return {
					type,
					subType: this.getCompletionSubtype(value)
				};
			case "geo_point":
				return { 
					type: "geo-point",
					subType: this.getGeoPointSubtype(value)
				};
			case "geo_shape":
				return { 
					type: "geo-shape",
					subType: this.getGeoShapeSubtype(value)
				};
			default:
				if (value !== undefined) {
					const scalar = this.getScalar(value);

					if (scalar === 'string') {
						return { type: 'string', mode: 'text' };
					} else if (scalar === 'number') {
						return { 
							type: 'number',
							mode: this.getNumberMode(value)
						};
					} else if (Array.isArray(value)) {
						return {
							type: 'array'
						};
					} else {
						return {
							type: scalar
						};
					}
				} else {
					if (hasProperties) {
						return { type: "object" }
					} else {
						return {};
					}
				}
		}
	},

	getScalar(value) {
		return typeof value;
	},

	getNumberMode(value) {
		const byte = 0x7F;
		const short = 0x7FFF;
		const int = 0x7FFFFFFF;
		const isFloat = (value - parseInt(value)) !== 0;

		if (isFloat) {
			return 'float';
		} else {
			if (value > -(byte + 1) && value < byte) {
				return 'byte';
			} else if (value > -(short + 1) && value < short) {
				return 'short';
			} else if (value > -(int + 1) && value < int) {
				return 'integer';
			} else {
				return 'long';
			}
		}
	},

	getServiceFields(sample) {
		let schema = {
			_index: { type: "string", mode: "text" },
			_type: { type: "string", mode: "text" },
			_id: { type: "string", mode: "text" },
			_source: { type: "object", properties: {} }
		};

		if (!sample) {
			return schema;
		}

		for (let field in sample) {
			const value = sample[field];

			schema[field] = this.getType('', value, typeof value === 'object');
		}

		return schema;
	},

	getGeoPointSubtype(value) {
		if (typeof value === "string") {
			if (/\-?\d+\.\d+\,\-?\d+\.\d+/.test(value)) {
				return "string";
			} else {
				return "geohash";
			}
		} else if (Array.isArray(value)) {
			return "geoJSON";
		} else if (typeof value === "object") {
			if (value.top_left && value.bottom_right) {
				return "geo-bounding";
			}
		}

		return "object";
	},

	getGeoShapeSubtype(value) {
		if (typeof value === "string") {
			const isPoint = /^POINT\s*(.+)/i.test(value.trim());
			const isLinestring = /^LINESTRING\s*(.+)/i.test(value.trim());
			const isPolygon = /^POLYGON\s*(.+)/i.test(value.trim());
			const isMultipoint = /^MULTIPOINT\s*(.+)/i.test(value.trim());
			const isMultilinestring = /^MULTILINESTRING\s*(.+)/i.test(value.trim());
			const isMultipolygon = /^MULTIPOLYGON\s*(.+)/i.test(value.trim());
			const isGeometryCollection = /^GEOMETRYCOLLECTION\s*(.+)/i.test(value.trim());
			const isEnvelope = /^BBOX\s*(.+)/i.test(value.trim());

			if (isPoint) { return "point"; }
			if (isLinestring) { return "linestring"; }
			if (isPolygon) { return "polygon"; }
			if (isMultipoint) { return "multipoint"; }
			if (isMultilinestring) { return "multilinestring"; }
			if (isMultipolygon) { return "multipolygon"; }
			if (isGeometryCollection) { return "geometrycollection"; }
			if (isEnvelope) { return "envelope"; }

		} else if (typeof value === "object" && value.type) {
			return value.type;
		} else {
			return "point";
		}
	},

	getCompletionSubtype(value) {
		if (Array.isArray(value)) {
			return "array";
		} else {
			return "object";
		}
	},

	handleCompletionSnippet(schema) {
		return Object.assign({}, this.handleSnippet(Object.assign({}, schema, {
			subType: schema.subType === 'array' ? 'completionArray' : 'completionObject' 
		})), {
			subType: schema.subType
		});
	},

	handleSnippet(schema) {
		const snippet = snippets[schema.subType];
		if (snippet) {
			if (snippet.parentType === 'array') {
				schema.items = this.getSchemaFromSnippet(snippet);
			} else {
				schema.properties = this.getSchemaFromSnippet(snippet);
			}
		}

		return schema;
	},

	getSchemaFromSnippet(snippet) {
		const isArray = snippet.type === 'array' || snippet.parentType === 'array';
		let schema = isArray ? [] : {};

		for (let i in snippet.properties) {
			const field = snippet.properties[i];
			let currentSchema = {
				type: field.type
			};

			if (field.properties) {
				const properties = this.getSchemaFromSnippet(field);
				
				if (currentSchema.type === 'array') {
					currentSchema.items = properties;
				} else {
					currentSchema.properties = properties;
				}
			}

			if (field.sample) {
				currentSchema.sample = field.sample;
			}

			if (isArray) {
				schema.push(currentSchema);
			} else {
				schema[field.name] = currentSchema;
			}
		}

		return schema;
	},

	setProperties(schema, fieldData) {
		const properties = helper.getFieldProperties(schema.type, Object.assign({mode: fieldData.type}, fieldData), { "stringfields": "fields" });

		for (let propName in properties) {
			if (propName === 'fields') {
				schema["stringfields"] = JSON.stringify(properties[propName], null, 4);
			} else if (propName === 'relations') {
				schema[propName] = getRelations(properties[propName]);
			} else if (propName === 'analyzer') {
				schema = { ...schema, ...getAnalyzerProps(properties[propName])};
			} else {
				schema[propName] = properties[propName];
			}
		}

		return schema;
	},

	getCopyToPath(copyToValue, mapping) {
		const copyTo = Array.isArray(copyToValue) ? copyToValue : [ copyToValue ];

		const result = copyTo.reduce((result, propertyName) => {
			return [
				...result,
				...findPropertiesInMapping(propertyName, mapping)
			];
		}, []);

		return result;
	}
}; 

const getRelations = (relations) => {
	if (typeof relations !== 'object') {
		return [];
	}

	return Object.keys(relations).map((parentName) => {
		const children = Array.isArray(relations[parentName]) ? relations[parentName] : [ relations[parentName] ];
		
		return {
			parent: parentName,
			children: children.map(item => ({ name: item }))
		};
	}, {});
};

const findPropertiesInMapping = (propertyName, mapping) => {
	const getPaths = (propertyName, properties, path) => {
		return Object.keys(properties).reduce((result, name) => {
			const property = properties[name];

			if (property.properties) {
				result = [
					...result,
					...getPaths(propertyName, property.properties, [...path, name])
				];
			}
			
			if (propertyName === name) {
				result = [
					...result,
					[...path, name].join('.')
				];
			}

			return result;
		}, []);
	};

	return getPaths(propertyName, mapping, []);
};

const getAnalyzerProps = (analyzerType) => {
	const builtInAnalyzers = [
		"standard",
		"simple",
		"whitespace",
		"stop",
		"keyword",
		"pattern",
		"english",
		"french",
		"fingerprint",
	];
	const isBuiltInAnalyzer = builtInAnalyzers.includes(analyzerType);
	return isBuiltInAnalyzer ? { analyzer: analyzerType } : { analyzer: 'custom', customAnalyzerName: analyzerType };
};

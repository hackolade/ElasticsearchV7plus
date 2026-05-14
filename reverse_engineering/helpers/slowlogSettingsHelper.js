const SLOWLOG_LEVELS_ORDER = ['warn', 'info', 'debug', 'trace'];

const TIME_UNITS_DESC = ['nanos', 'micros', 'ms', 's', 'm', 'h', 'd'];

const flattenObjectLeaves = ({ node, prefix } = {}) => {
	if (node === null || node === undefined) {
		return {};
	}
	if (typeof node !== 'object' || Array.isArray(node)) {
		return { [prefix]: node };
	}
	return Object.entries(node).reduce((acc, [key, value]) => {
		const next = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			return { ...acc, ...flattenObjectLeaves({ node: value, prefix: next }) };
		}
		return { ...acc, [next]: value };
	}, {});
};

const mergeFlatSlowlogKeysFromContainer = ({ settingContainer, flat } = {}) => {
	for (const key of Object.keys(settingContainer || {})) {
		if (!key.includes('slowlog')) {
			continue;
		}
		const val = settingContainer[key];
		if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
			continue;
		}
		if (key.startsWith('index.search.slowlog.') || key.startsWith('index.indexing.slowlog.')) {
			flat[key] = val;
		} else if (key.startsWith('search.slowlog.')) {
			flat[`index.${key}`] = val;
		} else if (key.startsWith('indexing.slowlog.')) {
			flat[`index.${key}`] = val;
		}
	}
};

const collectFlatSlowlogKeys = settingContainer => {
	let flat = {};
	const searchTree = settingContainer?.search?.slowlog;
	const indexingTree = settingContainer?.indexing?.slowlog;
	if (searchTree && typeof searchTree === 'object') {
		flat = { ...flat, ...flattenObjectLeaves({ node: searchTree, prefix: 'index.search.slowlog' }) };
	}
	if (indexingTree && typeof indexingTree === 'object') {
		flat = { ...flat, ...flattenObjectLeaves({ node: indexingTree, prefix: 'index.indexing.slowlog' }) };
	}
	mergeFlatSlowlogKeysFromContainer({ settingContainer, flat });
	return flat;
};

const toBooleanOrNull = value => {
	if (typeof value === 'boolean') {
		return value;
	}
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	return null;
};

const parseElasticsearchTimeValue = raw => {
	if (raw === null || raw === undefined || raw === '') {
		return null;
	}
	if (typeof raw === 'number' && !Number.isNaN(raw)) {
		return { threshold: raw, threshold_unit: '' };
	}
	const str = String(raw).trim();
	for (const unit of TIME_UNITS_DESC) {
		if (str.endsWith(unit)) {
			const numPart = str.slice(0, -unit.length);
			if (/^-?\d+$/.test(numPart)) {
				return { threshold: Number(numPart), threshold_unit: unit };
			}
		}
	}
	if (/^-?\d+$/.test(str)) {
		return { threshold: Number(str), threshold_unit: '' };
	}
	return null;
};

const thresholdEntriesFromFlat = ({ flat, prefix } = {}) => {
	const rows = [];
	for (const level of SLOWLOG_LEVELS_ORDER) {
		const key = `${prefix}.${level}`;
		if (!(key in flat)) {
			continue;
		}
		const raw = flat[key];
		if (raw === undefined || raw === null || raw === '') {
			continue;
		}
		const parsed = parseElasticsearchTimeValue(raw);
		if (!parsed) {
			continue;
		}
		rows.push({
			level,
			threshold: parsed.threshold,
			threshold_unit: parsed.threshold_unit,
		});
	}
	return rows;
};

const indexingSourceToModel = value => {
	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}
	return String(value);
};

const buildSearchSlowlog = flat => {
	const search = {};
	const includeUser = toBooleanOrNull(flat['index.search.slowlog.include.user']);
	if (includeUser !== null) {
		search.include_user = includeUser;
	}
	const query = thresholdEntriesFromFlat({
		flat,
		prefix: 'index.search.slowlog.threshold.query',
	});
	if (query.length > 0) {
		search.query = query;
	}
	const fetch = thresholdEntriesFromFlat({
		flat,
		prefix: 'index.search.slowlog.threshold.fetch',
	});
	if (fetch.length > 0) {
		search.fetch = fetch;
	}
	return Object.keys(search).length > 0 ? search : null;
};

const buildIndexingSlowlog = flat => {
	const indexing = {};
	const includeUser = toBooleanOrNull(flat['index.indexing.slowlog.include.user']);
	if (includeUser !== null) {
		indexing.include_user = includeUser;
	}
	const sourceKey = 'index.indexing.slowlog.source';
	if (sourceKey in flat && flat[sourceKey] !== undefined && flat[sourceKey] !== null && flat[sourceKey] !== '') {
		indexing.source = indexingSourceToModel(flat[sourceKey]);
	}
	const reformat = toBooleanOrNull(flat['index.indexing.slowlog.reformat']);
	if (reformat !== null) {
		indexing.reformat = reformat;
	}
	const indexRows = thresholdEntriesFromFlat({
		flat,
		prefix: 'index.indexing.slowlog.threshold.index',
	});
	if (indexRows.length > 0) {
		indexing.index = indexRows;
	}
	return Object.keys(indexing).length > 0 ? indexing : null;
};

/**
 * Builds the Hackolade `slowlog` fragment from Elasticsearch index settings (search/indexing thresholds and related flags).
 *
 * @param {object} [params]
 * @param {object} [params.settingContainer] - Raw index settings (nested or flattened slowlog keys).
 * @returns {{ slowlog?: object }} `{}` when no slowlog settings are present.
 */
const getSlowlogDataFromSettings = ({ settingContainer } = {}) => {
	if (!settingContainer || typeof settingContainer !== 'object') {
		return {};
	}
	const flat = collectFlatSlowlogKeys(settingContainer);
	if (Object.keys(flat).length === 0) {
		return {};
	}
	const slowlog = {};
	const search = buildSearchSlowlog(flat);
	if (search) {
		slowlog.search = search;
	}
	const indexing = buildIndexingSlowlog(flat);
	if (indexing) {
		slowlog.indexing = indexing;
	}
	if (Object.keys(slowlog).length === 0) {
		return {};
	}
	return { slowlog };
};

module.exports = {
	getSlowlogDataFromSettings,
};

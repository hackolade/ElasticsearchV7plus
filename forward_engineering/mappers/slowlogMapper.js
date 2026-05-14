const SLOWLOG_LEVELS = new Set(['warn', 'info', 'debug', 'trace']);

const formatThresholdValue = ({ threshold, threshold_unit } = {}) => {
	if (threshold === undefined || threshold === null || threshold === '') {
		return null;
	}
	return `${threshold}${threshold_unit || ''}`;
};

const getThresholdEntries = ({ entries, settingPrefix } = {}) => {
	if (!Array.isArray(entries)) {
		return {};
	}
	const settingEntries = entries
		.map(entry => {
			const level = entry?.level;
			if (!SLOWLOG_LEVELS.has(level)) {
				return null;
			}
			const value = formatThresholdValue(entry);
			if (value === null) {
				return null;
			}
			return [`${settingPrefix}.${level}`, value];
		})
		.filter(entry => entry !== null);
	return Object.fromEntries(settingEntries);
};

const getBooleanSetting = ({ data, propertyKey, settingKey } = {}) => {
	const value = data?.[propertyKey];
	if (typeof value !== 'boolean') {
		return {};
	}
	return { [settingKey]: value };
};

const getDefinedSetting = ({ data, propertyKey, settingKey } = {}) => {
	const value = data?.[propertyKey];
	if (value === undefined || value === null || value === '') {
		return {};
	}
	return { [settingKey]: value };
};

const getSearchSlowlogSettings = ({ search } = {}) => {
	if (!search) {
		return {};
	}
	return {
		...getBooleanSetting({
			data: search,
			propertyKey: 'include_user',
			settingKey: 'index.search.slowlog.include.user',
		}),
		...getThresholdEntries({
			entries: search.query,
			settingPrefix: 'index.search.slowlog.threshold.query',
		}),
		...getThresholdEntries({
			entries: search.fetch,
			settingPrefix: 'index.search.slowlog.threshold.fetch',
		}),
	};
};

const getIndexingSlowlogSettings = ({ indexing } = {}) => {
	if (!indexing) {
		return {};
	}
	return {
		...getBooleanSetting({
			data: indexing,
			propertyKey: 'include_user',
			settingKey: 'index.indexing.slowlog.include.user',
		}),
		...getDefinedSetting({
			data: indexing,
			propertyKey: 'source',
			settingKey: 'index.indexing.slowlog.source',
		}),
		...getBooleanSetting({
			data: indexing,
			propertyKey: 'reformat',
			settingKey: 'index.indexing.slowlog.reformat',
		}),
		...getThresholdEntries({
			entries: indexing.index,
			settingPrefix: 'index.indexing.slowlog.threshold.index',
		}),
	};
};

/**
 * Maps index-level slowlog model data to Elasticsearch index slowlog settings (search and indexing).
 * @param {{ indexData?: Object }} [param]
 * @returns {Object}
 */
const getSlowlogSettings = ({ indexData } = {}) => {
	const slowlog = indexData?.slowlog;
	if (!slowlog) {
		return {};
	}
	return {
		...getSearchSlowlogSettings({ search: slowlog.search }),
		...getIndexingSlowlogSettings({ indexing: slowlog.indexing }),
	};
};

module.exports = {
	getSlowlogSettings,
};

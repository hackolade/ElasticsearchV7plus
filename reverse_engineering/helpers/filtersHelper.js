const getFilters = filtersData => {
	if (!filtersData) {
		return null;
	}
	const filters = Object.entries(filtersData).map(getFilter).filter(Boolean);

	return filters.length > 0 ? filters : null;
};

const getFilter = ([name, data]) => {
	try {
		const config = JSON.stringify(data, null, 4);
		return {
			name,
			config: config,
		}
	} catch (e) {
		return null;
	}
};

module.exports = {
	getFilters,
};

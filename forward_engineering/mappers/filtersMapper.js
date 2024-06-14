const { isObjectEmpty } = require('./mapperHelper');

const getFilters = (filtersData = []) => {
	if (filtersData.length === 0) {
		return null;
	}
	const filters = filtersData.reduce((filters, filterData) => {
		const filter = getFilter(filterData);
		const filterName = filterData.name?.trim();
		if (filter && filterName) {
			filters[filterName] = filter;
		}
		return filters;
	}, {});

	return isObjectEmpty(filters) ? null : filters;
};

const getFilter = filterData => {
	try {
		const filter = JSON.parse(filterData.config);
		return filter;
	} catch (e) {
		return null;
	}
};

module.exports = {
	getFilters,
};

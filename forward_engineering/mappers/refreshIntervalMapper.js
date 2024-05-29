const getIndexRefreshInterval = ({ indexData }) => {
	if (!indexData || !indexData.refresh_interval) {
		return null;
	}
	if (indexData.refresh_interval < 0) {
		return -1;
	}
	const defaultRefreshIntervalUnit = 's';
	return [indexData.refresh_interval, indexData.refresh_interval_unit || defaultRefreshIntervalUnit].join('');
};

module.exports = {
	getIndexRefreshInterval,
};

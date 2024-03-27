const getIndexRefreshInterval = ({ indexData }) => {
	if (!indexData || !indexData.refresh_interval || !indexData.refresh_interval_unit) {
		return null;
	}
	if (indexData.refresh_interval < 0) {
		return -1;
	}
	return [indexData.refresh_interval, indexData.refresh_interval_unit].join('');
};

module.exports = {
	getIndexRefreshInterval
}

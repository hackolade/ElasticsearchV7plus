const getIndexRefreshInterval = ({ indexData }) => {
	const defaultInterval = 1;
	const defaultUnit = 's';

	if (!indexData || typeof indexData.refresh_interval !== 'string') {
		return {};
	}

	if (indexData.refresh_interval < 0) {
		return {
			refresh_interval: -1,
			refresh_interval_unit: defaultUnit,
		};
	}

	const intervalRegexp = /(?<interval>-?\d+)(?<unit>\w{0,2})/;
	const parsedInterval = indexData.refresh_interval.match(intervalRegexp);

	if (!parsedInterval) {
		return {
			refresh_interval: defaultInterval,
			refresh_interval_unit: defaultUnit,
		};
	}

	const { interval, unit } = parsedInterval.groups;
	return {
		refresh_interval: interval,
		refresh_interval_unit: unit || defaultUnit,
	};
};

module.exports = {
	getIndexRefreshInterval,
};

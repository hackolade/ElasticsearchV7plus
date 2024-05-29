const assertExists = (param, paramName = 'param') => {
	if (!param) {
		throw new Error(`Invalid ${paramName}: ${param}`);
	}
};

module.exports = {
	assertExists,
};

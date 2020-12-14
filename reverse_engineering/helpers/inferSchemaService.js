
function getDocumentKindDataFromInfer(data, targetProbability) {
	const { inference, excludeDocKind } = data;
	let suggestedDocKinds = [];
	let otherDocKinds = [];
	let documentKind = {
		key: '',
		probability: 0	
	};
	let properties = inference.properties;

	Object.keys(properties).forEach(key => {
		const {
			probability,
			type,
		} = properties[key];

		if (probability < targetProbability || type !== 'string') {
			otherDocKinds.push(key);
			return;
		}

		suggestedDocKinds.push(key);

		if (excludeDocKind.includes(key)) {
			return;
		}

		if (documentKind.probability > probability) {
			return;
		}

		if (
			documentKind.probability === probability
			&&
			documentKind.key === 'type'
		) {
			return;
		}

		documentKind.probability = probability;
		documentKind.key = key;
	});

	return {
		documentKind,
		suggestedDocKinds,
		otherDocKinds,
	};
}

function typeOf(obj) {
	return {}.toString.call(obj).split(' ')[1].slice(0, -1).toLowerCase();
};

function generateCustomInferSchema(documents, sampleSize = 30) {
	const total = documents.length;
	const properties = {};

	documents.forEach(doc => {
		Object.keys(doc).forEach(key => {
			const value = doc[key];

			if (!properties.hasOwnProperty(key)) {
				properties[key] = {
					count: 1,
					samples: [value],
					type: typeOf(value),
				};	
				return;
			}

			properties[key].count++;

			const samples = properties[key].samples;
			if (!samples.includes(value) && samples.length < sampleSize) {
				properties[key].samples.push(value);
			}

			if (properties[key].type !== 'string') {
				properties[key].type = typeOf(value);
			}
		});
	});

	Object.keys(properties).forEach(key => {
		const value = properties[key];

		properties[key].probability = Math.round((value.count / total * 100), 2);
	});

	return {
		total,
		properties,
	};
}

module.exports = {
	getDocumentKindDataFromInfer,
	generateCustomInferSchema,
};

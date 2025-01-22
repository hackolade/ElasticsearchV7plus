const getDependencyResults = (dependency, data) => {
	switch (dependency.type) {
		case 'and':
			return dependency.values.every(condition => checkDependency(condition, data));
		case 'or':
			return dependency.values.some(condition => checkDependency(condition, data));
		case 'not':
			return !dependency.values.every(condition => checkDependency(condition, data));
		default:
			return false;
	}
};

const checkDependency = (dependency, data) => {
	if (dependency.type) {
		return getDependencyResults(dependency, data);
	}

	return data[dependency.key] === dependency.value;
};

const getTargetFieldLevelPropertyNames = (type, data, fieldLevelConfig) => {
	if (!fieldLevelConfig.structure[type] || !Array.isArray(fieldLevelConfig.structure[type])) {
		return [];
	}

	return fieldLevelConfig.structure[type]
		.filter(property => {
			if (typeof property === 'object' && property.isTargetProperty) {
				if (!property.dependency) {
					return true;
				} else if (!checkDependency(property.dependency, data)) {
					return false;
				} else if (Array.isArray(property.options) && !property.options.includes(data[property.propertyName])) {
					return false;
				} else {
					return true;
				}
			}

			return false;
		})
		.map(property => property.propertyKeyword);
};

module.exports = {
	getFieldProperties(type, data, pseudonyms, fieldLevelConfig) {
		const propertyNames = getTargetFieldLevelPropertyNames(type, data, fieldLevelConfig);

		return propertyNames.reduce((result, propertyName) => {
			if (Object.hasOwn(data, propertyName)) {
				result[propertyName] = data[propertyName];
			} else if (Object.hasOwn(data, pseudonyms[propertyName])) {
				result[pseudonyms[propertyName]] = data[pseudonyms[propertyName]];
			}

			return result;
		}, {});
	},

	getContainerLevelProperties(containerLevelConfig) {
		let properties = [];

		containerLevelConfig.forEach(tab => {
			tab.structure.forEach(property => {
				if (property.isTargetProperty) {
					properties.push({
						propertyName: property.propertyKeyword,
						isJson: property.template === 'textAreaJson',
					});
				}
			});
		});

		return properties;
	},
};

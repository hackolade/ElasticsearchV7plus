const fs = require('fs');
const path = require('path');
const readConfig = (pathToConfig) => {
	return JSON.parse(fs.readFileSync(path.join(__dirname, pathToConfig)).toString().replace(/\/\*[.\s\S]*?\*\//ig, ""));
};
const fieldLevelConfig = readConfig('../properties_pane/field_level/fieldLevelConfig.json');
const containerLevelConfig = readConfig('../properties_pane/container_level/containerLevelConfig.json');

module.exports = {
	getTargetFieldLevelPropertyNames(type, data) {
		if (!fieldLevelConfig.structure[type] || !Array.isArray(fieldLevelConfig.structure[type])) {
			return [];
		}

		return fieldLevelConfig.structure[type].filter(property => {
			if (typeof property === 'object' && property.isTargetProperty) {
				if (!property.dependency) {
					return true;
				} else if (data[property.dependency.key] != property.dependency.value) {
					return false;
				} else if (Array.isArray(property.options) && !property.options.includes(data[property.propertyName])) {
					return false;
				} else {
					return true;
				}
			}

			return false;
		}).map(property => property.propertyKeyword);
	},

	getFieldProperties(type, data, pseudonyms) {
		const propertyNames = this.getTargetFieldLevelPropertyNames(type, data);

		return propertyNames.reduce((result, propertyName) => {
			if (Object.prototype.hasOwnProperty.call(data, propertyName)) {
				result[propertyName] = data[propertyName];
			} else if (Object.prototype.hasOwnProperty.call(data, pseudonyms[propertyName])) {
				result[pseudonyms[propertyName]] = data[pseudonyms[propertyName]];
			}

			return result;
		}, {});
	},

	getContainerLevelProperties() {
		let properties = [];

		containerLevelConfig.forEach((tab) => {
			tab.structure.forEach(property => {
				if (property.isTargetProperty) {
					properties.push(property.propertyKeyword);
				}
			});
		});

		return properties;
	}
};

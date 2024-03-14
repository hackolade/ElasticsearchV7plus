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
				} else if (!this.checkDependency(property.dependency, data)) {
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

	checkDependency(dependency, data) {
		if (dependency.type) {
			return this.getDependencyResults(dependency, data);
		}
		
		return data[dependency.key] === dependency.value;
	},
	
	getDependencyResults(dependency, data) {
			switch (dependency.type) {
			case 'and':
				return dependency.values.every(condition => this.checkDependency(condition, data));
				case 'or':
				return dependency.values.some(condition => this.checkDependency(condition, data));
			case 'not':
				return !this.checkDependency(dependency.values, data);
			default:
				return false;
		}
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
					properties.push({ propertyName: property.propertyKeyword, isJson: property.template === 'textAreaJson' });
				}
			});
		});

		return properties;
	}
};

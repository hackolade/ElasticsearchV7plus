const getPathById = (schema, id, path) => {
	if (schema.GUID === id) {
		return path;
	}

	if (schema.properties) {
		return Object.keys(schema.properties).reduce((newPath, propertyName) => {
			if (newPath) {
				return newPath;
			} else {
				return getPathById(schema.properties[propertyName], id, [
					...path,
					schema.properties[propertyName].GUID,
				]);
			}
		}, undefined);
	} else if (schema.items) {
		if (Array.isArray(schema.items)) {
			return schema.items.reduce((newPath, item) => {
				if (newPath) {
					return newPath;
				} else {
					return getPathById(item, id, [...path, item.GUID]);
				}
			}, undefined);
		} else {
			return getPathById(schema.items, id, [...path, schema.items.GUID]);
		}
	}
};

const getNameByPath = (schema, path) => {
	if (schema.properties) {
		return Object.keys(schema.properties).reduce((foundedName, propertyName) => {
			if (foundedName.length) {
				return foundedName;
			}

			const property = schema.properties[propertyName];

			if (property.GUID !== path[0]) {
				return foundedName;
			}

			if (path.length === 1) {
				return [propertyName];
			}

			return [propertyName, ...getNameByPath(property, path.slice(1))];
		}, []);
	} else if (Array.isArray(schema.items)) {
		return schema.items.reduce((foundedName, property, i) => {
			if (foundedName.length) {
				return foundedName;
			}

			if (property.GUID !== path[0]) {
				return foundedName;
			}

			if (path.length === 1) {
				return ['[' + i + ']'];
			}

			return ['[' + i + ']', ...getNameByPath(property, path.slice(1))];
		}, []);
	} else if (Object(schema.items) === schema.items) {
		const property = schema.items;

		if (property.GUID !== path[0]) {
			return [''];
		}

		if (path.length === 1) {
			return ['[0]'];
		}

		return ['[0]', ...getNameByPath(property, path.slice(1))];
	}
};

const joinIndex = items => {
	return items.reduce((result, item) => {
		if (/\[\d+]/.test(item)) {
			return [...result.slice(0, -1), result[result.length - 1] + item];
		} else {
			return [...result, item];
		}
	}, []);
};

const findFieldNameById = (id, source) => {
	let path = getPathById(source, id, []);

	if (path) {
		const name = joinIndex(getNameByPath(source, path));

		return name[name.length - 1] || '';
	} else {
		return '';
	}
};

const getPathName = (id, sources) => {
	for (const element of sources) {
		let path = getPathById(element, id, []);

		if (path) {
			const name = getNameByPath(element, path);

			return name
				.slice(1)
				.filter(item => !/\[\d+]/.test(item))
				.join('.');
		}
	}

	return '';
};

const getNamesByIds = (ids, sources) => {
	return ids.reduce((names, id) => {
		for (const element of sources) {
			const name = findFieldNameById(id, element);

			if (name) {
				return [...names, name];
			}
		}

		return names;
	}, []);
};

module.exports = {
	getNamesByIds,
	getPathName,
};

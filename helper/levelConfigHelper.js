const fs = require('fs');
const path = require('path');

const blockCommentRegex = /\/\*[.\s\S]*?\*\//gi;

const fieldLevelConfigPath = path.join('properties_pane', 'field_level', 'fieldLevelConfig.json');
const containerLevelConfigPath = path.join('properties_pane', 'container_level', 'containerLevelConfig.json');

/**
 * @typedef {object | object[]} levelConfig
 */

/**
 * @description
 * @param {string} pathToConfig absolute path to the config file
 * @returns {levelConfig}
 */
const readConfig = pathToConfig => {
	const filePath = path.join(__dirname, '..', pathToConfig);
	const fileContent = fs.readFileSync(filePath);
	const cleanedFileContent = fileContent.toString().replace(blockCommentRegex, '');

	return JSON.parse(cleanedFileContent);
};

/**
 * @returns {levelConfig}
 */
const getFieldLevelConfig = () => {
	return readConfig(fieldLevelConfigPath);
};

/**
 * @returns {levelConfig}
 */
const getContainerLevelConfig = () => {
	return readConfig(containerLevelConfigPath);
};

module.exports = {
	getFieldLevelConfig,
	getContainerLevelConfig,
};

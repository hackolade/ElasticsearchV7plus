const { generateScript } = require('../forward_engineering/generateScript');
const { generateContainerScript } = require('../forward_engineering/generateContainerScript');
const { getTemplateScopeJsonSchema } = require('../forward_engineering/helpers/getTemplateScopeJsonSchema');

module.exports = {
	generateScript,
	generateContainerScript,
	getTemplateScopeJsonSchema,
};

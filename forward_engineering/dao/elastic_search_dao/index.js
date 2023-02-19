const {ElasticSearchClientFactory} = require('./client_factory');
const readline = require('readline');
const fs = require('fs');
const kibanaParser = require('../../script_parser/kibana_script_parser');

class ElasticSearchDao {

    _client = null;

    /**
     * @param connectionInfo {{
     *     connectionType: string,
     *     username: string,
     *     password: string,
     *     protocol: string,
     *     host?: string,
     *     port?: number,
     *     path?: string,
     *     hosts?: Array<{
     *         host: string,
     *         port: string,
     *     }>,
     *     is_ssl: boolean,
     *     ca?: string,
     *     rejectUnauthorized?: boolean,
     * }}
     * @throws Error
     * */
    constructor(connectionInfo) {
        this._client = ElasticSearchClientFactory.getByConnectionInfo(connectionInfo);

        this.applyToInstance = this.applyToInstance.bind(this);
        this._executeScript = this._executeScript.bind(this);
        this._insertExampleDocuments = this._insertExampleDocuments.bind(this);
        this._insertExampleDocument = this._insertExampleDocument.bind(this);
        this._insertExampleDocumentsFromFile = this._insertExampleDocumentsFromFile.bind(this);
        this._executeKibanaScript = this._executeKibanaScript.bind(this);
        this._executeCurlScript = this._executeCurlScript.bind(this);
        this.close = this.close.bind(this);
    }

    /**
     * @param script {string}
     * @param entitiesData {{
     *     [x: string]: {
     *         name: string,
     *         jsonData: string,
     *         filePath?: string
     *     }
     * }}
     * */
    async applyToInstance(script, entitiesData) {
        await this._executeScript(script);
        const insertDocumentsPromises = Object.values(entitiesData)
            .map((typeData) => {
                const { name, filePath, jsonData } = typeData;
                return this._insertExampleDocuments(name, JSON.parse(jsonData), filePath);
            });
        await Promise.all(insertDocumentsPromises);
    }

    /**
     * @param script {string}
     */
    async _executeCurlScript(script) {
        return null;
    }

    /**
     * @param script {string}
     */
    async _executeKibanaScript(script) {
        const parsedScript = kibanaParser.parseKibanaScript(script);
        return null;
    }

    /**
     * @param script {string}
     */
    async _executeScript(script) {
        if (script.startsWith('curl')) {
            return await this._executeCurlScript(script);
        }
        return await this._executeKibanaScript(script);
    }

    /**
     * @param typeName {string}
     * @param jsonData {Object}
     */
    async _insertExampleDocument(typeName, jsonData) {

    }

    /**
     * @param typeName {string}
     * @param filePath {string}
     */
    async _insertExampleDocumentsFromFile(typeName, filePath) {
        return new Promise((resolve, reject) => {
            const pushSamplePromises = [];
            const file = readline.createInterface({
                input: fs.createReadStream(filePath),
                output: process.stdout,
                terminal: false
            });
            file.on('line', (line) => {
                try {
                    const parsedLine = JSON.parse(line);
                    const pushSamplePromise = this._insertExampleDocument(typeName, parsedLine);
                    pushSamplePromises.push(pushSamplePromise);
                } catch (e) {
                    reject(e)
                }
            });
            Promise.all(pushSamplePromises)
                .then(() => resolve(true))
                .catch(e => reject(e));
        })
    }

    /**
     * @param typeName {string}
     * @param jsonData {Object}
     * @param filePath {string | undefined}
     */
    async _insertExampleDocuments(typeName, jsonData, filePath) {
        await this._insertExampleDocument(typeName, jsonData);
        if (filePath) {
            await this._insertExampleDocumentsFromFile(typeName, filePath);
        }
    }

    async close() {
        if (this._client) {
            await this._client.close();
        }
    }

}

module.exports = {
    ElasticSearchDao,
}

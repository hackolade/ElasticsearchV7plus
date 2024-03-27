const readline = require('readline');
const fs = require('fs');

/**
 * @typedef { import('../../types/scriptParserTypes').ParsedScriptData } ParsedScriptData
 * @typedef { import('../../types/elasticsearchSampleDataTypes').EntitiesData } EntitiesData
 * @typedef { import('../../types/elasticsearchSampleDataTypes').JsonData } JsonData
 * */


class ElasticSearchService {

    _client = null;

    /**
     * @throws Error
     * */
    constructor(client) {
        this._client = client;

        this.applyToInstance = this.applyToInstance.bind(this);
        this._executeScript = this._executeScript.bind(this);
        this._insertExampleDocuments = this._insertExampleDocuments.bind(this);
        this._insertExampleDocument = this._insertExampleDocument.bind(this);
        this._insertExampleDocumentsFromFile = this._insertExampleDocumentsFromFile.bind(this);
        this.testConnection = this.testConnection.bind(this);
        this.close = this.close.bind(this);
    }

    /**
     * @param scriptData {ParsedScriptData}
     * @param entitiesData {EntitiesData}
     * */
    async applyToInstance(scriptData, entitiesData) {
        await this._executeScript(scriptData);
        for (const typeData of Object.values(entitiesData)) {
            const {filePath, jsonData } = typeData;
            await this._insertExampleDocuments(JSON.parse(jsonData), filePath);
        }
    }

    async testConnection() {
        await this._client.ping(undefined, { requestTimeout: 5000 });
    }

    /**
     * @param scriptData {ParsedScriptData}
     */
    async _executeScript(scriptData) {
        const { body, indexName } = scriptData;
        const existsResponse = await this._client.indices.exists({
            index: indexName,
        });
        if (!existsResponse.body) {
            await this._client.indices.create({
                index: indexName,
                body,
            });
        } else {
            throw new Error(`Index ${indexName} already exists, index update is not supported`);
        }
    }

    /**
     * @param jsonData {JsonData}
     */
    async _insertExampleDocument(jsonData) {
        const { _index: indexName, _source: data } = jsonData;
        if (!indexName) {
            throw new Error(`Index name must be present in sample data line ${JSON.stringify(jsonData)}`);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(`Invalid sample data: ${data}`);
        }
        await this._client.index({
            index: indexName,
            op_type: 'index',
            body: data
        });
    }

    /**
     * @param filePath {string}
     */
    async _insertExampleDocumentsFromFile(filePath) {
        const file = readline.createInterface({
            input: fs.createReadStream(filePath),
            output: process.stdout,
            terminal: false
        });
        for await (const line of file) {
            const parsedLine = JSON.parse(line);
            await this._insertExampleDocument(parsedLine);
        }
    }

    /**
     * @param jsonData {JsonData}
     * @param filePath {string | undefined}
     */
    async _insertExampleDocuments(jsonData, filePath) {
        await this._insertExampleDocument(jsonData);
        if (filePath) {
            await this._insertExampleDocumentsFromFile(filePath);
        }
    }

    async close() {
        if (this._client) {
            await this._client.close();
        }
    }

}

module.exports = {
    ElasticSearchService,
}

const readline = require('readline');
const fs = require('fs');
const kibanaParser = require('../../script_parser/kibana_script_parser');
const curlParser = require('../../script_parser/curl_script_parser');

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
                const {filePath, jsonData } = typeData;
                return this._insertExampleDocuments(JSON.parse(jsonData), filePath);
            });
        await Promise.all(insertDocumentsPromises);
    }

    async testConnection() {
        await this._client.ping(undefined, { requestTimeout: 5000 });
    }

    /**
     * @param script {string}
     */
    async _executeScript(script) {
        let parsedData;
        if (script.startsWith('curl')) {
            parsedData = curlParser.parseCurlScript(script);
        } else {
            parsedData = kibanaParser.parseKibanaScript(script);
        }
        const { body, indexName, httpMethod } = parsedData;
        const existsResponse = await this._client.indices.exists({
            index: indexName,
        });
        if (!existsResponse.body) {
            await this._client.indices.create({
                index: indexName,
                method: httpMethod,
                body,
            });
        }
    }

    /**
     * @param jsonData {{
     *      _index: string,
     *      _type?:string,
     *      _id:string,
     *      _source: Object
     * }}
     */
    async _insertExampleDocument(jsonData) {
        const { _index: indexName, _source: data, _type: typeName } = jsonData;
        if (!indexName) {
            throw new Error(`Index name must be present in sample data line ${JSON.stringify(jsonData)}`);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(`Invalid sample data: ${data}`);
        }
        await this._client.index({
            index: indexName,
            type: typeName,
            op_type: 'index',
            body: data
        });
    }

    /**
     * @param filePath {string}
     */
    async _insertExampleDocumentsFromFile(filePath) {
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
                    const pushSamplePromise = this._insertExampleDocument(parsedLine);
                    pushSamplePromises.push(pushSamplePromise);
                } catch (e) {
                    reject(e)
                }
            });
            file.on('close', () => {
                Promise.all(pushSamplePromises)
                    .then(() => resolve(true))
                    .catch(e => reject(e));
            })
        })
    }

    /**
     * @param jsonData {Object}
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

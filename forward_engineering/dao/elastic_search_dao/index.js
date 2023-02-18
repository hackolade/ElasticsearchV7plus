const {ElasticSearchClientFactory} = require('./client_factory');

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

        this.insertExampleDocumentsInBulk = this.insertExampleDocumentsInBulk.bind(this);
        this.close = this.close.bind(this);
    }

    async insertExampleDocumentsInBulk() {

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

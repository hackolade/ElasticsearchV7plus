const {ConnectionType} = require("../../../enums/connection_type_enum");
const fs = require('fs');
const elasticsearch = require('@elastic/elasticsearch');
const {assertExists} = require("../../../util/error-util");

class ElasticSearchClientFactory {

    /**
     * @param protocol {string}
     * @param host {string}
     * @param port {number | string}
     * @param path {string | undefined}
     * @return {URL}
     * @throws {Error}
     * */
    static #buildUrl(protocol, host, port, path) {
        assertExists(protocol, 'protocol');
        assertExists(host, 'host');
        assertExists(port, 'port');
        const pathAsString = path ? String(path) : '';
        const pathNoStartSlash = pathAsString.startsWith('/') ? pathAsString.substring(1) : pathAsString;
        const urlAsString = `${protocol}://${host}:${port}/${pathNoStartSlash}`;
        return new URL(urlAsString);
    }

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
    static #applyDefaults(connectionInfo) {
        connectionInfo.protocol = connectionInfo.protocol || 'http';
        connectionInfo.connectionType = connectionInfo.connectionType || ConnectionType.DIRECT_CONNECTION;
    }

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
    static getByConnectionInfo(connectionInfo) {
        ElasticSearchClientFactory.#applyDefaults(connectionInfo);

        /**
         * @return {{
         *     node: string,
         * }}
         * @throws {Error}
         * */
        const getNode = () => {
            const { protocol, host, port, path } = connectionInfo;
            return {
                node: ElasticSearchClientFactory.#buildUrl(protocol, host, port, path).toString(),
            }
        };

        /**
         * @return {{
         *     nodes: Array<string>
         * }}
         * @throws {Error}
         * */
        const getNodes = () => {
            const { protocol, hosts, path } = connectionInfo;
            assertExists((hosts || []).length, 'hosts length');

            return {
                nodes: hosts.map(hostConfig => {
                    const { host, port } = hostConfig;
                    return ElasticSearchClientFactory.#buildUrl(protocol, host, port, path).toString()
                }),
            }
        };

        /**
         * @return {{
         *     node?: string,
         *     nodes?: Array<string>
         * }}
         * @throws {Error}
         * */
        const getNodeConfig = () => {
            const { connectionType } = connectionInfo;
            if (connectionType === ConnectionType.DIRECT_CONNECTION) {
                return getNode()
            } else if (connectionType === ConnectionType.REPLICA_SET_OR_SHARDED_CLUSTER) {
                return getNodes();
            }
            throw new Error(`Unsupported connection type: ${connectionType}`);
        }

        /**
         * @return {undefined | {
         *     ca: string | Buffer,
         *     rejectUnauthorized: Boolean,
         * }}
         * */
        const getTlsConfig = () => {
            const { is_ssl, ca, rejectUnauthorized } = connectionInfo;
            if (!is_ssl) {
                return undefined;
            }
            return {
                ca: fs.readFileSync(String(ca)),
                rejectUnauthorized: Boolean(rejectUnauthorized),
            }
        }

        const { username, password } = connectionInfo;
        const nodeConfig = getNodeConfig();
        return new elasticsearch.Client({
            auth: {
                username,
                password,
            },
            ssl: getTlsConfig(),
            ...nodeConfig,
        });
    }

}

module.exports = {
    ElasticSearchClientFactory
}

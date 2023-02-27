const {ConnectionType} = require("../../../enums/connectionTypeEnum");
const fs = require('fs');
const elasticsearch = require('@elastic/elasticsearch');
const {assertExists} = require("../../../util/errorUtil");

/**
 * @typedef { import('../../types/connectionTypes').ConnectionInfo } ConnectionInfo
 * */


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
     * @param connectionInfo {ConnectionInfo}
     * @throws Error
     * */
    static #applyDefaults(connectionInfo) {
        connectionInfo.protocol = connectionInfo.protocol || 'http';
        connectionInfo.connectionType = connectionInfo.connectionType || ConnectionType.DIRECT_CONNECTION;
    }

    /**
     * @return {{
     *     node: string,
     * }}
     * @throws {Error}
     * */
    static #getNode(connectionInfo) {
        const {protocol, host, port, path} = connectionInfo;
        return {
            node: ElasticSearchClientFactory.#buildUrl(protocol, host, port, path).toString(),
        }
    }

    /**
     * @return {{
     *     nodes: Array<string>
     * }}
     * @throws {Error}
     * */
    static #getNodes(connectionInfo) {
        const {protocol, hosts, path} = connectionInfo;
        assertExists((hosts || []).length, 'hosts length');

        return {
            nodes: hosts.map(hostConfig => {
                const {host, port} = hostConfig;
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
    static #getNodeConfig(connectionInfo) {
        const {connectionType} = connectionInfo;
        if (connectionType === ConnectionType.DIRECT_CONNECTION) {
            return ElasticSearchClientFactory.#getNode(connectionInfo)
        } else if (connectionType === ConnectionType.REPLICA_SET_OR_SHARDED_CLUSTER) {
            return ElasticSearchClientFactory.#getNodes(connectionInfo);
        }
        throw new Error(`Unsupported connection type: ${connectionType}`);
    }

    /**
     * @return {undefined | {
     *     ca: string | Buffer,
     *     rejectUnauthorized: Boolean,
     * }}
     * */
    static #getTlsConfig(connectionInfo) {
        const {is_ssl, ca, rejectUnauthorized} = connectionInfo;
        if (!is_ssl) {
            return undefined;
        }
        return {
            ca: fs.readFileSync(String(ca)),
            rejectUnauthorized: Boolean(rejectUnauthorized),
        }
    }

    /**
     * @param connectionInfo {ConnectionInfo}
     * @throws Error
     * */
    static getByConnectionInfo(connectionInfo) {
        ElasticSearchClientFactory.#applyDefaults(connectionInfo);

        const {username, password} = connectionInfo;
        const nodeConfig = ElasticSearchClientFactory.#getNodeConfig(connectionInfo);
        return new elasticsearch.Client({
            auth: {
                username,
                password,
            },
            ssl: ElasticSearchClientFactory.#getTlsConfig(connectionInfo),
            ...nodeConfig,
        });
    }

}

module.exports = {
    ElasticSearchClientFactory
}

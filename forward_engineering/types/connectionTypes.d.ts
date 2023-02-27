export type ConnectionInfo = {
    connectionType: string,
    username: string,
    password: string,
    protocol: string,
    host?: string,
    port?: number,
    path?: string,
    hosts?: Array<{
        host: string,
        port: string,
    }>,
    is_ssl: boolean,
    ca?: string,
    rejectUnauthorized?: boolean,
}

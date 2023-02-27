export type ParsedScriptFirstLine = {
    httpMethod: string,
    indexName: string,
    line: string,
}

export type ParsedScriptBody = {
    settings: {
        number_of_shards: number,
        number_of_replicas: number
    },
    mappings: {
        properties: {
            [typeName: string]: {
                type: string,
                index: boolean,
                index_options: string
            }
        }
    }
}

export type ParsedScriptData = {
    httpMethod: string,
    indexName: string,
    body: ParsedScriptBody,
}

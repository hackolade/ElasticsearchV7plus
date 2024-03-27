export type EntitiesData = {
    [x: string]: {
        name: string,
        jsonData: string,
        filePath?: string
    }
}

export type JsonData = {
    _index: string,
    _id: string,
    _source: Object
}

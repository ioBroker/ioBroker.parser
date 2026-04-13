export interface ParserCommon extends ioBroker.StateCommon {
    enabled?: boolean;
}

export interface ParserState extends ioBroker.StateObject {
    common: ParserCommon;
}

export interface ParserRule {
    _id: string;
    common: {
        name: string;
        enabled: boolean;
        role?: string;
        type: ioBroker.CommonType;
        unit?: string;
        read?: boolean;
        write?: boolean;
    };
    native: {
        type?: 'url' | 'iobstate' | 'iobfile' | 'ioblog';
        link: string;
        logLevel?: ioBroker.LogLevel | '*';
        logSource?: string;
        item: number | string;
        regex: string;
        interval: number | string;
        cron: string;
        substitute: string | null | number | boolean | undefined;
        substituteOld: string | null | number | boolean | undefined;
        offset: number | string;
        factor: number | string;
        parseHtml: boolean | 'true';
        comma?: boolean;
    };
}

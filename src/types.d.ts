import { Adapter } from '@iobroker/adapter-core';

export interface ParserAdapterConfig {
    pollInterval: number;
    requestTimeout: number;
    requestDelay: number;
    acceptInvalidCertificates: boolean;
    useInsecureHTTPParser: boolean;
    updateNonChanged: boolean;
    userAgent: string;
}

export interface ParserNative {
    link: string;
    interval: number;
    regex: string;
    item: number;
    factor: number;
    offset: number;
    substitute: ioBroker.StateValue | undefined | null;
    substituteOld: boolean | string;
    comma?: boolean;
    parseHtml?: boolean;
}

export interface ParserStateObject extends Omit<ioBroker.StateObject, 'native'> {
    native: ParserNative;
    value: ioBroker.State;
    regex?: RegExp;
    processed?: boolean;
}

export interface TimerEntry {
    interval: number;
    count: number;
    timer: ReturnType<typeof setInterval>;
}

export interface QueueEntry {
    link: string;
    callback: ReadLinkCallback;
}

export type ReadLinkCallback = (error: string | null, text: string | null, link: string) => void;

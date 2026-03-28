import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import https from 'node:https';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';

import type {
    LogMessage,
    ParserAdapterConfig,
    ParserStateObject,
    QueueEntry,
    ReadLinkCallback,
    TimerEntry,
} from './types';

const regexFlags: Record<string, string> = {
    global: 'g',
    ignoreCase: 'i',
    multiline: 'm',
    dotAll: 's',
    sticky: 'y',
    unicode: 'u',
};

type IobUri = string;
type IobUriType = 'object' | 'state' | 'file' | 'http' | 'base64';

type IobUriParsed = { type: IobUriType; address: string; path?: string };

function iobUriParse(uri: IobUri): IobUriParsed {
    const result: IobUriParsed = {
        type: 'object',
        address: '',
    };
    if (uri.startsWith('iobobject://')) {
        result.type = 'object';
        uri = uri.replace('iobobject://', '');
        const parts = uri.split('/');
        result.address = parts[0];
        result.path = parts[1]; // native.schemas.myObject
    } else if (uri.startsWith('iobstate://')) {
        result.type = 'state';
        uri = uri.replace('iobstate://', '');
        const parts = uri.split('/');
        result.address = parts[0];
        result.path = parts[1]; // val, ts, lc, from, q, ...
    } else if (uri.startsWith('iobfile://')) {
        result.type = 'file';
        uri = uri.replace('iobfile://', '');
        const parts = uri.split('/');
        result.address = parts.shift() || '';
        result.path = parts.join('/'); // main/img/hello.png
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
        result.type = 'http';
        result.address = uri; // https://googlw.com/path/uri?lakds=7889
    } else if (uri.startsWith('data:')) {
        // data:image/jpeg;base64,
        result.type = 'base64';
        result.address = uri; // data:image/jpeg;base64,...
    } else {
        // no protocol provided
        const parts = uri.split('/');
        if (parts.length === 2) {
            result.address = parts[0];
            result.path = parts[1];
            if (result.path.includes('.')) {
                result.type = 'object';
            } else if (result.path) {
                if (
                    result.path === 'val' ||
                    result.path === 'q' ||
                    result.path === 'ack' ||
                    result.path === 'ts' ||
                    result.path === 'lc' ||
                    result.path === 'from' ||
                    result.path === 'user' ||
                    result.path === 'expire' ||
                    result.path === 'c'
                ) {
                    result.type = 'state';
                } else if (
                    result.path === 'common' ||
                    result.path === 'native' ||
                    result.path === 'from' ||
                    result.path === 'acl' ||
                    result.path === 'type'
                ) {
                    result.type = 'object';
                } else {
                    throw new Error(`Unknown path: ${result.path}`);
                }
            } else {
                result.type = 'state';
            }
        } else if (parts.length === 1) {
            result.address = parts[0];
            result.type = 'state';
        } else {
            // it is a file
            result.address = parts.shift() || '';
            result.type = 'file';
            result.path = parts.join('/');
        }
    }
    return result;
}

const LOG_LEVEL_SEVERITY: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3, silly: 4 };

/**
 * Returns true if `messageSeverity` is at least as severe as `configLevel`.
 *
 * @param configLevel
 * @param messageSeverity
 */
function compareLogLevel(configLevel: string | undefined, messageSeverity: string): boolean {
    if (!configLevel || configLevel === '*') {
        return true;
    }
    const configRank = LOG_LEVEL_SEVERITY[configLevel] ?? 2;
    const msgRank = LOG_LEVEL_SEVERITY[messageSeverity] ?? 2;
    return msgRank <= configRank;
}

function compareLogSource(config: string | undefined, source: string): boolean {
    if (!config || config === '*') {
        return true;
    }
    if (config.startsWith('system.adapter.')) {
        const stripped = config.slice('system.adapter.'.length); // e.g. 'admin.0' or 'admin.*'
        if (stripped.endsWith('.*')) {
            return source.startsWith(`${stripped.slice(0, -2)}.`); // 'admin.*' → source starts with 'admin.'
        }
        return stripped === source;
    }
    if (config.startsWith('system.host.')) {
        const stripped = config.slice('system.host.'.length); // e.g. 'iobroker' or '*'
        if (stripped === '*') {
            return source.startsWith('host.'); // match any host process
        }
        return `host.${stripped}` === source; // 'host.iobroker' === source
    }
    return config === source;
}

class ParserAdapter extends Adapter {
    declare config: ParserAdapterConfig;
    private states: Record<string, ParserStateObject> = {};
    private timers: Record<number, TimerEntry> = {};
    private hostnamesQueue: Record<string, QueueEntry[]> = {};
    private hostnamesRequestTime: Record<string, number> = {};
    private stateSubscriptions: Record<string, string[]> = {};
    private fileSubscriptions: Record<string, string[]> = {};
    private logSubscriptions: string[] = [];

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'parser',
            objectChange: (id, obj) => this.onObjectChange(id, obj),
            stateChange: (id, state) => this.onStateChange(id, state),
            fileChange: (id: string, fileName: string) => this.onFileChange(id, fileName),
            message: obj => this.onMessage(obj),
            ready: () => this.main(),
            logTransporter: true,
        });
        this.on('log', this.onLog);
    }

    onLog = (message: LogMessage): void => {
        console.log(`[${message.severity}] ${message.from}: ${message.message}`);
        // host has "from" as "host.NAME", but instance is "adapter.X"
        for (const parserId of this.logSubscriptions) {
            if (this.states[parserId]) {
                if (compareLogLevel(this.states[parserId].native.logLevel, message.severity)) {
                    if (compareLogSource(this.states[parserId].native.logSource, message.from)) {
                        this.analyseData(this.states[parserId], message.message, null);
                    }
                }
            }
        }
    };

    private async onFileChange(id: string, fileName: string): Promise<void> {
        const key = `${id}/${fileName}`;
        if (this.fileSubscriptions[key] && fileName) {
            try {
                const file = await this.readFileAsync(id, fileName);
                if (file.file) {
                    for (const parserId of this.fileSubscriptions[key]) {
                        if (this.states[parserId]) {
                            this.analyseData(this.states[parserId], file.file.toString(), null);
                        }
                    }
                }
            } catch (error) {
                this.log.error(String(error));
            }
        }
    }

    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        if (!id) {
            return;
        }
        if (!obj) {
            if (this.states[id]) {
                this.log.info(`Parser object ${id} removed`);
                await this.deletePoll(this.states[id]);
                delete this.states[id];
            }
        } else if (id.startsWith(`${this.namespace}.`)) {
            if (!obj.native) {
                this.log.warn(`No configuration for ${obj._id}, ignoring it`);
                return;
            }

            const newObj = obj as unknown as ParserStateObject;
            newObj.native.interval = parseInt(String(newObj.native.interval || this.config.pollInterval), 10);

            if (!this.states[id]) {
                this.log.info(`Parser object ${id} added`);
                const state = await this.getStateAsync(id);
                this.states[id] = newObj;
                this.states[id].value = state || {
                    val: null,
                    ack: false,
                    ts: 0,
                    lc: 0,
                    from: '',
                };
                if (await this.initPoll(this.states[id], false)) {
                    this.poll(this.timers[newObj.native.interval].interval);
                }
            } else {
                const oldNative = this.states[id].native;
                const isSubscriptionType = (t: string | undefined): boolean =>
                    t === 'iobstate' || t === 'iobfile' || t === 'ioblog';
                const needsReset =
                    oldNative.interval !== newObj.native.interval ||
                    this.states[id].common.enabled !== newObj.common.enabled ||
                    oldNative.type !== newObj.native.type ||
                    (oldNative.link !== newObj.native.link &&
                        (isSubscriptionType(oldNative.type) || isSubscriptionType(newObj.native.type)));

                if (needsReset) {
                    this.log.info(`Parser object ${id} source changed`);
                    await this.deletePoll(this.states[id]);
                    this.states[id] = Object.assign(this.states[id], newObj);
                    await this.initPoll(this.states[id], false);
                } else {
                    this.log.debug(`Parser object ${id} updated`);
                    this.states[id] = Object.assign(this.states[id], newObj);
                    await this.initPoll(this.states[id], true);
                }
            }
        }
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        // Handle subscribed foreign state changes (any ack)
        if (this.stateSubscriptions[id]) {
            if (state) {
                const text = state.val != null ? String(state.val) : '';
                for (const parserId of this.stateSubscriptions[id]) {
                    if (this.states[parserId]) {
                        this.analyseData(this.states[parserId], text, null);
                    }
                }
            }
            return;
        }

        if (!state || state.ack) {
            return;
        }

        if (this.states[id] && !state.val) {
            const oldVal = this.states[id].value.val;
            setTimeout(() => {
                void this.readLink(this.states[id].native.link, (error, text) =>
                    this.analyseData(this.states[id], text, error, updated => {
                        if (!updated) {
                            void this.setState(id, { val: oldVal, ack: true });
                        }
                    }),
                );
            }, 0);
        }
    }

    private onMessage(obj: ioBroker.Message): void {
        if (obj) {
            switch (obj.command) {
                case 'link':
                    if (obj.callback) {
                        void this.readLink(obj.message as string, (err, text) =>
                            this.sendTo(obj.from, obj.command, { error: err, text }, obj.callback),
                        );
                    }
                    break;

                case 'trigger':
                    if (obj.callback) {
                        const msgId = obj.message as string;
                        if (!this.states[msgId] && !this.states[`${this.namespace}.${msgId}`]) {
                            this.sendTo(obj.from, obj.command, { error: 'State not found', value: null }, obj.callback);
                        } else {
                            const id = this.states[msgId] ? msgId : `${this.namespace}.${msgId}`;
                            void this.readLink(this.states[id].native.link, (error, text) =>
                                this.analyseData(
                                    this.states[id],
                                    text,
                                    error,
                                    () =>
                                        obj.callback &&
                                        this.sendTo(
                                            obj.from,
                                            obj.command,
                                            { error, value: this.states[id].value.val },
                                            obj.callback,
                                        ),
                                ),
                            );
                        }
                    }
                    break;
            }
        }
    }

    private async initPoll(obj: ParserStateObject, onlyUpdate: boolean): Promise<boolean> {
        if (!obj.native) {
            this.log.warn(`No configuration for ${obj._id}, ignoring it`);
            return false;
        }

        obj.native.interval = obj.native.interval || this.config.pollInterval;
        obj.native.regex = obj.native.regex || '.+';

        if (obj.native.regex[0] === '/') {
            obj.native.regex = obj.native.regex.substring(1, obj.native.regex.length - 1);
        }
        obj.native.substituteOld = obj.native.substituteOld === 'true' || obj.native.substituteOld === true;

        if (
            (obj.native.substitute !== '' || obj.common.type === 'string') &&
            obj.native.substitute !== undefined &&
            obj.native.substitute !== null
        ) {
            if (obj.native.substitute === 'null') {
                obj.native.substitute = null;
            }

            if (obj.common.type === 'number') {
                obj.native.substitute = parseFloat(String(obj.native.substitute)) || 0;
            } else if (obj.common.type === 'boolean') {
                if (obj.native.substitute === 'true') {
                    obj.native.substitute = true;
                }
                if (obj.native.substitute === 'false') {
                    obj.native.substitute = false;
                }
                obj.native.substitute = !!obj.native.substitute;
            }
        } else {
            obj.native.substitute = undefined;
        }

        obj.native.offset = parseFloat(String(obj.native.offset)) || 0;
        obj.native.factor = parseFloat(String(obj.native.factor)) || 1;
        obj.native.item = parseFloat(String(obj.native.item)) || 0;
        obj.regex = new RegExp(obj.native.regex, obj.native.item || obj.common.type === 'array' ? 'g' : '');

        if (obj.common.enabled === false) {
            this.log.debug(`Rule ${obj._id} is disabled, ignoring it`);
            return false;
        }

        if (!obj.native.link && obj.native.type !== 'ioblog') {
            this.log.warn(`No link configured for ${obj._id}, ignoring it`);
            return false;
        }
        if (obj.native.link && !obj.native.link.match(/^https?:\/\//)) {
            obj.native.link = obj.native.link.replace(/\\/g, '/');
        }

        if (obj.native.type === 'iobstate') {
            if (!onlyUpdate) {
                const stateId = obj.native.link;
                if (!this.stateSubscriptions[stateId]) {
                    this.stateSubscriptions[stateId] = [];
                    this.subscribeForeignStates(stateId);
                }
                if (!this.stateSubscriptions[stateId].includes(obj._id)) {
                    this.stateSubscriptions[stateId].push(obj._id);
                }
            }
            return false; // no timer for state-subscribed rules
        }

        if (obj.native.type === 'iobfile') {
            if (!onlyUpdate) {
                const fileId = iobUriParse(obj.native.link);
                if (!this.fileSubscriptions[obj.native.link]) {
                    this.fileSubscriptions[obj.native.link] = [];
                    await this.subscribeForeignFiles(fileId.address, fileId.path!);
                }
                if (!this.fileSubscriptions[obj.native.link].includes(obj._id)) {
                    this.fileSubscriptions[obj.native.link].push(obj._id);
                }
            }
            return false; // no timer for state-subscribed rules
        }

        if (obj.native.type === 'ioblog') {
            if (!onlyUpdate) {
                if (!this.logSubscriptions.length) {
                    await this.requireLog?.(true);
                }
                if (!this.logSubscriptions.includes(obj._id)) {
                    this.logSubscriptions.push(obj._id);
                }
            }
            return false; // no timer for log-subscribed rules
        }

        if (!onlyUpdate) {
            if (!this.timers[obj.native.interval]) {
                this.timers[obj.native.interval] = {
                    interval: obj.native.interval,
                    count: 1,
                    timer: setInterval(() => this.poll(obj.native.interval), obj.native.interval),
                };
                return true;
            }
            this.timers[obj.native.interval].count++;
        }

        return false;
    }

    private async deletePoll(obj: ParserStateObject): Promise<void> {
        if (obj.native.type === 'iobstate') {
            const stateId = obj.native.link;
            if (this.stateSubscriptions[stateId]) {
                this.stateSubscriptions[stateId] = this.stateSubscriptions[stateId].filter(id => id !== obj._id);
                if (!this.stateSubscriptions[stateId].length) {
                    delete this.stateSubscriptions[stateId];
                    this.unsubscribeForeignStates(stateId);
                }
            }
            return;
        }

        if (obj.native.type === 'iobfile') {
            const fileId = iobUriParse(obj.native.link);
            if (this.fileSubscriptions[obj.native.link]) {
                this.fileSubscriptions[obj.native.link] = this.fileSubscriptions[obj.native.link].filter(
                    id => id !== obj._id,
                );
                if (!this.fileSubscriptions[obj.native.link].length) {
                    delete this.fileSubscriptions[obj.native.link];
                    await this.unsubscribeForeignFiles(fileId.address, fileId.path!);
                }
            }
            return;
        }

        if (obj.native.type === 'ioblog') {
            const pos = this.logSubscriptions.indexOf(obj._id);
            if (pos !== -1) {
                this.logSubscriptions.splice(pos, 1);
            }
            if (!this.logSubscriptions.length) {
                await this.requireLog?.(false);
            }
        }

        if (this.timers[obj.native.interval] === undefined) {
            return;
        }
        this.timers[obj.native.interval].count--;
        if (!this.timers[obj.native.interval].count) {
            clearInterval(this.timers[obj.native.interval].timer);
            delete this.timers[obj.native.interval];
        }
    }

    private _analyseDataForStates(
        linkStates: string[],
        data: string | null,
        error: string | null,
        callback?: () => void,
    ): void {
        if (!linkStates?.length) {
            callback?.();
        } else {
            const id = linkStates.shift()!;
            if (!this.states[id]) {
                this.log.error(`Invalid state ID: ${id}`);
                setImmediate(() => this._analyseDataForStates(linkStates, data, error, callback));
                return;
            }

            this.analyseData(this.states[id], data, error, () =>
                setImmediate(() => this._analyseDataForStates(linkStates, data, error, callback)),
            );
        }
    }

    private analyseDataForStates(
        curStates: string[],
        link: string,
        data: string | null,
        error: string | null | (() => void),
        callback?: () => void,
    ): void {
        if (typeof error === 'function') {
            callback = error;
            error = null;
        }

        const linkStates: string[] = [];
        for (let i = 0; i < curStates.length; i++) {
            if (this.states[curStates[i]] && this.states[curStates[i]].native.link === link) {
                linkStates.push(curStates[i]);
            }
        }
        this.log.debug(`Process ${JSON.stringify(linkStates)} for link ${link}`);
        this._analyseDataForStates(linkStates, data, error, callback);
    }

    private cloneRegex(regex: RegExp, noFlags?: boolean): RegExp {
        const lFlags = Object.keys(regexFlags)
            .map(flag => ((regex as unknown as Record<string, boolean>)[flag] ? regexFlags[flag] : ''))
            .join('');
        return new RegExp(regex.source, noFlags ? undefined : lFlags);
    }

    private analyseData(
        obj: ParserStateObject,
        data: string | null,
        error: string | null,
        callback?: (updated?: boolean) => void,
    ): void {
        this.log.debug(`analyseData CHECK for ${obj._id}, old=${obj.value.val}`);
        this.states[obj._id].processed = true;

        if (error) {
            if (obj.native.substituteOld) {
                this.log.info(`Cannot read link "${obj.native.link}": ${error}`);
                callback?.();
            } else {
                this.log.warn(`Cannot read link "${obj.native.link}": ${error}`);
                if (obj.value.q !== 0x82 || this.config.updateNonChanged) {
                    obj.value.q = 0x82;
                    obj.value.ack = true;
                    if (obj.native.substitute !== undefined) {
                        obj.value.val = obj.native.substitute;
                    }

                    this.log.debug(`analyseData for ${obj._id}, old=${obj.value.val}, new=Error`);
                    this.setForeignState(obj._id, { val: obj.value.val, q: obj.value.q, ack: obj.value.ack }, () =>
                        callback?.(true),
                    );
                } else if (callback) {
                    callback();
                }
            }
        } else if (obj.regex) {
            let item = obj.native.item + 1;
            if (item < 0) {
                item = 1;
            }
            if (item > 1000) {
                item = 1000;
            }
            let m: RegExpMatchArray | RegExpExecArray | null;

            const regex = this.cloneRegex(obj.regex);
            const dataStr = (data || '').toString().replace(/\r\n|[\r\n]/g, ' ');

            if (obj.common.type === 'array') {
                m = dataStr.match(regex);
            } else {
                do {
                    m = regex.exec(dataStr);
                    item--;
                } while (item && m);
            }

            if (m) {
                let newVal: ioBroker.StateValue | undefined;

                if (obj.common.type === 'boolean') {
                    newVal = true;
                } else if (obj.common.type !== 'array') {
                    newVal = m.length > 1 ? m[1] : m[0];

                    if (newVal === undefined) {
                        this.log.info(`Regex didn't matched for ${obj._id}, old=${obj.value.val}`);
                        if (obj.native.substituteOld) {
                            return callback?.();
                        }
                        if (obj.value.q !== 0x82 || this.config.updateNonChanged) {
                            obj.value.q = 0x82;
                            obj.value.ack = true;
                            if (obj.native.substitute !== undefined) {
                                obj.value.val = obj.native.substitute;
                            } else {
                                obj.value.val = null;
                            }
                            this.setForeignState(
                                obj._id,
                                { val: obj.value.val, q: obj.value.q, ack: obj.value.ack },
                                () => callback?.(true),
                            );
                        } else if (callback) {
                            callback();
                        }
                        return;
                    } else if (obj.common.type === 'number') {
                        const comma = obj.native.comma;
                        if (!comma) {
                            newVal = newVal.replace(/,/g, '');
                        }
                        if (comma) {
                            // 1.000.000 => 1000000
                            newVal = newVal.replace(/\./g, '');
                            // 5,67 => 5.67
                            newVal = newVal.replace(',', '.');
                        }
                        // 1 000 000 => 1000000
                        newVal = newVal.replace(/\s/g, '');

                        newVal = parseFloat(newVal);
                        newVal *= obj.native.factor;
                        newVal += obj.native.offset;
                    } else if (obj.common.type === 'string' && obj.native.parseHtml) {
                        newVal = newVal === null ? '' : String(newVal);
                        newVal = newVal.replace(/&#(\d+);/g, (_match, dec: string) =>
                            String.fromCharCode(parseInt(dec)),
                        );
                    }
                } else {
                    let mArr: string[] = m as string[];
                    if (obj.native.regex.includes('(')) {
                        const _regex = this.cloneRegex(obj.regex, true);
                        mArr = mArr.map(it => {
                            const _m = it.match(_regex);
                            if (_m && _m[1]) {
                                return _m[1];
                            }
                            return it;
                        });
                    }
                    if (obj.native.parseHtml) {
                        newVal = JSON.stringify(
                            mArr.map(it =>
                                it.replace(/&#(\d+);/g, (_match, dec: string) => String.fromCharCode(parseInt(dec))),
                            ),
                        );
                    } else {
                        newVal = JSON.stringify(mArr);
                    }
                }

                if (obj.value.q || newVal !== obj.value.val || !obj.value.ack || this.config.updateNonChanged) {
                    this.log.debug(`analyseData for ${obj._id}, old=${obj.value.val}, new=${newVal}`);
                    obj.value.ack = true;
                    obj.value.val = newVal ?? null;
                    obj.value.q = 0;
                    this.setForeignState(obj._id, { val: obj.value.val, q: obj.value.q, ack: obj.value.ack }, () =>
                        callback?.(true),
                    );
                } else if (callback) {
                    callback();
                }
            } else {
                if (obj.common.type === 'boolean') {
                    const newVal = false;
                    this.log.debug(`Text not found for ${obj._id}`);
                    if (obj.value.q || newVal !== obj.value.val || !obj.value.ack || this.config.updateNonChanged) {
                        this.log.debug(`analyseData for ${obj._id}, old=${obj.value.val},new=${newVal}`);
                        obj.value.ack = true;
                        obj.value.val = newVal;
                        obj.value.q = 0;
                        this.setForeignState(obj._id, { val: obj.value.val, q: obj.value.q, ack: obj.value.ack }, () =>
                            callback?.(true),
                        );
                    } else if (callback) {
                        callback();
                    }
                } else {
                    this.log.debug(`Cannot find number in answer for ${obj._id}`);
                    if (obj.native.substituteOld) {
                        callback?.();
                    } else {
                        if (obj.value.q !== 0x44 || !obj.value.ack || this.config.updateNonChanged) {
                            obj.value.q = 0x44;
                            obj.value.ack = true;
                            if (obj.native.substitute !== undefined) {
                                obj.value.val = obj.native.substitute;
                            }
                            console.log(`Use substitution: "${obj.native.substitute}"`);

                            this.setForeignState(
                                obj._id,
                                { val: obj.value.val, q: obj.value.q, ack: obj.value.ack },
                                () => callback?.(true),
                            );
                        } else if (callback) {
                            callback();
                        }
                    }
                }
            }
        } else {
            this.log.warn(`No regex object found for "${obj._id}"`);
            callback?.();
        }
    }

    private isStateLink(link: string): boolean {
        return (link || '').startsWith('iobstate://');
    }

    private isIobFileLink(link: string): boolean {
        return (link || '').startsWith('iobfile://');
    }

    private isRemoteLink(link: string): boolean {
        return !!(link || '').match(/^https?:\/\//);
    }

    private async readLink(link: string, callback: ReadLinkCallback): Promise<void> {
        if (this.isStateLink(link)) {
            const stateId = iobUriParse(link);
            try {
                const state = await this.getForeignStateAsync(stateId.address);
                callback(null, state?.val != null ? String(state.val) : '', link);
            } catch (e) {
                callback(String(e), null, link);
            }
            return;
        }
        if (this.isIobFileLink(link)) {
            const fileId = iobUriParse(link);
            try {
                const state = await this.readFileAsync(fileId.address, fileId.path!);
                callback(null, state?.file != null ? String(state.file) : '', link);
            } catch (e) {
                callback(String(e), null, link);
            }
            return;
        }

        if (this.isRemoteLink(link)) {
            this.log.debug(`Request URL: ${link}`);
            try {
                const res = await axios({
                    method: 'GET',
                    url: link,
                    httpsAgent: new https.Agent({
                        rejectUnauthorized: this.config.acceptInvalidCertificates === false,
                    }),
                    insecureHTTPParser: !!this.config.useInsecureHTTPParser,
                    timeout: this.config.requestTimeout,
                    transformResponse: [],
                    responseType: 'text',
                    headers: {
                        accept: '*/*',
                        'user-agent': this.config.userAgent,
                    },
                } as any);
                callback(
                    res.status !== 200 ? res.statusText || JSON.stringify(res.status) : null,
                    res.data as string,
                    link,
                );
            } catch (err: unknown) {
                const e = err as { data?: string; toString(): string };
                callback(e.data ? e.data : e.toString(), null, link);
            }
        } else {
            let resolvedLink = (link || '').replace(/\\/g, '/');
            if (resolvedLink[0] !== '/' && !resolvedLink.match(/^[A-Za-z]:/)) {
                resolvedLink = path.normalize(`${__dirname}/../../../${resolvedLink}`);
            }

            this.log.debug(`Read file: ${resolvedLink}`);

            if (fs.existsSync(resolvedLink)) {
                let data: string;
                try {
                    data = fs.readFileSync(resolvedLink).toString('utf8');
                } catch (e) {
                    this.log.warn(`Cannot read file "${resolvedLink}": ${e}`);
                    callback(String(e), null, link);
                    return;
                }
                callback(null, data, link);
            } else {
                callback('File does not exist', null, link);
            }
        }
    }

    // Keep a per-host queue for remote requests
    private processRemoteQueue(hostName: string): void {
        this.hostnamesRequestTime[hostName] = Date.now();
        const entry = this.hostnamesQueue[hostName][0];
        void this.readLink(entry.link, entry.callback);
    }

    private addToRemoteQueue(link: string, callback: ReadLinkCallback): void {
        this.log.debug(`Queue ${link}`);
        const url = new URL(link);

        if (!(url.hostname in this.hostnamesQueue)) {
            // No queue object yet, make one
            this.log.debug(`Creating request queue for ${url.hostname}`);
            this.hostnamesQueue[url.hostname] = [];
        }
        const requestQueue = this.hostnamesQueue[url.hostname];
        requestQueue.push({ link, callback });

        if (requestQueue.length === 1) {
            // First item in queue, process it. Otherwise, will get done when current request is removed.
            this.processRemoteQueue(url.hostname);
        }
    }

    private removeFromRemoteQueue(link: string): void {
        this.log.debug(`Dequeue ${link}`);
        const url = new URL(link);
        const requestQueue = this.hostnamesQueue[url.hostname];

        // Remove first entry (should be the request that just finished)
        requestQueue.shift();

        // And process the next request if there is one
        if (requestQueue.length > 0) {
            // Make sure correct delay has passed or wait until for that point
            const delay = Date.now() - this.hostnamesRequestTime[url.hostname];
            this.log.debug(`Next delay for ${url.hostname} is ${delay}`);
            if (delay < this.config.requestDelay) {
                this.setTimeout(() => this.processRemoteQueue(url.hostname), delay);
            } else {
                // Request already took longer than timeout so start instantly.
                // Issue a warning because this means delay is probably too short.
                this.log.warn(`No delay before next request to ${url.hostname}`);
                this.processRemoteQueue(url.hostname);
            }
        } else {
            this.log.debug(`Request queue for ${url.hostname} is now empty`);
        }
    }

    private poll(interval: number, callback?: () => void): void {
        // first mark all entries as not processed and collect the states for current interval that are not already planned for processing
        const curStates: string[] = [];
        const curLinks: string[] = [];
        for (const id of Object.keys(this.states)) {
            // skip disabled rules - they should not be polled even if the timer exists for other rules with the same interval
            if (
                this.states[id].common.enabled !== false &&
                this.states[id].native.interval === interval &&
                this.states[id].native.type !== 'iobfile' &&
                this.states[id].native.type !== 'iobstate' &&
                this.states[id].native.type !== 'ioblog' &&
                (this.states[id].processed || this.states[id].processed === undefined)
            ) {
                this.states[id].processed = false;
                curStates.push(id);
                if (!curLinks.includes(this.states[id].native.link)) {
                    curLinks.push(this.states[id].native.link);
                }
            }
        }
        this.log.debug(`States for current Interval (${interval}): ${JSON.stringify(curStates)}`);

        for (let j = 0; j < curLinks.length; j++) {
            const thisLink = curLinks[j];
            this.log.debug(`Do Link: ${thisLink}`);

            if (this.isRemoteLink(thisLink) && this.config.requestDelay) {
                // Queue handler...
                this.addToRemoteQueue(thisLink, (error, text, link) => {
                    // Remove from queue before performing actual analyse callback
                    this.removeFromRemoteQueue(link);
                    this.analyseDataForStates(curStates, link, text, error, callback);
                });
            } else {
                // Just read it instantly
                void this.readLink(thisLink, (error, text, link) =>
                    this.analyseDataForStates(curStates, link, text, error, callback),
                );
            }
        }
    }

    private async main(): Promise<void> {
        this.config.pollInterval = parseInt(String(this.config.pollInterval), 10) || 5000;
        this.config.requestTimeout = parseInt(String(this.config.requestTimeout), 10) || 60000;
        this.config.requestDelay = parseInt(String(this.config.requestDelay), 10) || 0;
        this.config.userAgent =
            this.config.userAgent ||
            'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

        // read current existing objects
        try {
            this.states = (await this.getForeignObjectsAsync(`${this.namespace}.*`, 'state')) as unknown as Record<
                string,
                ParserStateObject
            >;
        } catch (err: unknown) {
            this.log.error(`Cannot get objects: ${(err as Error).message}`);
            void this.stop?.();
            return;
        }
        // Migrate all states write: true
        for (const id of Object.keys(this.states)) {
            if (!this.states[id].common.write) {
                this.states[id].common.write = true;
                await this.setForeignObjectAsync(id, this.states[id]);
            }
        }

        let values: Record<string, ioBroker.State | null | undefined>;
        try {
            values = await this.getForeignStatesAsync(`${this.namespace}.*`);
        } catch (err: unknown) {
            this.log.error(`Cannot get state values: ${(err as Error).message}`);
            void this.stop?.();
            return;
        }
        // subscribe on changes
        await this.subscribeStatesAsync('*');
        await this.subscribeObjectsAsync('*');

        // Mark all sensors as if they received something
        for (const id of Object.keys(this.states)) {
            this.states[id].value = (values[id] as ioBroker.State) || { val: null, ack: false, ts: 0, lc: 0, from: '' };
            await this.initPoll(this.states[id], false);
        }

        // trigger all parsers first time
        for (const timerEntry of Object.values(this.timers)) {
            this.poll(timerEntry.interval);
        }

        // Initial read for state-subscribed rules
        for (const [stateId, parserIds] of Object.entries(this.stateSubscriptions)) {
            try {
                const state = await this.getForeignStateAsync(stateId);
                if (state) {
                    const text = state.val != null ? String(state.val) : '';
                    for (const parserId of parserIds) {
                        if (this.states[parserId]) {
                            this.analyseData(this.states[parserId], text, null);
                        }
                    }
                }
            } catch (e) {
                this.log.warn(`Cannot read initial state "${stateId}": ${e}`);
            }
        }

        // Initial read for file-subscribed rules
        for (const [key, parserIds] of Object.entries(this.fileSubscriptions)) {
            const fileId = iobUriParse(key);
            try {
                const file = await this.readFileAsync(fileId.address, fileId.path!);
                if (file) {
                    const text = file.file ? String(file.file) : '';
                    for (const parserId of parserIds) {
                        if (this.states[parserId]) {
                            this.analyseData(this.states[parserId], text, null);
                        }
                    }
                }
            } catch (e) {
                this.log.warn(`Cannot read initial file "${key}": ${e}`);
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new ParserAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ParserAdapter())();
}

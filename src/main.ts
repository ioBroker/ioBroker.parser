import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import https from 'node:https';
import path from 'node:path';
import fs from 'node:fs';
import axios from 'axios';

import type { ParserAdapterConfig, ParserStateObject, QueueEntry, ReadLinkCallback, TimerEntry } from './types';

const regexFlags: Record<string, string> = {
    global: 'g',
    ignoreCase: 'i',
    multiline: 'm',
    dotAll: 's',
    sticky: 'y',
    unicode: 'u',
};

class ParserAdapter extends Adapter {
    declare config: ParserAdapterConfig;
    private states: Record<string, ParserStateObject> = {};
    private timers: Record<number, TimerEntry> = {};
    private hostnamesQueue: Record<string, QueueEntry[]> = {};
    private hostnamesRequestTime: Record<string, number> = {};

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'parser',
            objectChange: (id, obj) => this.onObjectChange(id, obj),
            stateChange: (id, state) => this.onStateChange(id, state),
            message: obj => this.onMessage(obj),
            ready: () => this.main(),
        });
    }

    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (!id) {
            return;
        }
        if (!obj) {
            if (this.states[id]) {
                this.log.info(`Parser object ${id} removed`);
                this.deletePoll(this.states[id]);
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
                this.getState(id, (_err, state) => {
                    this.states[id] = newObj;
                    this.states[id].value = (state as ioBroker.State) || {
                        val: null,
                        ack: false,
                        ts: 0,
                        lc: 0,
                        from: '',
                    };
                    if (this.initPoll(this.states[id], false)) {
                        this.poll(this.timers[newObj.native.interval].interval);
                    }
                });
            } else {
                if (
                    this.states[id].native.interval !== newObj.native.interval ||
                    (this.states[id].common as ioBroker.StateCommon & { enabled?: boolean }).enabled !==
                        (newObj.common as ioBroker.StateCommon & { enabled?: boolean }).enabled
                ) {
                    this.log.info(`Parser object ${id} interval changed`);
                    this.deletePoll(this.states[id]);
                    this.states[id] = Object.assign(this.states[id], newObj);
                    this.initPoll(this.states[id], false);
                } else {
                    this.log.debug(`Parser object ${id} updated`);
                    this.states[id] = Object.assign(this.states[id], newObj);
                    this.initPoll(this.states[id], true);
                }
            }
        }
    }

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
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

    private initPoll(obj: ParserStateObject, onlyUpdate: boolean): boolean {
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

        if ((obj.common as ioBroker.StateCommon & { enabled?: boolean }).enabled === false) {
            this.log.debug(`Rule ${obj._id} is disabled, ignoring it`);
            return false;
        }

        if (!obj.native.link) {
            this.log.warn(`No link configured for ${obj._id}, ignoring it`);
            return false;
        } else if (!obj.native.link.match(/^https?:\/\//)) {
            obj.native.link = obj.native.link.replace(/\\/g, '/');
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

    private deletePoll(obj: ParserStateObject): void {
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

    private isRemoteLink(link: string): boolean {
        return !!(link || '').match(/^https?:\/\//);
    }

    private async readLink(link: string, callback: ReadLinkCallback): Promise<void> {
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
    private processRemoteQueue(hostname: string): void {
        this.hostnamesRequestTime[hostname] = Date.now();
        const entry = this.hostnamesQueue[hostname][0];
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
            if (
                this.states[id].native.interval === interval &&
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
            this.initPoll(this.states[id], false);
        }

        // trigger all parsers first time
        for (const timerEntry of Object.values(this.timers)) {
            this.poll(timerEntry.interval);
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

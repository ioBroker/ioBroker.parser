/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName = require('./package.json').name.split('.').pop();
const https = require('https');
let axios;
let path;
let fs;
let states;

let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName});
    adapter = new utils.Adapter(options);

    adapter.on('objectChange', (id, obj) => {
        if (!id) {
            return;
        }
        if (!obj) {
            if (states[id]) {
                adapter.log.info(`Parser object ${id} removed`);
                deletePoll(states[id]);
                delete states[id];
            }
        } else if (id.startsWith(`${adapter.namespace}.`)) {
            if (!obj.native) {
                adapter.log.warn(`No configuration for ${obj._id}, ignoring it`);
                return;
            }

            obj.native.interval = parseInt(obj.native.interval || adapter.config.pollInterval, 10);

            if (!states[id]) {
                adapter.log.info(`Parser object ${id} added`);
                adapter.getState(id, (err, state) => {
                    states[id] = obj;
                    states[id].value = state || {val: null};
                    if (initPoll(states[id], false)) {
                        poll(timers[obj.native.interval].interval); // new timer, so start initially once
                    }
                });
            } else {
                if (states[id].native.interval !== obj.native.interval || states[id].common.enabled !== obj.common.enabled) {
                    adapter.log.info(`Parser object ${id} interval changed`);
                    deletePoll(states[id]);
                    states[id] = Object.assign(states[id], obj);
                    initPoll(states[id], false);
                } else {
                    adapter.log.debug(`Parser object ${id} updated`);
                    states[id] = Object.assign(states[id], obj);
                    initPoll(states[id], true);
                }
            }
        }
    });

    adapter.on('stateChange', (id, state) => {
        if (!state || state.ack) {
            return;
        }

        if (states[id] && !state.val) {
            const oldVal = states[id].value.val;
            setTimeout(() => {
                readLink(states[id].native.link, (error, text) =>
                    analyseData(states[id], text, error, updated => {
                        if (!updated) {
                            adapter.setState(id, {val: oldVal, ack: true});
                        }
                    }));
            }, 0);
        }
    });

    adapter.on('message', obj => {
        if (obj) {
            switch (obj.command) {
                case 'link':
                    if (obj.callback) {
                        // read link
                        readLink(obj.message, (err, text) =>
                            adapter.sendTo(obj.from, obj.command, {error: err, text: text}, obj.callback));
                    }
                    break;

                case 'trigger':
                    if (obj.callback) {
                        if (!states[obj.message] && !states[`${adapter.namespace}.${obj.message}`]) {
                            obj.callback && adapter.sendTo(obj.from, obj.command, {error, value: states[id].value.val}, obj.callback)
                        } else {
                            const id = states[obj.message] ? obj.message : `${adapter.namespace}.${obj.message}`;

                            readLink(states[id].native.link, (error, text) =>
                                analyseData(states[id], text, error, () =>
                                    obj.callback && adapter.sendTo(obj.from, obj.command, {error, value: states[id].value.val}, obj.callback)));
                        }
                    }
                    break;
            }
        }
    });

    adapter.on('ready', main);

    return adapter;
}

function initPoll(obj, onlyUpdate) {
    if (!obj.native) {
        adapter.log.warn(`No configuration for ${obj._id}, ignoring it`);
        return false;
    }

    obj.native.interval = obj.native.interval || adapter.config.pollInterval;
    obj.native.regex = obj.native.regex || '.+';

    if (obj.native.regex[0] === '/') {
        obj.native.regex = obj.native.regex.substring(1, obj.native.regex.length - 1);
    }
    obj.native.substituteOld = obj.native.substituteOld === 'true' || obj.native.substituteOld === true;

    if ((obj.native.substitute !== '' || obj.common.type === 'string') && obj.native.substitute !== undefined && obj.native.substitute !== null) {
        if (obj.native.substitute === 'null')  {
            obj.native.substitute = null;
        }

        if (obj.common.type === 'number') {
            obj.native.substitute = parseFloat(obj.native.substitute) || 0;
        } else if (obj.common.type === 'boolean') {
            if (obj.native.substitute === 'true')  {
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

    obj.native.offset = parseFloat(obj.native.offset) || 0;
    obj.native.factor = parseFloat(obj.native.factor) || 1;
    obj.native.item   = parseFloat(obj.native.item)   || 0;
    obj.regex = new RegExp(obj.native.regex, obj.native.item ? 'g' : '');

    if (obj.common.enabled === false) {
        adapter.log.debug(`Rule ${obj._id} is disabled, ignoring it`);
        return false;
    }

    if (!obj.native.link) {
        adapter.log.warn(`No link configured for ${obj._id}, ignoring it`);
        return false;
    } else if (!obj.native.link.match(/^https?:\/\//)) {
        obj.native.link = obj.native.link.replace(/\\/g, '/');
    }

    if (!onlyUpdate) {
        if (!timers[obj.native.interval]) {
            timers[obj.native.interval] = {
                interval: obj.native.interval,
                count: 1,
                timer: setInterval(poll, obj.native.interval, obj.native.interval)
            };
            return true;
        } else {
            timers[obj.native.interval].count++;
        }
    }

    return false;
}

function deletePoll(obj) {
    if (timers[obj.native.interval] === undefined) {
        return;
    }
    timers[obj.native.interval].count--;
    if (!timers[obj.native.interval].count) {
        clearInterval(timers[obj.native.interval]);
        delete timers[obj.native.interval];
    }
}

function _analyseDataForStates(linkStates, data, error, callback) {
    if (!linkStates || !linkStates.length) {
        if (callback) callback();
    } else {
        const id = linkStates.shift();
        if (!states[id]) {
            adapter.log.error(`Invalid state ID: ${id}`);
            setImmediate(_analyseDataForStates, linkStates, data, error, callback);
            return;
        }

        analyseData(states[id], data, error, () =>
            setImmediate(_analyseDataForStates, linkStates, data, error, callback));
    }
}

function analyseDataForStates(curStates, link, data, error, callback) {
    if (typeof error === 'function') {
        callback = error;
        error = null;
    }

    const linkStates = [];
    for (let i = 0; i < curStates.length; i++) {
        if (states[curStates[i]] && states[curStates[i]].native.link === link) {
            linkStates.push(curStates[i]);
        }
    }
    adapter.log.debug(`Process ${JSON.stringify(linkStates)} for link ${link}`);
    _analyseDataForStates(linkStates, data, error, callback);
}

const flags = {
    global: 'g',
    ignoreCase: 'i',
    multiline: 'm',
    dotAll: 's',
    sticky: 'y',
    unicode: 'u',
};

function cloneRegex(regex) {
    const lFlags = Object.keys(flags).map(flag => regex[flag] ? flags[flag] : '').join('');
    return new RegExp(regex.source, lFlags);
}

function analyseData(obj, data, error, callback) {
    adapter.log.debug(`analyseData CHECK for ${obj._id}, old=${obj.value.val}`);
    states[obj._id].processed = true;
    let newVal;
    if (error) {
        if (obj.native.substituteOld) {
            adapter.log.info(`Cannot read link "${obj.native.link}": ${error}`);
            callback && callback();
        } else {
            adapter.log.warn(`Cannot read link "${obj.native.link}": ${error}`);
            if (obj.value.q !== 0x82 || adapter.config.updateNonChanged) {
                obj.value.q   = 0x82;
                obj.value.ack = true;
                if (obj.native.substitute !== undefined) {
                    obj.value.val = obj.native.substitute;
                }

                adapter.log.debug(`analyseData for ${obj._id}, old=${obj.value.val}, new=Error`);
                adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, () => callback && callback(true));
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
        let m;

        let regex = cloneRegex(obj.regex);

        data = (data || '').toString().replace(/\r\n|[\r\n]/g, ' ');

        do {
            m = regex.exec(data);
            item--;
        } while(item && m);

        if (m) {
            if (obj.common.type === 'boolean') {
                newVal = true;
            } else {
                newVal = m.length > 1 ? m[1] : m[0];

                if (newVal === undefined) {
                    adapter.log.info(`Regex didn't matched for ${obj._id}, old=${obj.value.val}`)
                    if (obj.native.substituteOld) {
                        return callback && callback();
                    }
                    if (obj.value.q !== 0x82) {
                        obj.value.q = 0x82;
                        obj.value.ack = true;
                        if (obj.native.substitute !== undefined) {
                            obj.value.val = obj.native.substitute;
                        } else {
                            obj.value.val = null; // undefined is now allowed
                        }
                    }
                } else if (obj.common.type === 'number') {
                    const comma = obj.native.comma;
                    if (!comma) newVal = newVal.replace(/,/g, '');
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
                    newVal = newVal === null ? '' : newVal.toString();
                    newVal = newVal.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
                }
            }

            if (obj.value.q || newVal !== obj.value.val || !obj.value.ack || adapter.config.updateNonChanged) {
                adapter.log.debug(`analyseData for ${obj._id}, old=${obj.value.val}, new=${newVal}`);
                obj.value.ack = true;
                obj.value.val = newVal;
                obj.value.q   = 0;
                adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, () => callback && callback(true));
            } else if (callback) {
                callback();
            }
        } else {
            if (obj.common.type === 'boolean') {
                newVal = false;
                adapter.log.debug(`Text not found for ${obj._id}`);
                if (obj.value.q || newVal !== obj.value.val || !obj.value.ack || adapter.config.updateNonChanged) {
                    adapter.log.debug(`analyseData for ${obj._id}, old=${obj.value.val},new=${newVal}`);
                    obj.value.ack = true;
                    obj.value.val = newVal;
                    obj.value.q   = 0;
                    adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, () => callback && callback(true));
                } else if (callback) {
                    callback();
                }
            } else  {
                adapter.log.debug(`Cannot find number in answer for ${obj._id}`);
                if (obj.native.substituteOld) {
                    callback && callback();
                } else {
                    if (obj.value.q !== 0x44 || !obj.value.ack || adapter.config.updateNonChanged) {
                        obj.value.q   = 0x44;
                        obj.value.ack = true;
                        if (obj.native.substitute !== undefined) {
                            obj.value.val = obj.native.substitute;
                        }
                        console.log(`Use substitution: "${obj.native.substitute}"`);

                        adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, () => callback && callback(true));
                    } else if (callback) {
                        callback();
                    }
                }
            }
        }
    } else {
        adapter.log.warn(`No regex object found for "${obj._id}"`);
        callback && callback();
    }
}

function isRemoteLink(link) {
    return (link || '').match(/^https?:\/\//);
}

async function readLink(link, callback) {
    if (isRemoteLink(link)) {
        axios = axios || require('axios');

        adapter.log.debug(`Request URL: ${link}`);
        try {
            const res = await axios({
                method: 'GET',
                url: link,
                httpsAgent: new https.Agent({
                    rejectUnauthorized: adapter.config.acceptInvalidCertificates === false
                }),
                insecureHTTPParser: !!adapter.config.useInsecureHTTPParser,
                timeout: adapter.config.requestTimeout,
                transformResponse: [], // do not have any JSON parsing or such
                responseType: 'text',
            });
            callback(res.status !== 200 ? res.statusText || JSON.stringify(res.status) : null, res.data, link)
            // (error, response, body) => callback(!body ? error || JSON.stringify(response) : null, body, link)
        } catch (err) {
            callback(err.data ? err.data : err.toString(), null, link);
        }
    } else {
        path = path || require('path');
        fs   = fs   || require('fs');
        link = (link || '').replace(/\\/g, '/');
        if (link[0] !== '/' && !link.match(/^[A-Za-z]:/)) {
            link = path.normalize(`${__dirname}/../../${link}`);
        }

        adapter.log.debug(`Read file: ${link}`);

        if (fs.existsSync(link)) {
            let data;
            try {
                data = fs.readFileSync(link).toString('utf8');
            } catch (e) {
                adapter.log.warn(`Cannot read file "${link}": ${e}`);
                callback(e, null, link);
                return;
            }
            callback(null, data, link);
        } else {
            callback('File does not exist', null, link);
        }
    }
}

// Keep a per-host queue for remote requests
const hostnamesQueue = [];
const hostnamesRequestTime = [];
function processRemoteQueue(hostname) {
    hostnamesRequestTime[hostname] = Date.now();
    readLink(hostnamesQueue[hostname][0].link, hostnamesQueue[hostname][0].callback);
}

function addToRemoteQueue(link, callback) {
    adapter.log.debug(`Queue ${link}`);
    const url = new URL(link);

    if (!(url.hostname in hostnamesQueue)) {
        // No queue object yet, make one
        adapter.log.debug(`Creating request queue for ${url.hostname}`);
        hostnamesQueue[url.hostname] = [];
    }
    const requestQueue = hostnamesQueue[url.hostname];
    requestQueue.push({link, callback});

    if (requestQueue.length === 1) {
        // First item in queue, process it. Otherwise, will get done when current request is removed.
        processRemoteQueue(url.hostname);
    }
}

function removeFromRemoteQueue(link) {
    adapter.log.debug(`Dequeue ${link}`);
    const url = new URL(link);
    const requestQueue = hostnamesQueue[url.hostname];

    // Remove first entry (should be the request that just finished)
    requestQueue.shift();

    // And process next request if there is one
    if (requestQueue.length > 0) {
        // Make sure correct delay has passed or wait until for that point
        const delay = Date.now() - hostnamesRequestTime[url.hostname];
        adapter.log.debug(`Next delay for ${url.hostname} is ${delay}`);
        if (delay < adapter.config.requestDelay) {
            adapter.setTimeout(processRemoteQueue, delay, url.hostname);
        } else {
            // Request already took longer than timeout so start instantly.
            // Issue a warning because this means delay is probably too short.
            adapter.log.warn(`No delay before next request to ${url.hostname}`);
            processRemoteQueue(url.hostname);
        }
    } else {
        adapter.log.debug(`Request queue for ${url.hostname} is now empty`);
    }
}

function poll(interval, callback) {
    let id;
    // first mark all entries as not processed and collect the states for current interval tht are not already planned for processing
    const curStates = [];
    const curLinks = [];
    for (id in states) {
        if (!states.hasOwnProperty(id)) {
            continue;
        }
        if (states[id].native.interval === interval && (states[id].processed || states[id].processed === undefined)) {
            states[id].processed = false;
            curStates.push(id);
            if (!curLinks.includes(states[id].native.link)) {
                curLinks.push(states[id].native.link);
            }
        }
    }
    adapter.log.debug(`States for current Interval (${interval}): ${JSON.stringify(curStates)}`);

    for (let j = 0; j < curLinks.length; j++) {
        const thisLink = curLinks[j];
        adapter.log.debug(`Do Link: ${thisLink}`);

        if (isRemoteLink(thisLink) && adapter.config.requestDelay) {
            // Queue handler...
            addToRemoteQueue(thisLink, (error, text, link) => {
                // Remove from queue before performing actual analyse callback
                removeFromRemoteQueue(link);
                analyseDataForStates(curStates, link, text, error, callback)
            });
        } else {
            // Just read it instantly
            readLink(thisLink, (error, text, link) => analyseDataForStates(curStates, link, text, error, callback));
        }
    }
}

const timers = {};

async function main() {
    adapter.config.pollInterval   = parseInt(adapter.config.pollInterval, 10)   || 5000;
    adapter.config.requestTimeout = parseInt(adapter.config.requestTimeout, 10) || 60000;
    adapter.config.requestDelay   = parseInt(adapter.config.requestDelay, 10)   || 0;

    // read current existing objects (прочитать текущие существующие объекты)
    try {
        states = await adapter.getForeignObjectsAsync(`${adapter.namespace}.*`, 'state');
    } catch (err) {
        adapter.log.error(`Cannot get objects: ${err.message}`);
        adapter.stop();
        return;
    }
    let values;
    try {
        values = await adapter.getForeignStatesAsync(`${adapter.namespace}.*`);
    } catch (err) {
        adapter.log.error(`Cannot get state values: ${err.message}`);
        adapter.stop();
        return;
    }
    // subscribe on changes
    await adapter.subscribeStatesAsync('*');
    await adapter.subscribeObjectsAsync('*');

    // Mark all sensors as if they received something
    for (const id in states) {
        if (!states.hasOwnProperty(id)) {
            continue;
        }

        states[id].value = values[id] || {val: null};
        initPoll(states[id], false);
    }

    // trigger all parsers first time
    for (const timer in timers) {
        if (timers.hasOwnProperty(timer)) {
            poll(timers[timer].interval);
        }
    }
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}

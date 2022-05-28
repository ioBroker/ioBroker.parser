/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapter  = new utils.Adapter('parser');
let request;
let path;
let fs;
let states;

// is called if a subscribed state changes
adapter.on('stateChange', (id, state) => {
    if (!state || state.ack) return;

    // Warning, state can be null if it was deleted
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // output to parser
    if (states[id] && states[id].common && states[id].common.write) {

    }
});

adapter.on('objectChange', (id, obj) => {
    if (!id) return;
    if (!obj) {
        if (states[id]) {
            adapter.log.info(`Parser object ${id} removed`);
            deletePoll(states[id]);
            delete states[id];
        }
    } else {
        if (!obj.native) {
            adapter.log.warn(`No configuration for ${obj._id}, ignoring it`);
            return;
        }

        if (!obj.native.interval) obj.native.interval = adapter.config.pollInterval;
        obj.native.interval = parseInt(obj.native.interval, 10);

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
            if (states[id].native.interval !== obj.native.interval) {
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

adapter.on('message', obj => {
    if (obj) {
        switch (obj.command) {
            case 'link':
                if (obj.callback) {
                    // read all found serial ports
                    readLink(obj.message, (err, text) =>
                        adapter.sendTo(obj.from, obj.command, {error: err, text: text}, obj.callback)
                    );
                }
                break;
        }
    }
});

function initPoll(obj, onlyUpdate) {
    if (!obj.native) {
        adapter.log.warn(`No configuration for ${obj._id}, ignoring it`);
        return;
    }

    if (!obj.native.interval) obj.native.interval = adapter.config.pollInterval;

    if (!obj.native.regex) obj.native.regex = '.+';

    if (obj.native.regex[0] === '/') {
        obj.native.regex = obj.native.regex.substring(1, obj.native.regex.length - 1);
    }
    obj.native.substituteOld = obj.native.substituteOld === 'true' || obj.native.substituteOld === true;

    if ((obj.native.substitute !== '' || obj.common.type === 'string') && obj.native.substitute !== undefined && obj.native.substitute !== null) {
        if (obj.native.substitute === 'null')  obj.native.substitute = null;

        if (obj.common.type === 'number') {
            obj.native.substitute = parseFloat(obj.native.substitute) || 0;
        } else if (obj.common.type === 'boolean') {
            if (obj.native.substitute === 'true')  obj.native.substitute = true;
            if (obj.native.substitute === 'false') obj.native.substitute = false;
            obj.native.substitute = !!obj.native.substitute;
        }
    } else {
        obj.native.substitute = undefined;
    }

    obj.native.offset = parseFloat(obj.native.offset) || 0;
    obj.native.factor = parseFloat(obj.native.factor) || 1;
    obj.native.item   = parseFloat(obj.native.item)   || 0;
    obj.regex = new RegExp(obj.native.regex, obj.native.item ? 'g' : '');

    if (!obj.native.link.match(/^https?:\/\//)) {
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
    timers[obj.native.interval].count--;
    if (!timers[obj.native.interval].count) {
        clearInterval(timers[obj.native.interval]);
        delete timers[obj.native.interval];
    }
}
adapter.on('ready', main);

function _analyseDataForStates(linkStates, data, error, callback) {
    if (!linkStates || !linkStates.length) {
        if (callback) callback();
    } else {
        const id = linkStates.shift();
        if (!states[id]) {
            adapter.log.error('Invalid state ID: ' + id);
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
    adapter.log.debug('Process ' + JSON.stringify(linkStates) + ' for link ' + link);
    _analyseDataForStates(linkStates, data, error, callback);
}

const flags = {
    global: 'g',
    ignoreCase: 'i',
    multiline: 'm',
    dotAll: 's',
    sticky: 'y',
    unicode: 'u'
};

function cloneRegex(regex) {
    const lFlags = Object.keys(flags).map(flag => regex[flag] ? flags[flag] : '').join('');
    return new RegExp(regex.source, lFlags);
}

function analyseData(obj, data, error, callback) {
    adapter.log.debug('analyseData CHECK for ' + obj._id + ', old=' + obj.value.val);
    states[obj._id].processed = true;
    let newVal;
    if (error) {
        if (obj.native.substituteOld) {
            adapter.log.warn('Cannot read link "' + obj.native.link + '": ' + error);
            if (callback) {
                callback();
            }
        } else {
            adapter.log.error('Cannot read link "' + obj.native.link + '": ' + error);
            if (obj.value.q !== 0x82) {
                obj.value.q   = 0x82;
                obj.value.ack = true;
                if (obj.native.substitute !== undefined) {
                    obj.value.val = obj.native.substitute;
                }

                adapter.log.debug(`analyseData for ${obj._id}, old=${obj.value.val}, new=Error`);
                adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, callback);
            } else if (callback) {
                callback();
            }
        }
    } else if (obj.regex) {
        let item = obj.native.item + 1;
        if (item < 0) item = 1;
        if (item > 1000) item = 1000;
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
            } else  {
                newVal = m.length > 1 ? m[1] : m[0];

                if (newVal === undefined) {
                    adapter.log.info(`Regex didn't matched for ${obj._id}, old=${obj.value.val}`)
                    if (obj.native.substituteOld) {
                        return callback && callback ();
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
                }
            }

            if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                adapter.log.debug('analyseData for ' + obj._id + ', old=' + obj.value.val + ', new=' + newVal);
                obj.value.ack = true;
                obj.value.val = newVal;
                obj.value.q   = 0;
                adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, callback);
            } else if (callback) {
                callback();
            }
        } else {
            if (obj.common.type === 'boolean') {
                newVal = false;
                adapter.log.debug('Text not found for ' + obj._id);
                if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                    adapter.log.debug('analyseData for ' + obj._id + ', old=' + obj.value.val + ',new=' + newVal);
                    obj.value.ack = true;
                    obj.value.val = newVal;
                    obj.value.q   = 0;
                    adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, callback);
                } else if (callback) {
                    callback();
                }
            } else  {
                adapter.log.debug('Cannot find number in answer for ' + obj._id);
                if (obj.native.substituteOld) {
                    callback && callback();
                } else {
                    if (obj.value.q !== 0x44 || !obj.value.ack) {
                        obj.value.q   = 0x44;
                        obj.value.ack = true;
                        if (obj.native.substitute !== undefined) obj.value.val = obj.native.substitute;
                        console.log('USe subs: "' + obj.native.substitute + '"');

                        adapter.setForeignState(obj._id, {val: obj.value.val, q: obj.value.q, ack: obj.value.ack}, callback);
                    } else if (callback) {
                        callback();
                    }
                }
            }
        }
    } else {
        adapter.log.warn('No regex object found for "' + obj._id + '"');
        if (callback) {
            callback();
        }
    }
}


function readLink(link, callback) {
    if (link.match(/^https?:\/\//)) {
        request = request || require('request');

        adapter.log.debug('Request URL: ' + link);
        request({
            method: 'GET',
            url: link,
            rejectUnauthorized: false,
            timeout: 60000
        }, (error, response, body) => callback(!body ? error || JSON.stringify(response) : null, body, link));
    } else {
        path = path || require('path');
        fs   = fs   || require('fs');
        link = link.replace(/\\/g, '/');
        if (link[0] !== '/' && !link.match(/^[A-Za-z]:/)) {
            link = path.normalize(__dirname + '/../../' + link);
        }
        adapter.log.debug('Read file: ' + link);
        if (fs.existsSync(link)) {
            let data;
            try {
                data = fs.readFileSync(link).toString('utf8');
            } catch (e) {
                adapter.log.error('Cannot read file "' + link + '": ' + e);
                callback(e, null, link);
                return;
            }
            callback(null, data, link);
        } else {
            callback('File does not exist', null, link);
        }
    }
}

function poll(interval, callback) {
    let id;
    // first mark all entries as not processed and collect the states for current interval tht are not already planned for processing
    const curStates = [];
    const curLinks = [];
    for (id in states) {
        if (!states.hasOwnProperty(id)) continue;
        if (states[id].native.interval === interval && (states[id].processed || states[id].processed === undefined)) {
            states[id].processed = false;
            curStates.push(id);
            if (curLinks.indexOf(states[id].native.link) === -1) {
                curLinks.push(states[id].native.link);
            }
        }
    }
    adapter.log.debug('States for current Interval (' + interval + '): ' + JSON.stringify(curStates));

    for (let j = 0; j < curLinks.length; j++) {
        adapter.log.debug('Do Link: ' + curLinks[j]);
        readLink(curLinks[j], (error, text, link) => analyseDataForStates(curStates, link, text, error, callback));
    }
}

const timers = {};

function main() {
    adapter.config.pollInterval = parseInt(adapter.config.pollInterval, 10) || 5000;

    // read current existing objects (прочитать текущие существующие объекты)
    adapter.getForeignObjects(adapter.namespace + '.*', 'state', (err, _states) => {
        states = _states;
        adapter.getForeignStates(adapter.namespace + '.*', (err, values) => {
            // subscribe on changes
            adapter.subscribeStates('*');
            adapter.subscribeObjects('*');

            // Mark all sensors as if they received something
            for (const id in states) {
                if (!states.hasOwnProperty(id)) continue;

                states[id].value = values[id] || {val: null};
                initPoll(states[id], false);
            }

            // trigger all parsers first time
            for (const timer in timers) {
                if (timers.hasOwnProperty(timer)) {
                    poll(timers[timer].interval);
                }
            }
        });
    });
}

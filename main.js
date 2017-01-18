/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
var utils        = require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter      = new utils.Adapter('parser');
var request;
var path;
var fs;
var states;

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    if (!state || state.ack || !comm) return;

    // Warning, state can be null if it was deleted
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // output to parser
    if (states[id] && states[id].common.write) {

    }
});

adapter.on('objectChange', function (id, obj) {
    if (!id) return;
    if (!obj) {
        if (states[id]) {
            deletePoll(states[id]);
            delete states[id];
        }
    } else {
        if (!obj.native.interval) obj.native.interval = adapter.config.pollInterval;
        obj.native.interval = parseInt(obj.native.interval, 10);

        if (!states[id]) {
            states[id] = obj;
            initPoll(states[id]);
        } else {
            if (states[id].native.interval !== obj.native.interval) {
                deletePoll(states[id]);
                states[id] = obj;
                initPoll(states[id]);
            } else {
                states[id] = obj;
            }
        }
    }
});

function initPoll(obj) {
    if (!obj.native.interval) obj.native.interval = adapter.config.pollInterval;

    if (!obj.native.regex) obj.native.regex = '.+';

    if (obj.native.regex[0] === '/') {
        obj.native.regex = obj.native.regex.substring(1, obj.native.regex.length - 1);
    }

    if (obj.native.substitute !== '' && obj.native.substitute !== undefined && obj.native.substitute !== null) {
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

    obj.regex = new RegExp(obj.native.regex);
    obj.native.offset = parseFloat(obj.native.offset) || 0;
    obj.native.factor = parseFloat(obj.native.factor) || 1;

    if (!timers[obj.native.interval]) {
        timers[obj.native.interval] = {
            interval: obj.native.interval,
            count:    1,
            timer:    setInterval(poll, obj.native.interval, obj.native.interval)
        };
    } else {
        timers[obj.native.interval].count++;
    }
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
        var id = linkStates.shift();
        analyseData(states[id], data, error, function () {
            setTimeout(_analyseDataForStates, 0, linkStates, data, error, callback);
        });
    }
}

function analyseDataForStates(curStates, link, data, error, callback) {
    if (typeof error === 'function') {
        callback = error;
        error = null;
    }

    var linkStates = [];
    for (var i = 0; i < curStates.length; i++) {
        if (states[curStates[i]].native.link === link) {
            linkStates.push(curStates[i]);
        }
    }
    _analyseDataForStates(linkStates, data, error, callback);
}

function analyseData(obj, data, error, callback) {
    if (error) {
        adapter.log.error('Cannot read link "' + obj.native.link + '": ' + error);
        if (obj.value.q !== 0x82) {
            obj.value.q   = 0x82;
            obj.value.ack = true;
            if (obj.native.substitute !== undefined) obj.value.val = obj.native.substitute;

            adapter.setForeignState(obj._id, obj.value, callback);
        } else if (callback) {
            callback();
        }
    } else {
        var m = obj.regex.exec(data);
        if (m) {
            var newVal;

            if (obj.common.type === 'boolean') {
                newVal = true;
            } else  {
                newVal = m.length > 1 ? m[1] : m[0];
                if (obj.common.type === 'number') {
                    newVal = parseFloat(newVal);
                    newVal *= obj.native.factor;
                    newVal += obj.native.offset;
                }
            }

            if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                obj.value.ack = true;
                obj.value.val = newVal;
                obj.value.q   = 0;
                adapter.setForeignState(obj._id, obj.value, callback);
            } else if (callback) {
                callback();
            }
        } else {
            if (obj.common.type === 'boolean') {
                newVal = false;
                adapter.log.debug('Text not found for ' + obj._id);
                if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                    obj.value.ack = true;
                    obj.value.val = newVal;
                    obj.value.q   = 0;
                    adapter.setForeignState(obj._id, obj.value, callback);
                } else if (callback) {
                    callback();
                }
            } else  {
                adapter.log.debug('Cannot find number in answer for ' + obj._id);
                if (obj.value.q !== 0x44 || !obj.value.ack) {
                    obj.value.q   = 0x44;
                    obj.value.ack = true;
                    if (obj.native.substitute !== undefined) obj.value.val = obj.native.substitute;

                    adapter.setForeignState(obj._id, obj.value, callback);
                } else if (callback) {
                    callback();
                }
            }
        }
    }
}

function poll(interval, callback) {
    var id;
    // first mark all entries as not processed
    var curStates = [];
    for (id in states) {
        if (!states.hasOwnProperty(id)) continue;
        if (states[id].native.interval === interval) {
            states[id].processed = false;
            curStates.push(id);
        }
    }

    for (var i = 0; i < curStates.length; i++) {
        id = curStates[i];
        if (!states.hasOwnProperty(id)) continue;
        if (states[id].native.interval === interval && !states[id].processed) {
            if (states[id].native.link.match(/^https?:\/\//)) {
                request = request || require('request');

                (function(link) {
                    adapter.log.debug('Request URL: ' + link);
                    request(link, function (error, response, body) {
                        if (!body) {
                            analyseDataForStates(curStates, link, null, error || JSON.stringify(response), callback);
                        } else {
                            analyseDataForStates(curStates, link, body, callback);
                        }
                    });
                })(states[id].native.link);

            } else {
                path = path || require('path');
                fs   = fs   || require('fs');
                states[id].native.link = states[id].native.link.replace(/\\/g, '/');
                if (states[id].native.link[0] !== '/' && !states[id].native.link.match(/^[A-Za-z]:/)) {
                    states[id].native.link = path.normalize(__dirname + '/../../' + states[id].native.link);
                }
                adapter.log.debug('Read file: ' + states[id].native.link);
                if (fs.existsSync(states[id].native.link)) {
                    var data;
                    try {
                        data = fs.readFileSync(states[id].native.link);
                    } catch (e) {
                        adapter.log.error('Cannot read file "' + states[id].native.link + '": ' + e);
                        analyseDataForStates(curStates, states[id].native.link, null, e, callback);
                        return;
                    }
                    analyseDataForStates(curStates, states[id].native.link, data, callback);
                } else {
                    analyseDataForStates(curStates, states[id].native.link, null, 'File does not exist', callback);
                }
            }
        }
    }
}

var timers = {};

function main() {
    adapter.config.pollInterval = parseInt(adapter.config.pollInterval, 10) || 5000;

    // read current existing objects (прочитать текущие существующие объекты)
    adapter.getForeignObjects(adapter.namespace + '.*', 'state', function (err, _states) {
        states = _states;
        adapter.getForeignStates(adapter.namespace + '.*', function (err, values) {
            // subscribe on changes
            adapter.subscribeStates('*');
            adapter.subscribeObjects('*');

            // Mark all sensors as if they received something
            for (var id in states) {
                if (!states.hasOwnProperty(id)) continue;
                states[id].value = values[id] || {val: null};
                initPoll(states[id]);
            }

            // trigger all parsers first time
            for (var timer in timers) {
                if (timers.hasOwnProperty(timer)) {
                    poll(timers[timer].interval);
                }
            }
        });
    });
}
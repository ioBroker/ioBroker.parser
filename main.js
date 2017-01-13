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
    
    obj.regex = new RegExp(obj.native.regex);
    
    if (!timers[obj.native.interval]) {
        timers[obj.native.interval] = {
            count: 1,
            timer: setInterval(poll, obj.native.interval, obj.native.interval)
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


function analyseData(obj, data, error) {
    if (error) {
        adapter.log.error('Cannot read link "' + obj.native.link + '": ' + error);
        if (obj.value.q !== 0x82) {
            obj.value.q = 0x82;
            obj.value.ack = true;
            adapter.setForeignState(obj._id, obj.value);
        }
    } else {
        var m = states[id].regex.exec(data);
        if (m) {
            var newVal;

            if (obj.common.type === 'boolean') {
                newVal = true;
            } else  {
                newVal = m.length > 1 ? m[1] : m[0];
                if (obj.common.type === 'number') newVal = parseFloat(newVal);
            }

            if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                obj.value.ack = true;
                obj.value.val = newVal;
                obj.value.q   = 0;
                adapter.setForeignState(obj._id, obj.value);
            }
        } else {
            if (obj.common.type === 'boolean') {
                newVal = false;
                if (obj.value.q || newVal !== obj.value.val || !obj.value.ack) {
                    obj.value.ack = true;
                    obj.value.val = newVal;
                    obj.value.q   = 0;
                    adapter.setForeignState(obj._id, obj.value);
                }
            } else  {
                if (!obj.value.q || !obj.value.ack) {
                    obj.value.q   = 0x44;
                    obj.value.ack = true;
                    adapter.setForeignState(obj._id, obj.value);
                }
            }
        }
    }
}

function poll(interval) {
    for (var id in states) {
        if (!states.hasOwnProperty(id)) continue;
        if (states[id].native.interval === interval) {
            if (states[id].native.link.match(/^https?:\/\//)) {
                request = request || require('request');
                request(states[id].native.link, function (error, response, body) {
                    if (!body) {
                        analyseData(states[id], null, error || JSON.stringify(response));
                    } else {
                        analyseData(states[id], body);
                    }
                });
            } else {
                path = path || require('path');
                fs   = fs   || require('fs');
                states[id].native.link = states[id].native.link.replace(/\\/g, '/');
                if (states[id].native.link[0] !== '/' && !states[id].native.link.match(/^[A-Za-z]:/)) {
                    states[id].native.link = path.normalize(__dirname + '/../../' + states[id].native.link);
                }
                if (fs.existsSync(states[id].native.link)) {
                    var data;
                    try {
                        data = fs.readFileSync(states[id].native.link);
                    } catch (e) {
                        adapter.log.error('Cannot read file "' + states[id].native.link + '": ' + e);
                        analyseData(states[id], null, e);
                        return;
                    }
                    analyseData(states[id], data);                     
                } else {
                    analyseData(states[id], null, 'File does not exist');
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
        });
    });
}
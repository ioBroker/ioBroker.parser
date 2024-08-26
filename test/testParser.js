/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jshint expr: true*/
const expect = require('chai').expect;
const setup = require('@iobroker/legacy-testing');

let objects = null;
let states  = null;
let onObjectChanged = null;
let received = 0;
let receivedAll = 0;

const adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.')+1);

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log(`Try check #${counter}`);
    if (counter > 30) {
        if (cb) {
            cb('Cannot check connection');
        }
        return;
    }

    states.getState(`system.adapter.${adapterShortName}.0.alive`, (err, state) => {
        if (err) {
            console.error(err);
        }
        if (state && state.val) {
            if (cb) {
                cb();
            }
        } else {
            setTimeout(() => checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        if (cb) {
            cb(`Cannot check value Of State ${id}`);
        }
        return;
    }

    states.getState(id, (err, state) => {
        if (err) {
            console.error(err);
        }

        if (value === null && !state) {
            if (cb) {
                cb();
            }
        } else
        if (state && (value === undefined || state.val === value)) {
            if (cb) {
                cb();
            }
        } else {
            setTimeout(() =>
                checkValueOfState(id, value, cb, counter + 1), 500);
        }
    });
}

const vars = [
    {
        _id: "parser.0.forumRunning",
        "common": {
            "name": "forumRunning",
            "write": false,
            "read": true,
            "type": "boolean",
            "role": "indicator",
            "unit": ""
        },
        "native": {
            "link": "http://forum.iobroker.net/",
            "regex": "Forum",
            "interval": "20000",
            "substitute": "false",
            "expect": true
        },
        "type": "state"
    },
    {
        "_id": "parser.0.temperatureMunich",
        "common": {
            "name": "temperatureMunich",
            "write": false,
            "role": "value.temperature",
            "read": true,
            "unit": "°C",
            "type": "number"
        },
        "native": {
            "link": "https://darksky.net/forecast/48.1371,11.5754/si24/de",
            "regex": "<span class=\"temp\">(-?\\d+)˚<",
            "interval": "30000",
            "substitute": "0"
        },
        "type": "state"
    },
    {
        "_id": "parser.0.temperatureMunich2",
        "common": {
            "name": "temperatureMunich2",
            "write": false,
            "role": "value.temperature",
            "read": true,
            "unit": "°C",
            "type": "number"
        },
        "native": {
            "link": "https://darksky.net/forecast/48.1371,11.5754/si24/de",
            "regex": "<span class=\"temp\">(-?\\d+)˚<",
            "interval": "30000",
            "substitute": "0"
        },
        "type": "state"
    },
    {
        "_id": "parser.0.temperatureMunich3",
        "common": {
            "name": "temperatureMunich3",
            "write": false,
            "role": "value.temperature",
            "read": true,
            "unit": "°C",
            "type": "number"
        },
        "native": {
            "link": "https://darksky.net/forecast/48.1371,11.5754/si24/de",
            "regex": "<span class=\"temp\">(-?\\d+)˚<",
            "interval": "30000",
            "substitute": "0"
        },
        "type": "state"
    },
    {
        "_id": "parser.0.temperatureMunichWrong",
        "common": {
            "name": "temperatureMunich",
            "write": false,
            "role": "value.temperature",
            "read": true,
            "unit": "°C",
            "type": "number"
        },
        "native": {
            "link": "https://darksky.net/forecast/48.1371,11.5754/si24/deasdasdasdasdas",
            "regex": "<span clas=\"temp\">(-?\\d+)˚<",
            "interval": "30000",
            "substitute": "0",
            "expect": 0,
            "expectQ": 0x44
        },
        "type": "state"
    },
    {
        "_id": "parser.0.fileTest",
        "common": {
            "name": "file test",
            "write": false,
            "read": true,
            type: 'boolean',
            role: 'indicator'
        },
        "native": {
            "link": __dirname + '/testParser.js',
            "regex": "testParser",
            "interval": "15000",
            "substitute": "false",
            "expect": true
        },
        "type": "state"
    },
    {
        "_id": "parser.0.fileNegativeTest",
        "common": {
            "name": "file test",
            "write": false,
            "read": true,
            type: 'boolean',
            role: 'indicator'
        },
        "native": {
            "link": __dirname + '/testParser.js',
            "regex": "testParser" + "1",
            "interval": "30000",
            "substitute": "false",
            "expect": false
        },
        "type": "state"
    }
];

let onStateChanged = (id, state) => {
    let rec = 0;
    for (let i = 0; i < vars.length; i++) {
        if (vars[i]._id === id) {
            vars[i].received = true;
        }
        if (vars[i].received) {
            rec++;
        }
    }
    received = rec;
    receivedAll++;
};

function createStates(_objects, _vars, index, callback) {
    if (!_vars || index >= _vars.length) {
        if (callback) callback();
        return;
    }

    console.log(`createStates ${_vars[index]._id}`);
    _objects.setObject(_vars[index]._id, _vars[index], function (err) {
        expect(err).to.be.not.ok;
        setTimeout(createStates, 0, _objects, _vars, index + 1, callback);
    });
}

function checkStates(_states, _vars, index, result, callback) {
    result = result || [];

    if (!_vars || index >= _vars.length) {
        if (callback) callback(result);
        return;
    }

    console.log(`getState - ${_vars[index]._id}`);
    _states.getState(_vars[index]._id, function (err, state) {
        result[index] = state;
        setTimeout(checkStates, 0, _states, _vars, index + 1, result, callback);
    });
}

function finalCheck(__states, _vars, done) {
    checkStates(__states, _vars, 0, [], function (_states) {
        for (let i = 0; i < _states.length; i++) {
            console.log(`Check ${vars[i]._id}: ${JSON.stringify(_states[i])}`);
            expect(_states[i]).to.be.ok;
            expect(_states[i].from).to.be.equal('system.adapter.parser.0');
            expect(_states[i].val).to.be.not.null;

            if (vars[i].native.expect !== undefined) {
                expect(_states[i].val).to.be.equal(vars[i].native.expect);
            }
            if (vars[i].native.expectQ !== undefined) {
                expect(_states[i].q).to.be.equal(vars[i].native.expectQ);
            }
        }
        done();
    });
}

describe(`Test ${adapterShortName} adapter`, function() {
    before(`Test ${adapterShortName} adapter: Start js-controller`, function (_done) {
        this.timeout(600000); // because of the first installation from npm

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = 'debug';

            config.native.pollInterval = '15000';

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(
                false,
                (id, obj) => {
                    if (onObjectChanged) {
                        onObjectChanged(id, obj);
                    }
                },
                (id, state) => {
                    if (onStateChanged) {
                        onStateChanged(id, state);
                    }
                },
                (_objects, _states) => {
                    objects = _objects;
                    states  = _states;
                    states.subscribe('*');

                    console.log('Create states');
                    createStates(objects, vars, 0, () => {
                        console.log('Start adapter');
                        setup.startAdapter(objects, states, () => {
                            console.log('Start tests');
                            _done();
                        });
                    });
                });
        });
    });

    it(`Test ${adapterShortName} adapter: Check if adapter started`, function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(function (res) {
            if (res) console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('system.adapter.test.0', {
                    common: {

                    },
                    type: 'instance'
                },
                function () {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                });
        });
    });

    it(`Test ${adapterShortName} adapter: values must be there`, function (done) {
        this.timeout(5000);
        setTimeout(function () {
            console.log(`received 1 - ${received}`);
            //[{
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154545,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154483
            //}, {
            //    "val": -8,
            //    "ack": true,
            //    "ts": 1484732154815,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154774
            //}, {
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154160,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154152
            //}, {
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154163,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154154
            //}]

            if (received < vars.length) {
                setTimeout(function () {
                    console.log(`received 2 - ${received}`);
                    expect(receivedAll).to.be.at.least(vars.length);
                    finalCheck(states, vars, done);
                }, 2000);
            } else {
                expect(receivedAll).to.be.at.least(vars.length);
                finalCheck(states, vars, done);
            }
        }, 2000);
    });

    it(`Test ${adapterShortName} adapter: values must be there after interval `, function (done) {
        this.timeout(35000);
        receivedAll = 0;
        setTimeout(function () {
            expect(receivedAll).to.be.at.least(vars.length + 2);
            console.log(`received 1 - ${received}`);
            //[{
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154545,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154483
            //}, {
            //    "val": -8,
            //    "ack": true,
            //    "ts": 1484732154815,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154774
            //}, {
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154160,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154152
            //}, {
            //    "val": true,
            //    "ack": true,
            //    "ts": 1484732154163,
            //    "q": 0,
            //    "from": "system.adapter.parser.0",
            //    "lc": 1484732154154
            //}]

            if (received < vars.length) {
                setTimeout(function () {
                    console.log('received 2 - ' + received);
                    finalCheck(states, vars, done);
                }, 2000);
            } else {
                finalCheck(states, vars, done);
            }
        }, 32000);
    });

    after(`Test ${adapterShortName} adapter: Stop js-controller`, function (done) {
        this.timeout(10000);

        setup.stopController(normalTerminated => {
            console.log(`Adapter normal terminated: ${normalTerminated}`);
            done();
        });
    });
});

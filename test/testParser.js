/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
/* jshint expr: true*/
const assert = require('node:assert');
const setup = require('@iobroker/legacy-testing');

let objects = null;
let states = null;
let received = 0;
let receivedAll = 0;

const adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.') + 1);

function checkConnectionOfAdapter(cb, counter) {
    counter ||= 0;
    console.log(`Try check #${counter}`);
    if (counter > 30) {
        cb?.('Cannot check connection');
        return;
    }

    states.getState(`system.adapter.${adapterShortName}.0.alive`, (err, state) => {
        if (err) {
            console.error(err);
        }
        if (state?.val) {
            cb?.();
        } else {
            setTimeout(() => checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

const vars = [
    {
        _id: 'parser.0.forumRunning',
        common: {
            name: 'forumRunning',
            write: false,
            read: true,
            type: 'boolean',
            role: 'indicator',
            unit: '',
        },
        native: {
            link: 'http://forum.iobroker.net/',
            regex: 'Forum',
            interval: '20000',
            substitute: 'false',
            expect: true,
        },
        type: 'state',
    },
    {
        _id: 'parser.0.onlineCount',
        common: {
            name: 'onlineCount',
            write: false,
            role: 'value',
            read: true,
            unit: '',
            type: 'number',
        },
        native: {
            link: 'http://forum.iobroker.net/',
            regex: '(\\d+)',
            interval: '30000',
            substitute: '0',
        },
        type: 'state',
    },
    {
        _id: 'parser.0.onlineCount2',
        common: {
            name: 'onlineCount2',
            write: false,
            role: 'value',
            read: true,
            unit: '',
            type: 'number',
        },
        native: {
            link: 'http://forum.iobroker.net/',
            regex: '(\\d+)',
            interval: '30000',
            substitute: '0',
        },
        type: 'state',
    },
    {
        _id: 'parser.0.onlineCount3',
        common: {
            name: 'onlineCount3',
            write: false,
            role: 'value',
            read: true,
            unit: '',
            type: 'number',
        },
        native: {
            link: 'http://forum.iobroker.net/',
            regex: '(\\d+)',
            interval: '30000',
            substitute: '0',
        },
        type: 'state',
    },
    {
        _id: 'parser.0.onlineCountWrong',
        common: {
            name: 'onlineCountWrong',
            write: false,
            role: 'value',
            read: true,
            unit: '',
            type: 'number',
        },
        native: {
            link: 'http://forum.iobroker.net/',
            regex: '<span clas="nonexistent_class_xyz">(-?\\d+)<',
            interval: '30000',
            substitute: '0',
            expect: 0,
            expectQ: 0x44,
        },
        type: 'state',
    },
    {
        _id: 'parser.0.fileTest',
        common: {
            name: 'file test',
            write: false,
            read: true,
            type: 'boolean',
            role: 'indicator',
        },
        native: {
            link: __dirname + '/testParser.js',
            regex: 'testParser',
            interval: '15000',
            substitute: 'false',
            expect: true,
        },
        type: 'state',
    },
    {
        _id: 'parser.0.fileNegativeTest',
        common: {
            name: 'file test',
            write: false,
            read: true,
            type: 'boolean',
            role: 'indicator',
        },
        native: {
            link: __dirname + '/testParser.js',
            regex: 'testParser' + '1',
            interval: '30000',
            substitute: 'false',
            expect: false,
        },
        type: 'state',
    },
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
        callback?.();
        return;
    }

    console.log(`createStates ${_vars[index]._id}`);
    _objects.setObject(_vars[index]._id, _vars[index], err => {
        assert.ok(!err, err);
        setTimeout(createStates, 0, _objects, _vars, index + 1, callback);
    });
}

function checkStates(_states, _vars, index, result, callback) {
    result ||= [];

    if (!_vars || index >= _vars.length) {
        callback?.(result);
        return;
    }

    console.log(`getState - ${_vars[index]._id}`);
    _states.getState(_vars[index]._id, function (err, state) {
        result[index] = state;
        setTimeout(checkStates, 0, _states, _vars, index + 1, result, callback);
    });
}

function finalCheck(__states, _vars, done) {
    checkStates(__states, _vars, 0, [], _states => {
        for (let i = 0; i < _states.length; i++) {
            console.log(`Check ${vars[i]._id}: ${JSON.stringify(_states[i])}`);
            assert.ok(_states[i]);
            assert.strictEqual(_states[i].from, 'system.adapter.parser.0');
            assert.notStrictEqual(_states[i].val, null);

            if (vars[i].native.expect !== undefined) {
                assert.strictEqual(_states[i].val, vars[i].native.expect);
            }
            if (vars[i].native.expectQ !== undefined) {
                assert.strictEqual(_states[i].q, vars[i].native.expectQ);
            }
        }
        done();
    });
}

describe(`Test ${adapterShortName} adapter`, function () {
    before(`Test ${adapterShortName} adapter: Start js-controller`, function (_done) {
        this.timeout(600000); // because of the first installation from npm

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled = true;
            config.common.loglevel = 'debug';

            config.native.pollInterval = '15000';

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(
                false,
                (_id, _obj) => {},
                (id, state) => onStateChanged?.(id, state),
                (_objects, _states) => {
                    objects = _objects;
                    states = _states;
                    states.subscribe('*');

                    console.log('Create states');
                    createStates(objects, vars, 0, () => {
                        console.log('Start adapter');
                        setup.startAdapter(objects, states, () => {
                            console.log('Start tests');
                            _done();
                        });
                    });
                },
            );
        });
    });

    it(`Test ${adapterShortName} adapter: Check if adapter started`, function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(res => {
            if (res) console.log(res);
            assert.notStrictEqual(res, 'Cannot check connection');
            objects.setObject(
                'system.adapter.test.0',
                {
                    common: {},
                    type: 'instance',
                },
                function () {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                },
            );
        });
    });

    it(`Test ${adapterShortName} adapter: values must be there`, function (done) {
        this.timeout(5000);
        setTimeout(() => {
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
                setTimeout(() => {
                    console.log(`received 2 - ${received}`);
                    assert.ok(receivedAll >= vars.length);
                    finalCheck(states, vars, done);
                }, 2000);
            } else {
                assert.ok(receivedAll >= vars.length);
                finalCheck(states, vars, done);
            }
        }, 2000);
    });

    it(`Test ${adapterShortName} adapter: values must be there after interval `, function (done) {
        this.timeout(35000);
        receivedAll = 0;
        setTimeout(() => {
            assert.ok(receivedAll >= vars.length + 2);
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
                setTimeout(() => {
                    console.log(`received 2 - ${received}`);
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

var Mixpanel = require('../lib/mixpanel-node'),
    Sinon    = require('sinon'),
    http     = require('http'),
    events   = require('events');

exports.import = {
    setUp: function(next) {
        this.mixpanel = Mixpanel.init('token', { key: 'key' });
        this.clock = Sinon.useFakeTimers();

        Sinon.stub(this.mixpanel, 'send_request');

        next();
    },

    tearDown: function(next) {
        this.mixpanel.send_request.restore();
        this.clock.restore();

        next();
    },

    "calls send_request with correct endpoint and data": function(test) {
        var event = "test",
            time = 500,
            props = { key1: 'val1' },
            expected_endpoint = "/track",
            expected_data = {
                event: 'test',
                properties: {
                    key1: 'val1',
                    token: 'token',
                    time: 500
                }
            };

        this.mixpanel.import(event, time, props);

        test.ok(
            this.mixpanel.send_request.calledWithMatch(expected_endpoint, expected_data),
            "import didn't call send_request with correct arguments"
        );

        test.done();
    },

    "supports a Date instance": function(test) {
        var event = "test",
            time = new Date,
            props = { key1: 'val1' },
            expected_endpoint = "/track",
            expected_data = {
                event: 'test',
                properties: {
                    key1: 'val1',
                    token: 'token',
                    time: 0
                }
            };

        this.mixpanel.import(event, time, props);

        test.ok(
            this.mixpanel.send_request.calledWithMatch(expected_endpoint, expected_data),
            "import didn't call send_request with correct arguments"
        );

        test.done();
    },

    "requires the time argument": function(test) {
        test.throws(
            function() { this.mixpanel.import('test'); },
            "Import methods require you to specify the time of the event",
            "import didn't throw an error when time wasn't specified"
        );

        test.done();
    }
};

exports.import_batch = {
    setUp: function(next) {
        this.mixpanel = Mixpanel.init('token', { key: 'key' });
        this.clock = Sinon.useFakeTimers();

        Sinon.stub(this.mixpanel, 'send_request');

        next();
    },

    tearDown: function(next) {
        this.mixpanel.send_request.restore();
        this.clock.restore();

        next();
    },

    "calls send_request with correct endpoint and data": function(test) {
        var expected_endpoint = "/import",
            event_list = [
                {event: 'test',  properties: {key1: 'val1', time: 500 }},
                {event: 'test',  properties: {key2: 'val2', time: 1000}},
                {event: 'test2', properties: {key2: 'val2', time: 1500}}
            ],
            expected_data = [
                {event: 'test',  properties: {key1: 'val1', time: 500,  token: 'token'}},
                {event: 'test',  properties: {key2: 'val2', time: 1000, token: 'token'}},
                {event: 'test2', properties: {key2: 'val2', time: 1500, token: 'token'}}
            ];

        this.mixpanel.import_batch(event_list);

        test.ok(
            this.mixpanel.send_request.calledWithMatch(expected_endpoint, expected_data),
            "import_batch didn't call send_request with correct arguments"
        );

        test.done();
    },

    "requires the time argument for every event": function(test) {
        var event_list = [
                {event: 'test',  properties: {key1: 'val1', time: 500 }},
                {event: 'test',  properties: {key2: 'val2', time: 1000}},
                {event: 'test2', properties: {key2: 'val2'            }}
            ];
        test.throws(
            function() { this.mixpanel.import_batch(event_list); },
            "Import methods require you to specify the time of the event",
            "import didn't throw an error when time wasn't specified"
        );

        test.done();
    },

    "batches 50 events at a time": function(test) {
        var event_list = [];
        for (var ei = 0; ei < 130; ei++) { // 3 batches: 50 + 50 + 30
            event_list.push({event: 'test',  properties: {key1: 'val1', time: 500 + ei }});
        }

        this.mixpanel.import_batch(event_list);

        test.equals(
            3, this.mixpanel.send_request.callCount,
            "import_batch didn't call send_request correct number of times"
        );

        test.done();
    }
};

exports.import_batch_integration = {
    setUp: function(next) {
        this.mixpanel = Mixpanel.init('token', { key: 'key' });
        this.clock = Sinon.useFakeTimers();

        Sinon.stub(http, 'get');

        this.http_emitter = new events.EventEmitter();

        // stub sequence of http responses
        this.res = [];
        for (var ri = 0; ri < 5; ri++) {
            this.res.push(new events.EventEmitter());
            http.get
                .onCall(ri)
                .callsArgWith(1, this.res[ri])
                .returns(this.http_emitter);
        }

        this.event_list = [];
        for (var ei = 0; ei < 130; ei++) { // 3 batches: 50 + 50 + 30
            this.event_list.push({event: 'test',  properties: {key1: 'val1', time: 500 + ei }});
        }

        next();
    },

    tearDown: function(next) {
        http.get.restore();
        this.clock.restore();

        next();
    },

    "calls provided callback after all requests finish": function(test) {
        test.expect(2);
        this.mixpanel.import_batch(this.event_list, function(error_list) {
            test.equals(
                3, http.get.callCount,
                "import_batch didn't call send_request correct number of times before callback"
            );
            test.equals(
                0, error_list.length,
                "import_batch returned errors in callback unexpectedly"
            );
            test.done();
        });
        for (var ri = 0; ri < 3; ri++) {
            this.res[ri].emit('data', '1');
            this.res[ri].emit('end');
        }
    },

    "passes error list to callback": function(test) {
        test.expect(1);
        this.mixpanel.import_batch(this.event_list, function(error_list) {
            test.equals(
                3, error_list.length,
                "import_batch didn't return errors in callback"
            );
            test.done();
        });
        for (var ri = 0; ri < 3; ri++) {
            this.res[ri].emit('data', '0');
            this.res[ri].emit('end');
        }
    },

    "calls provided callback when options are passed": function(test) {
        test.expect(2);
        this.mixpanel.import_batch(this.event_list, {max_batch_size: 100}, function(error_list) {
            test.equals(
                3, http.get.callCount,
                "import_batch didn't call send_request correct number of times before callback"
            );
            test.equals(
                0, error_list.length,
                "import_batch returned errors in callback unexpectedly"
            );
            test.done();
        });
        for (var ri = 0; ri < 3; ri++) {
            this.res[ri].emit('data', '1');
            this.res[ri].emit('end');
        }
    },

    "sends more requests when max_batch_size < 50": function(test) {
        test.expect(2);
        this.mixpanel.import_batch(this.event_list, {max_batch_size: 30}, function(error_list) {
            test.equals(
                5, http.get.callCount, // 30 + 30 + 30 + 30 + 10
                "import_batch didn't call send_request correct number of times before callback"
            );
            test.equals(
                0, error_list.length,
                "import_batch returned errors in callback unexpectedly"
            );
            test.done();
        });
        for (var ri = 0; ri < 5; ri++) {
            this.res[ri].emit('data', '1');
            this.res[ri].emit('end');
        }
    },

    "behaves well without a callback": function(test) {
        test.expect(2);
        this.mixpanel.import_batch(this.event_list);
        test.equals(
            3, http.get.callCount,
            "import_batch didn't call send_request correct number of times"
        );
        this.mixpanel.import_batch(this.event_list, {max_batch_size: 100});
        test.equals(
            5, http.get.callCount, // 3 + 100 / 50; last request starts async
            "import_batch didn't call send_request correct number of times"
        );
        test.done();
    }
};

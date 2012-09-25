var events = require('events'),
    trycatch = require('trycatch');

var NO_RESULT = {},
    DEFAULT_OPTIONS = {
        slowTimeout: 0,
        skipTimeout: 0
    };

function stepdown(steps, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = DEFAULT_OPTIONS;
    } else if (options == null) {
        options = DEFAULT_OPTIONS;
    }

    var emitter = new events.EventEmitter(),
        index = 0,
        midStep = false,
        results = [null],
        expectedResults = 0,
        slowTimeoutId = null,
        skipTimeoutId = null,
        self = {
            data: {}
        };

    self.next = next;
    function next(err/*, ... rest*/) {
        var rest = Array.prototype.slice.call(arguments, 1),
            step,
            result;

        if (slowTimeoutId) {
            clearTimeout(slowTimeoutId);
            slowTimeoutId = null;
        }
        if (skipTimeoutId) {
            clearTimeout(skipTimeoutId);
            skipTimeoutId = null;
        }

        if (err) {
            // TODO: Assert that `err` is actually an Error instance.
            emitter.emit('error', err);
            return;
        }

        if (index === steps.length) {
            emitter.emit.apply(emitter, ['complete'].concat(rest));
            return;
        }

        if (results.length) {
            results = [null];
            expectedResults = 0;
        }

        trycatch(function() {
            midStep = true;

            step = steps[index++];

            if (options.slowTimeout) {
                slowTimeoutId = setTimeout(function slowTimeoutFn() {
                    emitter.emit('slow', step, function skip() {
                        next();
                    });
                });
            }
            if (options.skipTimeout) {
                skipTimeoutId = setTimeout(function skipTimeoutFn() {
                    var cancelled = false;

                    emitter.emit('skip', step, function cancel() {
                        cancelled = true;
                    });

                    // Events are emitted synchronously. If none have called cancel() synchronously, continue.
                    if (!cancelled) {
                        next();
                    }
                });
            }

            result = step.apply(self, rest);

            if (result !== undefined) {
                next(null, result);
            }

            midStep = false;
        }, function(err) {
            emitter.emit('error', err);
        });
    }

    self.addResult = addResult;
    function addResult() {
        if (!midStep) {
            throw new Error('addResult cannot be called after the step has completed.');
        }

        var index = results.push(NO_RESULT) - 1;

        expectedResults++;

        return function collectResult(err/*, ... rest*/) {
            if (results[index] !== NO_RESULT) {
                // TODO: Emit an error? They've already called this callback.
                return;
            }

            if (err) {
                if (results[0] === null) {
                    results[0] = err;
                } else if (Array.isArray(results[0])) {
                    results[0].push(err);
                } else {
                    results[0] = [results[0], err];
                }
            }

            if (arguments.length === 2) {
                results[index] = arguments[1];
            } else if (arguments.length > 2) {
                results[index] = Array.prototype.slice.call(arguments, 1);
            } else {
                results[index] = null;
            }

            if (midStep) {
                process.nextTick(checkExpectedResults);
            } else {
                checkExpectedResults();
            }
        };
    }
    function checkExpectedResults() {
        expectedResults--;

        if (!expectedResults) {
            next.apply(null, results);
        }
    }

    self.createGroup = createGroup;
    function createGroup() {
        var callback = addResult(),
            groupError = null,
            groupResults = [],
            expectedGroupResults = 0,
            completed = false;

        function checkExpectedGroupResults() {
            if (expectedGroupResults === 0) {
                completed = true;
                callback.apply(null, [groupError, groupResults]);
            }
        }

        function onComplete() {
            expectedGroupResults--;

            if (midStep) {
                process.nextTick(checkExpectedGroupResults);
            } else {
                checkExpectedGroupResults();
            }
        }

        process.nextTick(checkExpectedGroupResults);

        return function addGroupResult() {
            if (completed) {
                throw new Error('Group has already completed. Did you asynchronously generate?');
            }

            var index = groupResults.push(NO_RESULT) - 1;

            expectedGroupResults++;

            return function collectGroupResult(err/*, ... rest*/) {
                if (groupResults[index] !== NO_RESULT) {
                    // TODO: Emit an error? They've already called this callback.
                    return;
                }

                if (err) {
                    if (groupError === null) {
                        groupError = err;
                    } else if (Array.isArray(groupError)) {
                        groupError.push(err);
                    } else {
                        groupError = [groupError, err];
                    }
                }

                if (arguments.length === 2) {
                    groupResults[index] = arguments[1];
                } else if (arguments.length > 2) {
                    groupResults[index] = Array.prototype.slice.call(arguments, 1);
                } else {
                    groupResults[index] = null;
                }

                onComplete();
            };
        };
    }

    function wrappedCallback(fn) {
        return function() {
            emitter.removeAllListeners('error');
            emitter.removeAllListeners('complete');
            fn.apply(this, arguments);
        };
    }

    if (callback) {
        emitter.on('error', wrappedCallback(callback));
        emitter.on('complete', wrappedCallback(callback.bind(null, null)));
    }

    process.nextTick(next);

    return emitter;
}

module.exports = stepdown;

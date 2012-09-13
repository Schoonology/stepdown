var events = require('events');

var NO_RESULT = {},
    DEFAULT_OPTIONS = {
        slowTimeout: 0,
        skipTimeout: 0
    };

function stepdown(steps, options, errorHandler, slowHandler, skipHandler) {
    if (typeof options === 'function') {
        skipHandler = slowHandler;
        slowHandler = errorHandler;
        errorHandler = options;
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
        self = {};

    self.next = next;
    function next(err/*, ... rest*/) {
        var errorListeners = emitter.listeners('error'),
            args = arguments,
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

        if (errorListeners.length) {
            if (err) {
                // TODO: Assert that `err` is actually an Error instance.
                emitter.emit('error', err);
                return;
            }

            args = Array.prototype.slice.call(arguments, 1);
        }

        if (index === steps.length) {
            emitter.emit('complete');
            return;
        }

        if (results.length) {
            results = [null];
            expectedResults = 0;
        }

        try {
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

            result = step.apply(self, args);

            if (result != null) {
                next(null, result);
            }

            midStep = false;
        } catch (err) {
            if (errorListeners.length) {
                emitter.emit('error', err);
            } else {
                next(err);
            }
        }
    }

    self.addResult = addResult;
    function addResult() {
        var index = results.push(NO_RESULT) - 1;

        expectedResults++;

        // TODO: Throw an Error if results are added asynchronously.

        // console.log('Now expecting:', expectedResults);

        return function collectResult(err/*, ... rest*/) {
            if (results[index] !== NO_RESULT) {
                // console.log('Skipping:', index);
                // TODO: Emit an error? They've already called this callback.
                return;
            }

            if (err) {
                // console.log('Before Error:', results[0]);
                if (results[0] === null) {
                    results[0] = err;
                } else if (Array.isArray(results[0])) {
                    results[0].push(err);
                } else {
                    results[0] = [results[0], err];
                }
                // console.log('After Error:', results[0]);
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
        // console.log('Now only expecting:', expectedResults);

        if (!expectedResults) {
            next.apply(null, results);
        }
    }

    self.createGroup = createGroup;
    function createGroup() {
        var callback = addResult(),
            groupResults = [null],
            expectedGroupResults = 0;

        function checkExpectedGroupResults() {
            expectedGroupResults--;
            // console.log('Group got smaller:', expectedGroupResults);

            if (!expectedGroupResults) {
                callback.apply(null, groupResults);
            }
        }

        return function addGroupResult() {
            var index = groupResults.push(NO_RESULT) - 1;

            expectedGroupResults++;
            // console.log('Group got bigger:', expectedGroupResults);

            return function collectGroupResult(err/*, ... rest*/) {
                if (groupResults[index] !== NO_RESULT) {
                    // console.log('Skipping:', index);
                    // TODO: Emit an error? They've already called this callback.
                    return;
                }

                if (err) {
                    // console.log('Before Error:', results[0]);
                    if (groupResults[0] === null) {
                        groupResults[0] = err;
                    } else if (Array.isArray(groupResults[0])) {
                        groupResults[0].push(err);
                    } else {
                        groupResults[0] = [groupResults[0], err];
                    }
                    // console.log('After Error:', results[0]);
                }

                if (arguments.length === 2) {
                    groupResults[index] = arguments[1];
                } else if (arguments.length > 2) {
                    groupResults[index] = Array.prototype.slice.call(arguments, 1);
                } else {
                    groupResults[index] = null;
                }

                if (midStep) {
                    process.nextTick(checkExpectedGroupResults);
                } else {
                    checkExpectedGroupResults();
                }
            };
        };
    }

    if (typeof errorHandler === 'function') {
        emitter.on('error', errorHandler);
    }

    process.nextTick(next);

    return emitter;
}

module.exports = stepdown;

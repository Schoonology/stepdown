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
        data = {};

    function next(err/*, ... rest*/) {
        var self = {
                data: data
            },
            rest,
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

        if (expectedResults !== 0) {
            throw new Error('Cannot call next after addResult or [createGroup]()')
        }

        rest = Array.prototype.slice.call(arguments, 1);

        if (index === steps.length) {
            emitter.emit.apply(emitter, ['complete'].concat(rest));
            return;
        }

        if (results.length) {
            results = [null];
            expectedResults = 0;
        }

        self.addResult = fbind(addResult, self);
        self.addEventResult = fbind(addEventResult, self);
        self.createGroup = fbind(createGroup, self);
        self.createEventGroup = fbind(createEventGroup, self);
        self.next = tempNext;

        trycatch(function() {
            step = steps[index++];

            if (options.slowTimeout) {
                slowTimeoutId = setTimeout(function slowTimeoutFn() {
                    emitter.emit('slow', step, function skip() {
                        tempNext.apply(null, arguments);
                    });
                }, options.slowTimeout);
            }
            if (options.skipTimeout) {
                skipTimeoutId = setTimeout(function skipTimeoutFn() {
                    var cancelled = false;

                    emitter.emit('skip', step, function cancel() {
                        cancelled = true;
                    });

                    // Events are emitted synchronously. If none have called cancel() synchronously, continue.
                    if (!cancelled) {
                        tempNext();
                    }
                }, options.skipTimeout);
            }

            midStep = true;
            result = step.apply(self, rest);
            midStep = false;

            if (result !== undefined) {
                tempNext(null, result);
            }
        }, function(err) {
            emitter.emit('error', err);
        });

        function tempNext() {
            var args = arguments;
            
            if (tempNext.completed === true) throw new Error('This step has already progressed.');

            tempNext.called = true;
            if (midStep) {
                process.nextTick(function() {
                    tempNext.apply(null, args)
                });
                return;
            }
            
            data = self.data;
            tempNext.completed = true;
            next.apply(null, args);
        }
    }

    function addResult(that) {
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
                process.nextTick(function() {
                    checkExpectedResults(that)
                });
            } else {
                checkExpectedResults(that);
            }
        };
    }
    function checkExpectedResults(that) {
        expectedResults--;

        if (!expectedResults) {
            that.next.apply(null, results);
        }
    }

    function addEventResult(that) {
        var callback = addResult(that);
        return function handleEvent() {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(null);
            callback.apply(null, args);
        };
    }

    function createGroup(that, count) {
        var callback = addResult(that),
            groupError = null,
            groupResults = [],
            expectedGroupResults = 0,
            completed = false,
            ret;

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

        function addGroupResult() {
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
                if (completed) {
                    throw new Error('Group has already completed.');
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
        }

        process.nextTick(function() {
            if (!that.next.called) {
                checkExpectedGroupResults()
            }
        });

        if (count) {
            ret = [];
            for(; count > 0; --count) {
                ret.push(addGroupResult());
            }
            return ret;
        }

        return addGroupResult;
    }

    function createEventGroup(that) {
        var generator = createGroup(that);
        return function addEventGroupResult() {
            var callback = generator();
            return function collectEventGroupResult() {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(null);
                callback.apply(null, args);
            }
        }
    }

    function wrappedCallback(fn) {
        return function() {
            emitter.removeAllListeners('error');
            emitter.removeAllListeners('complete');
            fn.apply(this, arguments);
        };
    }

    // Performance optimization
    function fbind(fn, arg1) {
        return function(arg2, arg3, arg4) {
            return fn(arg1, arg2, arg3, arg4)
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

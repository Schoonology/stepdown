var events = require('events');

var NO_RESULT = {};

function stepdown(steps, errorHandler) {
    var emitter = new events.EventEmitter(),
        index = 0,
        midStep = false,
        results = [null],
        expectedResults = 0;

    next.next = next;
    function next(err/*, ... rest*/) {
        var errorListeners = emitter.listeners('error'),
            args = arguments;

        if (errorListeners.length) {
            if (err) {
                // TODO: Assert that `err` is actually an Error instance.
                // TODO: Control continuation from error handlers?
                emitter.emit('error', err, function () {
                    err = null;
                    next.apply(this, args);
                });
                return;
            }

            args = Array.prototype.slice.call(arguments, 1);
        }

        if (index === steps.length) {
            return;
        }

        if (results.length) {
            results = [null];
            expectedResults = 0;
        }

        try {
            midStep = true;
            steps[index++].apply(next, args);
            midStep = false;
        } catch (err) {
            if (errorListeners.length) {
                emitter.emit('error', err, function () {
                    next();
                });
            } else {
                next(err);
            }
        }
    }

    next.parallel = next.addResult = addResult;
    function addResult() {
        var index = results.push(NO_RESULT) - 1;

        expectedResults++;

        // console.log('Now expecting:', expectedResults);

        return function (err/*, ... rest*/) {
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

    next.group = next.createGroup = createGroup;
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

        return function () {
            var index = groupResults.push(NO_RESULT) - 1;

            expectedGroupResults++;
            // console.log('Group got bigger:', expectedGroupResults);
            
            return function (err/*, ... rest*/) {
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
        }
    }

    if (typeof errorHandler === 'function') {
        emitter.on('error', errorHandler);
    }

    next();

    return emitter;
}

stepdown.step = function () {
    return stepdown(Array.prototype.slice.call(arguments));
};

stepdown.stepup = function () {
    var args = Array.prototype.slice.call(arguments);

    if (!args.length || !args[0].length) {
        return stepdown(args);
    }

    return stepdown(args, args.shift());
};

module.exports = stepdown;
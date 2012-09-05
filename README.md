# Stepdown

A simple control-flow library for node.JS that makes parallel execution, serial execution, and error handling painless.

## How to install

    npm install stepdown

## Basic Usage (Serial)

Stepdown exports a single function:

    stepdown(steps, [options], [errorHandler], [slowHandler], [skipHandler])

Each of the functions in the `steps` Array is called serially until that step has completed:

    var stepdown = require('stepdown');

    stepdown([function stepOne() {
        return 'Step one is complete!';
    }, function stepTwo(err, message) {
        console.log(message);

        this.next(null, 'Step two is complete!');
    }, function finalStep(err, message) {
        console.log(message);
    }]);

The two basic methods of indicating that a step function has completed are by return value (as in `stepOne`) and by a callback function accessible as `this.next` (as in `stepTwo`). If you run this snippet, the output is what you expect:

    Step one is complete!
    Step two is complete!

Shiny!

### Next _Steps_

Going beyond the [basic usage](#basic-usage), Stepdown supports parallel execution in two ways: as a pre-defined set of "[results](#adding-results)", and as an arbitrary "[group](#grouping results)" of results.

## Adding Results (Pre-defined Parallel)

The [basic usage](#basic-usage) and it's `next` callback assume that each step has exactly one (a)synchronous result, and that each step performs only one task. The beauty of Node is in its asynchronicity, and we should take advantage of that asynchronicity to perform as much of our work as we can in parallel.

To that end, enter `addResult`. Within a step, each call to `this.addResult()` generates a new callback function. Each of these functions corresponds to a new argument passed to the next step.

Instead of this:

    stepdown([function stepOne() {
        // Do something asynchronous
        setTimeout(this.next.bind(this, null, 1), 1000);
    }, function stepTwo(err, result) {
        // Do something else asynchronous with no dependency on the first step
        setTimeout(this.next.bind(this, null, result, 2), 1000);
    }, function finished(err, first, second) {
        // This process would get really messy and take a really long time with lots of steps...
        console.log('Results:', first, second);
    }]);

We can do this:

    stepdown([function onlyStep() {
        // Do something asynchronous
        setTimeout(this.addResult().bind(this, null, 1), 1000);
        // Do something else asynchronous with no dependency on the first step
        setTimeout(this.addResult().bind(this, null, 2), 1000);
    }, function finished(err, first, second) {
        // This is both more maintainable and more time-efficient.
        console.log('Results:', first, second);
    }]);

Much better, no?

### Important Caveat

The caveat to `addResult` is that these callback functions are allocated synchronously, requiring the developer to explicitly prescribe what results are expected ahead of time. To get around this, we can create [arbitrary groups of results](#grouping-results).

## Grouping Results (Arbitrary Parallel)

While `addResult` is sufficent and recommended for parallel operations known ahead-of-time, it's impractical-to-incapable of handling arbitrary sets of parallel operations. Enter `createGroup`. Within a step, each call to `this.createGroup()` generates a new "group" function. When this group function is called, it generates a new callback specific to that result _within the group_.

The same example from before, but grouped:

    stepdown([function onlyStep() {
        var groupFn = this.createGroup();

        // Do something asynchronous
        setTimeout(groupFn().bind(this, null, 1), 1000);
        // Do something else asynchronous with no dependency on the first step
        setTimeout(groupFn().bind(this, null, 2), 1000);
    }, function finished(err, group) {
        console.log('Group Results:', group);
    }]);

Using the group function should look incredibly similar to using `addResult`.

## Moving from Step/Stepup

If you should decide to port a project from using [Step](https://github.com/creationix/step) or [Stepup](https://github.com/CrabDude/stepup) to use Stepdown, there are helper functions that map the Step/Stepup signatures to Stepdown:

    stepdown.step(... steps)

    stepdown.stepup([errorHandler], ... steps)

Find and replace, then convert the APIs to Stepdown as necessary.

## Attribution

This work stands on the shoulders of giants:

 * Tim Caswell [creationix](https://github.com/creationix), who created [Step](https://github.com/creationix/step).
 * Adam Crabtree [CrabDude](https://github.com/CrabDude), who created [Stepup](https://github.com/CrabDude/stepup).

## Improvements

Step and Stepup are great libraries, but Stepdown profits from their work in enabling the following improvements in the core engine:

 * If more than one Error is generated during parallel execution, the error handler will be called with an Array of all Errors. Step and Stepup only return the last Error.
 * If more than one result is generated during parallel execution, the value given to the next step will be an Array of all arguments passed. Step and Stepup only pass on the first non-Error argument.
 * If a parallel callback is fired more than once, it will be ignored. Step and Stepup break under these circumstances.

var trycatch = require('../../trycatch/lib/trycatch');

// Inspired by http://github.com/willconant/flow-js, but reimplemented and
// modified to fit my taste and the node.JS error handling system.
function Step() {
	var steps = Array.prototype.slice.call(arguments),
		errorHandler, counter, results, lock;
	
	if (steps.length && steps[0].length) {
		errorHandler = steps.shift();
	}

	// Define the main callback that's given as `this` to the steps.
	function next() {

		// Check if there are no steps left
		if (steps.length === 0) {
			// Throw uncaught errors
			if (arguments[0]) {
				throw arguments[0];
			}
			return;
		}

		if (arguments[0] && errorHandler) {
			// Don't expose any next properties to errorHandler
			return errorHandler.call(function() {
				var args = arguments;
				Array.prototype.unshift.call(args, null);
				trycatch(function() {
					next.apply(null, args);
				}, next);
			}, arguments[0]);
		}
		// Get the next step to execute
		var fn = steps.shift();
		var args = arguments;
		Array.prototype.splice.call(args, 0, 1);
		counter = 0;
		results = [];
		lock = true;
		
		function run() {
			var result = fn.apply(next, args);
			// If a synchronous return is used, pass it to the callback
			if (result !== undefined) {
				next(undefined, result);
			}
			lock = false;
		}
		
		// Run the step in an async trycatch block so exceptions don't get out of hand.
		if (errorHandler) {
			run();
		} else {
			// Pass any exceptions on through the next callback
			trycatch(run, next);
		}
	}

	// Add a special callback generator `this.parallel()` that groups stuff.
	next.parallel = function () {
		var i = counter;
		counter++;
		function check() {
			counter--;
			if (counter === 0) {
				// When they're all done, call the callback
				next.apply(null, results);
			}
		}
		return function () {
			// Compress the error from any result to the first argument
			if (arguments[0]) {
				results[0] = arguments[0];
			}
			// Send the other results as arguments
			results[i + 1] = arguments[1];
			if (lock) {
				process.nextTick(check);
				return
			}
			check();
		};
	};

	// Generates a callback generator for grouped results
	next.group = function () {
		var localCallback = next.parallel();
		var counter = 0;
		var result = [];
		var error = undefined;
		// Generates a callback for the group
		return function () {
			var i = counter;
			counter++;
			function check() {
				counter--;
				if (counter === 0) {
					// When they're all done, call the callback
					localCallback(error, result);
				}
			}
			return function () {
				// Compress the error from any result to the first argument
				if (arguments[0]) {
					error = arguments[0];
				}
				// Send the other results as arguments
				result[i] = arguments[1];
				if (lock) {
					process.nextTick(check);
					return
				}
				check();
			}

		}
	};

	// Start the engine an pass nothing to the first step.
	if (errorHandler) {
		trycatch(next, next);
	} else {
		next();
	}
}

// Hook into commonJS module systems
if (typeof module !== 'undefined' && "exports" in module) {
	module.exports = Step;
}


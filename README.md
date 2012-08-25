# Stepdown

A simple control-flow library for node.JS that makes parallel execution, serial execution, and error handling painless.

## How to install

    npm install stepdown

## Attribution

This work stands on the shoulders of giants:

 * Tim Caswell [creationix](https://github.com/creationix), who created [step](https://github.com/creationix/step).
 * Adam Crabtree [CrabDude](https://github.com/CrabDude), who created [stepup](https://github.com/CrabDude/stepup).

## Improvements

Step and Stepup are great libraries, but Stepdown profits from their work in enabling the following improvements:

 * If more than one Error is generated during parallel execution, the error handler will be called with an Array of all Errors. Step and Stepup only return the last Error.
 * If more than one result is generated during parallel execution, the value given to the next step will be an Array of all arguments passed. Step and Stepup only pass on the first non-Error argument.
 * If a parallel callback is fired more than once, it will be ignored. Step and Stepup break under these circumstances.

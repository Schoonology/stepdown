/*global describe:true, it:true */
var expect = require('chai').expect,
    stepdown = require('../');

describe('Stepdown', function () {
    describe('next', function () {
        it('should execute each step in order when this.next is called', function (done) {
            var steps = [];

            stepdown([function stepOne() {
                steps.push(1);
                this.next();
            }, function stepTwo() {
                steps.push(2);
                this.next();
            }, function stepThree() {
                steps.push(3);
                this.next();
            }, function () {
                expect(steps).to.have.length(3);
                expect(steps[0]).to.equal(1);
                expect(steps[1]).to.equal(2);
                expect(steps[2]).to.equal(3);
                done();
            }]);
        });

        it('should execute the next function with the value from the previous callback', function (done) {
            stepdown([function stepOne(value) {
                expect(value).to.not.exist;
                this.next(null, 'one');
            }, function stepTwo(value) {
                expect(value).to.equal('one');
                this.next(null, 'two');
            }, function stepThree(value) {
                expect(value).to.equal('two');
                this.next(null, 'three');
            }, function finished(value) {
                expect(value).to.equal('three');
                done();
            }]);
        });

        it('should pass along the return value if non-null, assuming the step is synchronous', function (done) {
            stepdown([function stepOne(value) {
                expect(value).to.not.exist;
                return 'one';
            }, function stepTwo(value) {
                expect(value).to.equal('one');
                return 'two';
            }, function stepThree(value) {
                expect(value).to.equal('two');
                return 'three';
            }, function finished(value) {
                expect(value).to.equal('three');
                done();
            }]);
        });

        it('should execute the provided error handler on throw', function (done) {
            stepdown([function flaky() {
                throw 42;
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });

        it('should execute the provided error handler on error', function (done) {
            stepdown([function flaky() {
                this.next(42);
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });
    });

    describe('addResult', function () {
        it('should execute the next step only when all generated callbacks have been fired', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo() {
                expect(arguments).to.have.length(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should preserve the order of the results as separate arguments', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo(a, b, c) {
                expect(arguments).to.have.length(3);
                expect(a).to.equal(2);
                expect(b).to.equal(1);
                expect(c).to.equal(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should clear those results between parallel stages', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo() {
                setTimeout(this.addResult().bind(this, null, 4), 20);
                setTimeout(this.addResult().bind(this, null, 5), 10);
            }, function stageThree(a, b) {
                expect(arguments).to.have.length(2);
                expect(a).to.equal(4);
                expect(b).to.equal(5);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should collect each "result" as an Array if more than one argument is given', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2, 3, 4), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 5), 30);
            }, function stageTwo(a, b, c) {
                expect(arguments).to.have.length(3);
                expect(a).to.deep.equal([2, 3, 4]);
                expect(b).to.equal(1);
                expect(c).to.equal(5);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should pass the only error to the error handler as an Error', function (done) {
            stepdown([function stageOne() {
                this.addResult()(42);
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });

        it('should pass an array of Errors to the error handler if there is more than one', function (done) {
            stepdown([function stageOne() {
                this.addResult()(42);
                this.addResult()('answer');
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.be.an.instanceof(Array);
                expect(err).to.have.length(2);
                done();
            });
        });
    });

    describe('createGroup', function () {
        it('should execute the next step only when all generated callbacks have been fired', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 3), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should preserve the order of the results as separate arguments', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 3), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);
                expect(results[0]).to.equal(2);
                expect(results[1]).to.equal(1);
                expect(results[2]).to.equal(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should not collude results between groups', function (done) {
            stepdown([function stageOne() {
                var groupA = this.createGroup(),
                    groupB = this.createGroup();

                setTimeout(groupA().bind(this, null, 2), 20);
                setTimeout(groupA().bind(this, null, 1), 10);
                setTimeout(groupA().bind(this, null, 3), 30);
                setTimeout(groupB().bind(this, null, 4), 20);
                setTimeout(groupB().bind(this, null, 5), 10);
            }, function stageTwo(a, b) {
                expect(a).to.have.length(3);
                expect(b).to.have.length(2);

                expect(a).to.deep.equal([2, 1, 3]);
                expect(b).to.deep.equal([4, 5]);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should collect each "result" as an Array if more than one argument is given', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2, 3, 4), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 5), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);
                expect(results[0]).to.deep.equal([2, 3, 4]);
                expect(results[1]).to.equal(1);
                expect(results[2]).to.equal(5);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should pass the only error to the error handler as an Error', function (done) {
            stepdown([function stageOne() {
                this.createGroup()()(42);
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });

        it('should pass an array of Errors to the error handler if there is more than one', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                group()(42);
                group()('answer');
            }, function neverHappens() {
                throw new Error('Should not have executed.');
            }], function errorHandler(err) {
                expect(err).to.be.an.instanceof(Array);
                expect(err).to.have.length(2);
                done();
            });
        });

        it('should result in an empty group if the generator is never fired', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();
            }, function stageTwo(results) {
                expect(results).to.be.an.instanceof(Array);
                expect(results).to.have.length(0);

                done();
            }]);
        });
    });

    describe('events', function () {
        describe('complete', function () {
            it('should fire upon completing all steps', function (done) {
                stepdown([function stepOne() {
                    process.nextTick(this.next);
                }]).on('complete', function () {
                    done();
                });
            });

            it('should pass along the final results', function (done) {
                stepdown([function stepOne() {
                    process.nextTick(this.next.bind(this, null, 42));
                }]).on('complete', function (result) {
                    expect(result).to.equal(42);
                    done();
                });
            });
        });

        describe('error', function () {
            it('should fire for the last step', function (done) {
                stepdown([function stepOne() {
                    this.next(new Error('Should be caught'));
                }]).on('error', function (err) {
                    done();
                });
            });
        });
    });

    describe('options', function () {
        describe('slowTimeout', function () {
            it('should emit the "slow" event when a step takes too long', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }], {
                    slowTimeout: 100
                });

                emitter.on('slow', function () {
                    done();
                });
            });
            it('should pass along the step itself as data', function (done) {
                function slowStep() {
                    // Never continues.
                }

                var emitter = stepdown([slowStep], {
                    slowTimeout: 100
                });

                emitter.on('slow', function (step) {
                    expect(step).to.equal(slowStep);
                    done();
                });
            });
            it('should be able to skip the step upon calling skip', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }, function finished() {
                    done();
                }], {
                    slowTimeout: 100
                });

                emitter.on('slow', function (step, skip) {
                    skip();
                });
            });
            it('should default to 0, indicating no timeout', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }]);

                emitter.on('slow', function () {
                    throw new Error('Should not have been called');
                });

                setTimeout(done, 100);
            });
        });

        describe('skipTimeout', function () {
            it('should emit the "skip" event when a step takes too long', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }], {
                    skipTimeout: 100
                });

                emitter.on('skip', function () {
                    done();
                });
            });
            it('should pass along the step itself as data', function (done) {
                function slowStep() {
                    // Never continues.
                }

                var emitter = stepdown([slowStep], {
                    skipTimeout: 100
                });

                emitter.on('skip', function (step) {
                    expect(step).to.equal(slowStep);
                    done();
                });
            });
            it('should skip the slow step automatically', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }, function finished() {
                    done();
                }], {
                    skipTimeout: 100
                });
            });
            it('should be able to cancel skipping the step upon calling cancel', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }, function () {
                    throw new Error('Should not have been called!');
                }], {
                    skipTimeout: 50
                }, function errorHandler(err) {
                    // Need to bubble out.
                    throw err;
                });

                emitter.on('skip', function (step, cancel) {
                    cancel();
                });

                setTimeout(done, 100);
            });
            it('should default to 0, indicating no timeout', function (done) {
                var emitter = stepdown([function () {
                    // Never continues.
                }]);

                emitter.on('skip', function () {
                    throw new Error('Should not have been called');
                });

                setTimeout(done, 100);
            });
        });
    });

    describe('callback', function () {
        it('should fire the Node-style callback on error', function (done) {
            stepdown([function stepOne() {
                this.next(new Error('Should be caught'));
            }], function (err, data) {
                expect(data).to.not.exist;
                expect(err.message).to.equal('Should be caught');
                done();
            });
        });

        it('should fire the Node-style callback on completion with the final results', function (done) {
            stepdown([function stepOne() {
                process.nextTick(this.next.bind(this, null, 'answer', 42));
            }], function (err, first, second) {
                expect(err).to.not.exist;
                expect(first).to.equal('answer');
                expect(second).to.equal(42);
                done();
            });
        });
    });

    describe('this', function () {
        it('should be consistent between steps', function (done) {
            var firstThis;

            stepdown([function stepOne() {
                firstThis = this;
                this.next();
            }, function stepTwo() {
                expect(this).to.equal(firstThis);
                done();
            }]);
        });

        it('should be mutable to allow for data passing', function (done) {
            stepdown([function stepOne() {
                this.data = [1];
                this.next();
            }, function stepTwo() {
                expect(this).to.have.property('data');
                this.data.push(2);
                this.next();
            }, function stepThree() {
                expect(this).to.have.property('data');
                expect(this.data).to.deep.equal([1, 2]);
                done();
            }]);
        });
    });
});

var step = require('./lib/step');

step(function(err) {
  console.log('error1', err.stack);
}, function() {
  console.log('a');
  setTimeout(this, 0);
}, function() {
  console.log('b');
  throw new Error('fail');
}, function() {
  console.log('end');
});



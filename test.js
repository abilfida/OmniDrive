const { AppError } = require('./packages/worker/src/middleware/error-handler');
console.log(new AppError(401, 'test').status);

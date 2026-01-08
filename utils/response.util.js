const sendSuccess = (res, message = 'Success', data = null, statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  };
  
  const sendError = (res, message = 'Error', statusCode = 400, errors = null) => {
    return res.status(statusCode).json({
      success: false,
      message,
      errors
    });
  };

  const sendNotFound = (res, message = 'Resource not found') => {
    return res.status(404).json({
      success: false,
      message,
      data: null
    });
  };
  
  module.exports = { sendSuccess, sendError, sendNotFound };
  
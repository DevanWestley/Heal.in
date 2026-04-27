function errorHandler(err, _req, res, _next) {
  console.error(err);
  return res.status(500).json({
    error: "Internal Server Error",
    detail: err.message
  });
}
module.exports = errorHandler;
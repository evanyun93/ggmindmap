module.exports = (req, res) => {
  res.status(200).json({
    message: "Vercel API Engine is active",
    timestamp: new Date().toISOString()
  });
};

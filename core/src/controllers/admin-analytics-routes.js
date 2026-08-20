const { getPlantRankings } = require("../services/analytics");

function registerAdminAnalyticsRoutes({ app }) {
  app.get("/api/analytics", async (req, res) => {
    try {
      const sort = req.query.sort || "exp";
      const data = getPlantRankings(sort);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminAnalyticsRoutes };

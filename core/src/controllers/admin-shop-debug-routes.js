const { getItemById } = require("../config/gameConfig");

const DEBUG_ITEM_IDS = [20002, 20003, 20071, 29998];

function registerAdminShopDebugRoutes({ app }) {
  app.get("/api/debug/item-config", (req, res) => {
    const results = DEBUG_ITEM_IDS.map((id) => {
      const itemConfig = getItemById(id);
      return {
        id,
        exists: !!itemConfig,
        type: itemConfig ? Number(itemConfig.type) : null,
        name: itemConfig ? itemConfig.name : null,
      };
    });

    res.json({ ok: true, results });
  });
}

module.exports = { registerAdminShopDebugRoutes };

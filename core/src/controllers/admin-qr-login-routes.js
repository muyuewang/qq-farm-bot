const { MiniProgramLoginSession } = require("../services/qrlogin");

function registerAdminQrLoginRoutes({ app }) {
  app.post("/api/qr/create", async (req, res) => {
    try {
      const data = await MiniProgramLoginSession.requestLoginCode();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/qr/check", async (req, res) => {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ ok: false, error: "Missing code" });
    }

    try {
      const status = await MiniProgramLoginSession.queryStatus(code);
      if (status.status === "OK") {
        const appId = "1112386029";
        const authCode = await MiniProgramLoginSession.getAuthCode(
          status.ticket,
          appId,
        );
        const avatar = status.uin
          ? `https://q1.qlogo.cn/g?b=qq&nk=${  status.uin  }&s=640`
          : "";
        return res.json({
          ok: true,
          data: {
            status: "OK",
            code: authCode,
            uin: status.uin || "",
            avatar,
            nickname: status.nickname || "",
          },
        });
      }

      if (status.status === "Used") {
        return res.json({ ok: true, data: { status: "Used" } });
      }
      if (status.status === "Wait") {
        return res.json({ ok: true, data: { status: "Wait" } });
      }

      res.json({
        ok: true,
        data: {
          status: "Error",
          error: status.msg,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminQrLoginRoutes };

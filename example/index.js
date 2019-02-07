const Server = require("../dist").default;
const path = require("path");
const fs = require("fs");
// Pass some options!
const instance = new Server({
  name: "my-redoubt-server",
  ssl: {
    cert: fs.readFileSync(path.resolve(__dirname, "./server.crt")),
    key: fs.readFileSync(path.resolve(__dirname, "./key.pem")),
    allowUnsigned: true
  },
  staticFiles: { from: path.resolve(__dirname, "./static"), serve: "/" },
  cookieSecret: "maggots-at-the-party",
  domains: ["localhost"],
  isDevelopment: true,
  webmasterMail: "sonstiges@patrick-sachs.de"
});
// Express app exposed via "app"
instance.app.get("/api/data", (req, res) => res.json({ values: ["express", "test"] }).end());
// Let's rock! 🤘
instance.listen();

/**
 * Run this before npm publish!
 */

const fs = require("fs-extra");
const path = require("path");

fs.emptyDirSync(path.resolve(__dirname, "./dist"));

const files = ["README.md", "LICENSE"];
for (let i = 0; i < files.length; i++) {
  fs.copyFileSync(path.resolve(__dirname, files[i]), path.resolve(__dirname, "./dist", files[i]));
}

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./package.json")));
delete packageJson.scripts;
delete packageJson.devDependencies;
packageJson.private = false;

fs.writeFileSync(path.resolve(__dirname, "./dist", "./package.json"), JSON.stringify(packageJson, null, 2));
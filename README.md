# redoubt 🏰

redoubt is a simple, yet powerful & secure [express](https://github.com/expressjs/express/) based server.

## Why?

I recently came to realize that most of my projects incorporating a web server end up containing the exact same server boilerplate code:

 * A JSON Body Parser
 * A URL Encoded Parser
 * A static file directory somewhere
 * An (optional) cookie based session storage
 * Proper compression for all files & data
 * And last but not least SSL certificates

The first four are rather trivial to set up, the last one would travidionally be a bit tricky and/or costly. 

Thankfully, [Let's Encrypt](https://letsencrypt.org/) is giving aways certificates, so we've got **free, automatically renewed certificates** built in.

## Quick Start

Install the library into your project:

```
npm i redoubt
```

You are ready to set up your server:

```js
const Redoubt = require("redoubt");
const path = require("path");
const fs = require("fs");

const server = new Redoubt({
  // The name of your server
  name: "my-redoubt-server",
  // Let's Encrypt will issue our certificates(We need to specify some details about our domain)
  certs: "letsEncrypt",
  agreeGreenlockTos: true,
  domains: ["patrick-sachs.de"],
  webmasterMail: "the-webmaster-mail@patrick-sachs.de"
  // We also serve some static files
  staticFiles: { from: path.resolve(__dirname, "./static"), serve: "/" },
  // The cookie on the client side(contains the session ID) is obfuscated with this secret.
  cookieSecret: "maggots-at-the-party",
});
// Express app exposed via "app" - Set up your actual server here!
server.app.get("/api/data", (req, res) => res
  .json({ values: ["express", "test"] })
  .end());
// Let's rock! 🤘
server.listen();
```

The code above is an example for a production server. Production servers using `certs: "letsEncrypt"` need a public FQDN in order for Let's Encrypt to be able to issue certificates to it.

For development server, we can either set `isDevelopment: true`, or use manually created certificates:

```js
certs: {
  cert: fs.readFileSync(path.resolve(__dirname, "./server.crt")),
  key: fs.readFileSync(path.resolve(__dirname, "./key.pem")),
  allowUnsigned: true
},
```

See the `/example/index.js` file for a complete development server example.

## All properties

| Key | Description | Type | Default/Required |
| - | - | - | - |
| `name` | The name of your server. Currently only used for the name of the session cookie, but this might change in the future. | `string` | ✔️ Required |
| `domains` | The domain names the Let's Encrypt certificates should be issued against. The first value is your primary domain. Must all be valid, resolvable FQDNs. Simply pass `localhost` in a development envrionment. | `string[]` | ✔️ Required |
| `webmasterMail` | The mail of the webmaster. Used by Let's Encrypt to conact you when something related to your certificates happens(about to be renewed...). | `string` | ✔️ Required |
| `cookieSecret` | This secret is used to obfuscate the session ID of the user saved in the cookie. Only the ID of the session is saved on the client side, not the actual data. If this secret is weak or compromised in any other way users can trivially pose as other users and access their session data. | `string` | ✔️ Required |
| `isDevelopment` | If this server running in development mode? Development mode servers do not compress, do not request valid SSL certificates and trust invalid SSL certificates. | `boolean` | `false` |
| `ssl` | The certificates your server uses. You can either use Let's Encrypt or your your own certificates(e.g. if you are running in a company internal network). Keep in mind that when using manually generated certificates, `key` and `cert` must contain the certificate & key file contents, not their file paths. | `"none" | "letsEncrypt" | { key: string, cert: string, allowUnsigned: boolean }` | `"letsEncrypt"` |
| `letsEncryptCertDirectory` | When using Let's Encrypt certificates, this is where they will be stored. Must be a directory with write access. | `string` | `"./.certs/"` |
| `agreeGreenlockTos` | The greenlock library used to create the Let's Encrypt certificates requires you to explictly accept their TOS. | `boolean` | `false` |
| `staticFiles` | Allows you to serve static files. File location on your server is specified in `from`, and URL users will be able to access them from in `serve`. | `{ from: string, serve: string } | null` | `null` |
| `maxPayloadSize` | The max size in bytes a single JSON or URL encoded request to the server can have. | `number` | `100 * 1024` |
| `debug` | Allows to to specify your own debug function(Or disable debug by passing `null`). By default the console is used. | `((level: string, ...args: any[]) => void) | null` | `console.log("[" + level + "]", "🏰 ", ...args)` |

## Questions

 * *I'm getting an error about greenlock TOS!* - Please read about the `agreeGreenlockTos` option.
 * *My development server is "Not Secure"!* - This is expected. Let's Encrypt can't issue certificates for `localhost`. As long as the `domains` option if correct on your production server it will work there.
 * *I don't want to use port 443 & 80!* - The `listen(https: number, http: number | null)` function allows you to customize the ports. You can also pass null as second parameter to disable the HTTP server redirection.
 * *How do I access the user session data?* - See the express-session documentation: https://www.npmjs.com/package/express-session

## Contributing

Feel free to go ahead and do so. I'm very open when it comesto PRs, Issues and Feature Requests.

This project is written in TypeScript and has a very minimal setup and configuration.

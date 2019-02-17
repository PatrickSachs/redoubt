import express from "express";
import spdy from "spdy";
import greenlock from "greenlock-express";
import compression from "compression";
import { EventEmitter } from "events";
import session from "express-session";
import net from "net";
import http from "http";
import https from "https";

type DestroyFunction = (cb?: Function) => HttpOrHttpsServer;
type HttpOrHttpsServer = (http.Server | https.Server) & { destroy?: DestroyFunction };

// enableDestroy(server) is based on https://github.com/isaacs/server-destroy
const enableDestroy = (server0: http.Server | https.Server) => {
  const server: HttpOrHttpsServer = server0 as HttpOrHttpsServer;
  const connections: { [key: string]: net.Socket } = {}

  server.on('connection', function (conn: net.Socket) {
    const key = conn.remoteAddress + ':' + conn.remotePort;
    connections[key] = conn;
    conn.once('close', function () {
      delete connections[key];
    });
  });

  server.destroy = function (cb) {
    server.close(cb);
    for (let key in connections) {
      connections[key].destroy();
    }
    return server;
  };

  return server;
}

class Server extends EventEmitter {
  constructor(options: Partial<IOptions>) {
    super();
    this._options = createDefaultOptions(options);
    this._options.debug && this._options.debug("debug", "Options", this._options);
    this._app = express();
    this.basicSetup();
  }

  private _options: IOptions;
  private _app: express.Express;
  private _server: HttpOrHttpsServer[] = [];
  private _portHttp: number | null = null;
  private _portHttps: number | null = null;

  // ========================================
  // PUBLIC API
  // ========================================

  // Expose express

  public get app() {
    return this._app;
  }

  public get server() {
    return this._server;
  }

  // Lifecycle

  /**
   * Gracefully closes this redoubt server.
   * @param now Should the server be closed now(terminates all active connections) or wait for all active connections to terminate and then shut down?
   */
  public async close(now = false) {
    this._portHttp = null;
    this._portHttps = null;
    const promises: Promise<HttpOrHttpsServer>[] = [];
    for (let server of this._server) {
      const srv = server;
      promises.push(new Promise((resolve, reject) => {
        const callback = (err: any) => err ? reject(err) : resolve(srv);
        if (now && srv.destroy) {
          srv.destroy(callback);
        } else {
          srv.close(callback)
        };
      }));
    }
    this._server = [];
    return await Promise.all(promises);
  }

  /**
   * Starts the server & listens on the given ports.
   * @param https The HTTPS port to run your server on.
   * @param http A HTTP port to also listen to. Simply redirecty to HTTPS. Set to `null` to disable.
   */
  public async listen(https = 443, http: number | null = 80) {
    this._portHttp = http;
    this._portHttps = https;

    return await this.startListening();
  }

  // ========================================
  // PRIVATE FUNCTIONS
  // ========================================

  private emitEvent(event: string) {
    this.emit(event, this);
  }

  private basicSetup() {
    this._app.use(compression({
      filter: (req, res) => {
        if (this._options.isDevelopment) return false;
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      }
    }));
    this._app.use(express.json({ limit: this._options.maxPayloadSize }));
    this._app.use(express.urlencoded({ limit: this._options.maxPayloadSize, extended: true }));
    this._options.staticFiles && this._app.use(this._options.staticFiles.serve, express.static(this._options.staticFiles.from));
    this._app.use(session({
      name: this._options.name,
      cookie: {
        // Prevent reading the session cookie from script
        httpOnly: true,
        // The cookie is only valid for our site.
        sameSite: true,
        // Don't send cookie over HTTP.
        // Use server.app.set("trust proxy", 1); when using a proxy and having problems with cookies.
        secure: this._options.ssl !== "none"
      },
      resave: false,
      // Don't save cookies if nothing has been saved in the session to comply with stricter cookie regulations.
      saveUninitialized: false,
      unset: "destroy",
      secret: this._options.cookieSecret
    }));
  }


  private greenlockOptions() {
    return {
      // It is not allowed to build apps/libraries which do not require the user to explictly accept the greenlock TOS.
      agreeTos: this._options.agreeGreenlockTos,
      version: "draft-11",
      // If development mode contact the staging server. They issue invalid certficates.
      server: this._options.isDevelopment ? "https://acme-staging-v02.api.letsencrypt.org/directory" : "https://acme-v02.api.letsencrypt.org/directory",
      // Let's encrypt requires a valid mail to contact you whenever something is going on with your certs.
      email: this._options.webmasterMail,
      // The domains the certs belong to.
      approveDomains: this._options.domains,
      // Where to save the certs.
      configDir: this._options.letsEncryptCertDirectory,
      // Debug on?
      debug: !!this._options.debug,
      // Sorry, but we'll opt out.
      communityMember: false,
      telemetry: false
    }
  };

  private spdyOptions() {
    return {
      key: typeof this._options.ssl !== "string" ? this._options.ssl.key : "",
      cert: typeof this._options.ssl !== "string" ? this._options.ssl.cert : ""
    }
  }

  private async startListening() {
    this._options.debug && this._options.debug("info", "Going to listen", this._portHttps, this._portHttp);
    this.emitEvent("beforeListen");

    // If we want to also listen to a HTTP fallback port and don't use greenlock(the library already has a
    // fallback mechanism built in) create a second express server that simply redirects everything to HTTPS.
    let fallback: Promise<number | null>;
    if (this._portHttp !== null && this._options.ssl !== "letsEncrypt" && this._options.ssl !== "none") {
      const fallbackServer = express();
      fallbackServer.get("*", (req, res) => res.redirect("https://" + req.headers.host + ":" + this._portHttps + req.url));
      fallback = new Promise((resolve, reject) => this._server.push(enableDestroy(fallbackServer.listen(this._portHttp, (err: any) => err ? reject(err) : resolve(this._portHttp)))));
    } else {
      fallback = Promise.resolve(this._portHttp);
    }

    // Start the HTTPS server. We either use greenlock for Let's Encrypt issued certificates, or spdy for 
    // manually generated certificates.
    let main: Promise<number | null>;
    if (this._options.ssl === "letsEncrypt") {
      if (this._options.isDevelopment) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }
      main = new Promise((resolve, reject) => {
        this._server.push(enableDestroy(greenlock.create({ ...this.greenlockOptions(), app: this._app }).listen(this._portHttp, this._portHttps, (err: any) => err ? reject(err) : resolve(this._portHttps))))
      });
    } else if (this._options.ssl === "none") {
      main = new Promise((resolve, reject) => {
        if (this._portHttp === null) {
          return reject(new Error("Cannot listen on HTTP without HTTP port."));
        }
        this._server.push(enableDestroy(this._app.listen(this._portHttp, (err: any) => err ? reject(err) : resolve(this._portHttp))));
      });
    } else {
      if (this._options.ssl.allowUnsigned || this._options.isDevelopment) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }
      main = new Promise((resolve, reject) => {
        this._server.push(enableDestroy(spdy.createServer(this.spdyOptions(), this._app).listen(this._portHttps, (err: any) => err ? reject(err) : resolve(this._portHttps))))
      });
    }

    await Promise.all([main, fallback]).then(() => {
      this._options.debug && this._options.debug("info", "Listening", this._portHttps, this._portHttp);
      this.emitEvent("listen")
    });
    return this._server;
  }
}

export interface IOptions {
  name: string;
  domains: string[];
  cookieSecret: string;
  webmasterMail: string;

  isDevelopment: boolean;
  ssl: "none" | "letsEncrypt" | { key: string, cert: string, allowUnsigned: boolean };
  letsEncryptCertDirectory: string;
  agreeGreenlockTos: boolean;

  staticFiles: { from: string, serve: string } | null;

  maxPayloadSize: number;
  debug: ((level: string, ...args: any[]) => void) | null;

};

const createDefaultOptions = ({
  debug, isDevelopment, agreeGreenlockTos,
  staticFiles, maxPayloadSize, name, ssl, webmasterMail, domains, letsEncryptCertDirectory, cookieSecret,
}: Partial<IOptions>): IOptions => {

  if (name === undefined) throw new Error("name is required.");
  if (domains === undefined) throw new Error("domains is required.");
  if (cookieSecret === undefined) throw new Error("cookieSecret is required.");
  if (webmasterMail === undefined) throw new Error("webmasterMail is required.");

  return {
    debug: debug === undefined ? defaultDebug : debug,
    isDevelopment: isDevelopment === undefined ? false : isDevelopment,
    agreeGreenlockTos: agreeGreenlockTos === undefined ? false : agreeGreenlockTos,

    staticFiles: staticFiles === undefined ? null : staticFiles,
    maxPayloadSize: maxPayloadSize === undefined ? 100 * 1024 : maxPayloadSize,
    ssl: ssl === undefined ? "letsEncrypt" : ssl,
    letsEncryptCertDirectory: letsEncryptCertDirectory === undefined ? "./.certs/" : letsEncryptCertDirectory,
    name, webmasterMail, domains, cookieSecret
  };
};

const defaultDebug = (level: string, ...args: any[]) => console.log("[" + level + "]", "🏰 ", ...args);

export default Server;

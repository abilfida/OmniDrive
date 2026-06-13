var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  decrypt: () => decrypt,
  decryptOrPassthrough: () => decryptOrPassthrough,
  encrypt: () => encrypt
});
async function getKey(secret) {
  const encoder = new TextEncoder();
  const raw2 = encoder.encode(secret).slice(0, 32);
  const keyBytes = new Uint8Array(32);
  keyBytes.set(raw2);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );
}
async function encrypt(plaintext, secret) {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function decrypt(encoded, secret) {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
async function decryptOrPassthrough(value, secret) {
  try {
    return await decrypt(value, secret);
  } catch {
    return value;
  }
}
var ALGORITHM, IV_LENGTH;
var init_crypto = __esm({
  "src/lib/crypto.ts"() {
    "use strict";
    ALGORITHM = "AES-GCM";
    IV_LENGTH = 12;
  }
});

// src/middleware/rbac.ts
var rbac_exports = {};
__export(rbac_exports, {
  getWorkspaceRole: () => getWorkspaceRole,
  hasPermission: () => hasPermission
});
async function getWorkspaceRole(db, workspaceId, userId) {
  const member = await db.prepare(
    "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?"
  ).bind(workspaceId, userId).first();
  return member ? member.role : null;
}
function hasPermission(role, requiredRole) {
  const levels = {
    "viewer": 1,
    "auditor": 1,
    "commenter": 2,
    "editor": 3,
    "manager": 4,
    "owner": 5
  };
  return (levels[role] || 0) >= levels[requiredRole];
}
var init_rbac = __esm({
  "src/middleware/rbac.ts"() {
    "use strict";
  }
});

// ../../node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// ../../node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// ../../node_modules/hono/dist/utils/body.js
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// ../../node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// ../../node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// ../../node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// ../../node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// ../../node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// ../../node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// ../../node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env2, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env2, "GET")))();
    }
    const path = this.getPath(request, { env: env2 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env2,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// ../../node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// ../../node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// ../../node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// ../../node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// ../../node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// ../../node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// ../../node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// ../../node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// ../../node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        if (opts.credentials) {
          return (origin) => origin || null;
        }
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*" || opts.credentials) {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*" || opts.credentials) {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// src/middleware/cors.ts
function corsMiddleware() {
  return cors({
    origin: (origin, c) => {
      const env2 = c.env;
      const allowed = [env2.FRONTEND_URL];
      if (allowed.includes(origin)) {
        return origin;
      }
      const isDev = env2.FRONTEND_URL?.includes("localhost");
      if (isDev && origin && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin;
      }
      return "";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
    maxAge: 86400
  });
}

// ../../node_modules/hono/dist/helper/factory/index.js
var createMiddleware = (middleware) => middleware;

// src/middleware/security-headers.ts
var securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// src/middleware/csrf-guard.ts
var SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
var CSRF_EXEMPT_PATHS = [
  "/api/auth/google/callback",
  "/api/auth/login",
  "/api/auth/register"
];
function isPublicSharedEndpoint(method, path) {
  const sharedMatch = path.match(/^\/api\/shared\/[^/]+/);
  if (!sharedMatch) return false;
  if (method === "GET") return true;
  if (method === "POST" && path.endsWith("/verify")) return true;
  return false;
}
var csrfGuard = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.includes(c.req.method)) {
    return next();
  }
  const path = new URL(c.req.url).pathname;
  if (CSRF_EXEMPT_PATHS.some((p) => path.startsWith(p))) {
    return next();
  }
  if (isPublicSharedEndpoint(c.req.method, path)) {
    return next();
  }
  const allowedOrigins = [c.env.FRONTEND_URL, c.env.WORKER_URL].filter(Boolean);
  const origin = c.req.header("Origin");
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return c.json({ error: "CSRF validation failed" }, 403);
    }
    return next();
  }
  const referer = c.req.header("Referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        return c.json({ error: "CSRF validation failed" }, 403);
      }
      return next();
    } catch {
      return c.json({ error: "CSRF validation failed" }, 403);
    }
  }
  return c.json({ error: "CSRF validation failed" }, 403);
});

// src/middleware/rate-limiter.ts
var store = /* @__PURE__ */ new Map();
var lastCleanup = Date.now();
var CLEANUP_INTERVAL = 5 * 60 * 1e3;
function cleanup(windowMs) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}
function rateLimiter(opts) {
  return createMiddleware(async (c, next) => {
    cleanup(opts.windowMs);
    const key = opts.keyFn ? opts.keyFn(c) : c.req.header("CF-Connecting-IP") ?? c.req.header("X-Real-IP") ?? "unknown";
    const now = Date.now();
    const entry = store.get(key) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => now - t < opts.windowMs);
    if (entry.timestamps.length >= opts.maxRequests) {
      const retryAfter = Math.ceil(
        (entry.timestamps[0] + opts.windowMs - now) / 1e3
      );
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many requests" }, 429);
    }
    entry.timestamps.push(now);
    store.set(key, entry);
    return next();
  });
}

// src/constants.ts
var DEFAULT_FOLDER_ICON = "\u{1F4C1}";
var DEFAULT_FOLDER_COLOR = "#4A90D9";

// src/types/index.ts
function mapDriveRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    googleAccountId: row.google_account_id,
    email: row.email,
    name: row.name ?? null,
    type: row.type,
    isPrimary: row.is_primary === 1,
    rootFolderId: row.root_folder_id ?? null,
    totalQuota: row.total_quota ?? 0,
    usedQuota: row.used_quota ?? 0,
    quotaUpdatedAt: row.quota_updated_at ?? null,
    createdAt: row.created_at
  };
}
function mapFolderRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentId: row.parent_id ?? null,
    icon: row.icon ?? DEFAULT_FOLDER_ICON,
    color: row.color ?? DEFAULT_FOLDER_COLOR,
    isStarred: row.is_starred === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function mapFileRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    driveAccountId: row.drive_account_id,
    googleFileId: row.google_file_id,
    virtualFolderId: row.workspace_folder_id ?? row.virtual_folder_id ?? null,
    googleParentId: row.google_parent_id ?? null,
    name: row.name,
    mimeType: row.mime_type ?? null,
    size: row.size ?? 0,
    thumbnailUrl: row.thumbnail_url ?? null,
    webViewLink: row.web_view_link ?? null,
    webContentLink: row.web_content_link ?? null,
    isTrashed: row.is_trashed === 1,
    isStarred: row.is_starred === 1,
    googleCreatedAt: row.google_created_at ?? null,
    googleModifiedAt: row.google_modified_at ?? null,
    syncedAt: row.synced_at,
    lastSyncedAt: row.last_synced_at ?? null,
    syncStatus: row.sync_status ?? "idle",
    createdAt: row.created_at
  };
}
function mapDriveFolderRow(row) {
  return {
    id: row.id,
    driveAccountId: row.drive_account_id,
    googleFolderId: row.google_folder_id,
    googleParentId: row.google_parent_id ?? null,
    name: row.name,
    isSynced: row.is_synced === 1,
    syncedAt: row.synced_at ?? null,
    createdAt: row.created_at
  };
}
function mapSharedLinkRow(row) {
  const targetType = row.target_type;
  if (targetType !== "file" && targetType !== "folder") {
    throw new Error(`Invalid target_type: ${targetType}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    targetType,
    targetId: row.target_id,
    targetName: row.targetName ?? void 0,
    passwordHash: row.password_hash ?? null,
    expiresAt: row.expires_at ?? null,
    allowDownloads: Boolean(row.allow_downloads ?? 1),
    allowUploads: Boolean(row.allow_uploads ?? 0),
    maxDownloads: row.max_downloads ?? null,
    requireEmail: Boolean(row.require_email ?? 0),
    webhookUrl: row.webhook_url ?? null,
    viewCount: row.view_count || 0,
    downloadCount: row.download_count || 0,
    createdAt: row.created_at
  };
}
function mapAutomationRuleRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    triggerType: row.trigger_type,
    triggerConfig: typeof row.trigger_config === "string" ? JSON.parse(row.trigger_config) : row.trigger_config || {},
    conditions: typeof row.conditions === "string" ? JSON.parse(row.conditions) : row.conditions || [],
    actions: typeof row.actions === "string" ? JSON.parse(row.actions) : row.actions || [],
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// src/services/google-drive.ts
var DRIVE_API = "https://www.googleapis.com/drive/v3";
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var GoogleDriveError = class extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "GoogleDriveError";
  }
  status;
  data;
};
var GoogleDriveService = class {
  constructor(kv2, clientId, clientSecret, encryptionKey) {
    this.kv = kv2;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.encryptionKey = encryptionKey;
  }
  kv;
  clientId;
  clientSecret;
  encryptionKey;
  // ─── Token Management ───
  async getValidToken(driveAccountId) {
    const raw2 = await this.kv.get(`tokens:${driveAccountId}`) ?? await this.kv.get(`oauth:${driveAccountId}`);
    if (!raw2) {
      throw new Error(`No tokens found for drive ${driveAccountId}`);
    }
    let tokensJson = raw2;
    if (this.encryptionKey) {
      try {
        const { decryptOrPassthrough: decryptOrPassthrough2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
        tokensJson = await decryptOrPassthrough2(raw2, this.encryptionKey);
      } catch {
      }
    }
    const tokens = JSON.parse(tokensJson);
    if (tokens.expiresAt > Date.now() + 6e4) {
      return tokens.accessToken;
    }
    return this.refreshToken(driveAccountId, tokens.refreshToken);
  }
  async refreshToken(driveAccountId, refreshToken) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed for ${driveAccountId}: ${error}`);
    }
    const data = await response.json();
    const newTokens = JSON.stringify({
      accessToken: data.access_token,
      refreshToken,
      expiresAt: Date.now() + data.expires_in * 1e3
    });
    if (this.encryptionKey) {
      const { encrypt: encrypt2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
      const encrypted = await encrypt2(newTokens, this.encryptionKey);
      await this.kv.put(`tokens:${driveAccountId}`, encrypted);
    } else {
      await this.kv.put(`oauth:${driveAccountId}`, newTokens);
    }
    return data.access_token;
  }
  // ─── Quota ───
  async getQuota(driveAccountId) {
    const cached = await this.kv.get(`quota:${driveAccountId}`);
    if (cached) {
      const quota = JSON.parse(cached);
      return { total: quota.total, used: quota.used };
    }
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/about?fields=storageQuota`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch quota: ${await response.text()}`);
    }
    const data = await response.json();
    const total = parseInt(data.storageQuota.limit ?? "0", 10);
    const used = parseInt(data.storageQuota.usage ?? "0", 10);
    await this.kv.put(
      `quota:${driveAccountId}`,
      JSON.stringify({ total, used, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }),
      { expirationTtl: 300 }
    );
    return { total, used };
  }
  // ─── Folder Operations ───
  async createFolder(driveAccountId, name, parentId) {
    const token = await this.getValidToken(driveAccountId);
    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.folder"
    };
    if (parentId) {
      metadata.parents = [parentId];
    }
    const response = await fetch(`${DRIVE_API}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(metadata)
    });
    if (!response.ok) {
      throw new Error(`Failed to create folder: ${await response.text()}`);
    }
    const folder = await response.json();
    return folder.id;
  }
  // ─── Upload ───
  async initiateResumableUpload(driveAccountId, fileName, mimeType, parentFolderId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType
        },
        body: JSON.stringify({
          name: fileName,
          parents: [parentFolderId]
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to initiate upload: ${await response.text()}`);
    }
    const uploadUrl = response.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No upload URL in response");
    }
    return uploadUrl;
  }
  // ─── File Operations ───
  async getFile(driveAccountId, googleFileId) {
    const token = await this.getValidToken(driveAccountId);
    const fields = "id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime";
    const response = await fetch(`${DRIVE_API}/files/${googleFileId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to get file: ${await response.text()}`);
    }
    return response.json();
  }
  async downloadFile(driveAccountId, googleFileId, mimeType) {
    const token = await this.getValidToken(driveAccountId);
    let url = `${DRIVE_API}/files/${googleFileId}?alt=media`;
    let exportedMimeType = void 0;
    let exportedExtension = void 0;
    if (mimeType && mimeType.startsWith("application/vnd.google-apps.")) {
      if (mimeType === "application/vnd.google-apps.spreadsheet") {
        exportedMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        exportedExtension = ".xlsx";
      } else if (mimeType === "application/vnd.google-apps.document") {
        exportedMimeType = "application/pdf";
        exportedExtension = ".pdf";
      } else if (mimeType === "application/vnd.google-apps.presentation") {
        exportedMimeType = "application/pdf";
        exportedExtension = ".pdf";
      } else {
        exportedMimeType = "application/pdf";
        exportedExtension = ".pdf";
      }
      url = `${DRIVE_API}/files/${googleFileId}/export?mimeType=${exportedMimeType}`;
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to download file: ${await response.text()}`);
    }
    if (!response.body) {
      throw new Error("Response body is null");
    }
    return {
      stream: response.body,
      exportedMimeType,
      exportedExtension
    };
  }
  async deleteFile(driveAccountId, googleFileId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${googleFileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete file: ${await response.text()}`);
    }
  }
  async renameFile(driveAccountId, googleFileId, newName) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${googleFileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: newName })
    });
    if (!response.ok) {
      throw new Error(`Failed to rename file: ${await response.text()}`);
    }
  }
  // ─── Move To Another Drive Operations ───
  async shareFile(driveAccountId, fileId, emailAddress, role = "writer", type = "user") {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${fileId}/permissions?sendNotificationEmail=false`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role, type, emailAddress })
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
      }
      throw new GoogleDriveError(response.status, `Failed to share file: ${errorText}`, errorData);
    }
    const data = await response.json();
    return data.id;
  }
  async revokeShare(driveAccountId, fileId, permissionId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${fileId}/permissions/${permissionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
      }
      throw new GoogleDriveError(response.status, `Failed to revoke share: ${errorText}`, errorData);
    }
  }
  async copyFile(driveAccountId, fileId) {
    const token = await this.getValidToken(driveAccountId);
    const fields = "id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime";
    const response = await fetch(`${DRIVE_API}/files/${fileId}/copy?fields=${fields}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
      }
      throw new GoogleDriveError(response.status, `Failed to copy file: ${errorText}`, errorData);
    }
    return response.json();
  }
  async trashFile(driveAccountId, fileId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ trashed: true })
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
      }
      throw new GoogleDriveError(response.status, `Failed to trash file: ${errorText}`, errorData);
    }
  }
  async untrashFile(driveAccountId, fileId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ trashed: false })
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
      }
      throw new GoogleDriveError(response.status, `Failed to untrash file: ${errorText}`, errorData);
    }
  }
  // ─── Changes API (for sync) ───
  async getStartPageToken(driveAccountId) {
    const token = await this.getValidToken(driveAccountId);
    const response = await fetch(`${DRIVE_API}/changes/startPageToken`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to get start page token: ${await response.text()}`);
    }
    const data = await response.json();
    return data.startPageToken;
  }
  async listChanges(driveAccountId, pageToken) {
    const token = await this.getValidToken(driveAccountId);
    const fields = "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,parents,trashed,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime))";
    const response = await fetch(
      `${DRIVE_API}/changes?pageToken=${encodeURIComponent(pageToken)}&fields=${fields}&spaces=drive&includeRemoved=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new Error(`Failed to list changes: ${await response.text()}`);
    }
    return response.json();
  }
  async listFilesInFolder(driveAccountId, folderId) {
    const token = await this.getValidToken(driveAccountId);
    const fields = "files(id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime)";
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const allFiles = [];
    let pageToken;
    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,${fields}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Failed to list files: ${await response.text()}`);
      }
      const data = await response.json();
      allFiles.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return allFiles;
  }
  // ─── Full Folder Contents (files + subfolders) ───
  async listFolderContents(driveAccountId, folderId) {
    const token = await this.getValidToken(driveAccountId);
    const fields = "nextPageToken,files(id,name,mimeType,size,parents,trashed,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime)";
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const allFiles = [];
    const allFolders = [];
    let pageToken;
    do {
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,${fields}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Failed to list folder contents: ${await response.text()}`);
      }
      const data = await response.json();
      for (const item of data.files) {
        if (item.mimeType === "application/vnd.google-apps.folder") {
          allFolders.push({ id: item.id, name: item.name, parents: item.parents });
        } else if (item.mimeType !== "application/vnd.google-apps.shortcut") {
          allFiles.push(item);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return { files: allFiles, folders: allFolders };
  }
};

// src/lib/id.ts
function generateId() {
  return crypto.randomUUID();
}

// src/services/sync.ts
async function syncDriveFolder(_env, _driveId, _folderId, _userId) {
}
async function syncDriveAccount(drive, db, _kv, driveService) {
  await db.prepare("UPDATE sync_state SET status = 'syncing', error_message = NULL WHERE drive_account_id = ?").bind(drive.id).run();
  try {
    const syncState = await db.prepare("SELECT * FROM sync_state WHERE drive_account_id = ?").bind(drive.id).first();
    let changeToken = syncState?.change_token;
    if (!changeToken) {
      await performInitialSync(drive, db, driveService);
      changeToken = await driveService.getStartPageToken(drive.id);
    } else {
      changeToken = await performIncrementalSync(drive, db, changeToken, driveService);
    }
    await db.prepare(
      "UPDATE sync_state SET change_token = ?, last_synced_at = datetime('now'), status = 'idle' WHERE drive_account_id = ?"
    ).bind(changeToken, drive.id).run();
    try {
      await driveService.getQuota(drive.id);
    } catch {
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Sync failed for ${drive.email}:`, message);
    await db.prepare("UPDATE sync_state SET status = 'error', error_message = ? WHERE drive_account_id = ?").bind(message, drive.id).run();
  }
}
async function performInitialSync(drive, db, driveService) {
  console.log(`Initial sync for ${drive.email} \u2014 crawling Drive root`);
  const { files, folders } = await driveService.listFolderContents(drive.id, "root");
  for (const folder of folders) {
    await upsertDriveFolder(db, drive, folder, null);
  }
  for (const file of files) {
    await upsertFile(db, drive, file, "root");
  }
}
async function performIncrementalSync(drive, db, pageToken, driveService) {
  console.log(`Incremental sync for ${drive.email} from token ${pageToken}`);
  let currentToken = pageToken;
  let hasMore = true;
  while (hasMore) {
    const response = await driveService.listChanges(drive.id, currentToken);
    for (const change of response.changes) {
      const isFolder = change.file?.mimeType === "application/vnd.google-apps.folder";
      if (change.removed || change.file?.trashed) {
        if (isFolder) {
          await db.prepare("DELETE FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?").bind(drive.id, change.fileId).run();
        } else {
          await db.prepare("DELETE FROM files WHERE drive_account_id = ? AND google_file_id = ?").bind(drive.id, change.fileId).run();
        }
        continue;
      }
      const file = change.file;
      if (!file) continue;
      if (file.mimeType === "application/vnd.google-apps.shortcut") continue;
      const parentId = file.parents?.[0] ?? null;
      if (isFolder) {
        await upsertDriveFolder(db, drive, { id: file.id, name: file.name, parents: file.parents }, parentId);
      } else {
        await upsertFile(db, drive, file, parentId ?? "root");
      }
    }
    if (response.newStartPageToken) {
      return response.newStartPageToken;
    }
    if (response.nextPageToken) {
      currentToken = response.nextPageToken;
    } else {
      hasMore = false;
    }
  }
  return currentToken;
}
async function upsertDriveFolder(db, drive, folder, googleParentId) {
  const existing = await db.prepare("SELECT id FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?").bind(drive.id, folder.id).first();
  if (existing) {
    await db.prepare("UPDATE drive_folders SET name = ?, google_parent_id = ? WHERE id = ?").bind(folder.name, googleParentId, existing.id).run();
  } else {
    const folderId = generateId();
    await db.prepare(
      `INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced)
         VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(folderId, drive.id, folder.id, googleParentId, folder.name).run();
  }
}
async function upsertFile(db, drive, file, googleParentId) {
  const existing = await db.prepare("SELECT id FROM files WHERE drive_account_id = ? AND google_file_id = ?").bind(drive.id, file.id).first();
  if (existing) {
    await db.prepare(
      `UPDATE files
         SET name = ?, mime_type = ?, size = ?, thumbnail_url = ?, web_view_link = ?,
             web_content_link = ?, google_modified_at = ?, google_parent_id = ?,
             synced_at = datetime('now')
         WHERE id = ?`
    ).bind(
      file.name,
      file.mimeType,
      parseInt(file.size ?? "0", 10),
      file.thumbnailLink ?? null,
      file.webViewLink ?? null,
      file.webContentLink ?? null,
      file.modifiedTime,
      googleParentId,
      existing.id
    ).run();
  } else {
    const fileId = generateId();
    await db.prepare(
      `INSERT INTO files
           (id, user_id, drive_account_id, google_file_id, google_parent_id, name, mime_type, size,
            thumbnail_url, web_view_link, web_content_link, google_created_at, google_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fileId,
      drive.userId,
      drive.id,
      file.id,
      googleParentId,
      file.name,
      file.mimeType,
      parseInt(file.size ?? "0", 10),
      file.thumbnailLink ?? null,
      file.webViewLink ?? null,
      file.webContentLink ?? null,
      file.createdTime,
      file.modifiedTime
    ).run();
  }
}
async function runScheduledSync(env2) {
  const driveService = new GoogleDriveService(env2.KV, env2.GOOGLE_CLIENT_ID, env2.GOOGLE_CLIENT_SECRET, env2.TOKEN_ENCRYPTION_KEY);
  const rows = await env2.DB.prepare("SELECT * FROM drive_accounts WHERE type = 'oauth'").all();
  const driveAccounts = (rows.results ?? []).map(mapDriveRow);
  console.log(`Syncing ${driveAccounts.length} drive accounts`);
  await Promise.allSettled(
    driveAccounts.map(
      (drive) => syncDriveAccount(drive, env2.DB, env2.KV, driveService).catch((err) => {
        console.error(`Sync error for ${drive.email}:`, err);
      })
    )
  );
}

// src/services/audit.service.ts
var AuditService = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async logEvent(params) {
    const id = generateId();
    await this.db.prepare(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action_type, resource_id, resource_name, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      params.workspaceId,
      params.actorId,
      params.actionType,
      params.resourceId || null,
      params.resourceName || null,
      params.metadata ? JSON.stringify(params.metadata) : null
    ).run();
  }
  async cleanupOldLogs(daysToKeep = 30) {
    await this.db.prepare(
      `DELETE FROM audit_logs WHERE created_at < datetime('now', '-' || ? || ' days')`
    ).bind(daysToKeep).run();
  }
};

// src/services/policy.service.ts
var PolicyService = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async checkQuota(workspaceId, incomingBytes) {
    const workspace = await this.db.prepare("SELECT used_bytes FROM workspaces WHERE id = ?").bind(workspaceId).first();
    if (!workspace) return false;
    const policy = await this.db.prepare(
      `SELECT config FROM workspace_policies 
       WHERE workspace_id = ? AND policy_type = 'storage_quota'`
    ).bind(workspaceId).first();
    if (!policy) return true;
    const config = JSON.parse(policy.config);
    return workspace.used_bytes + incomingBytes <= config.max_bytes;
  }
  async checkRetentionProtection(folderId) {
    const policy = await this.db.prepare(
      `SELECT p.config 
       FROM workspace_policies p
       JOIN workspace_folders f ON f.workspace_id = p.workspace_id
       WHERE f.id = ? AND p.policy_type = 'data_retention'
         AND (p.target_type = 'workspace' OR (p.target_type = 'folder' AND p.target_id = ?))`
    ).bind(folderId, folderId).first();
    if (!policy) return false;
    const config = JSON.parse(policy.config);
    return config.action === "prevent_deletion";
  }
  async updateWorkspaceStorage(workspaceId, sizeDelta) {
    await this.db.prepare("UPDATE workspaces SET used_bytes = COALESCE(used_bytes, 0) + ? WHERE id = ?").bind(sizeDelta, workspaceId).run();
  }
  async processAutoDeleteRetentionPolicies(googleClientId, googleClientSecret, kv2) {
    const { results: policies } = await this.db.prepare(
      `SELECT * FROM workspace_policies WHERE policy_type = 'data_retention' AND json_extract(config, '$.action') = 'auto_delete'`
    ).all();
    for (const policy of policies) {
      const config = JSON.parse(policy.config);
      const cutoffDate = /* @__PURE__ */ new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.days);
      const cutoffStr = cutoffDate.toISOString();
      let query = "";
      let binds = [];
      if (policy.target_type === "workspace") {
        query = `SELECT f.id, f.user_id, f.google_file_id, f.size, f.workspace_id, d.id as driveId 
                 FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
                 WHERE f.workspace_id = ? AND f.created_at < ?`;
        binds = [policy.workspace_id, cutoffStr];
      } else {
        query = `SELECT f.id, f.user_id, f.google_file_id, f.size, f.workspace_id, d.id as driveId 
                 FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
                 WHERE f.workspace_id = ? AND f.workspace_folder_id = ? AND f.created_at < ?`;
        binds = [policy.workspace_id, policy.target_id, cutoffStr];
      }
      const { results: expiredFiles } = await this.db.prepare(query).bind(...binds).all();
      if (expiredFiles.length > 0) {
        for (const file of expiredFiles) {
          await this.db.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
          await this.updateWorkspaceStorage(file.workspace_id, -file.size);
        }
      }
    }
  }
};

// ../../node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = (value) => {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const charCode = value.charCodeAt(start);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    start++;
  }
  while (end > start) {
    const charCode = value.charCodeAt(end - 1);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    end--;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
};
var parse = (cookie, name) => {
  if (name && cookie.indexOf(name) === -1) {
    return {};
  }
  const pairs = cookie.split(";");
  const parsedCookie = /* @__PURE__ */ Object.create(null);
  for (const pairStr of pairs) {
    const valueStartPos = pairStr.indexOf("=");
    if (valueStartPos === -1) {
      continue;
    }
    const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
    if (name && name !== cookieName || !validCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) {
      continue;
    }
    let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
    if (cookieValue.startsWith('"') && cookieValue.endsWith('"')) {
      cookieValue = cookieValue.slice(1, -1);
    }
    if (validCookieValueRegEx.test(cookieValue)) {
      parsedCookie[cookieName] = cookieValue.indexOf("%") !== -1 ? tryDecode(cookieValue, decodeURIComponent_) : cookieValue;
      if (name) {
        break;
      }
    }
  }
  return parsedCookie;
};
var _serialize = (name, value, opt = {}) => {
  if (!validCookieNameRegEx.test(name)) {
    throw new Error("Invalid cookie name");
  }
  let cookie = `${name}=${value}`;
  if (name.startsWith("__Secure-") && !opt.secure) {
    throw new Error("__Secure- Cookie must have Secure attributes");
  }
  if (name.startsWith("__Host-")) {
    if (!opt.secure) {
      throw new Error("__Host- Cookie must have Secure attributes");
    }
    if (opt.path !== "/") {
      throw new Error('__Host- Cookie must have Path attributes with "/"');
    }
    if (opt.domain) {
      throw new Error("__Host- Cookie must not have Domain attributes");
    }
  }
  for (const key of ["domain", "path", "sameSite", "priority"]) {
    if (opt[key] && /[;\r\n]/.test(opt[key])) {
      throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
    }
  }
  if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
    if (opt.maxAge > 3456e4) {
      throw new Error(
        "Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration."
      );
    }
    cookie += `; Max-Age=${opt.maxAge | 0}`;
  }
  if (opt.domain && opt.prefix !== "host") {
    cookie += `; Domain=${opt.domain}`;
  }
  if (opt.path) {
    cookie += `; Path=${opt.path}`;
  }
  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 3456e7) {
      throw new Error(
        "Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future."
      );
    }
    cookie += `; Expires=${opt.expires.toUTCString()}`;
  }
  if (opt.httpOnly) {
    cookie += "; HttpOnly";
  }
  if (opt.secure) {
    cookie += "; Secure";
  }
  if (opt.sameSite) {
    cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
  }
  if (opt.priority) {
    cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
  }
  if (opt.partitioned) {
    if (!opt.secure) {
      throw new Error("Partitioned Cookie must have Secure attributes");
    }
    cookie += "; Partitioned";
  }
  return cookie;
};
var serialize = (name, value, opt) => {
  value = encodeURIComponent(value);
  return _serialize(name, value, opt);
};

// ../../node_modules/hono/dist/helper/cookie/index.js
var getCookie = (c, key, prefix) => {
  const cookie = c.req.raw.headers.get("Cookie");
  if (typeof key === "string") {
    if (!cookie) {
      return void 0;
    }
    let finalKey = key;
    if (prefix === "secure") {
      finalKey = "__Secure-" + key;
    } else if (prefix === "host") {
      finalKey = "__Host-" + key;
    }
    const obj2 = parse(cookie, finalKey);
    return obj2[finalKey];
  }
  if (!cookie) {
    return {};
  }
  const obj = parse(cookie);
  return obj;
};
var generateCookie = (name, value, opt) => {
  let cookie;
  if (opt?.prefix === "secure") {
    cookie = serialize("__Secure-" + name, value, { path: "/", ...opt, secure: true });
  } else if (opt?.prefix === "host") {
    cookie = serialize("__Host-" + name, value, {
      ...opt,
      path: "/",
      secure: true,
      domain: void 0
    });
  } else {
    cookie = serialize(name, value, { path: "/", ...opt });
  }
  return cookie;
};
var setCookie = (c, name, value, opt) => {
  const cookie = generateCookie(name, value, opt);
  c.header("Set-Cookie", cookie, { append: true });
};
var deleteCookie = (c, name, opt) => {
  const deletedCookie = getCookie(c, name, opt?.prefix);
  setCookie(c, name, "", { ...opt, maxAge: 0 });
  return deletedCookie;
};

// ../../node_modules/bcryptjs/index.js
var import_crypto = __toESM(require("crypto"), 1);
var randomFallback = null;
function randomBytes(len) {
  try {
    return crypto.getRandomValues(new Uint8Array(len));
  } catch {
  }
  try {
    return import_crypto.default.randomBytes(len);
  } catch {
  }
  if (!randomFallback) {
    throw Error(
      "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
    );
  }
  return randomFallback(len);
}
function genSaltSync(rounds, seed_length) {
  rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof rounds !== "number")
    throw Error(
      "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
    );
  if (rounds < 4) rounds = 4;
  else if (rounds > 31) rounds = 31;
  var salt = [];
  salt.push("$2b$");
  if (rounds < 10) salt.push("0");
  salt.push(rounds.toString());
  salt.push("$");
  salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
  return salt.join("");
}
function genSalt(rounds, seed_length, callback) {
  if (typeof seed_length === "function")
    callback = seed_length, seed_length = void 0;
  if (typeof rounds === "function") callback = rounds, rounds = void 0;
  if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
  else if (typeof rounds !== "number")
    throw Error("illegal arguments: " + typeof rounds);
  function _async(callback2) {
    nextTick(function() {
      try {
        callback2(null, genSaltSync(rounds));
      } catch (err) {
        callback2(err);
      }
    });
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function hash(password, salt, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password === "string" && typeof salt === "number")
      genSalt(salt, function(err, salt2) {
        _hash(password, salt2, callback2, progressCallback);
      });
    else if (typeof password === "string" && typeof salt === "string")
      _hash(password, salt, callback2, progressCallback);
    else
      nextTick(
        callback2.bind(
          this,
          Error("Illegal arguments: " + typeof password + ", " + typeof salt)
        )
      );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function safeStringCompare(known, unknown) {
  var diff = known.length ^ unknown.length;
  for (var i = 0; i < known.length; ++i) {
    diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
  }
  return diff === 0;
}
function compare(password, hashValue, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password !== "string" || typeof hashValue !== "string") {
      nextTick(
        callback2.bind(
          this,
          Error(
            "Illegal arguments: " + typeof password + ", " + typeof hashValue
          )
        )
      );
      return;
    }
    if (hashValue.length !== 60) {
      nextTick(callback2.bind(this, null, false));
      return;
    }
    hash(
      password,
      hashValue.substring(0, 29),
      function(err, comp) {
        if (err) callback2(err);
        else callback2(null, safeStringCompare(comp, hashValue));
      },
      progressCallback
    );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
var nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
function utf8Length(string) {
  var len = 0, c = 0;
  for (var i = 0; i < string.length; ++i) {
    c = string.charCodeAt(i);
    if (c < 128) len += 1;
    else if (c < 2048) len += 2;
    else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
      ++i;
      len += 4;
    } else len += 3;
  }
  return len;
}
function utf8Array(string) {
  var offset = 0, c1, c2;
  var buffer = new Array(utf8Length(string));
  for (var i = 0, k = string.length; i < k; ++i) {
    c1 = string.charCodeAt(i);
    if (c1 < 128) {
      buffer[offset++] = c1;
    } else if (c1 < 2048) {
      buffer[offset++] = c1 >> 6 | 192;
      buffer[offset++] = c1 & 63 | 128;
    } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
      c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
      ++i;
      buffer[offset++] = c1 >> 18 | 240;
      buffer[offset++] = c1 >> 12 & 63 | 128;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    } else {
      buffer[offset++] = c1 >> 12 | 224;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    }
  }
  return buffer;
}
var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
var BASE64_INDEX = [
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  1,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  -1,
  -1,
  -1,
  -1,
  -1
];
function base64_encode(b, len) {
  var off = 0, rs = [], c1, c2;
  if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
  while (off < len) {
    c1 = b[off++] & 255;
    rs.push(BASE64_CODE[c1 >> 2 & 63]);
    c1 = (c1 & 3) << 4;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 4 & 15;
    rs.push(BASE64_CODE[c1 & 63]);
    c1 = (c2 & 15) << 2;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 6 & 3;
    rs.push(BASE64_CODE[c1 & 63]);
    rs.push(BASE64_CODE[c2 & 63]);
  }
  return rs.join("");
}
function base64_decode(s, len) {
  var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
  if (len <= 0) throw Error("Illegal len: " + len);
  while (off < slen - 1 && olen < len) {
    code = s.charCodeAt(off++);
    c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    code = s.charCodeAt(off++);
    c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c1 == -1 || c2 == -1) break;
    o = c1 << 2 >>> 0;
    o |= (c2 & 48) >> 4;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c3 == -1) break;
    o = (c2 & 15) << 4 >>> 0;
    o |= (c3 & 60) >> 2;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    o = (c3 & 3) << 6 >>> 0;
    o |= c4;
    rs.push(String.fromCharCode(o));
    ++olen;
  }
  var res = [];
  for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
  return res;
}
var BCRYPT_SALT_LEN = 16;
var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
var BLOWFISH_NUM_ROUNDS = 16;
var MAX_EXECUTION_TIME = 100;
var P_ORIG = [
  608135816,
  2242054355,
  320440878,
  57701188,
  2752067618,
  698298832,
  137296536,
  3964562569,
  1160258022,
  953160567,
  3193202383,
  887688300,
  3232508343,
  3380367581,
  1065670069,
  3041331479,
  2450970073,
  2306472731
];
var S_ORIG = [
  3509652390,
  2564797868,
  805139163,
  3491422135,
  3101798381,
  1780907670,
  3128725573,
  4046225305,
  614570311,
  3012652279,
  134345442,
  2240740374,
  1667834072,
  1901547113,
  2757295779,
  4103290238,
  227898511,
  1921955416,
  1904987480,
  2182433518,
  2069144605,
  3260701109,
  2620446009,
  720527379,
  3318853667,
  677414384,
  3393288472,
  3101374703,
  2390351024,
  1614419982,
  1822297739,
  2954791486,
  3608508353,
  3174124327,
  2024746970,
  1432378464,
  3864339955,
  2857741204,
  1464375394,
  1676153920,
  1439316330,
  715854006,
  3033291828,
  289532110,
  2706671279,
  2087905683,
  3018724369,
  1668267050,
  732546397,
  1947742710,
  3462151702,
  2609353502,
  2950085171,
  1814351708,
  2050118529,
  680887927,
  999245976,
  1800124847,
  3300911131,
  1713906067,
  1641548236,
  4213287313,
  1216130144,
  1575780402,
  4018429277,
  3917837745,
  3693486850,
  3949271944,
  596196993,
  3549867205,
  258830323,
  2213823033,
  772490370,
  2760122372,
  1774776394,
  2652871518,
  566650946,
  4142492826,
  1728879713,
  2882767088,
  1783734482,
  3629395816,
  2517608232,
  2874225571,
  1861159788,
  326777828,
  3124490320,
  2130389656,
  2716951837,
  967770486,
  1724537150,
  2185432712,
  2364442137,
  1164943284,
  2105845187,
  998989502,
  3765401048,
  2244026483,
  1075463327,
  1455516326,
  1322494562,
  910128902,
  469688178,
  1117454909,
  936433444,
  3490320968,
  3675253459,
  1240580251,
  122909385,
  2157517691,
  634681816,
  4142456567,
  3825094682,
  3061402683,
  2540495037,
  79693498,
  3249098678,
  1084186820,
  1583128258,
  426386531,
  1761308591,
  1047286709,
  322548459,
  995290223,
  1845252383,
  2603652396,
  3431023940,
  2942221577,
  3202600964,
  3727903485,
  1712269319,
  422464435,
  3234572375,
  1170764815,
  3523960633,
  3117677531,
  1434042557,
  442511882,
  3600875718,
  1076654713,
  1738483198,
  4213154764,
  2393238008,
  3677496056,
  1014306527,
  4251020053,
  793779912,
  2902807211,
  842905082,
  4246964064,
  1395751752,
  1040244610,
  2656851899,
  3396308128,
  445077038,
  3742853595,
  3577915638,
  679411651,
  2892444358,
  2354009459,
  1767581616,
  3150600392,
  3791627101,
  3102740896,
  284835224,
  4246832056,
  1258075500,
  768725851,
  2589189241,
  3069724005,
  3532540348,
  1274779536,
  3789419226,
  2764799539,
  1660621633,
  3471099624,
  4011903706,
  913787905,
  3497959166,
  737222580,
  2514213453,
  2928710040,
  3937242737,
  1804850592,
  3499020752,
  2949064160,
  2386320175,
  2390070455,
  2415321851,
  4061277028,
  2290661394,
  2416832540,
  1336762016,
  1754252060,
  3520065937,
  3014181293,
  791618072,
  3188594551,
  3933548030,
  2332172193,
  3852520463,
  3043980520,
  413987798,
  3465142937,
  3030929376,
  4245938359,
  2093235073,
  3534596313,
  375366246,
  2157278981,
  2479649556,
  555357303,
  3870105701,
  2008414854,
  3344188149,
  4221384143,
  3956125452,
  2067696032,
  3594591187,
  2921233993,
  2428461,
  544322398,
  577241275,
  1471733935,
  610547355,
  4027169054,
  1432588573,
  1507829418,
  2025931657,
  3646575487,
  545086370,
  48609733,
  2200306550,
  1653985193,
  298326376,
  1316178497,
  3007786442,
  2064951626,
  458293330,
  2589141269,
  3591329599,
  3164325604,
  727753846,
  2179363840,
  146436021,
  1461446943,
  4069977195,
  705550613,
  3059967265,
  3887724982,
  4281599278,
  3313849956,
  1404054877,
  2845806497,
  146425753,
  1854211946,
  1266315497,
  3048417604,
  3681880366,
  3289982499,
  290971e4,
  1235738493,
  2632868024,
  2414719590,
  3970600049,
  1771706367,
  1449415276,
  3266420449,
  422970021,
  1963543593,
  2690192192,
  3826793022,
  1062508698,
  1531092325,
  1804592342,
  2583117782,
  2714934279,
  4024971509,
  1294809318,
  4028980673,
  1289560198,
  2221992742,
  1669523910,
  35572830,
  157838143,
  1052438473,
  1016535060,
  1802137761,
  1753167236,
  1386275462,
  3080475397,
  2857371447,
  1040679964,
  2145300060,
  2390574316,
  1461121720,
  2956646967,
  4031777805,
  4028374788,
  33600511,
  2920084762,
  1018524850,
  629373528,
  3691585981,
  3515945977,
  2091462646,
  2486323059,
  586499841,
  988145025,
  935516892,
  3367335476,
  2599673255,
  2839830854,
  265290510,
  3972581182,
  2759138881,
  3795373465,
  1005194799,
  847297441,
  406762289,
  1314163512,
  1332590856,
  1866599683,
  4127851711,
  750260880,
  613907577,
  1450815602,
  3165620655,
  3734664991,
  3650291728,
  3012275730,
  3704569646,
  1427272223,
  778793252,
  1343938022,
  2676280711,
  2052605720,
  1946737175,
  3164576444,
  3914038668,
  3967478842,
  3682934266,
  1661551462,
  3294938066,
  4011595847,
  840292616,
  3712170807,
  616741398,
  312560963,
  711312465,
  1351876610,
  322626781,
  1910503582,
  271666773,
  2175563734,
  1594956187,
  70604529,
  3617834859,
  1007753275,
  1495573769,
  4069517037,
  2549218298,
  2663038764,
  504708206,
  2263041392,
  3941167025,
  2249088522,
  1514023603,
  1998579484,
  1312622330,
  694541497,
  2582060303,
  2151582166,
  1382467621,
  776784248,
  2618340202,
  3323268794,
  2497899128,
  2784771155,
  503983604,
  4076293799,
  907881277,
  423175695,
  432175456,
  1378068232,
  4145222326,
  3954048622,
  3938656102,
  3820766613,
  2793130115,
  2977904593,
  26017576,
  3274890735,
  3194772133,
  1700274565,
  1756076034,
  4006520079,
  3677328699,
  720338349,
  1533947780,
  354530856,
  688349552,
  3973924725,
  1637815568,
  332179504,
  3949051286,
  53804574,
  2852348879,
  3044236432,
  1282449977,
  3583942155,
  3416972820,
  4006381244,
  1617046695,
  2628476075,
  3002303598,
  1686838959,
  431878346,
  2686675385,
  1700445008,
  1080580658,
  1009431731,
  832498133,
  3223435511,
  2605976345,
  2271191193,
  2516031870,
  1648197032,
  4164389018,
  2548247927,
  300782431,
  375919233,
  238389289,
  3353747414,
  2531188641,
  2019080857,
  1475708069,
  455242339,
  2609103871,
  448939670,
  3451063019,
  1395535956,
  2413381860,
  1841049896,
  1491858159,
  885456874,
  4264095073,
  4001119347,
  1565136089,
  3898914787,
  1108368660,
  540939232,
  1173283510,
  2745871338,
  3681308437,
  4207628240,
  3343053890,
  4016749493,
  1699691293,
  1103962373,
  3625875870,
  2256883143,
  3830138730,
  1031889488,
  3479347698,
  1535977030,
  4236805024,
  3251091107,
  2132092099,
  1774941330,
  1199868427,
  1452454533,
  157007616,
  2904115357,
  342012276,
  595725824,
  1480756522,
  206960106,
  497939518,
  591360097,
  863170706,
  2375253569,
  3596610801,
  1814182875,
  2094937945,
  3421402208,
  1082520231,
  3463918190,
  2785509508,
  435703966,
  3908032597,
  1641649973,
  2842273706,
  3305899714,
  1510255612,
  2148256476,
  2655287854,
  3276092548,
  4258621189,
  236887753,
  3681803219,
  274041037,
  1734335097,
  3815195456,
  3317970021,
  1899903192,
  1026095262,
  4050517792,
  356393447,
  2410691914,
  3873677099,
  3682840055,
  3913112168,
  2491498743,
  4132185628,
  2489919796,
  1091903735,
  1979897079,
  3170134830,
  3567386728,
  3557303409,
  857797738,
  1136121015,
  1342202287,
  507115054,
  2535736646,
  337727348,
  3213592640,
  1301675037,
  2528481711,
  1895095763,
  1721773893,
  3216771564,
  62756741,
  2142006736,
  835421444,
  2531993523,
  1442658625,
  3659876326,
  2882144922,
  676362277,
  1392781812,
  170690266,
  3921047035,
  1759253602,
  3611846912,
  1745797284,
  664899054,
  1329594018,
  3901205900,
  3045908486,
  2062866102,
  2865634940,
  3543621612,
  3464012697,
  1080764994,
  553557557,
  3656615353,
  3996768171,
  991055499,
  499776247,
  1265440854,
  648242737,
  3940784050,
  980351604,
  3713745714,
  1749149687,
  3396870395,
  4211799374,
  3640570775,
  1161844396,
  3125318951,
  1431517754,
  545492359,
  4268468663,
  3499529547,
  1437099964,
  2702547544,
  3433638243,
  2581715763,
  2787789398,
  1060185593,
  1593081372,
  2418618748,
  4260947970,
  69676912,
  2159744348,
  86519011,
  2512459080,
  3838209314,
  1220612927,
  3339683548,
  133810670,
  1090789135,
  1078426020,
  1569222167,
  845107691,
  3583754449,
  4072456591,
  1091646820,
  628848692,
  1613405280,
  3757631651,
  526609435,
  236106946,
  48312990,
  2942717905,
  3402727701,
  1797494240,
  859738849,
  992217954,
  4005476642,
  2243076622,
  3870952857,
  3732016268,
  765654824,
  3490871365,
  2511836413,
  1685915746,
  3888969200,
  1414112111,
  2273134842,
  3281911079,
  4080962846,
  172450625,
  2569994100,
  980381355,
  4109958455,
  2819808352,
  2716589560,
  2568741196,
  3681446669,
  3329971472,
  1835478071,
  660984891,
  3704678404,
  4045999559,
  3422617507,
  3040415634,
  1762651403,
  1719377915,
  3470491036,
  2693910283,
  3642056355,
  3138596744,
  1364962596,
  2073328063,
  1983633131,
  926494387,
  3423689081,
  2150032023,
  4096667949,
  1749200295,
  3328846651,
  309677260,
  2016342300,
  1779581495,
  3079819751,
  111262694,
  1274766160,
  443224088,
  298511866,
  1025883608,
  3806446537,
  1145181785,
  168956806,
  3641502830,
  3584813610,
  1689216846,
  3666258015,
  3200248200,
  1692713982,
  2646376535,
  4042768518,
  1618508792,
  1610833997,
  3523052358,
  4130873264,
  2001055236,
  3610705100,
  2202168115,
  4028541809,
  2961195399,
  1006657119,
  2006996926,
  3186142756,
  1430667929,
  3210227297,
  1314452623,
  4074634658,
  4101304120,
  2273951170,
  1399257539,
  3367210612,
  3027628629,
  1190975929,
  2062231137,
  2333990788,
  2221543033,
  2438960610,
  1181637006,
  548689776,
  2362791313,
  3372408396,
  3104550113,
  3145860560,
  296247880,
  1970579870,
  3078560182,
  3769228297,
  1714227617,
  3291629107,
  3898220290,
  166772364,
  1251581989,
  493813264,
  448347421,
  195405023,
  2709975567,
  677966185,
  3703036547,
  1463355134,
  2715995803,
  1338867538,
  1343315457,
  2802222074,
  2684532164,
  233230375,
  2599980071,
  2000651841,
  3277868038,
  1638401717,
  4028070440,
  3237316320,
  6314154,
  819756386,
  300326615,
  590932579,
  1405279636,
  3267499572,
  3150704214,
  2428286686,
  3959192993,
  3461946742,
  1862657033,
  1266418056,
  963775037,
  2089974820,
  2263052895,
  1917689273,
  448879540,
  3550394620,
  3981727096,
  150775221,
  3627908307,
  1303187396,
  508620638,
  2975983352,
  2726630617,
  1817252668,
  1876281319,
  1457606340,
  908771278,
  3720792119,
  3617206836,
  2455994898,
  1729034894,
  1080033504,
  976866871,
  3556439503,
  2881648439,
  1522871579,
  1555064734,
  1336096578,
  3548522304,
  2579274686,
  3574697629,
  3205460757,
  3593280638,
  3338716283,
  3079412587,
  564236357,
  2993598910,
  1781952180,
  1464380207,
  3163844217,
  3332601554,
  1699332808,
  1393555694,
  1183702653,
  3581086237,
  1288719814,
  691649499,
  2847557200,
  2895455976,
  3193889540,
  2717570544,
  1781354906,
  1676643554,
  2592534050,
  3230253752,
  1126444790,
  2770207658,
  2633158820,
  2210423226,
  2615765581,
  2414155088,
  3127139286,
  673620729,
  2805611233,
  1269405062,
  4015350505,
  3341807571,
  4149409754,
  1057255273,
  2012875353,
  2162469141,
  2276492801,
  2601117357,
  993977747,
  3918593370,
  2654263191,
  753973209,
  36408145,
  2530585658,
  25011837,
  3520020182,
  2088578344,
  530523599,
  2918365339,
  1524020338,
  1518925132,
  3760827505,
  3759777254,
  1202760957,
  3985898139,
  3906192525,
  674977740,
  4174734889,
  2031300136,
  2019492241,
  3983892565,
  4153806404,
  3822280332,
  352677332,
  2297720250,
  60907813,
  90501309,
  3286998549,
  1016092578,
  2535922412,
  2839152426,
  457141659,
  509813237,
  4120667899,
  652014361,
  1966332200,
  2975202805,
  55981186,
  2327461051,
  676427537,
  3255491064,
  2882294119,
  3433927263,
  1307055953,
  942726286,
  933058658,
  2468411793,
  3933900994,
  4215176142,
  1361170020,
  2001714738,
  2830558078,
  3274259782,
  1222529897,
  1679025792,
  2729314320,
  3714953764,
  1770335741,
  151462246,
  3013232138,
  1682292957,
  1483529935,
  471910574,
  1539241949,
  458788160,
  3436315007,
  1807016891,
  3718408830,
  978976581,
  1043663428,
  3165965781,
  1927990952,
  4200891579,
  2372276910,
  3208408903,
  3533431907,
  1412390302,
  2931980059,
  4132332400,
  1947078029,
  3881505623,
  4168226417,
  2941484381,
  1077988104,
  1320477388,
  886195818,
  18198404,
  3786409e3,
  2509781533,
  112762804,
  3463356488,
  1866414978,
  891333506,
  18488651,
  661792760,
  1628790961,
  3885187036,
  3141171499,
  876946877,
  2693282273,
  1372485963,
  791857591,
  2686433993,
  3759982718,
  3167212022,
  3472953795,
  2716379847,
  445679433,
  3561995674,
  3504004811,
  3574258232,
  54117162,
  3331405415,
  2381918588,
  3769707343,
  4154350007,
  1140177722,
  4074052095,
  668550556,
  3214352940,
  367459370,
  261225585,
  2610173221,
  4209349473,
  3468074219,
  3265815641,
  314222801,
  3066103646,
  3808782860,
  282218597,
  3406013506,
  3773591054,
  379116347,
  1285071038,
  846784868,
  2669647154,
  3771962079,
  3550491691,
  2305946142,
  453669953,
  1268987020,
  3317592352,
  3279303384,
  3744833421,
  2610507566,
  3859509063,
  266596637,
  3847019092,
  517658769,
  3462560207,
  3443424879,
  370717030,
  4247526661,
  2224018117,
  4143653529,
  4112773975,
  2788324899,
  2477274417,
  1456262402,
  2901442914,
  1517677493,
  1846949527,
  2295493580,
  3734397586,
  2176403920,
  1280348187,
  1908823572,
  3871786941,
  846861322,
  1172426758,
  3287448474,
  3383383037,
  1655181056,
  3139813346,
  901632758,
  1897031941,
  2986607138,
  3066810236,
  3447102507,
  1393639104,
  373351379,
  950779232,
  625454576,
  3124240540,
  4148612726,
  2007998917,
  544563296,
  2244738638,
  2330496472,
  2058025392,
  1291430526,
  424198748,
  50039436,
  29584100,
  3605783033,
  2429876329,
  2791104160,
  1057563949,
  3255363231,
  3075367218,
  3463963227,
  1469046755,
  985887462
];
var C_ORIG = [
  1332899944,
  1700884034,
  1701343084,
  1684370003,
  1668446532,
  1869963892
];
function _encipher(lr, off, P, S) {
  var n, l = lr[off], r = lr[off + 1];
  l ^= P[0];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[1];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[2];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[3];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[4];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[5];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[6];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[7];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[8];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[9];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[10];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[11];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[12];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[13];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[14];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[15];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[16];
  lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
  lr[off + 1] = l;
  return lr;
}
function _streamtoword(data, offp) {
  for (var i = 0, word = 0; i < 4; ++i)
    word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
  return { key: word, offp };
}
function _key(key, P, S) {
  var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
  for (i = 0; i < plen; i += 2)
    lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _ekskey(data, key, P, S) {
  var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
  offp = 0;
  for (i = 0; i < plen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _crypt(b, salt, rounds, callback, progressCallback) {
  var cdata = C_ORIG.slice(), clen = cdata.length, err;
  if (rounds < 4 || rounds > 31) {
    err = Error("Illegal number of rounds (4-31): " + rounds);
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.length !== BCRYPT_SALT_LEN) {
    err = Error(
      "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
    );
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  rounds = 1 << rounds >>> 0;
  var P, S, i = 0, j;
  if (typeof Int32Array === "function") {
    P = new Int32Array(P_ORIG);
    S = new Int32Array(S_ORIG);
  } else {
    P = P_ORIG.slice();
    S = S_ORIG.slice();
  }
  _ekskey(salt, b, P, S);
  function next() {
    if (progressCallback) progressCallback(i / rounds);
    if (i < rounds) {
      var start = Date.now();
      for (; i < rounds; ) {
        i = i + 1;
        _key(b, P, S);
        _key(salt, P, S);
        if (Date.now() - start > MAX_EXECUTION_TIME) break;
      }
    } else {
      for (i = 0; i < 64; i++)
        for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
      var ret = [];
      for (i = 0; i < clen; i++)
        ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
      if (callback) {
        callback(null, ret);
        return;
      } else return ret;
    }
    if (callback) nextTick(next);
  }
  if (typeof callback !== "undefined") {
    next();
  } else {
    var res;
    while (true) if (typeof (res = next()) !== "undefined") return res || [];
  }
}
function _hash(password, salt, callback, progressCallback) {
  var err;
  if (typeof password !== "string" || typeof salt !== "string") {
    err = Error("Invalid string / salt: Not a string");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var minor, offset;
  if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
    err = Error("Invalid salt version: " + salt.substring(0, 2));
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.charAt(2) === "$") minor = String.fromCharCode(0), offset = 3;
  else {
    minor = salt.charAt(2);
    if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
      err = Error("Invalid salt revision: " + salt.substring(2, 4));
      if (callback) {
        nextTick(callback.bind(this, err));
        return;
      } else throw err;
    }
    offset = 4;
  }
  if (salt.charAt(offset + 2) > "$") {
    err = Error("Missing salt rounds");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
  password += minor >= "a" ? "\0" : "";
  var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
  function finish(bytes) {
    var res = [];
    res.push("$2");
    if (minor >= "a") res.push(minor);
    res.push("$");
    if (rounds < 10) res.push("0");
    res.push(rounds.toString());
    res.push("$");
    res.push(base64_encode(saltb, saltb.length));
    res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
    return res.join("");
  }
  if (typeof callback == "undefined")
    return finish(_crypt(passwordb, saltb, rounds));
  else {
    _crypt(
      passwordb,
      saltb,
      rounds,
      function(err2, bytes) {
        if (err2) callback(err2, null);
        else callback(null, finish(bytes));
      },
      progressCallback
    );
  }
}

// src/middleware/error-handler.ts
var AppError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
  status;
};

// src/services/auth.service.ts
var AuthService = class {
  constructor(env2) {
    this.env = env2;
  }
  env;
  async exchangeCodeForTokens(code, redirectUri, codeVerifier) {
    const params = new URLSearchParams({
      code,
      client_id: this.env.GOOGLE_CLIENT_ID,
      client_secret: this.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });
    if (codeVerifier) {
      params.append("code_verifier", codeVerifier);
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    if (!response.ok) {
      const error = await response.text();
      console.error("OAuth token exchange failed:", error);
      throw new AppError(401, "Failed to exchange authorization code");
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1e3
    };
  }
  async fetchUserInfo(accessToken) {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new AppError(401, "Failed to fetch user info from Google");
    }
    return response.json();
  }
};

// src/middleware/auth-guard.ts
var MAX_SESSION_AGE = 30 * 24 * 60 * 60 * 1e3;
var authGuard = createMiddleware(async (c, next) => {
  const cookie = getCookie(c, "omnidrive_sid");
  if (!cookie) {
    throw new AppError(401, "Not authenticated");
  }
  const sessionJson = await c.env.KV.get(`session:${cookie}`);
  if (!sessionJson) {
    throw new AppError(401, "Session expired");
  }
  const session = JSON.parse(sessionJson);
  if (session.createdAt && Date.now() - session.createdAt > MAX_SESSION_AGE) {
    await c.env.KV.delete(`session:${cookie}`);
    throw new AppError(401, "Session expired");
  }
  c.set("userId", session.userId);
  c.set("session", session);
  await c.env.KV.put(`session:${cookie}`, sessionJson, {
    expirationTtl: 60 * 60 * 24 * 7
    // 7 days
  });
  await next();
});

// src/lib/validation.ts
function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}
function validateWebhookUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid webhook URL";
  }
  if (parsed.protocol !== "https:") return "Webhook URL must use HTTPS";
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
    return "Webhook URL must not point to private/internal addresses";
  }
  if (hostname === "169.254.169.254") {
    return "Webhook URL must not point to private/internal addresses";
  }
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 10) return "Webhook URL must not point to private/internal addresses";
    if (a === 172 && b >= 16 && b <= 31) return "Webhook URL must not point to private/internal addresses";
    if (a === 192 && b === 168) return "Webhook URL must not point to private/internal addresses";
  }
  return null;
}

// src/lib/pkce.ts
async function generatePKCE() {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = btoa(String.fromCharCode(...buffer)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { codeVerifier, codeChallenge };
}

// src/routes/auth.ts
init_crypto();
var authRouter = new Hono2({ strict: false });
authRouter.get("/setup-status", async (c) => {
  const result = await c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  return c.json({ isSetup: (result?.count || 0) > 0 });
});
authRouter.post("/register", async (c) => {
  const { name, username, password, email, invitation_code } = await c.req.json();
  if (!username || !password) throw new AppError(400, "Username and password required");
  const passwordError = validatePassword(password);
  if (passwordError) throw new AppError(400, passwordError);
  const db = c.env.DB;
  const setupRes = await db.prepare("SELECT COUNT(*) as count FROM users").first();
  const isSetup = (setupRes?.count || 0) > 0;
  if (isSetup) {
    if (!invitation_code) throw new AppError(400, "Invitation code required");
    const inv = await db.prepare("SELECT id, max_uses, used_count FROM invitation_codes WHERE code = ?").bind(invitation_code).first();
    if (!inv) throw new AppError(400, "Invalid invitation code");
    if (inv.max_uses > 0 && inv.used_count >= inv.max_uses) throw new AppError(400, "Invitation code has reached its usage limit");
    await db.prepare("UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?").bind(inv.id).run();
  }
  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) throw new AppError(400, "Username already exists");
  if (email) {
    const existingEmail = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existingEmail) throw new AppError(400, "Email already exists");
  }
  const id = generateId();
  const passwordHash = await hash(password, 10);
  const isSuperAdmin = isSetup ? 0 : 1;
  await db.prepare(
    "INSERT INTO users (id, username, password_hash, email, name, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, username, passwordHash, email || null, name || username, isSuperAdmin).run();
  const sessionData = { userId: id, username, email: email || null, name: name || username, avatarUrl: null, role: isSuperAdmin ? "super_admin" : "member", createdAt: Date.now() };
  const sessionId = generateId();
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  setCookie(c, "omnidrive_sid", sessionId, { path: "/", secure: true, httpOnly: true, sameSite: "None", maxAge: 60 * 60 * 24 * 7 });
  return c.json({ success: true, user: sessionData, isSuperAdmin: !!isSuperAdmin });
});
authRouter.post("/login", async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) throw new AppError(400, "Username and password required");
  const user = await c.env.DB.prepare("SELECT id, username, password_hash, email, name, avatar_url, is_super_admin FROM users WHERE username = ?").bind(username).first();
  if (!user || !await compare(password, user.password_hash)) {
    throw new AppError(401, "Invalid credentials");
  }
  const sessionData = { userId: user.id, username: user.username, email: user.email, name: user.name, avatarUrl: user.avatar_url, role: user.is_super_admin ? "super_admin" : "member", createdAt: Date.now() };
  const sessionId = generateId();
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 60 * 60 * 24 * 7 });
  setCookie(c, "omnidrive_sid", sessionId, { path: "/", secure: true, httpOnly: true, sameSite: "None", maxAge: 60 * 60 * 24 * 7 });
  return c.json({ success: true, user: sessionData });
});
authRouter.use("*", authGuard);
authRouter.get("/google", async (c) => {
  const env2 = c.env;
  if (!env2.GOOGLE_CLIENT_ID || !env2.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, "Google OAuth is not configured. Please login with username and password.");
  }
  const redirectUri = `${env2.WORKER_URL}/api/auth/callback`;
  const scope = "openid email profile https://www.googleapis.com/auth/drive";
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", env2.GOOGLE_CLIENT_ID);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", scope);
  authUrl.searchParams.append("access_type", "offline");
  authUrl.searchParams.append("prompt", "consent");
  const state = crypto.randomUUID();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  await env2.KV.put(`oauth_state:${state}`, JSON.stringify({ codeVerifier }), { expirationTtl: 600 });
  setCookie(c, "oauth_state", state, { path: "/", httpOnly: true, secure: true, maxAge: 60 * 5 });
  authUrl.searchParams.append("state", state);
  authUrl.searchParams.append("code_challenge", codeChallenge);
  authUrl.searchParams.append("code_challenge_method", "S256");
  return c.redirect(authUrl.toString());
});
authRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) throw new AppError(400, "Authorization code missing");
  const state = c.req.query("state");
  const savedState = getCookie(c, "oauth_state");
  if (!state || state !== savedState) {
    throw new AppError(400, "Invalid state parameter");
  }
  deleteCookie(c, "oauth_state", { path: "/" });
  const stateDataJson = await c.env.KV.get(`oauth_state:${state}`);
  if (!stateDataJson) throw new AppError(400, "OAuth state expired");
  const stateData = JSON.parse(stateDataJson);
  await c.env.KV.delete(`oauth_state:${state}`);
  const env2 = c.env;
  const redirectUri = `${env2.WORKER_URL}/api/auth/callback`;
  const authService = new AuthService(env2);
  const tokens = await authService.exchangeCodeForTokens(code, redirectUri, stateData.codeVerifier);
  const googleUser = await authService.fetchUserInfo(tokens.accessToken);
  const targetUserId = c.get("userId");
  const db = env2.DB;
  await db.prepare("UPDATE users SET google_id = ?, email = COALESCE(email, ?), name = COALESCE(name, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?").bind(googleUser.id, googleUser.email, googleUser.name, googleUser.picture, targetUserId).run();
  let drive = await db.prepare("SELECT id FROM drive_accounts WHERE google_account_id = ? AND user_id = ?").bind(googleUser.id, targetUserId).first();
  if (!drive) {
    const driveId = generateId();
    const res = await db.prepare("SELECT COUNT(*) as count FROM drive_accounts WHERE user_id = ?").bind(targetUserId).first();
    const isPrimary = res && res.count === 0 ? 1 : 0;
    await db.prepare(
      "INSERT INTO drive_accounts (id, user_id, google_account_id, email, name, type, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(driveId, targetUserId, googleUser.id, googleUser.email, googleUser.name, "oauth", isPrimary).run();
    drive = { id: driveId };
  }
  const encryptedTokens = await encrypt(JSON.stringify(tokens), env2.TOKEN_ENCRYPTION_KEY);
  await env2.KV.put(`tokens:${drive.id}`, encryptedTokens);
  return c.redirect(`${env2.FRONTEND_URL}/`);
});
authRouter.get("/me", (c) => {
  return c.json({ user: c.get("session") });
});
authRouter.post("/logout", async (c) => {
  const sid = getCookie(c, "omnidrive_sid");
  if (sid) {
    await c.env.KV.delete(`session:${sid}`);
  }
  deleteCookie(c, "omnidrive_sid", { path: "/", secure: true, sameSite: "None" });
  return c.json({ success: true });
});

// src/routes/drives.ts
init_crypto();
async function buildDriveBreadcrumb(db, driveId, googleFolderId) {
  const path = [];
  if (googleFolderId && googleFolderId !== "root") {
    const query = `
      WITH RECURSIVE breadcrumb_path(id, google_parent_id, name, lvl) AS (
        SELECT google_folder_id, google_parent_id, name, 0 as lvl 
        FROM drive_folders 
        WHERE drive_account_id = ? AND google_folder_id = ?
        UNION ALL
        SELECT d.google_folder_id, d.google_parent_id, d.name, bp.lvl + 1 
        FROM drive_folders d
        JOIN breadcrumb_path bp ON d.google_folder_id = bp.google_parent_id
        WHERE d.drive_account_id = ?
      )
      SELECT id, name FROM breadcrumb_path ORDER BY lvl DESC
    `;
    const { results } = await db.prepare(query).bind(driveId, googleFolderId, driveId).all();
    for (const row of results) {
      path.push({ id: row.id, name: row.name });
    }
  }
  path.unshift({ id: "root", name: "All Files" });
  return path;
}
var drivesRouter = new Hono2({ strict: false });
drivesRouter.use("*", authGuard);
drivesRouter.get("/connect", (c) => {
  const env2 = c.env;
  if (!env2.GOOGLE_CLIENT_ID || !env2.GOOGLE_CLIENT_SECRET) {
    throw new AppError(400, "Google OAuth is not configured. Please use a Service Account JSON to connect your drives.");
  }
  const redirectUri = `${env2.WORKER_URL}/api/auth/callback`;
  const scope = "openid email profile https://www.googleapis.com/auth/drive";
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", env2.GOOGLE_CLIENT_ID);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", scope);
  authUrl.searchParams.append("access_type", "offline");
  authUrl.searchParams.append("prompt", "select_account consent");
  const state = crypto.randomUUID();
  setCookie(c, "oauth_state", state, { path: "/", httpOnly: true, secure: true, maxAge: 60 * 5 });
  authUrl.searchParams.append("state", state);
  return c.redirect(authUrl.toString());
});
drivesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results } = await db.prepare("SELECT * FROM drive_accounts WHERE user_id = ?").bind(userId).all();
  const drives = results.map(mapDriveRow);
  const drivesWithQuota = await Promise.all(drives.map(async (drive) => {
    const encryptedTokens = await c.env.KV.get(`tokens:${drive.id}`);
    if (!encryptedTokens) return { ...drive, freeSpace: 0, usagePercent: 0 };
    const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);
    try {
      const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
      await c.env.KV.put(`oauth:${drive.id}`, tokenJson);
      const quota = await driveService.getQuota(drive.id);
      const freeSpace = quota.total - quota.used;
      const usagePercent = quota.total > 0 ? quota.used / quota.total * 100 : 0;
      c.executionCtx.waitUntil(
        db.prepare("UPDATE drive_accounts SET total_quota = ?, used_quota = ?, quota_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(quota.total, quota.used, drive.id).run()
      );
      return { ...drive, totalQuota: quota.total, usedQuota: quota.used, freeSpace, usagePercent };
    } catch (e) {
      console.error(`Failed to fetch quota for drive ${drive.id}`, e);
      const freeSpace = Math.max(0, drive.totalQuota - drive.usedQuota);
      const usagePercent = drive.totalQuota > 0 ? drive.usedQuota / drive.totalQuota * 100 : 0;
      return { ...drive, freeSpace, usagePercent };
    }
  }));
  const aggregate = {
    totalQuota: drivesWithQuota.reduce((sum, d) => sum + d.totalQuota, 0),
    totalUsed: drivesWithQuota.reduce((sum, d) => sum + d.usedQuota, 0),
    totalFree: drivesWithQuota.reduce((sum, d) => sum + d.freeSpace, 0),
    driveCount: drivesWithQuota.length
  };
  return c.json({ drives: drivesWithQuota, aggregate });
});
drivesRouter.get("/:driveId/folders/:googleFolderId", async (c) => {
  const userId = c.get("userId");
  const { driveId, googleFolderId } = c.req.param();
  const drive = await c.env.DB.prepare("SELECT id FROM drive_accounts WHERE id = ? AND user_id = ?").bind(driveId, userId).first();
  if (!drive) return c.json({ error: "Drive not found" }, 404);
  const folder = googleFolderId === "root" ? null : await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?").bind(driveId, googleFolderId).first();
  const subfolderResult = googleFolderId === "root" ? await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id IS NULL").bind(driveId).all() : await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
  const filesResult = await c.env.DB.prepare("SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
  const breadcrumb = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);
  return c.json({
    folder: folder ? mapDriveFolderRow(folder) : { googleFolderId: "root", name: "My Drive", isSynced: true },
    subfolders: subfolderResult.results.map((r) => mapDriveFolderRow(r)),
    files: filesResult.results.map((r) => mapFileRow(r)),
    breadcrumb
  });
});
drivesRouter.post("/:id/sync", async (c) => {
  const userId = c.get("userId");
  const driveId = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?").bind(driveId, userId).first();
  if (!row) return c.json({ error: "Drive not found" }, 404);
  const drive = mapDriveRow(row);
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  c.executionCtx.waitUntil(syncDriveAccount(drive, c.env.DB, c.env.KV, driveService));
  return c.json({ success: true });
});
drivesRouter.post("/:driveId/folders/:googleFolderId/sync", async (c) => {
  const userId = c.get("userId");
  const { driveId, googleFolderId } = c.req.param();
  const driveRow = await c.env.DB.prepare("SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?").bind(driveId, userId).first();
  if (!driveRow) return c.json({ error: "Drive not found" }, 404);
  const folder = await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?").bind(driveId, googleFolderId).first();
  if (folder && folder.is_synced) {
    const subfolders = await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
    const files = await c.env.DB.prepare("SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
    const breadcrumb2 = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);
    return c.json({
      folder: mapDriveFolderRow(folder),
      subfolders: subfolders.results.map((r) => mapDriveFolderRow(r)),
      files: files.results.map((r) => mapFileRow(r)),
      breadcrumb: breadcrumb2
    });
  }
  const encryptedTokens = await c.env.KV.get(`tokens:${driveId}`);
  if (!encryptedTokens) return c.json({ error: "No tokens for drive" }, 400);
  const tokenJson = await decryptOrPassthrough(encryptedTokens, c.env.TOKEN_ENCRYPTION_KEY);
  await c.env.KV.put(`oauth:${driveId}`, tokenJson);
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  const { files: gFiles, folders: gFolders } = await driveService.listFolderContents(driveId, googleFolderId);
  const ownerUserId = driveRow.user_id;
  for (const gFolder of gFolders) {
    const existing = await c.env.DB.prepare("SELECT id FROM drive_folders WHERE drive_account_id = ? AND google_folder_id = ?").bind(driveId, gFolder.id).first();
    if (existing) {
      await c.env.DB.prepare("UPDATE drive_folders SET name = ?, google_parent_id = ? WHERE id = ?").bind(gFolder.name, googleFolderId, existing.id).run();
    } else {
      await c.env.DB.prepare(
        "INSERT INTO drive_folders (id, drive_account_id, google_folder_id, google_parent_id, name, is_synced) VALUES (?, ?, ?, ?, ?, 0)"
      ).bind(generateId(), driveId, gFolder.id, googleFolderId, gFolder.name).run();
    }
  }
  for (const gFile of gFiles) {
    const existing = await c.env.DB.prepare("SELECT id FROM files WHERE drive_account_id = ? AND google_file_id = ?").bind(driveId, gFile.id).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE files SET name = ?, mime_type = ?, size = ?, thumbnail_url = ?, web_view_link = ?,
           web_content_link = ?, google_modified_at = ?, google_parent_id = ?, synced_at = datetime('now')
           WHERE id = ?`
      ).bind(
        gFile.name,
        gFile.mimeType,
        parseInt(gFile.size ?? "0", 10),
        gFile.thumbnailLink ?? null,
        gFile.webViewLink ?? null,
        gFile.webContentLink ?? null,
        gFile.modifiedTime,
        googleFolderId,
        existing.id
      ).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO files (id, user_id, drive_account_id, google_file_id, google_parent_id, name, mime_type, size,
             thumbnail_url, web_view_link, web_content_link, google_created_at, google_modified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        ownerUserId,
        driveId,
        gFile.id,
        googleFolderId,
        gFile.name,
        gFile.mimeType,
        parseInt(gFile.size ?? "0", 10),
        gFile.thumbnailLink ?? null,
        gFile.webViewLink ?? null,
        gFile.webContentLink ?? null,
        gFile.createdTime,
        gFile.modifiedTime
      ).run();
    }
  }
  if (folder) {
    await c.env.DB.prepare(`UPDATE drive_folders SET is_synced = 1, synced_at = datetime('now') WHERE drive_account_id = ? AND google_folder_id = ?`).bind(driveId, googleFolderId).run();
  }
  const newSubfolders = await c.env.DB.prepare("SELECT * FROM drive_folders WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
  const newFiles = await c.env.DB.prepare("SELECT * FROM files WHERE drive_account_id = ? AND google_parent_id = ?").bind(driveId, googleFolderId).all();
  const breadcrumb = await buildDriveBreadcrumb(c.env.DB, driveId, googleFolderId);
  return c.json({
    folder: folder ? mapDriveFolderRow(folder) : null,
    subfolders: newSubfolders.results.map((r) => mapDriveFolderRow(r)),
    files: newFiles.results.map((r) => mapFileRow(r)),
    breadcrumb
  });
});
drivesRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const driveId = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM drive_accounts WHERE id = ? AND user_id = ?").bind(driveId, userId).run();
  await c.env.KV.delete(`tokens:${driveId}`);
  await c.env.KV.delete(`oauth:${driveId}`);
  return c.json({ success: true });
});

// src/lib/cursor.ts
function encodeCursor(payload) {
  const str = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const base64 = btoa(binString);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCursor(cursor) {
  try {
    let base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binString = atob(base64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    const str = new TextDecoder().decode(bytes);
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// src/routes/folders.ts
var foldersRouter = new Hono2({ strict: false });
foldersRouter.use("*", authGuard);
async function performBackgroundSync(env2, folderId, driveId, userId) {
  const db = env2.DB;
  try {
    await db.prepare("UPDATE workspace_folders SET sync_status = 'syncing' WHERE id = ?").bind(folderId).run();
    if (driveId) {
      await syncDriveFolder(env2, driveId, folderId, userId);
    }
    await db.prepare("UPDATE workspace_folders SET sync_status = 'idle', last_synced_at = datetime('now') WHERE id = ?").bind(folderId).run();
  } catch (err) {
    console.error("Background sync error:", err);
    await db.prepare("UPDATE workspace_folders SET sync_status = 'error' WHERE id = ?").bind(folderId).run();
  }
}
foldersRouter.get("/tree", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results: workspaces } = await db.prepare(`
    SELECT w.id, w.name, w.created_at, w.updated_at
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ? ORDER BY w.name ASC
  `).bind(userId).all();
  const rootFolders = workspaces.map((w) => ({
    id: w.id,
    workspaceId: w.id,
    name: w.name,
    parentId: null,
    icon: "\u{1F3E2}",
    color: "#4A90D9",
    isStarred: false,
    createdAt: w.created_at,
    updatedAt: w.updated_at
  }));
  const { results: folders } = await db.prepare(`
    SELECT f.* 
    FROM workspace_folders f
    JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE wm.user_id = ? ORDER BY f.name ASC
  `).bind(userId).all();
  const subFolders = folders.map((f) => ({
    id: f.id,
    workspaceId: f.workspace_id,
    name: f.name,
    parentId: f.parent_id || f.workspace_id,
    icon: f.icon || "\u{1F4C1}",
    color: f.color || "#4A90D9",
    isStarred: !!f.is_starred,
    metadata: f.metadata,
    createdAt: f.created_at,
    updatedAt: f.updated_at
  }));
  return c.json({ folders: [...rootFolders, ...subFolders] });
});
foldersRouter.get("/:id?", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id") || null;
  const db = c.env.DB;
  const cursorParam = c.req.query("cursor");
  const parsed = parseInt(c.req.query("limit") || "50", 10);
  const limit = isNaN(parsed) || parsed < 1 ? 50 : Math.min(parsed, 100);
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  let hasMore = false;
  let nextCursor = null;
  let currentFolder = null;
  let subfolders = [];
  let files = [];
  let breadcrumb = [];
  if (!folderId) {
    const { results: workspaces } = await db.prepare(`
      SELECT w.id, w.name, w.created_at, w.updated_at
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ? ORDER BY w.name ASC
    `).bind(userId).all();
    subfolders = workspaces.map((w) => ({
      id: w.id,
      workspaceId: w.id,
      name: w.name,
      parentId: null,
      icon: "\u{1F3E2}",
      color: "#4A90D9",
      isStarred: false,
      createdAt: w.created_at,
      updatedAt: w.updated_at
    }));
  } else {
    const ws = await db.prepare(`
      SELECT w.* FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.id = ? AND wm.user_id = ?
    `).bind(folderId, userId).first();
    if (ws) {
      currentFolder = { id: ws.id, workspaceId: ws.id, name: ws.name, parentId: null, icon: "\u{1F3E2}", color: "#4A90D9", isStarred: false, createdAt: ws.created_at, updatedAt: ws.updated_at, lastSyncedAt: null, syncStatus: "idle" };
      const { results: subRows } = await db.prepare("SELECT * FROM workspace_folders WHERE workspace_id = ? AND parent_id IS NULL ORDER BY name ASC").bind(folderId).all();
      subfolders = subRows.map((f) => ({ id: f.id, workspaceId: f.workspace_id, name: f.name, parentId: folderId, icon: f.icon || "\u{1F4C1}", color: f.color || "#4A90D9", isStarred: !!f.is_starred, metadata: f.metadata, createdAt: f.created_at, updatedAt: f.updated_at }));
      let sql = `
        SELECT f.*, d.email as driveEmail 
        FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE f.workspace_id = ? AND f.workspace_folder_id IS NULL AND f.is_trashed = 0
      `;
      const binds = [folderId];
      if (cursor && cursor.name !== void 0 && cursor.id !== void 0) {
        sql += ` AND (f.name, f.id) > (?, ?)`;
        binds.push(cursor.name, cursor.id);
      }
      sql += ` ORDER BY f.name ASC, f.id ASC LIMIT ?`;
      binds.push(limit + 1);
      const { results: fileRows } = await db.prepare(sql).bind(...binds).all();
      if (fileRows.length > limit) {
        hasMore = true;
        fileRows.pop();
      }
      files = fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail }));
      if (files.length > 0 && hasMore) {
        const lastFile = files[files.length - 1];
        nextCursor = encodeCursor({ name: lastFile.name, id: lastFile.id });
      }
      breadcrumb = [{ id: null, name: "Home" }, { id: ws.id, name: ws.name }];
    } else {
      const folder = await db.prepare("SELECT f.*, w.name as ws_name FROM workspace_folders f JOIN workspaces w ON f.workspace_id = w.id WHERE f.id = ?").bind(folderId).first();
      if (!folder) throw new AppError(404, "Folder not found");
      currentFolder = { id: folder.id, workspaceId: folder.workspace_id, name: folder.name, parentId: folder.parent_id || folder.workspace_id, icon: folder.icon || "\u{1F4C1}", color: folder.color || "#4A90D9", isStarred: !!folder.is_starred, metadata: folder.metadata, createdAt: folder.created_at, updatedAt: folder.updated_at, lastSyncedAt: folder.last_synced_at, syncStatus: folder.sync_status };
      const { results: subRows } = await db.prepare("SELECT * FROM workspace_folders WHERE parent_id = ? ORDER BY name ASC").bind(folderId).all();
      subfolders = subRows.map((f) => ({ id: f.id, workspaceId: f.workspace_id, name: f.name, parentId: folderId, icon: f.icon || "\u{1F4C1}", color: f.color || "#4A90D9", isStarred: !!f.is_starred, metadata: f.metadata, createdAt: f.created_at, updatedAt: f.updated_at }));
      let sql = `
        SELECT f.*, d.email as driveEmail 
        FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE f.workspace_folder_id = ? AND f.is_trashed = 0
      `;
      const binds = [folderId];
      if (cursor && cursor.name !== void 0 && cursor.id !== void 0) {
        sql += ` AND (f.name, f.id) > (?, ?)`;
        binds.push(cursor.name, cursor.id);
      }
      sql += ` ORDER BY f.name ASC, f.id ASC LIMIT ?`;
      binds.push(limit + 1);
      const { results: fileRows } = await db.prepare(sql).bind(...binds).all();
      if (fileRows.length > limit) {
        hasMore = true;
        fileRows.pop();
      }
      files = fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail }));
      if (files.length > 0 && hasMore) {
        const lastFile = files[files.length - 1];
        nextCursor = encodeCursor({ name: lastFile.name, id: lastFile.id });
      }
      breadcrumb = [{ id: null, name: "Home" }, { id: folder.workspace_id, name: folder.ws_name }, { id: folder.id, name: folder.name }];
    }
  }
  if (currentFolder && currentFolder.id !== currentFolder.workspaceId) {
    const ws = await db.prepare("SELECT sync_ttl_minutes FROM workspaces WHERE id = ?").bind(currentFolder.workspaceId).first();
    const ttlMinutes = ws?.sync_ttl_minutes || 5;
    let isExpired = true;
    if (currentFolder.lastSyncedAt) {
      const lastSynced = new Date(currentFolder.lastSyncedAt).getTime();
      const now = Date.now();
      isExpired = now - lastSynced > ttlMinutes * 60 * 1e3;
    }
    let driveId = c.req.query("driveId") || null;
    if (!driveId) {
      const { results } = await db.prepare(`
        SELECT DISTINCT d.id 
        FROM files f 
        JOIN drive_accounts d ON f.drive_account_id = d.id 
        WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ? LIMIT 1
      `).bind(currentFolder.id, currentFolder.id, userId).all();
      if (results && results.length > 0) {
        driveId = results[0].id;
      }
    }
    if (isExpired && currentFolder.syncStatus !== "syncing") {
      c.executionCtx.waitUntil(performBackgroundSync(c.env, currentFolder.id, driveId, userId));
    }
  }
  return c.json({ folder: currentFolder, subfolders, files, breadcrumb, pagination: { nextCursor, hasMore } });
});
foldersRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { name, parentId, icon, color } = body;
  const db = c.env.DB;
  if (!name) throw new AppError(400, "Folder name is required");
  if (!parentId) {
    const workspaceId2 = generateId();
    const memberId = generateId();
    await db.batch([
      db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)").bind(workspaceId2, name, userId),
      db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)").bind(memberId, workspaceId2, userId, "owner")
    ]);
    return c.json({ id: workspaceId2, name, parentId: null });
  }
  const ws = await db.prepare("SELECT id FROM workspaces WHERE id = ?").bind(parentId).first();
  let workspaceId = parentId;
  let actualParentId = null;
  if (!ws) {
    const folder = await db.prepare("SELECT workspace_id FROM workspace_folders WHERE id = ?").bind(parentId).first();
    if (!folder) throw new AppError(404, "Parent not found");
    workspaceId = folder.workspace_id;
    actualParentId = parentId;
  }
  const id = generateId();
  await db.prepare("INSERT INTO workspace_folders (id, workspace_id, name, parent_id, icon, color) VALUES (?, ?, ?, ?, ?, ?)").bind(id, workspaceId, name, actualParentId, icon || "\u{1F4C1}", color || "#4A90D9").run();
  return c.json({ id, name, parentId });
});
foldersRouter.put("/:id", async (c) => {
  const folderId = c.req.param("id");
  const body = await c.req.json();
  const { name, parentId, icon, color } = body;
  const db = c.env.DB;
  const ws = await db.prepare("SELECT id FROM workspaces WHERE id = ?").bind(folderId).first();
  if (ws) {
    if (name) await db.prepare("UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, folderId).run();
    return c.json({ success: true });
  }
  const updateFields = [];
  const params = [];
  if (name !== void 0) {
    updateFields.push("name = ?");
    params.push(name);
  }
  if (icon !== void 0) {
    updateFields.push("icon = ?");
    params.push(icon);
  }
  if (color !== void 0) {
    updateFields.push("color = ?");
    params.push(color);
  }
  if (parentId !== void 0) {
    const parentWs = await db.prepare("SELECT id FROM workspaces WHERE id = ?").bind(parentId).first();
    updateFields.push("parent_id = ?");
    params.push(parentWs ? null : parentId);
  }
  if (updateFields.length > 0) {
    updateFields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(folderId);
    await db.prepare(`UPDATE workspace_folders SET ${updateFields.join(", ")} WHERE id = ?`).bind(...params).run();
  }
  return c.json({ success: true });
});
foldersRouter.post("/:id/star", async (c) => {
  const folderId = c.req.param("id");
  await c.env.DB.prepare("UPDATE workspace_folders SET is_starred = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(folderId).run();
  return c.json({ success: true });
});
foldersRouter.post("/:id/unstar", async (c) => {
  const folderId = c.req.param("id");
  await c.env.DB.prepare("UPDATE workspace_folders SET is_starred = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(folderId).run();
  return c.json({ success: true });
});
foldersRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id");
  const db = c.env.DB;
  const ws = await db.prepare("SELECT id FROM workspaces WHERE id = ? AND owner_id = ?").bind(folderId, userId).first();
  if (ws) {
    await db.prepare("DELETE FROM workspaces WHERE id = ?").bind(folderId).run();
    return c.json({ success: true });
  }
  await db.prepare("DELETE FROM workspace_folders WHERE id = ?").bind(folderId).run();
  return c.json({ success: true });
});
foldersRouter.post("/:id/files", async (c) => {
  const folderId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.env.DB;
  const { fileIds } = await c.req.json();
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) return c.json({ success: true });
  const ws = await db.prepare("SELECT id FROM workspaces WHERE id = ?").bind(folderId).first();
  let workspaceId = folderId;
  let workspaceFolderId = null;
  if (!ws) {
    const f = await db.prepare("SELECT workspace_id FROM workspace_folders WHERE id = ?").bind(folderId).first();
    if (f) {
      workspaceId = f.workspace_id;
      workspaceFolderId = folderId;
    }
  }
  const CHUNK_SIZE = 50;
  for (let i = 0; i < fileIds.length; i += CHUNK_SIZE) {
    const chunk = fileIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const query = `UPDATE files SET workspace_id = ?, workspace_folder_id = ?, updated_at = datetime('now') WHERE user_id = ? AND id IN (${placeholders})`;
    await db.prepare(query).bind(workspaceId, workspaceFolderId, userId, ...chunk).run();
  }
  return c.json({ success: true });
});
foldersRouter.post("/:id/sync", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id");
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT DISTINCT d.* 
    FROM files f 
    JOIN drive_accounts d ON f.drive_account_id = d.id 
    WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ?
  `).bind(folderId, folderId, userId).all();
  if (results && results.length > 0) {
    const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
    for (const row of results) {
      const drive = mapDriveRow(row);
      c.executionCtx.waitUntil(syncDriveAccount(drive, db, c.env.KV, driveService).catch(console.error));
    }
  }
  return c.json({ success: true });
});
foldersRouter.post("/:id/force-sync", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id");
  let driveId = c.req.query("driveId") || null;
  const db = c.env.DB;
  if (!driveId) {
    const { results } = await db.prepare(`
      SELECT DISTINCT d.id 
      FROM files f 
      JOIN drive_accounts d ON f.drive_account_id = d.id 
      WHERE (f.workspace_folder_id = ? OR f.workspace_id = ?) AND f.user_id = ? LIMIT 1
    `).bind(folderId, folderId, userId).all();
    if (results && results.length > 0) {
      driveId = results[0].id;
    }
  }
  if (!driveId) {
    const { results } = await db.prepare(`
      SELECT id FROM drive_accounts WHERE user_id = ? ORDER BY is_primary DESC LIMIT 1
    `).bind(userId).all();
    if (results && results.length > 0) {
      driveId = results[0].id;
    }
  }
  if (!driveId) {
    throw new AppError(400, "driveId is required or could not be determined");
  }
  c.executionCtx.waitUntil(performBackgroundSync(c.env, folderId, driveId, userId));
  return c.json({ success: true });
});

// src/services/drive.service.ts
var DriveService = class {
  constructor(env2, driveAccountId, tokens) {
    this.env = env2;
    this.driveAccountId = driveAccountId;
    this.tokens = tokens;
  }
  env;
  driveAccountId;
  tokens;
  async fetchWithAuth(url, init) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.tokens.accessToken}`);
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      if (res.status === 401) {
        throw new AppError(401, "Google Drive token expired");
      }
      throw new AppError(res.status, `Google Drive API error: ${await res.text()}`);
    }
    return res;
  }
  async getQuota() {
    const res = await this.fetchWithAuth("https://www.googleapis.com/drive/v3/about?fields=storageQuota");
    const data = await res.json();
    return {
      total: parseInt(data.storageQuota.limit || "0", 10),
      used: parseInt(data.storageQuota.usage || "0", 10)
    };
  }
  async createResumableUploadSession(metadata) {
    const res = await this.fetchWithAuth("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": this.env.FRONTEND_URL
      },
      body: JSON.stringify(metadata)
    });
    const locationUrl = res.headers.get("Location");
    if (!locationUrl) {
      throw new AppError(500, "Failed to get resumable upload session URL from Google");
    }
    return locationUrl;
  }
  async deleteFile(fileId) {
    await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE"
    });
  }
};

// src/services/upload-router.ts
var UploadRouter = class {
  constructor(drives) {
    this.drives = drives;
  }
  drives;
  /**
   * Selects the best drive account for a new upload.
   * Logic:
   * 1. If preferredDriveId is provided, use it (fail if not enough space).
   * 2. Otherwise, pick the drive with the most absolute free space.
   */
  selectDriveForUpload(fileSize, preferredDriveId) {
    if (this.drives.length === 0) {
      throw new AppError(400, "No connected Drive accounts available");
    }
    if (preferredDriveId) {
      const drive = this.drives.find((d) => d.id === preferredDriveId);
      if (!drive) {
        throw new AppError(404, "Preferred drive account not found");
      }
      if (drive.freeSpace < fileSize) {
        throw new AppError(400, "Insufficient quota in preferred drive");
      }
      return drive;
    }
    const sorted = [...this.drives].sort((a, b) => b.freeSpace - a.freeSpace);
    const bestDrive = sorted[0];
    if (bestDrive.freeSpace < fileSize) {
      throw new AppError(400, "Insufficient overall quota for this file");
    }
    return bestDrive;
  }
};

// src/services/automation.service.ts
var TRIGGER_EVENT = "event";
var TRIGGER_CRON = "cron";
var ACTION_MOVE = "move";
var ACTION_DELETE = "delete";
var IS_ACTIVE = 1;
var IS_INACTIVE = 0;
var IS_NOT_TRASHED = 0;
var IS_TRASHED = 1;
var BATCH_SIZE = 100;
function evaluateCondition(file, conditions) {
  if (!conditions || conditions.length === 0) return true;
  const evalFile = { ...file };
  if (!evalFile.extension && evalFile.name) {
    const parts = evalFile.name.split(".");
    evalFile.extension = parts.length > 1 ? parts.pop().toLowerCase() : "";
  }
  return conditions.every((cond) => {
    const rawFieldValue = evalFile[cond.field];
    const value = rawFieldValue != null ? String(rawFieldValue).toLowerCase() : "";
    const target = cond.value != null ? String(cond.value).toLowerCase() : "";
    switch (cond.operator) {
      case "endswith":
        return value.endsWith(target);
      case "contains":
        return value.includes(target);
      case "equals":
        return value === target;
      default:
        return false;
    }
  });
}
function parseRule(row) {
  try {
    const conditions = JSON.parse(row.conditions || "[]");
    const actions = JSON.parse(row.actions || "[]");
    return {
      id: row.id,
      userId: row.user_id,
      conditions,
      actions
    };
  } catch (error) {
    return null;
  }
}
var AutomationEngine = class {
  constructor(env2) {
    this.env = env2;
  }
  env;
  async processEventTrigger(file, ctx) {
    const db = this.env.DB;
    const { results } = await db.prepare(
      `SELECT * FROM automation_rules WHERE trigger_type = ? AND is_active = ? AND user_id = ?`
    ).bind(TRIGGER_EVENT, IS_ACTIVE, file.user_id).all();
    for (const row of results) {
      const rule = parseRule(row);
      if (rule && evaluateCondition(file, rule.conditions)) {
        ctx.waitUntil(this.executeActions(rule.id, file, rule.actions));
      }
    }
  }
  async processCronTrigger(ctx) {
    const db = this.env.DB;
    const { results } = await db.prepare(
      `SELECT * FROM automation_rules WHERE trigger_type = ? AND is_active = ?`
    ).bind(TRIGGER_CRON, IS_ACTIVE).all();
    const rulesByUser = /* @__PURE__ */ new Map();
    for (const row of results) {
      const rule = parseRule(row);
      if (rule) {
        const userRules = rulesByUser.get(rule.userId) || [];
        userRules.push(rule);
        rulesByUser.set(rule.userId, userRules);
      }
    }
    for (const [userId, rules] of rulesByUser.entries()) {
      let offset = 0;
      let hasMoreFiles = true;
      while (hasMoreFiles) {
        const { results: files } = await db.prepare(
          `SELECT * FROM files WHERE user_id = ? AND is_trashed = ? LIMIT ? OFFSET ?`
        ).bind(userId, IS_NOT_TRASHED, BATCH_SIZE, offset).all();
        if (files.length === 0) {
          hasMoreFiles = false;
          break;
        }
        for (const file of files) {
          for (const rule of rules) {
            if (evaluateCondition(file, rule.conditions)) {
              ctx.waitUntil(this.executeActions(rule.id, file, rule.actions));
            }
          }
        }
        if (files.length < BATCH_SIZE) {
          hasMoreFiles = false;
        } else {
          offset += BATCH_SIZE;
        }
      }
    }
  }
  async executeActions(ruleId, file, actions) {
    try {
      const stmts = [];
      for (const action of actions) {
        const targetFolderId = action.targetFolderId ?? action.target_folder_id;
        if (action.type === ACTION_MOVE && targetFolderId) {
          stmts.push(
            this.env.DB.prepare("UPDATE files SET workspace_folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(targetFolderId, file.id)
          );
        } else if (action.type === ACTION_DELETE) {
          stmts.push(
            this.env.DB.prepare("UPDATE files SET is_trashed = ? WHERE id = ?").bind(IS_TRASHED, file.id)
          );
        }
      }
      if (actions.length > 0) {
        stmts.push(
          this.env.DB.prepare("INSERT INTO automation_logs (id, rule_id, status, details) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), ruleId, "success", JSON.stringify({ fileId: file.id }))
        );
      }
      if (stmts.length > 0) {
        await this.env.DB.batch(stmts);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.env.DB.prepare("INSERT INTO automation_logs (id, rule_id, status, details) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), ruleId, "error", errorMessage).run();
    }
  }
};

// src/routes/files.ts
var filesRouter = new Hono2({ strict: false });
filesRouter.use("*", authGuard);
filesRouter.get("/recent", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results: fileRows } = await db.prepare(`
    SELECT DISTINCT f.*, d.email as driveEmail 
    FROM files f
    JOIN drive_accounts d ON f.drive_account_id = d.id
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE (f.user_id = ? OR wm.user_id = ?)
      AND f.is_trashed = 0
    ORDER BY f.updated_at DESC LIMIT 20
  `).bind(userId, userId).all();
  const { results: folderRows } = await db.prepare(`
    SELECT DISTINCT f.*, w.name as ws_name 
    FROM workspace_folders f
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    LEFT JOIN workspaces w ON f.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY f.updated_at DESC LIMIT 20
  `).bind(userId).all();
  const folders = folderRows.map((f) => ({
    id: f.id,
    workspaceId: f.workspace_id,
    name: f.name,
    parentId: f.parent_id,
    icon: f.icon,
    color: f.color,
    isStarred: !!f.is_starred,
    metadata: f.metadata,
    createdAt: f.created_at,
    updatedAt: f.updated_at
  }));
  return c.json({
    files: fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail })),
    folders
  });
});
filesRouter.get("/search", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");
  const workspaceId = c.req.query("workspaceId");
  const metadataRaw = c.req.query("metadata");
  const db = c.env.DB;
  let sql = `
    SELECT DISTINCT f.*, d.email as driveEmail 
    FROM files f
    JOIN drive_accounts d ON f.drive_account_id = d.id
    LEFT JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE (f.user_id = ? OR wm.user_id = ?)
      AND f.is_trashed = 0
  `;
  const binds = [userId, userId];
  if (query?.trim()) {
    sql += ` AND f.name LIKE ?`;
    binds.push(`%${query.trim()}%`);
  }
  if (workspaceId) {
    sql += ` AND f.workspace_id = ?`;
    binds.push(workspaceId);
  }
  if (metadataRaw) {
    try {
      const meta = JSON.parse(metadataRaw);
      for (const [key, value] of Object.entries(meta)) {
        sql += ` AND json_extract(f.metadata, '$.' || ?) = ?`;
        binds.push(key, String(value));
      }
    } catch (e) {
    }
  }
  sql += ` ORDER BY f.created_at DESC LIMIT 50`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return c.json({
    files: results.map((r) => ({
      ...mapFileRow(r),
      driveEmail: r.driveEmail
    })),
    query: query || ""
  });
});
filesRouter.get("/starred", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results: fileRows } = await db.prepare(
    "SELECT f.*, d.email as driveEmail FROM files f JOIN drive_accounts d ON f.drive_account_id = d.id WHERE f.user_id = ? AND f.is_starred = 1 AND f.is_trashed = 0 ORDER BY f.created_at DESC"
  ).bind(userId).all();
  const { results: folderRows } = await db.prepare(
    "SELECT f.*, w.name as ws_name FROM workspace_folders f JOIN workspace_members wm ON f.workspace_id = wm.workspace_id JOIN workspaces w ON f.workspace_id = w.id WHERE wm.user_id = ? AND f.is_starred = 1 ORDER BY f.updated_at DESC"
  ).bind(userId).all();
  return c.json({
    files: fileRows.map((r) => ({ ...mapFileRow(r), driveEmail: r.driveEmail })),
    folders: folderRows.map(mapFolderRow)
  });
});
filesRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const db = c.env.DB;
  await db.prepare("UPDATE files SET is_trashed = 1 WHERE id = ? AND user_id = ?").bind(fileId, userId).run();
  return c.json({ success: true });
});
filesRouter.patch("/:id/rename", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { name } = await c.req.json();
  if (!name) throw new AppError(400, "Name is required");
  await c.env.DB.prepare("UPDATE files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(name, fileId, userId).run();
  return c.json({ success: true });
});
filesRouter.patch("/:id/move", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { folderId } = await c.req.json();
  const folder = await c.env.DB.prepare("SELECT workspace_id FROM workspace_folders WHERE id = ?").bind(folderId).first();
  if (!folder && folderId) throw new AppError(404, "Folder not found");
  await c.env.DB.prepare("UPDATE files SET workspace_folder_id = ?, workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(folderId, folder?.workspace_id || null, fileId, userId).run();
  return c.json({ success: true });
});
filesRouter.post("/:id/move-drive", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const body = await c.req.json();
  const targetDriveId = body.targetDriveId;
  if (typeof targetDriveId !== "string" || !targetDriveId.trim()) {
    throw new AppError(400, "Target drive ID must be a non-empty string");
  }
  const db = c.env.DB;
  const file = await db.prepare(
    `SELECT f.*, d.email as driveEmail, d.id as sourceDriveId
     FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.id = ? AND f.user_id = ?`
  ).bind(fileId, userId).first();
  if (!file) {
    throw new AppError(404, "File not found or unauthorized");
  }
  if (file.sourceDriveId === targetDriveId) {
    throw new AppError(400, "File is already in the target drive");
  }
  const targetDrive = await db.prepare(
    "SELECT id, email FROM drive_accounts WHERE id = ? AND user_id = ?"
  ).bind(targetDriveId, userId).first();
  if (!targetDrive) {
    throw new AppError(404, "Target drive not found or unauthorized");
  }
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  let sharePermissionId = null;
  let copySuccessId = null;
  let trashSuccess = false;
  try {
    sharePermissionId = await driveService.shareFile(
      file.sourceDriveId,
      file.google_file_id,
      targetDrive.email,
      "writer"
    );
    const copiedFile = await driveService.copyFile(
      targetDriveId,
      file.google_file_id
    );
    copySuccessId = copiedFile.id;
    try {
      if (sharePermissionId) {
        await driveService.revokeShare(file.sourceDriveId, file.google_file_id, sharePermissionId);
        sharePermissionId = null;
      }
    } catch (revokeError) {
      console.error("Failed to revoke share after copy:", revokeError);
    }
    try {
      await driveService.trashFile(file.sourceDriveId, file.google_file_id);
      trashSuccess = true;
    } catch (trashError) {
      console.error("Failed to trash original file:", trashError);
    }
    await db.prepare(
      `UPDATE files 
       SET drive_account_id = ?, google_file_id = ?, google_parent_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(targetDriveId, copiedFile.id, fileId).run();
    const updatedFile = await db.prepare("SELECT * FROM files WHERE id = ?").bind(fileId).first();
    return c.json({ file: mapFileRow(updatedFile), success: true });
  } catch (error) {
    console.error("Move drive failed:", error);
    if (trashSuccess) {
      try {
        await driveService.untrashFile(file.sourceDriveId, file.google_file_id);
      } catch (e) {
        console.error("Rollback untrash failed:", e);
      }
    }
    if (copySuccessId) {
      try {
        await driveService.deleteFile(targetDriveId, copySuccessId);
      } catch (e) {
        console.error("Rollback delete failed:", e);
      }
    }
    if (sharePermissionId) {
      try {
        await driveService.revokeShare(file.sourceDriveId, file.google_file_id, sharePermissionId);
      } catch (e) {
        console.error("Failed to revoke share:", e);
      }
    }
    throw new AppError(500, "Failed to move file to another drive");
  }
});
filesRouter.post("/upload/init", async (c) => {
  const userId = c.get("userId");
  const { name, mimeType, size, folderId, workspaceId } = await c.req.json();
  console.log(`Init upload for folder: ${folderId}`);
  const db = c.env.DB;
  if (workspaceId && size) {
    const policyService = new PolicyService(db);
    const hasQuota = await policyService.checkQuota(workspaceId, size);
    if (!hasQuota) {
      return c.json({ error: "Storage quota exceeded" }, 403);
    }
  }
  const { results: driveRows } = await db.prepare("SELECT * FROM drive_accounts WHERE user_id = ?").bind(userId).all();
  if (driveRows.length === 0) throw new AppError(400, "No connected drives");
  const drives = driveRows.map(mapDriveRow).map((d) => ({
    ...d,
    freeSpace: Math.max(0, d.totalQuota - d.usedQuota),
    usagePercent: d.totalQuota > 0 ? d.usedQuota / d.totalQuota * 100 : 0
  }));
  const router = new UploadRouter(drives);
  const targetDrive = router.selectDriveForUpload(size);
  const tokenJson = await c.env.KV.get(`tokens:${targetDrive.id}`);
  if (!tokenJson) throw new AppError(401, "Drive token missing");
  const tokens = JSON.parse(tokenJson);
  const driveService = new DriveService(c.env, targetDrive.id, tokens);
  const uploadUrl = await driveService.createResumableUploadSession({
    name,
    mimeType
  });
  return c.json({
    uploadUrl,
    driveAccountId: targetDrive.id,
    googleFolderId: targetDrive.rootFolderId
  });
});
filesRouter.post("/upload/finalize", async (c) => {
  const userId = c.get("userId");
  const { googleFileId, driveAccountId, virtualFolderId, workspaceFolderId, workspaceId } = await c.req.json();
  if (!googleFileId || !driveAccountId) {
    throw new AppError(400, "Missing required fields: googleFileId, driveAccountId");
  }
  const finalFolderId = workspaceFolderId || virtualFolderId;
  const db = c.env.DB;
  const drive = await db.prepare("SELECT id FROM drive_accounts WHERE id = ? AND user_id = ?").bind(driveAccountId, userId).first();
  if (!drive) {
    throw new AppError(404, "Drive account not found or unauthorized");
  }
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  const gFile = await driveService.getFile(driveAccountId, googleFileId);
  const id = generateId();
  const fileSize = parseInt(gFile.size || "0", 10);
  await db.prepare(`
    INSERT INTO files (
      id, user_id, drive_account_id, workspace_id, workspace_folder_id, 
      google_file_id, name, mime_type, size, thumbnail_url, web_view_link, web_content_link,
      google_created_at, google_modified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    driveAccountId,
    workspaceId || null,
    finalFolderId || null,
    gFile.id,
    gFile.name,
    gFile.mimeType,
    fileSize,
    gFile.thumbnailLink || null,
    gFile.webViewLink || null,
    gFile.webContentLink || null,
    gFile.createdTime,
    gFile.modifiedTime
  ).run();
  if (workspaceId && fileSize > 0) {
    const policyService = new PolicyService(db);
    await policyService.updateWorkspaceStorage(workspaceId, fileSize);
  }
  await c.env.KV.delete(`quota:${driveAccountId}`);
  const created = await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  const engine = new AutomationEngine(c.env);
  c.executionCtx.waitUntil(engine.processEventTrigger({ ...created, user_id: userId }, c.executionCtx));
  return c.json({ file: mapFileRow(created), success: true }, 201);
});
filesRouter.get("/trash", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results } = await db.prepare(
    `SELECT f.*, d.email as driveEmail FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.user_id = ? AND f.is_trashed = 1
     ORDER BY f.updated_at DESC`
  ).bind(userId).all();
  return c.json({
    files: results.map((r) => ({
      ...mapFileRow(r),
      driveEmail: r.driveEmail
    }))
  });
});
filesRouter.post("/:id/restore", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { meta } = await c.env.DB.prepare("UPDATE files SET is_trashed = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(fileId, userId).run();
  if (meta.changes === 0) {
    throw new AppError(404, "File not found");
  }
  return c.json({ success: true });
});
filesRouter.post("/:id/star", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { meta } = await c.env.DB.prepare("UPDATE files SET is_starred = 1 WHERE id = ? AND user_id = ?").bind(fileId, userId).run();
  if (meta.changes === 0) throw new AppError(404, "File not found");
  return c.json({ success: true });
});
filesRouter.post("/:id/unstar", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { meta } = await c.env.DB.prepare("UPDATE files SET is_starred = 0 WHERE id = ? AND user_id = ?").bind(fileId, userId).run();
  if (meta.changes === 0) throw new AppError(404, "File not found");
  return c.json({ success: true });
});
filesRouter.delete("/:id/permanent", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const db = c.env.DB;
  const file = await db.prepare(
    `SELECT f.google_file_id, f.size, f.workspace_id, f.workspace_folder_id, d.id as driveId 
     FROM files f
     JOIN drive_accounts d ON f.drive_account_id = d.id
     WHERE f.id = ? AND f.user_id = ? AND f.is_trashed = 1`
  ).bind(fileId, userId).first();
  if (!file) throw new AppError(404, "File not found in trash");
  if (file.workspace_folder_id) {
    const policyService = new PolicyService(db);
    const protectedRet = await policyService.checkRetentionProtection(file.workspace_folder_id);
    if (protectedRet) {
      return c.json({ error: "Retention policy prevents deletion" }, 403);
    }
  }
  const driveService = new GoogleDriveService(c.env.KV, c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET, c.env.TOKEN_ENCRYPTION_KEY);
  try {
    await driveService.deleteFile(file.driveId, file.google_file_id);
  } catch (error) {
    console.error("Failed to permanently delete file from Google Drive:", error);
    throw new AppError(500, "Failed to delete file from Google Drive");
  }
  await db.prepare("DELETE FROM files WHERE id = ? AND user_id = ?").bind(fileId, userId).run();
  if (file.workspace_id && file.size) {
    const policyService = new PolicyService(db);
    await policyService.updateWorkspaceStorage(file.workspace_id, -file.size);
  }
  return c.json({ success: true });
});
filesRouter.patch("/:id/metadata", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("id");
  const { metadata } = await c.req.json();
  const db = c.env.DB;
  const file = await db.prepare("SELECT user_id, workspace_id FROM files WHERE id = ?").bind(fileId).first();
  if (!file) throw new AppError(404, "File not found");
  if (file.workspace_id) {
    const { getWorkspaceRole: getWorkspaceRole2, hasPermission: hasPermission2 } = await Promise.resolve().then(() => (init_rbac(), rbac_exports));
    const role = await getWorkspaceRole2(db, file.workspace_id, userId);
    if (!role || !hasPermission2(role, "editor")) {
      throw new AppError(403, "Forbidden");
    }
  } else if (file.user_id !== userId) {
    throw new AppError(403, "Forbidden");
  }
  await db.prepare("UPDATE files SET metadata = ? WHERE id = ?").bind(JSON.stringify(metadata), fileId).run();
  return c.json({ success: true });
});

// ../../node_modules/hono/dist/utils/encode.js
var decodeBase64Url = (str) => {
  return decodeBase64(str.replace(/_|-/g, (m) => ({ _: "/", "-": "+" })[m] ?? m));
};
var encodeBase64Url = (buf) => encodeBase64(buf).replace(/\/|\+/g, (m) => ({ "/": "_", "+": "-" })[m] ?? m);
var encodeBase64 = (buf) => {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0, len = bytes.length; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
var decodeBase64 = (str) => {
  const binary = atob(str);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  const half = binary.length / 2;
  for (let i = 0, j = binary.length - 1; i <= half; i++, j--) {
    bytes[i] = binary.charCodeAt(i);
    bytes[j] = binary.charCodeAt(j);
  }
  return bytes;
};

// ../../node_modules/hono/dist/utils/jwt/jwa.js
var AlgorithmTypes = /* @__PURE__ */ ((AlgorithmTypes2) => {
  AlgorithmTypes2["HS256"] = "HS256";
  AlgorithmTypes2["HS384"] = "HS384";
  AlgorithmTypes2["HS512"] = "HS512";
  AlgorithmTypes2["RS256"] = "RS256";
  AlgorithmTypes2["RS384"] = "RS384";
  AlgorithmTypes2["RS512"] = "RS512";
  AlgorithmTypes2["PS256"] = "PS256";
  AlgorithmTypes2["PS384"] = "PS384";
  AlgorithmTypes2["PS512"] = "PS512";
  AlgorithmTypes2["ES256"] = "ES256";
  AlgorithmTypes2["ES384"] = "ES384";
  AlgorithmTypes2["ES512"] = "ES512";
  AlgorithmTypes2["EdDSA"] = "EdDSA";
  return AlgorithmTypes2;
})(AlgorithmTypes || {});

// ../../node_modules/hono/dist/helper/adapter/index.js
var knownUserAgents = {
  deno: "Deno",
  bun: "Bun",
  workerd: "Cloudflare-Workers",
  node: "Node.js"
};
var getRuntimeKey = () => {
  const global = globalThis;
  const userAgentSupported = typeof navigator !== "undefined" && typeof navigator.userAgent === "string";
  if (userAgentSupported) {
    for (const [runtimeKey, userAgent] of Object.entries(knownUserAgents)) {
      if (checkUserAgentEquals(userAgent)) {
        return runtimeKey;
      }
    }
  }
  if (typeof global?.EdgeRuntime === "string") {
    return "edge-light";
  }
  if (global?.fastly !== void 0) {
    return "fastly";
  }
  if (global?.process?.release?.name === "node") {
    return "node";
  }
  return "other";
};
var checkUserAgentEquals = (platform) => {
  const userAgent = navigator.userAgent;
  return userAgent.startsWith(platform);
};

// ../../node_modules/hono/dist/utils/jwt/types.js
var JwtAlgorithmNotImplemented = class extends Error {
  constructor(alg) {
    super(`${alg} is not an implemented algorithm`);
    this.name = "JwtAlgorithmNotImplemented";
  }
};
var JwtAlgorithmRequired = class extends Error {
  constructor() {
    super('JWT verification requires "alg" option to be specified');
    this.name = "JwtAlgorithmRequired";
  }
};
var JwtAlgorithmMismatch = class extends Error {
  constructor(expected, actual) {
    super(`JWT algorithm mismatch: expected "${expected}", got "${actual}"`);
    this.name = "JwtAlgorithmMismatch";
  }
};
var JwtTokenInvalid = class extends Error {
  constructor(token) {
    super(`invalid JWT token: ${token}`);
    this.name = "JwtTokenInvalid";
  }
};
var JwtTokenNotBefore = class extends Error {
  constructor(token) {
    super(`token (${token}) is being used before it's valid`);
    this.name = "JwtTokenNotBefore";
  }
};
var JwtTokenExpired = class extends Error {
  constructor(token) {
    super(`token (${token}) expired`);
    this.name = "JwtTokenExpired";
  }
};
var JwtTokenIssuedAt = class extends Error {
  constructor(currentTimestamp, iat) {
    super(
      `Invalid "iat" claim, must be a valid number lower than "${currentTimestamp}" (iat: "${iat}")`
    );
    this.name = "JwtTokenIssuedAt";
  }
};
var JwtTokenIssuer = class extends Error {
  constructor(expected, iss) {
    super(`expected issuer "${expected}", got ${iss ? `"${iss}"` : "none"} `);
    this.name = "JwtTokenIssuer";
  }
};
var JwtHeaderInvalid = class extends Error {
  constructor(header) {
    super(`jwt header is invalid: ${JSON.stringify(header)}`);
    this.name = "JwtHeaderInvalid";
  }
};
var JwtHeaderRequiresKid = class extends Error {
  constructor(header) {
    super(`required "kid" in jwt header: ${JSON.stringify(header)}`);
    this.name = "JwtHeaderRequiresKid";
  }
};
var JwtSymmetricAlgorithmNotAllowed = class extends Error {
  constructor(alg) {
    super(`symmetric algorithm "${alg}" is not allowed for JWK verification`);
    this.name = "JwtSymmetricAlgorithmNotAllowed";
  }
};
var JwtAlgorithmNotAllowed = class extends Error {
  constructor(alg, allowedAlgorithms) {
    super(`algorithm "${alg}" is not in the allowed list: [${allowedAlgorithms.join(", ")}]`);
    this.name = "JwtAlgorithmNotAllowed";
  }
};
var JwtTokenSignatureMismatched = class extends Error {
  constructor(token) {
    super(`token(${token}) signature mismatched`);
    this.name = "JwtTokenSignatureMismatched";
  }
};
var JwtPayloadRequiresAud = class extends Error {
  constructor(payload) {
    super(`required "aud" in jwt payload: ${JSON.stringify(payload)}`);
    this.name = "JwtPayloadRequiresAud";
  }
};
var JwtTokenAudience = class extends Error {
  constructor(expected, aud) {
    super(
      `expected audience "${Array.isArray(expected) ? expected.join(", ") : expected}", got "${aud}"`
    );
    this.name = "JwtTokenAudience";
  }
};
var CryptoKeyUsage = /* @__PURE__ */ ((CryptoKeyUsage2) => {
  CryptoKeyUsage2["Encrypt"] = "encrypt";
  CryptoKeyUsage2["Decrypt"] = "decrypt";
  CryptoKeyUsage2["Sign"] = "sign";
  CryptoKeyUsage2["Verify"] = "verify";
  CryptoKeyUsage2["DeriveKey"] = "deriveKey";
  CryptoKeyUsage2["DeriveBits"] = "deriveBits";
  CryptoKeyUsage2["WrapKey"] = "wrapKey";
  CryptoKeyUsage2["UnwrapKey"] = "unwrapKey";
  return CryptoKeyUsage2;
})(CryptoKeyUsage || {});

// ../../node_modules/hono/dist/utils/jwt/utf8.js
var utf8Encoder = new TextEncoder();
var utf8Decoder = new TextDecoder();

// ../../node_modules/hono/dist/utils/jwt/jws.js
async function signing(privateKey, alg, data) {
  const algorithm = getKeyAlgorithm(alg);
  const cryptoKey = await importPrivateKey(privateKey, algorithm);
  return await crypto.subtle.sign(algorithm, cryptoKey, data);
}
async function verifying(publicKey, alg, signature, data) {
  const algorithm = getKeyAlgorithm(alg);
  const cryptoKey = await importPublicKey(publicKey, algorithm);
  return await crypto.subtle.verify(algorithm, cryptoKey, signature, data);
}
function pemToBinary(pem) {
  return decodeBase64(pem.replace(/-+(BEGIN|END).*?-+/g, "").replace(/\s/g, ""));
}
async function importPrivateKey(key, alg) {
  if (!crypto.subtle || !crypto.subtle.importKey) {
    throw new Error("`crypto.subtle.importKey` is undefined. JWT auth middleware requires it.");
  }
  if (isCryptoKey(key)) {
    if (key.type !== "private" && key.type !== "secret") {
      throw new Error(
        `unexpected key type: CryptoKey.type is ${key.type}, expected private or secret`
      );
    }
    return key;
  }
  const usages = [CryptoKeyUsage.Sign];
  if (typeof key === "object") {
    return await crypto.subtle.importKey("jwk", key, alg, false, usages);
  }
  if (key.includes("PRIVATE")) {
    return await crypto.subtle.importKey("pkcs8", pemToBinary(key), alg, false, usages);
  }
  return await crypto.subtle.importKey("raw", utf8Encoder.encode(key), alg, false, usages);
}
async function importPublicKey(key, alg) {
  if (!crypto.subtle || !crypto.subtle.importKey) {
    throw new Error("`crypto.subtle.importKey` is undefined. JWT auth middleware requires it.");
  }
  if (isCryptoKey(key)) {
    if (key.type === "public" || key.type === "secret") {
      return key;
    }
    key = await exportPublicJwkFrom(key);
  }
  if (typeof key === "string" && key.includes("PRIVATE")) {
    const privateKey = await crypto.subtle.importKey("pkcs8", pemToBinary(key), alg, true, [
      CryptoKeyUsage.Sign
    ]);
    key = await exportPublicJwkFrom(privateKey);
  }
  const usages = [CryptoKeyUsage.Verify];
  if (typeof key === "object") {
    return await crypto.subtle.importKey("jwk", key, alg, false, usages);
  }
  if (key.includes("PUBLIC")) {
    return await crypto.subtle.importKey("spki", pemToBinary(key), alg, false, usages);
  }
  return await crypto.subtle.importKey("raw", utf8Encoder.encode(key), alg, false, usages);
}
async function exportPublicJwkFrom(privateKey) {
  if (privateKey.type !== "private") {
    throw new Error(`unexpected key type: ${privateKey.type}`);
  }
  if (!privateKey.extractable) {
    throw new Error("unexpected private key is unextractable");
  }
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const { kty } = jwk;
  const { alg, e, n } = jwk;
  const { crv, x, y } = jwk;
  return { kty, alg, e, n, crv, x, y, key_ops: [CryptoKeyUsage.Verify] };
}
function getKeyAlgorithm(name) {
  switch (name) {
    case "HS256":
      return {
        name: "HMAC",
        hash: {
          name: "SHA-256"
        }
      };
    case "HS384":
      return {
        name: "HMAC",
        hash: {
          name: "SHA-384"
        }
      };
    case "HS512":
      return {
        name: "HMAC",
        hash: {
          name: "SHA-512"
        }
      };
    case "RS256":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: {
          name: "SHA-256"
        }
      };
    case "RS384":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: {
          name: "SHA-384"
        }
      };
    case "RS512":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: {
          name: "SHA-512"
        }
      };
    case "PS256":
      return {
        name: "RSA-PSS",
        hash: {
          name: "SHA-256"
        },
        saltLength: 32
        // 256 >> 3
      };
    case "PS384":
      return {
        name: "RSA-PSS",
        hash: {
          name: "SHA-384"
        },
        saltLength: 48
        // 384 >> 3
      };
    case "PS512":
      return {
        name: "RSA-PSS",
        hash: {
          name: "SHA-512"
        },
        saltLength: 64
        // 512 >> 3,
      };
    case "ES256":
      return {
        name: "ECDSA",
        hash: {
          name: "SHA-256"
        },
        namedCurve: "P-256"
      };
    case "ES384":
      return {
        name: "ECDSA",
        hash: {
          name: "SHA-384"
        },
        namedCurve: "P-384"
      };
    case "ES512":
      return {
        name: "ECDSA",
        hash: {
          name: "SHA-512"
        },
        namedCurve: "P-521"
      };
    case "EdDSA":
      return {
        name: "Ed25519",
        namedCurve: "Ed25519"
      };
    default:
      throw new JwtAlgorithmNotImplemented(name);
  }
}
function isCryptoKey(key) {
  const runtime = getRuntimeKey();
  if (runtime === "node" && !!crypto.webcrypto) {
    return key instanceof crypto.webcrypto.CryptoKey;
  }
  return key instanceof CryptoKey;
}

// ../../node_modules/hono/dist/utils/jwt/jwt.js
var encodeJwtPart = (part) => encodeBase64Url(utf8Encoder.encode(JSON.stringify(part)).buffer).replace(/=/g, "");
var encodeSignaturePart = (buf) => encodeBase64Url(buf).replace(/=/g, "");
var decodeJwtPart = (part) => JSON.parse(utf8Decoder.decode(decodeBase64Url(part)));
function isTokenHeader(obj) {
  if (typeof obj === "object" && obj !== null) {
    const objWithAlg = obj;
    return "alg" in objWithAlg && Object.values(AlgorithmTypes).includes(objWithAlg.alg) && (!("typ" in objWithAlg) || objWithAlg.typ === "JWT");
  }
  return false;
}
var sign = async (payload, privateKey, alg = "HS256") => {
  const encodedPayload = encodeJwtPart(payload);
  let encodedHeader;
  if (typeof privateKey === "object" && "alg" in privateKey) {
    alg = privateKey.alg;
    encodedHeader = encodeJwtPart({ alg, typ: "JWT", kid: privateKey.kid });
  } else {
    encodedHeader = encodeJwtPart({ alg, typ: "JWT" });
  }
  const partialToken = `${encodedHeader}.${encodedPayload}`;
  const signaturePart = await signing(privateKey, alg, utf8Encoder.encode(partialToken));
  const signature = encodeSignaturePart(signaturePart);
  return `${partialToken}.${signature}`;
};
var verify = async (token, publicKey, algOrOptions) => {
  if (!algOrOptions) {
    throw new JwtAlgorithmRequired();
  }
  const {
    alg,
    iss,
    nbf = true,
    exp = true,
    iat = true,
    aud
  } = typeof algOrOptions === "string" ? { alg: algOrOptions } : algOrOptions;
  if (!alg) {
    throw new JwtAlgorithmRequired();
  }
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    throw new JwtTokenInvalid(token);
  }
  const { header, payload } = decode(token);
  if (!isTokenHeader(header)) {
    throw new JwtHeaderInvalid(header);
  }
  if (header.alg !== alg) {
    throw new JwtAlgorithmMismatch(alg, header.alg);
  }
  const now = Math.floor(Date.now() / 1e3);
  if (nbf && payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > now) {
      throw new JwtTokenNotBefore(token);
    }
  }
  if (exp && payload.exp !== void 0) {
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now) {
      throw new JwtTokenExpired(token);
    }
  }
  if (iat && payload.iat !== void 0) {
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || now < payload.iat) {
      throw new JwtTokenIssuedAt(now, payload.iat);
    }
  }
  if (iss) {
    if (!payload.iss) {
      throw new JwtTokenIssuer(iss, null);
    }
    if (typeof iss === "string" && payload.iss !== iss) {
      throw new JwtTokenIssuer(iss, payload.iss);
    }
    if (iss instanceof RegExp && !iss.test(payload.iss)) {
      throw new JwtTokenIssuer(iss, payload.iss);
    }
  }
  if (aud) {
    if (!payload.aud) {
      throw new JwtPayloadRequiresAud(payload);
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const matched = audiences.some(
      (payloadAud) => aud instanceof RegExp ? aud.test(payloadAud) : typeof aud === "string" ? payloadAud === aud : Array.isArray(aud) && aud.includes(payloadAud)
    );
    if (!matched) {
      throw new JwtTokenAudience(aud, payload.aud);
    }
  }
  const headerPayload = token.substring(0, token.lastIndexOf("."));
  const verified = await verifying(
    publicKey,
    alg,
    decodeBase64Url(tokenParts[2]),
    utf8Encoder.encode(headerPayload)
  );
  if (!verified) {
    throw new JwtTokenSignatureMismatched(token);
  }
  return payload;
};
var symmetricAlgorithms = [
  AlgorithmTypes.HS256,
  AlgorithmTypes.HS384,
  AlgorithmTypes.HS512
];
var verifyWithJwks = async (token, options, init) => {
  const verifyOpts = options.verification || {};
  const header = decodeHeader(token);
  if (!isTokenHeader(header)) {
    throw new JwtHeaderInvalid(header);
  }
  if (!header.kid) {
    throw new JwtHeaderRequiresKid(header);
  }
  if (symmetricAlgorithms.includes(header.alg)) {
    throw new JwtSymmetricAlgorithmNotAllowed(header.alg);
  }
  if (!options.allowedAlgorithms.includes(header.alg)) {
    throw new JwtAlgorithmNotAllowed(header.alg, options.allowedAlgorithms);
  }
  let verifyKeys = options.keys ? [...options.keys] : void 0;
  if (options.jwks_uri) {
    const response = await fetch(options.jwks_uri, init);
    if (!response.ok) {
      throw new Error(`failed to fetch JWKS from ${options.jwks_uri}`);
    }
    const data = await response.json();
    if (!data.keys) {
      throw new Error('invalid JWKS response. "keys" field is missing');
    }
    if (!Array.isArray(data.keys)) {
      throw new Error('invalid JWKS response. "keys" field is not an array');
    }
    verifyKeys ??= [];
    verifyKeys.push(...data.keys);
  } else if (!verifyKeys) {
    throw new Error('verifyWithJwks requires options for either "keys" or "jwks_uri" or both');
  }
  const matchingKey = verifyKeys.find((key) => key.kid === header.kid);
  if (!matchingKey) {
    throw new JwtTokenInvalid(token);
  }
  if (matchingKey.alg && matchingKey.alg !== header.alg) {
    throw new JwtAlgorithmMismatch(matchingKey.alg, header.alg);
  }
  return await verify(token, matchingKey, {
    alg: header.alg,
    ...verifyOpts
  });
};
var decode = (token) => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtTokenInvalid(token);
  }
  try {
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    return {
      header,
      payload
    };
  } catch {
    throw new JwtTokenInvalid(token);
  }
};
var decodeHeader = (token) => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtTokenInvalid(token);
  }
  try {
    return decodeJwtPart(parts[0]);
  } catch {
    throw new JwtTokenInvalid(token);
  }
};

// ../../node_modules/hono/dist/utils/jwt/index.js
var Jwt = { sign, verify, decode, verifyWithJwks };

// ../../node_modules/hono/dist/middleware/jwt/jwt.js
var verifyWithJwks2 = Jwt.verifyWithJwks;
var verify2 = Jwt.verify;
var decode2 = Jwt.decode;
var sign2 = Jwt.sign;

// src/routes/shared.ts
var sharedRouter = new Hono2({ strict: false });
function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
async function validateSharedLink(c, link) {
  if (link.expiresAt && new Date(link.expiresAt) < /* @__PURE__ */ new Date()) {
    return { ok: false, status: 410, error: "Link expired" };
  }
  const requiresPassword = !!link.passwordHash;
  if (!requiresPassword) {
    return { ok: true };
  }
  const sessionCookie = getCookie(c, `shared_session_${link.id}`);
  if (sessionCookie) {
    try {
      const payload = await verify2(sessionCookie, c.env.JWT_SECRET, "HS256");
      if (payload.id === link.id) {
        return { ok: true };
      }
    } catch (e) {
    }
  }
  return { ok: false, status: 401, error: "Password required", requiresPassword: true };
}
sharedRouter.post("/", authGuard, async (c) => {
  const userId = c.get("userId");
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { targetType, targetId, password, expiresAt, allowDownloads = true, allowUploads = false, maxDownloads = null, requireEmail = false, webhookUrl = null } = body;
  if (!targetType || !targetId) {
    return c.json({ error: "targetType and targetId are required" }, 400);
  }
  const db = c.env.DB;
  if (targetType === "file") {
    const file = await db.prepare("SELECT id FROM files WHERE id = ? AND user_id = ?").bind(targetId, userId).first();
    if (!file) return c.json({ error: "You do not own this file" }, 403);
  } else if (targetType === "folder") {
    const folder = await db.prepare("SELECT id FROM workspace_folders WHERE id = ?").bind(targetId).first();
    if (!folder) return c.json({ error: "You do not own this folder" }, 403);
  }
  if (webhookUrl) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
  let passwordHash = null;
  if (password) {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordData,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 1e5,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const saltArray = Array.from(salt);
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const saltHex = saltArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    passwordHash = `${saltHex}:${hashHex}`;
  }
  let id = "";
  let attempts = 0;
  const maxAttempts = 3;
  let success = false;
  while (attempts < maxAttempts && !success) {
    id = generateId().replace(/-/g, "").slice(0, 16);
    try {
      await db.prepare(
        "INSERT INTO shared_links (id, user_id, target_type, target_id, password_hash, expires_at, allow_downloads, allow_uploads, max_downloads, require_email, webhook_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, userId, targetType, targetId, passwordHash, expiresAt || null, allowDownloads ? 1 : 0, allowUploads ? 1 : 0, maxDownloads, requireEmail ? 1 : 0, webhookUrl).run();
      success = true;
    } catch (e) {
      if (e.message && e.message.includes("UNIQUE constraint failed")) {
        attempts++;
      } else {
        console.error("Error creating shared link:", e);
        return c.json({ error: "Failed to create shared link" }, 500);
      }
    }
  }
  if (!success) {
    return c.json({ error: "Could not generate unique ID for shared link" }, 500);
  }
  const baseUrl = c.env.FRONTEND_URL.replace(/\/$/, "");
  return c.json({ id, url: `${baseUrl}/shared/${id}` });
});
sharedRouter.get("/", authGuard, async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT s.*, COALESCE(f.name, v.name) as targetName 
    FROM shared_links s 
    LEFT JOIN files f ON s.target_type = 'file' AND s.target_id = f.id 
    LEFT JOIN workspace_folders v ON s.target_type = 'folder' AND s.target_id = v.id 
    WHERE s.user_id = ?
  `).bind(userId).all();
  return c.json({ links: results.map(mapSharedLinkRow) });
});
sharedRouter.put("/:id", authGuard, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const db = c.env.DB;
  const existing = await db.prepare("SELECT * FROM shared_links WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!existing) {
    return c.json({ error: "Link not found" }, 404);
  }
  const {
    expiresAt = existing.expires_at,
    allowDownloads = existing.allow_downloads === 1,
    allowUploads = existing.allow_uploads === 1,
    maxDownloads = existing.max_downloads,
    requireEmail = existing.require_email === 1,
    webhookUrl = existing.webhook_url,
    password
  } = body;
  if (webhookUrl && webhookUrl !== existing.webhook_url) {
    const webhookError = validateWebhookUrl(webhookUrl);
    if (webhookError) return c.json({ error: webhookError }, 400);
  }
  let passwordHash = existing.password_hash;
  if (password !== void 0) {
    if (password === null || password === "") {
      passwordHash = null;
    } else {
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(password);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        passwordData,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );
      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations: 1e5,
          hash: "SHA-256"
        },
        keyMaterial,
        256
      );
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const saltArray = Array.from(salt);
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      const saltHex = saltArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      passwordHash = `${saltHex}:${hashHex}`;
    }
  }
  const result = await db.prepare(
    "UPDATE shared_links SET expires_at = ?, allow_downloads = ?, allow_uploads = ?, max_downloads = ?, require_email = ?, webhook_url = ?, password_hash = ? WHERE id = ? AND user_id = ?"
  ).bind(
    expiresAt || null,
    allowDownloads ? 1 : 0,
    allowUploads ? 1 : 0,
    maxDownloads || null,
    requireEmail ? 1 : 0,
    webhookUrl || null,
    passwordHash,
    id,
    userId
  ).run();
  if (result.meta.changes === 0) {
    return c.json({ error: "Link not found or no changes made" }, 404);
  }
  return c.json({ success: true });
});
sharedRouter.delete("/:id", authGuard, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM shared_links WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return c.json({ success: true });
});
sharedRouter.get("/:id/meta", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM shared_links WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "Link not found" }, 404);
  const link = mapSharedLinkRow(row);
  const validation = await validateSharedLink(c, link);
  if (!validation.ok) {
    return c.json({ error: validation.error, requiresPassword: validation.requiresPassword }, validation.status);
  }
  c.executionCtx.waitUntil(
    db.prepare("UPDATE shared_links SET view_count = view_count + 1 WHERE id = ?").bind(id).run()
  );
  c.executionCtx.waitUntil(
    db.prepare("INSERT INTO shared_link_logs (shared_link_id, action) VALUES (?, ?)").bind(id, "view").run()
  );
  if (link.targetType === "file") {
    const file = await db.prepare("SELECT * FROM files WHERE id = ?").bind(link.targetId).first();
    if (!file) return c.json({ error: "File not found" }, 404);
    return c.json({ target: file, type: "file" });
  } else {
    return c.json({ targetId: link.targetId, type: "folder" });
  }
});
sharedRouter.post("/:id/verify", async (c) => {
  const id = c.req.param("id");
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { password } = body;
  if (!password) return c.json({ error: "Password is required" }, 400);
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM shared_links WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "Link not found" }, 404);
  const link = mapSharedLinkRow(row);
  if (!link.passwordHash) return c.json({ error: "Link does not require password" }, 400);
  const [saltHex, storedHashHex] = link.passwordHash.split(":");
  const saltMatch = saltHex.match(/.{1,2}/g);
  if (!saltMatch) return c.json({ error: "Invalid salt format" }, 500);
  const salt = new Uint8Array(saltMatch.map((byte) => parseInt(byte, 16)));
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordData,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!timingSafeEqualStr(storedHashHex, hashHex)) {
    return c.json({ error: "Invalid password" }, 401);
  }
  const token = await sign2({ id, exp: Math.floor(Date.now() / 1e3) + 60 * 60 * 24 }, c.env.JWT_SECRET, "HS256");
  setCookie(c, `shared_session_${id}`, token, { path: "/", httpOnly: true, secure: true, sameSite: "None", maxAge: 60 * 60 * 24 });
  return c.json({ success: true });
});
sharedRouter.get("/:id/download", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM shared_links WHERE id = ?").bind(id).first();
  if (!row) return c.text("Not found", 404);
  const link = mapSharedLinkRow(row);
  const validation = await validateSharedLink(c, link);
  if (!validation.ok) {
    return c.text(validation.error || "Unauthorized", validation.status);
  }
  if (!link.allowDownloads) {
    return c.text("Downloads are disabled for this link", 403);
  }
  if (link.maxDownloads !== null && link.maxDownloads !== void 0 && link.downloadCount >= link.maxDownloads) {
    return c.text("Maximum download limit reached", 403);
  }
  c.executionCtx.waitUntil(
    db.prepare("UPDATE shared_links SET download_count = download_count + 1 WHERE id = ?").bind(id).run()
  );
  c.executionCtx.waitUntil(
    db.prepare("INSERT INTO shared_link_logs (shared_link_id, action) VALUES (?, ?)").bind(id, "download").run()
  );
  if (link.webhookUrl) {
    c.executionCtx.waitUntil(
      fetch(link.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download", linkId: id })
      }).catch(() => {
      })
      // Fire and forget
    );
  }
  if (link.targetType === "file") {
    const file = await db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ?").bind(link.targetId, link.userId).first();
    if (!file) return c.text("File not found", 404);
    const driveAccount = await db.prepare("SELECT * FROM drive_accounts WHERE id = ? AND user_id = ?").bind(file.drive_account_id, link.userId).first();
    if (!driveAccount) return c.text("Drive account not found", 404);
    const driveService = new GoogleDriveService(
      c.env.KV,
      c.env.GOOGLE_CLIENT_ID,
      c.env.GOOGLE_CLIENT_SECRET,
      c.env.TOKEN_ENCRYPTION_KEY
    );
    let stream;
    let finalMimeType = file.mime_type || "application/octet-stream";
    let finalFileName = file.name;
    try {
      const downloadResult = await driveService.downloadFile(
        file.drive_account_id,
        file.google_file_id,
        file.mime_type
      );
      stream = downloadResult.stream;
      if (downloadResult.exportedMimeType && downloadResult.exportedExtension) {
        finalMimeType = downloadResult.exportedMimeType;
        finalFileName = `${finalFileName}${downloadResult.exportedExtension}`;
      }
    } catch (e) {
      console.error("Download error:", e);
      return c.text("Failed to download file", 502);
    }
    c.header("Content-Type", finalMimeType);
    c.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`);
    if (file.size && !finalFileName.endsWith(".pdf") && !finalFileName.endsWith(".xlsx")) {
      c.header("Content-Length", String(file.size));
    }
    return c.body(stream);
  } else {
    return c.text("Folder download not supported yet", 400);
  }
});

// src/routes/automations.ts
var automationsRouter = new Hono2({ strict: false });
automationsRouter.use("*", authGuard);
automationsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare("SELECT * FROM automation_rules WHERE user_id = ?").bind(userId).all();
  return c.json({
    rules: results.map(mapAutomationRuleRow)
  });
});
automationsRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  if (!body.name || !body.trigger_type) {
    throw new AppError(400, "name and trigger_type are required");
  }
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const actions = Array.isArray(body.actions) ? body.actions : [];
  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO automation_rules (id, user_id, name, trigger_type, trigger_config, conditions, actions) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    body.name,
    body.trigger_type,
    JSON.stringify(body.trigger_config || {}),
    JSON.stringify(conditions),
    JSON.stringify(actions)
  ).run();
  return c.json({ id, success: true }, 201);
});
automationsRouter.patch("/:id/toggle", async (c) => {
  const userId = c.get("userId");
  const ruleId = c.req.param("id");
  const body = await c.req.json();
  if (typeof body.is_active !== "boolean") {
    throw new AppError(400, "is_active must be a boolean");
  }
  const { meta } = await c.env.DB.prepare("UPDATE automation_rules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(body.is_active ? IS_ACTIVE : IS_INACTIVE, ruleId, userId).run();
  if (meta.changes === 0) {
    throw new AppError(404, "Automation rule not found");
  }
  return c.json({ success: true });
});

// src/routes/workspaces.ts
init_rbac();
var workspacesRouter = new Hono2({ strict: false });
workspacesRouter.use("*", authGuard);
workspacesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { results } = await db.prepare(`
      SELECT w.*, wm.role 
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
      ORDER BY w.created_at DESC
    `).bind(userId).all();
  return c.json({ workspaces: results });
});
workspacesRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const { name } = await c.req.json();
  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }
  const workspaceId = generateId();
  const memberId = generateId();
  await db.batch([
    db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)").bind(workspaceId, name, userId),
    db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)").bind(memberId, workspaceId, userId, "owner")
  ]);
  const workspace = await db.prepare("SELECT * FROM workspaces WHERE id = ?").bind(workspaceId).first();
  return c.json({ workspace }, 201);
});
workspacesRouter.post("/:id/members", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const { email, role = "viewer" } = await c.req.json();
  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }
  const currentUserRole = await getWorkspaceRole(db, workspaceId, userId);
  if (!currentUserRole || !hasPermission(currentUserRole, "manager")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const levels = { "viewer": 1, "auditor": 1, "commenter": 2, "editor": 3, "manager": 4, "owner": 5 };
  const assignerLevel = levels[currentUserRole] || 0;
  const targetLevel = levels[role] || 0;
  if (targetLevel >= assignerLevel) {
    return c.json({ error: "Cannot assign a role equal to or higher than your own" }, 403);
  }
  const targetUser = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }
  const memberId = generateId();
  try {
    await db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)").bind(memberId, workspaceId, targetUser.id, role).run();
    const auditService = new AuditService(db);
    await auditService.logEvent({
      workspaceId,
      actorId: userId,
      actionType: "member.invite",
      resourceId: targetUser.id,
      resourceName: email,
      metadata: { role }
    });
  } catch (e) {
    if (e.message.includes("UNIQUE constraint failed")) {
      return c.json({ error: "User is already a member" }, 409);
    }
    throw e;
  }
  return c.json({ success: true }, 201);
});
workspacesRouter.delete("/:id/members/:targetUserId", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const targetUserId = c.req.param("targetUserId");
  if (userId === targetUserId) {
    return c.json({ error: "Cannot remove yourself from the workspace" }, 400);
  }
  const currentUserRole = await getWorkspaceRole(db, workspaceId, userId);
  if (!currentUserRole || !hasPermission(currentUserRole, "manager")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, targetUserId).run();
  const auditService = new AuditService(db);
  await auditService.logEvent({
    workspaceId,
    actorId: userId,
    actionType: "member.remove",
    resourceId: targetUserId,
    metadata: { targetUserId }
  });
  return c.json({ success: true });
});
workspacesRouter.get("/:id/audit-logs", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || role !== "owner" && role !== "manager" && role !== "auditor") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const { results } = await db.prepare(
    "SELECT a.*, u.email as actor_email FROM audit_logs a JOIN users u ON a.actor_id = u.id WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(workspaceId).all();
  return c.json({ logs: results });
});
workspacesRouter.get("/:id/policies", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, "manager")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const { results } = await db.prepare(
    "SELECT * FROM workspace_policies WHERE workspace_id = ?"
  ).bind(workspaceId).all();
  return c.json({ policies: results });
});
workspacesRouter.post("/:id/policies", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, "manager")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const { targetType, targetId, policyType, config } = await c.req.json();
  if (!targetType || !policyType || !config) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  if (policyType === "storage_quota" && targetType !== "workspace") {
    return c.json({ error: "storage_quota must target a workspace" }, 400);
  }
  const policyId = generateId();
  await db.prepare(`
    INSERT INTO workspace_policies (id, workspace_id, target_type, target_id, policy_type, config)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(policyId, workspaceId, targetType, targetId || null, policyType, JSON.stringify(config)).run();
  const policy = await db.prepare("SELECT * FROM workspace_policies WHERE id = ?").bind(policyId).first();
  return c.json({ policy }, 201);
});
workspacesRouter.delete("/:id/policies/:policyId", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const policyId = c.req.param("policyId");
  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, "manager")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.prepare("DELETE FROM workspace_policies WHERE id = ? AND workspace_id = ?").bind(policyId, workspaceId).run();
  return c.json({ success: true });
});
workspacesRouter.patch("/:id/folders/:folderId/metadata", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const workspaceId = c.req.param("id");
  const folderId = c.req.param("folderId");
  const { metadata } = await c.req.json();
  const role = await getWorkspaceRole(db, workspaceId, userId);
  if (!role || !hasPermission(role, "editor")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await db.prepare("UPDATE workspace_folders SET metadata = ? WHERE id = ? AND workspace_id = ?").bind(JSON.stringify(metadata), folderId, workspaceId).run();
  return c.json({ success: true });
});

// src/routes/admin.ts
var adminRouter = new Hono2({ strict: false });
adminRouter.use("*", authGuard);
adminRouter.use("*", async (c, next) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare("SELECT is_super_admin FROM users WHERE id = ?").bind(userId).first();
  if (!user || user.is_super_admin !== 1) {
    throw new AppError(403, "Forbidden: Super Admin access required");
  }
  await next();
});
adminRouter.get("/invitations", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM invitation_codes ORDER BY created_at DESC").all();
  return c.json({ invitations: results });
});
adminRouter.post("/invitations", async (c) => {
  const { code, max_uses } = await c.req.json();
  if (!code) throw new AppError(400, "Code is required");
  const id = generateId();
  const userId = c.get("userId");
  await c.env.DB.prepare(
    "INSERT INTO invitation_codes (id, code, created_by, max_uses) VALUES (?, ?, ?, ?)"
  ).bind(id, code, userId, max_uses || 1).run();
  return c.json({ success: true, invitation: { id, code, created_by: userId, max_uses: max_uses || 1, used_count: 0 } });
});
adminRouter.delete("/invitations/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM invitation_codes WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});
adminRouter.get("/audit-logs", async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(
    "SELECT a.*, u.email as actor_email, w.name as workspace_name FROM audit_logs a JOIN users u ON a.actor_id = u.id LEFT JOIN workspaces w ON a.workspace_id = w.id ORDER BY a.created_at DESC LIMIT 100"
  ).all();
  return c.json({ logs: results });
});
adminRouter.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, username, email, name, avatar_url, is_super_admin as role FROM users ORDER BY created_at DESC LIMIT 100").all();
  return c.json({ users: results.map((u) => ({ ...u, role: u.role ? "super_admin" : "member", status: "active" })) });
});
adminRouter.post("/users", async (c) => {
  const { name, username, password, email, role } = await c.req.json();
  if (!username || !password) throw new AppError(400, "Username and password required");
  const passwordError = validatePassword(password);
  if (passwordError) throw new AppError(400, passwordError);
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) throw new AppError(400, "Username already exists");
  if (email) {
    const existingEmail = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existingEmail) throw new AppError(400, "Email already exists");
  }
  const id = generateId();
  const passwordHash = await hash(password, 10);
  const isSuperAdmin = role === "super_admin" ? 1 : 0;
  await c.env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, email, name, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, username, passwordHash, email || null, name || username, isSuperAdmin).run();
  return c.json({ success: true, user: { id, username, email, name: name || username, role: isSuperAdmin ? "super_admin" : "member", status: "active" } });
});

// src/index.ts
var app = new Hono2({ strict: false });
app.use("*", securityHeaders);
app.use("*", corsMiddleware());
app.use("/api/*", csrfGuard);
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const isAppError = err instanceof AppError || err.name === "AppError";
  const status = isAppError ? err.status : 500;
  const message = isAppError ? err.message : "Internal server error";
  return c.json({ error: message }, status);
});
app.use("/api/auth/login", rateLimiter({ windowMs: 6e4, maxRequests: 10 }));
app.use("/api/auth/register", rateLimiter({ windowMs: 6e5, maxRequests: 10 }));
app.use("/api/shared/:id/verify", rateLimiter({
  windowMs: 6e4,
  maxRequests: 5,
  keyFn: (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Real-IP") ?? "unknown";
    const id = c.req.param("id") ?? "unknown";
    return `${ip}:${id}`;
  }
}));
app.use("/api/*", rateLimiter({ windowMs: 6e4, maxRequests: 100 }));
app.route("/api/auth", authRouter);
app.route("/api/drives", drivesRouter);
app.route("/api/folders", foldersRouter);
app.route("/api/files", filesRouter);
app.route("/api/shared", sharedRouter);
app.route("/api/automations", automationsRouter);
app.route("/api/workspaces", workspacesRouter);
app.route("/api/admin", adminRouter);
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var src_default = {
  fetch: app.fetch,
  async scheduled(event, env2, ctx) {
    console.log("Cron triggered:", event.cron);
    ctx.waitUntil(runScheduledSync(env2));
    const engine = new AutomationEngine(env2);
    ctx.waitUntil(engine.processCronTrigger(ctx));
    const auditService = new AuditService(env2.DB);
    ctx.waitUntil(auditService.cleanupOldLogs(30));
    const policyService = new PolicyService(env2.DB);
    ctx.waitUntil(policyService.processAutoDeleteRetentionPolicies(env2.GOOGLE_CLIENT_ID, env2.GOOGLE_CLIENT_SECRET, env2.KV));
  }
};

// src/polyfills/d1.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var D1PreparedStatementWrapper = class _D1PreparedStatementWrapper {
  db;
  query;
  params;
  constructor(db, query, params = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }
  bind(...values) {
    return new _D1PreparedStatementWrapper(this.db, this.query, values);
  }
  async first() {
    const stmt = this.db.prepare(this.query);
    const result = stmt.get(...this.params);
    return result || null;
  }
  async all() {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params);
    return { results };
  }
  async run() {
    const stmt = this.db.prepare(this.query);
    stmt.run(...this.params);
    return { success: true };
  }
};
var D1DatabaseWrapper = class {
  db;
  constructor(dbPath) {
    this.db = new import_better_sqlite3.default(dbPath);
  }
  prepare(query) {
    return new D1PreparedStatementWrapper(this.db, query);
  }
  exec(query) {
    this.db.exec(query);
  }
};

// src/polyfills/kv.ts
var import_better_sqlite32 = __toESM(require("better-sqlite3"));
var KVNamespaceWrapper = class {
  db;
  constructor(dbPath) {
    this.db = new import_better_sqlite32.default(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expiration INTEGER
      )
    `);
  }
  async get(key) {
    const stmt = this.db.prepare("SELECT value, expiration FROM kv_store WHERE id = ?");
    const row = stmt.get(key);
    if (!row) return null;
    if (row.expiration && row.expiration < Math.floor(Date.now() / 1e3)) {
      await this.delete(key);
      return null;
    }
    return row.value;
  }
  async put(key, value, options) {
    let expiration = null;
    if (options?.expirationTtl) {
      expiration = Math.floor(Date.now() / 1e3) + options.expirationTtl;
    }
    const stmt = this.db.prepare(`
      INSERT INTO kv_store (id, value, expiration) 
      VALUES (?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET value = excluded.value, expiration = excluded.expiration
    `);
    stmt.run(key, value, expiration);
  }
  async delete(key) {
    const stmt = this.db.prepare("DELETE FROM kv_store WHERE id = ?");
    stmt.run(key);
  }
};

// ../../test_app2.ts
var d1 = new D1DatabaseWrapper("/app/data/omnidrive.sqlite");
var kv = new KVNamespaceWrapper("/app/data/kv.sqlite");
var env = {
  DB: d1,
  KV: kv,
  JWT_SECRET: "dev-secret"
};
async function run() {
  await kv.put("session:mock-sid", JSON.stringify({ userId: "ba0d0422-e28b-4da6-96bf-201254ea957e", createdAt: Date.now() }));
  app.get("/test-get", async (c) => {
    const req = new Request("http://localhost/api/drives/0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd/folders/root", {
      headers: {
        "Cookie": "omnidrive_sid=mock-sid"
      }
    });
    const res2 = await app.fetch(req, env, { waitUntil: () => {
    }, passThroughOnException: () => {
    } });
    return c.json({ status: res2.status, body: await res2.json() });
  });
  const res = await app.request("/test-get", {}, env);
  console.log(await res.text());
}
run().catch(console.error);

# fastify-opaque-apake
[![License](https://img.shields.io/github/license/squirrelchat/fastify-opaque-apake.svg?style=flat-square)](https://github.com/squirrelchat/fastify-opaque-apake/blob/mistress/LICENSE)
[![npm](https://img.shields.io/npm/v/fastify-opaque-apake?style=flat-square)](https://npm.im/fastify-opaque-apake)

Fastify plugin to implement the OPAQUE aPAKE protocol. Uses [`@squirrelchat/opaque-wasm-server`](https://npm.im/@squirrelchat/opaque-wasm-server)
under the hood, itself using [opaque-ke](https://github.com/facebook/opaque-ke) to do the real work.

This plugins depends on [`@fastify/session`](https://npm.im/@fastify/session) (or any compatible plugin such
as [`@fastify/secure-session`](https://npm.im/@fastify/secure-session)) to handle state memoization during login.

The underlying library uses the following OPAQUE configuration, based on the recommendations of the OPAQUE draft:
- OPRF: ristretto255-SHA512
- KDF: HKDF-SHA-512
- MAC: HMAC-SHA-512
- Hash: SHA-512
- Group: ristretto255

Make sure to match this configuration in your clients, otherwise the protocol will not be able to execute. For
browser clients, we recommend [`@squirrelchat/opaque-wasm-client`](https://npm.im/@squirrelchat/opaque-wasm-client).
Totally unbiased recommendation, of course :whistle:

## Installation
```
[pnpm | yarn | npm] i fastify-opaque-apake
```

## Usage
```js
fastify.register(import('@fastify/session'), { ... })
fastify.register(import('fastify-opaque-apake'), { ... })
```

Once registered, you have the OPAQUE server instance accessible via `fastify.opaque`. However, you shouldn't need to
use it as more convenient methods are added to the `FastifyRequest` object.

These methods will handle temporary state holding for you (by forwarding the work to `@fastify/session`, itself capable
of dealing with scaled environments by using a Redis-backed store for example).

```js
fastify.post('/auth/register/init', (request, reply) => {
	return { response: request.startOpaqueRegistration(request.body.username, request.body.request) }
})

fastify.post('/auth/register/finalize', (request, reply) => {
	const credentials = request.finishOpaqueRegistration(request.body.record)
	// store credentials to database

	reply.code(204).send()
})

fastify.post('/auth/login/init', (request, reply) => {
	// fetch record from database
	const record = ...

	// A note on account enumeration:
	// The OPAQUE protocol protects against account enumeration
	// by design during authentication. To achieve this, you must
	// engage in the protocol even if the account does not exists.
	// opaque-wasm and the underlying lib does this by using a fake
	// random record when no record is specified.
	//
	// Whether to do this step or not is up to you. If account
	// enumeration during authentication is not a concern for you,
	// you may skip this and simply send a clear error right now to
	// the client.
	return { response: request.startOpaqueLogin(request.body.username, request.body.request, record) }
})

fastify.post('/auth/login/finalize', (request, reply) => {
	const sessionKey = request.finishOpaqueLogin(request.body.finish)
	reply.code(204).send()
})
```

### Configuring state
The state holds the salt and the keypair used by the server. This keypair must not change, and must be the same across
all instances if you have multiple instances of your app. There are 3 ways of providing the state to the plugin: using
a static one, using a provider, or pointing to a file.

With a static state, you are responsible for loading/saving the state.
```js
const state = loadState()

fastify.register(import('fastify-opaque-apake'), { state: state })
	.after()
	.then(() => saveState(fastify.opaque.getState()))
```

With a provider, the library uses functions you've provided to load/save the state. Your functions can return promises
and the library will await them accordingly.
```js
fastify.register(import('fastify-opaque-apake'), {
	getState: () => ...,
	setState: (state) => { ... },
})
```

When pointing to a file, the plugin will read/write the file by itself. Please note that the OPAQUE keys are extremely
sensitive, and storing them to a file isn't the best for security.
```js
fastify.register(import('fastify-opaque-apake'), { stateFile: './opaque.bin' })
```

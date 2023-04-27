/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { webcrypto } from 'crypto'
// @ts-expect-error
globalThis.crypto = webcrypto

import { vitest, beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { readFile, writeFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { Server } from '@squirrelchat/opaque-wasm-server'
import { startRegistration, startLogin, type ClientRegistrationResult } from '@squirrelchat/opaque-wasm-client'

import fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import fastifyOpaqueApake from './index.js'
import fastifyOpaqueApakeCore from './core.js'

let app: FastifyInstance

let TEST_STATE: Uint8Array
let TEST_REGISTRATION: ClientRegistrationResult
let TEST_CREDENTIALS: Uint8Array
const TEST_USERNAME = 'cyyynthia'
const TEST_PASSWORD = 'i meow at strangers ~^w^~'
const SECRET = 'uwu uwu uwu uwu uwu uwu uwu uwu!'
const TEMP_FILE = join(tmpdir(), 'fastify-opaque-apake-test.bin')

beforeAll(() => {
	const srv = new Server()
	TEST_STATE = srv.getState()

	const testReg = startRegistration(TEST_PASSWORD)
	const testRegRes = srv.startRegistration(TEST_USERNAME, testReg.request)
	TEST_REGISTRATION = testReg.finish(testRegRes)
	TEST_CREDENTIALS = srv.finishRegistration(TEST_REGISTRATION.record)
	srv.free()
})

describe('registration', () => {
	it('registers normally in a standard environment', async () => {
		expect.assertions(0)

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { state: void 0 })

		await app.ready()
	})

	it('requires a session plugin to be provided', () => {
		expect.assertions(1)

		app = fastify().register(fastifyOpaqueApake, { state: void 0 })

		return expect(app.ready()).rejects.toThrow()
	})

	it('frees the OPAQUE server when the server is stopped', async () => {
		expect.assertions(2)

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { state: void 0 })

		await app.ready()
		expect((app.opaque as any).ptr).not.toBe(0)

		await app.close()
		expect((app.opaque as any).ptr).toBe(0)
	})

	it('registers normally with just the core plugin', async () => {
		expect.assertions(0)

		app = fastify().register(fastifyOpaqueApakeCore, { state: void 0 })

		await app.ready()
	})
})

describe('options', () => {
	it('requires a state to be provided', () => {
		expect.assertions(1)

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake)

		return expect(app.ready()).rejects.toThrow()
	})

	it('calls the provider to load the state', async () => {
		expect.assertions(3)

		const getState = vitest.fn()
		const setState = vitest.fn()

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { getState, setState })

		await app.ready()
		expect(getState).toHaveBeenCalledOnce()
		expect(setState).toHaveBeenCalledOnce()
		expect(setState).toHaveBeenCalledWith(app.opaque.getState())
	})

	it('doesn\'t save the state if one have already been provided', async () => {
		expect.assertions(3)

		const getState = vitest.fn()
		const setState = vitest.fn()
		getState.mockReturnValue(TEST_STATE)

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { getState, setState })

		await app.ready()
		expect(getState).toHaveBeenCalledOnce()
		expect(setState).not.toHaveBeenCalled()
		expect(app.opaque.getState()).toStrictEqual(TEST_STATE)
	})

	it('saves state to file', async () => {
		expect.assertions(2)
		await rm(TEMP_FILE).catch(() => {})

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { stateFile: TEMP_FILE })

		await app.ready()

		expect(existsSync(TEMP_FILE)).toBe(true)
		const state = await readFile(TEMP_FILE)
		expect(new Uint8Array(state)).toStrictEqual(app.opaque.getState())
	})


	it('loads state from file', async () => {
		expect.assertions(1)

		await writeFile(TEMP_FILE, TEST_STATE)

		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET })
			.register(fastifyOpaqueApake, { stateFile: TEMP_FILE })

		await app.ready()
		expect(app.opaque.getState()).toStrictEqual(TEST_STATE)
	})
})

describe('protocol execution', () => {
	beforeEach(async () => {
		app = fastify()
			.register(fastifyCookie)
			.register(fastifySession, { secret: SECRET, cookie: { secure: false } })
			.register(fastifyOpaqueApake, { state: TEST_STATE })

		app.post('/register/init', (request) => {
			const body = request.body as any
			const response = request.startOpaqueRegistration(body.identifier, body.request)
			return { response: Array.from(response) }
		})

		app.post('/register/finish', (request) => {
			const body = request.body as any
			const credentials = request.finishOpaqueRegistration(body.record)
			return { credentials: Array.from(credentials) }
		})

		app.post('/login/init', async (request) => {
			const body = request.body as any
			const response = request.startOpaqueLogin(body.identifier, body.request, TEST_CREDENTIALS)
			return { response: Array.from(response) }
		})

		app.post('/login/finish', (request) => {
			const body = request.body as any
			const sessionKey = request.finishOpaqueLogin(body.finish)
			return { sessionKey: Array.from(sessionKey) }
		})

		await app.ready()
	})

	it('successfully registers with the server', async () => {
		expect.assertions(3)

		const register = startRegistration('test')
		const res1 = await app.inject({
			method: 'POST',
			path: '/register/init',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ identifier: 'test', request: Array.from(register.request) })
		})

		expect(res1.statusCode).toBe(200)
		const { response } = JSON.parse(res1.body)
		const regResult = register.finish(new Uint8Array(response))
		const res2 = await app.inject({
			method: 'POST',
			path: '/register/finish',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ record: Array.from(regResult.record) })
		})

		expect(res2.statusCode).toBe(200)
		expect(regResult.serverPublicKey).toStrictEqual(TEST_REGISTRATION.serverPublicKey)
	})

	it('successfully logs in with the server', async () => {
		expect.assertions(5)

		const login = startLogin(TEST_PASSWORD)
		const res1 = await app.inject({
			method: 'POST',
			path: '/login/init',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ identifier: TEST_USERNAME, request: Array.from(login.request) })
		})

		expect(res1.statusCode).toBe(200)
		const { response } = res1.json()
		const loginRes = login.finish(new Uint8Array(response))
		const res2 = await app.inject({
			method: 'POST',
			path: '/login/finish',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ finish: Array.from(loginRes.message) }),
			cookies: { sessionId: res1.cookies[0].value },
		})

		expect(res2.statusCode).toBe(200)
		const { sessionKey } = res2.json()
		expect(new Uint8Array(sessionKey)).toStrictEqual(loginRes.sessionKey)
		expect(loginRes.exportKey).toStrictEqual(TEST_REGISTRATION.exportKey)
		expect(loginRes.serverPublicKey).toStrictEqual(TEST_REGISTRATION.serverPublicKey)
	})

	it('clears the state upon completing the protocol', async () => {
		expect.assertions(3)

		const login = startLogin(TEST_PASSWORD)
		const res1 = await app.inject({
			method: 'POST',
			path: '/login/init',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ identifier: TEST_USERNAME, request: Array.from(login.request) })
		})

		expect(res1.statusCode).toBe(200)
		const { response } = res1.json()
		const loginRes = login.finish(new Uint8Array(response))
		const res2 = await app.inject({
			method: 'POST',
			path: '/login/finish',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ finish: Array.from(loginRes.message) }),
			cookies: { sessionId: res1.cookies[0].value },
		})

		expect(res2.statusCode).toBe(200)

		const res3 = await app.inject({
			method: 'POST',
			path: '/login/finish',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ finish: Array.from(loginRes.message) }),
			cookies: { sessionId: res1.cookies[0].value },
		})

		expect(res3.statusCode).not.toBe(200)
	})
})

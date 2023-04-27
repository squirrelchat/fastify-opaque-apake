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

import type {} from '@fastify/session' // Import so the session types are accessible
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import core, { type OpaqueApakeCorePluginOptions } from './core.js'

export type OpaqueApakePluginOptions = OpaqueApakeCorePluginOptions & {}

function startRegistration (this: FastifyRequest, identifier: string, request: Uint8Array) {
	return this.server.opaque.startRegistration(identifier, request)
}

function finishRegistration (this: FastifyRequest, record: Uint8Array) {
	return this.server.opaque.finishRegistration(record)
}

function startLogin (this: FastifyRequest, identifier: string, request: Uint8Array, record?: Uint8Array | undefined) {
	const { response, state } = this.server.opaque.startLogin(identifier, request, record)

	this.session.set('fastify-opaque-apake::state', state)
	return response
}

function finishLogin (this: FastifyRequest, finish: Uint8Array) {
	const state = this.session.get<Uint8Array>('fastify-opaque-apake::state')
	if (!state) throw new Error('Invalid state')

	this.session.set('fastify-opaque-apake::state', void 0)
	return this.server.opaque.finishLogin(state, finish)
}

async function opaqueApakePlugin (fastify: FastifyInstance, opts: OpaqueApakePluginOptions) {
	fastify.register(core, opts)
	await fastify.after()

	fastify.decorateRequest('startOpaqueRegistration', startRegistration)
	fastify.decorateRequest('finishOpaqueRegistration', finishRegistration)
	fastify.decorateRequest('startOpaqueLogin', startLogin)
	fastify.decorateRequest('finishOpaqueLogin', finishLogin)
}

export default fp(opaqueApakePlugin, {
	name: 'opaque-apake',
	fastify: '4.x',
	decorators: {
		request: [ 'session' ]
	}
})

// Extend Fastify interface
declare module 'fastify' {
	interface FastifyRequest {
		startOpaqueRegistration: (identifier: string, request: Uint8Array) => Uint8Array
		finishOpaqueRegistration: (record: Uint8Array) => Uint8Array
		startOpaqueLogin: (identifier: string, request: Uint8Array, record?: Uint8Array | undefined) => Uint8Array
		finishOpaqueLogin: (finish: Uint8Array) => Uint8Array
	}
}
